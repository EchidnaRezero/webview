import { MODELS, type ModelId } from '../data/models';
import {
  PALETTE,
  clamp,
  drawCuboid,
  drawDepthStack,
  drawFlowArrow,
  drawRopeDial,
  easeInOut,
  easeOut,
  lerp,
  roundRect,
} from './drawUtils';

export const WORLD_W = 1120;
export const WORLD_H = 620;

export const MACRO_TO_MESO_PORTAL = { x: 468, y: 244, w: 232, h: 140 };
export const MESO_TO_MICRO_PORTAL = { x: 514, y: 244, w: 204, h: 132 };

export interface MicroHitRects {
  patches: Array<{ x: number; y: number; w: number; h: number; idx: number }>;
  tokens: Array<{ x: number; y: number; w: number; h: number; idx: number }>;
}

const PATCH_LABELS = [
  '하늘', '머리', '머리', '하늘',
  '배경', '눈L', '눈R', '배경',
  '배경', '의상', '의상', '배경',
  '하단', '의상', '의상', '하단',
];

function drawMathTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  intensity: number,
  align: CanvasTextAlign = 'center',
  size = 11.5,
) {
  ctx.save();
  ctx.textAlign = align;
  ctx.font = `700 ${size}px "JetBrains Mono", monospace`;
  ctx.globalAlpha = clamp(0.36 + intensity * 0.64, 0.36, 1);
  if (intensity > 0.35) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * intensity;
  }
  ctx.fillStyle = intensity > 0.45 ? '#ffffff' : color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Procedural 16×16 target scene matching our prompt ("silver hair, blue eyes, night sky, dress")
 * blended continuously with Gaussian noise at level `sigma` ∈ [0, 1] for Rectified Flow visualization!
 */
function drawDenoisingImage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  sigma: number,
  seedOffset: number,
  res = 16,
) {
  const cell = size / res;
  const cleanW = 1 - sigma;
  for (let r = 0; r < res; r++) {
    const ny = (r + 0.5) / res; // 0..1 top to bottom
    for (let c = 0; c < res; c++) {
      const nx = (c + 0.5) / res; // 0..1 left to right
      // Base clean target RGB: deep night sky
      let tr = 12, tg = 22, tb = 48;

      // Stars in upper sky
      if (ny < 0.42 && Math.sin(r * 31.7 + c * 59.3) > 0.92) {
        tr = 210; tg = 235; tb = 255;
      }

      // Silver hair crown & sides (upper-center ellipse)
      const dHair = Math.hypot((nx - 0.5) * 1.15, (ny - 0.34) * 1.35);
      if (dHair < 0.32) {
        tr = 212; tg = 226; tb = 244;
      }

      // Face oval
      const dFace = Math.hypot((nx - 0.5) * 1.65, (ny - 0.42) * 1.55);
      if (dFace < 0.24) {
        tr = 236; tg = 206; tb = 194;
      }

      // Glowing blue/cyan eyes
      const dEyeL = Math.hypot((nx - 0.43) * 4.5, (ny - 0.42) * 5.0);
      const dEyeR = Math.hypot((nx - 0.57) * 4.5, (ny - 0.42) * 5.0);
      if (dEyeL < 0.22 || dEyeR < 0.22) {
        tr = 56; tg = 205; tb = 250;
      }

      // Flowing teal-indigo dress (lower center trapezoid)
      if (ny > 0.58 && Math.abs(nx - 0.5) < 0.14 + (ny - 0.58) * 0.55) {
        tr = 38; tg = 166; tb = 178;
      }

      // Deterministic Gaussian-like RGB noise
      const h1 = Math.sin(r * 12.9898 + c * 78.233 + seedOffset * 1.7) * 43758.5453;
      const h2 = Math.sin(r * 39.346 + c * 11.135 + seedOffset * 2.3) * 24634.6345;
      const h3 = Math.sin(r * 73.156 + c * 52.235 + seedOffset * 3.1) * 19283.1234;
      const nr = (h1 - Math.floor(h1)) * 255;
      const ng = (h2 - Math.floor(h2)) * 255;
      const nb = (h3 - Math.floor(h3)) * 255;

      // Rectified Flow linear interpolation: x_σ = σ·ε + (1−σ)·x_0
      const rr = Math.round(nr * sigma + tr * cleanW);
      const gg = Math.round(ng * sigma + tg * cleanW);
      const bb = Math.round(nb * sigma + tb * cleanW);

      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

function stagePulse(phase: number, start: number, end: number): number {
  if (phase < start || phase > end) return 0;
  return Math.sin(((phase - start) / (end - start)) * Math.PI);
}

/* ============================================================================
 * LEVEL 1 (z = 0): MACRO — LIVE RECTIFIED FLOW SAMPLING LOOP (σ: 1.0 → 0.0)
 * `sampleProgress` (0..1) drives the outer ODE sampling steps (Step 1..8, σ: 1.0 -> 0.0),
 * while `stepPhase` (0..1) drives the forward pass inside each sampling step!
 * ============================================================================ */
export function drawMacroScene(
  ctx: CanvasRenderingContext2D,
  modelId: ModelId,
  stepPhase: number,      // 0..1 forward pass within one ODE step
  sampleProgress: number, // 0..1 overall denoising progress (σ = 1 - sampleProgress)
  portalFade: number,
) {
  const H = WORLD_H;
  const cyTop = H * 0.17;
  const cyMid = H * 0.51;

  const sigma = clamp(1 - sampleProgress, 0, 1);
  const stepNum = Math.min(8, Math.floor(sampleProgress * 8) + 1);
  const isFinalDecode = sampleProgress > 0.86;

  const p1 = easeInOut(stepPhase / 0.24);
  const p2 = easeInOut((stepPhase - 0.24) / 0.22);
  const p3 = easeInOut((stepPhase - 0.46) / 0.30);
  const p4 = easeInOut((stepPhase - 0.76) / 0.24);

  const actText = stagePulse(stepPhase, 0.0, 0.28);
  const actPatch = stagePulse(stepPhase, 0.04, 0.34);
  const actDit = stagePulse(stepPhase, 0.42, 0.78);
  const actVel = stagePulse(stepPhase, 0.72, 1.0);

  const isAnima = modelId === 'anima';
  const isMoss = modelId === 'moss';
  const isKrea = modelId === 'krea2';

  // ---- 1. TEXT ENCODER & BRIDGE (TOP TRACK — computed once per prompt) ----
  const teX = 28;
  const teW = 166;
  const bridgeX = 232;
  const bridgeW = 186;

  ctx.save();
  if (isKrea) {
    for (let k = 6; k >= 0; k--) {
      const off = k * 3.2;
      roundRect(ctx, teX + off, cyTop - 28 - off * 0.6, teW, 56, 7, 'rgba(245,158,11,0.05)', `rgba(245,158,11,${0.18 + (1 - k / 7) * 0.4})`, 0.9);
    }
    roundRect(ctx, teX, cyTop - 28, teW, 56, 7, PALETTE.surface, PALETTE.txt, 1.3);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.txt;
    ctx.font = '700 12px "Pretendard Variable", sans-serif';
    ctx.fillText('Qwen3-VL-4B (12층)', teX + teW / 2, cyTop - 4);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9.5px "JetBrains Mono", monospace';
    ctx.fillText('[B, T, 12, 2560]', teX + teW / 2, cyTop + 16);
  } else if (isAnima) {
    roundRect(ctx, teX, cyTop - 32, teW, 28, 6, PALETTE.txtDim, PALETTE.txt, 1.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText('Qwen3-0.6B (K,V)', teX + teW / 2, cyTop - 14);
    roundRect(ctx, teX, cyTop + 2, teW, 28, 6, PALETTE.imgDim, PALETTE.img, 1.2);
    ctx.fillStyle = '#bae6fd';
    ctx.fillText('T5 임베딩 (Q)', teX + teW / 2, cyTop + 20);
  } else {
    roundRect(ctx, teX, cyTop - 28, teW, 56, 7, PALETTE.surface, PALETTE.txt, 1.3);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.txt;
    ctx.font = '700 12px "Pretendard Variable", sans-serif';
    ctx.fillText('Qwen3.5-9B', teX + teW / 2, cyTop - 4);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9.5px "JetBrains Mono", monospace';
    ctx.fillText('[B, L, 4096]', teX + teW / 2, cyTop + 16);
  }

  drawFlowArrow(ctx, teX + teW + 6, cyTop, bridgeX - 6, cyTop, PALETTE.txt);

  drawDepthStack(ctx, bridgeX, cyTop - 28, bridgeW, 56, PALETTE.txt, isAnima ? 4 : 2, 4, -3);
  roundRect(ctx, bridgeX, cyTop - 28, bridgeW, 56, 7, PALETTE.surfaceHi, PALETTE.txt, 1.4);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fde68a';
  ctx.font = '700 12px "Pretendard Variable", sans-serif';
  ctx.fillText(isAnima ? 'LLMAdapter (6blk)' : isMoss ? 'Text Refiner (2blk)' : 'txtfusion (12→1L)', bridgeX + bridgeW / 2, cyTop - 4);
  ctx.fillStyle = PALETTE.txt;
  ctx.font = '600 9.5px "JetBrains Mono", monospace';
  ctx.fillText(isAnima ? 'ctx [512, 1024]' : isMoss ? 'T [L, 3072]' : 'T [T, 6144]', bridgeX + bridgeW / 2, cyTop + 16);

  drawMathTag(
    ctx,
    isAnima ? 'ctx = Pad₅₁₂(Adapter(T5, Qwen))' : isMoss ? 'T = Refiner₂(H_Qwen)' : 'T = MLP(txtfusion(H₁₂))',
    bridgeX + bridgeW / 2,
    cyTop - 42,
    PALETTE.txt,
    actText,
    'center',
    10.5,
  );
  ctx.restore();

  // ---- 2. LIVE DENOISING 3D LATENT CUBOID x_σ (NOISE -> PORTRAIT CRYSTALLIZATION!) ----
  const latX = 32;
  const latW = 76;
  const latH = 76;
  drawCuboid(ctx, latX, cyMid - latH / 2, latW, latH, 16, 11, PALETTE.img, '#070e1a', 0);
  drawDenoisingImage(ctx, latX + 2, cyMid - latH / 2 + 2, latW - 4, sigma, stepNum, 12);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#bae6fd';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillText(`x_σ (σ=${sigma.toFixed(2)})`, latX + latW / 2, cyMid + latH / 2 + 20);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.fillText(`ODE Step ${stepNum}/8`, latX + latW / 2, cyMid + latH / 2 + 35);

  // ---- 3. PATCHIFY & SEQUENCE ASSEMBLY ----
  const seqAreaX = 200;
  const dit = MACRO_TO_MESO_PORTAL;
  drawFlowArrow(ctx, latX + latW + 20, cyMid, seqAreaX - 8, cyMid, PALETTE.img, p1 > 0.02 && p1 < 0.98 ? p1 : undefined);
  drawMathTag(ctx, isMoss ? 'Flatten' : 'Patch₂ₓ₂', (latX + latW + 20 + seqAreaX) / 2, cyMid - 22, PALETTE.img, actPatch, 'center', 10);

  const tileW = 17;
  const tileH = 34;
  const tileGap = 3.5;
  const imgCount = 5;
  const txtCount = 4;
  const imgBaseX = isKrea ? seqAreaX + (txtCount * (tileW + tileGap) + 8) * p2 : seqAreaX;
  const ribbonShiftX = p3 * (dit.x + 20 - seqAreaX);

  for (let i = 0; i < imgCount; i++) {
    const gx = latX + (i % 3) * 18 + 8;
    const gy = cyMid - 16 + Math.floor(i / 3) * 18;
    const x = lerp(gx, imgBaseX + i * (tileW + tileGap) + ribbonShiftX, easeOut(p1));
    const y = lerp(gy, cyMid - tileH / 2, easeOut(p1));
    ctx.save();
    ctx.globalAlpha = (p4 > 0.2 ? clamp(1 - (p4 - 0.2) * 1.4, 0.2, 1) : 1) * (1 - portalFade * 0.9);
    roundRect(ctx, x, y, tileW, tileH, 4, PALETTE.imgDim, PALETTE.img, 1.1);
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`I${i}`, x + tileW / 2, y + tileH / 2 + 3);
    ctx.restore();
  }

  for (let j = 0; j < txtCount; j++) {
    const startX = bridgeX + bridgeW + 14 + j * (tileW + tileGap);
    const startY = cyTop - tileH / 2;
    const targetX = isAnima
      ? dit.x + 28 + j * (tileW + 10)
      : isMoss
        ? seqAreaX + imgCount * (tileW + tileGap) + 6 + j * (tileW + tileGap) + ribbonShiftX
        : seqAreaX + j * (tileW + tileGap) + ribbonShiftX;
    const targetY = isAnima ? cyTop - tileH / 2 : cyMid - tileH / 2;
    const x = lerp(startX, targetX, p2);
    const y = lerp(startY, targetY, p2);
    const coevolve = !isAnima ? p3 : 0;

    ctx.save();
    ctx.globalAlpha = (!isAnima && p4 > 0.1 ? clamp(1 - p4 * 1.4, 0.1, 1) : 1) * (1 - portalFade * 0.9);
    const isTrap = j === txtCount - 1;
    roundRect(ctx, x, y, tileW, tileH, 4, isTrap ? PALETTE.gateDim : coevolve > 0.35 ? PALETTE.attnDim : PALETTE.txtDim, isTrap ? PALETTE.gate : coevolve > 0.35 ? PALETTE.attn : PALETTE.txt, 1.1);
    ctx.fillStyle = isTrap ? '#fda4af' : coevolve > 0.35 ? '#99f6e4' : '#fde68a';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isTrap ? (isAnima ? '0' : 'S') : `T${j}`, x + tileW / 2, y + tileH / 2 + 3);
    ctx.restore();
  }

  if (isAnima) {
    for (let k = 0; k < 3; k++) {
      const bx = dit.x + 52 + k * 60;
      drawFlowArrow(ctx, bx, cyTop + 22, bx, dit.y - 10, PALETTE.txt, p3 > 0.02 ? (p3 * 2 + k * 0.25) % 1 : undefined, true);
    }
  } else {
    drawMathTag(ctx, isMoss ? '[Img N | Txt L]' : '[Txt T | Img N]', seqAreaX + 95, cyMid + 42, PALETTE.attn, p2, 'center', 10.5);
  }

  // ---- 4. 3D DIT BLOCK STACK (PORTAL TO MESO!) ----
  drawDepthStack(ctx, dit.x, dit.y, dit.w, dit.h, PALETTE.attn, 5, 6, -5);
  roundRect(ctx, dit.x, dit.y, dit.w, dit.h, 12, `rgba(6, 9, 16, ${lerp(0.90, 0.15, portalFade)})`, PALETTE.attn, 1.6 + actDit * 1.3);

  if (portalFade < 0.85) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - portalFade * 1.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 15px "Pretendard Variable", sans-serif';
    ctx.fillText(isAnima ? 'DiT Block × 28' : isMoss ? 'DiT Block × 42' : 'DiT Block × 28', dit.x + dit.w / 2, dit.y + 30);
    drawMathTag(ctx, 'AdaLN · QK-Norm · RoPE · Attn', dit.x + dit.w / 2, dit.y + 52, PALETTE.attn, actDit, 'center', 10);
    roundRect(ctx, dit.x + dit.w / 2 - 64, dit.y + dit.h - 30, 128, 22, 11, 'rgba(45,212,191,0.16)', 'rgba(45,212,191,0.5)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText('휠/클릭 → 블록 확대 ↘', dit.x + dit.w / 2, dit.y + dit.h - 15);
    ctx.restore();
  }

  // ---- 5. FINAL LAYER (Norm + AdaLN + Unpatch) -> DYNAMIC VELOCITY FIELD v_θ(x_σ, σ) ----
  const flX = 738;
  const flW = 62;
  drawFlowArrow(ctx, dit.x + dit.w + 30, cyMid, flX - 6, cyMid, PALETTE.attn, p4 > 0.02 && p4 < 0.45 ? p4 * 2.2 : undefined);
  roundRect(ctx, flX, cyMid - 42, flW, 84, 8, PALETTE.surface, PALETTE.border, 1.2 + actVel * 0.8);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text2;
  ctx.font = '700 10px "Pretendard Variable", sans-serif';
  ctx.fillText('Final', flX + flW / 2, cyMid - 12);
  ctx.fillText('AdaLN', flX + flW / 2, cyMid + 4);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.fillText('Unpatch', flX + flW / 2, cyMid + 22);

  // Dynamic Velocity Vector Field v_θ(x_σ, σ) — arrows shift & shrink as σ -> 0!
  const velX = 824;
  const velW = 62;
  const velH = 62;
  drawFlowArrow(ctx, flX + flW + 4, cyMid, velX - 6, cyMid, PALETTE.attn, p4 > 0.3 && p4 < 0.75 ? (p4 - 0.3) * 2.2 : undefined);
  drawCuboid(ctx, velX, cyMid - velH / 2, velW, velH, 12, 9, PALETTE.attn, '#071419', 0);

  // Draw live dynamic velocity vector arrows inside v_θ cuboid!
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const vx = velX + 12 + c * 19;
      const vy = cyMid - velH / 2 + 12 + r * 19;
      const ang = Math.atan2(r - 1, c - 1) + sigma * 2.4 + stepNum * 0.6;
      const len = 4 + sigma * 6;
      ctx.strokeStyle = PALETTE.attn;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + Math.cos(ang) * len, vy + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  drawMathTag(ctx, `v_θ(x_σ, ${sigma.toFixed(2)})`, velX + velW / 2 + 4, cyMid - velH / 2 - 18, PALETTE.attn, actVel, 'center', 10.5);

  // ---- 6. EXPLICIT RECTIFIED FLOW ODE SAMPLING FEEDBACK LOOP (v -> x_{σ-Δσ} -> back to Latent x_σ!) ----
  const loopY = H * 0.85;
  ctx.save();
  ctx.strokeStyle = isFinalDecode ? 'rgba(56, 189, 248, 0.25)' : PALETTE.img;
  ctx.lineWidth = isFinalDecode ? 1.4 : 2.2;
  ctx.beginPath();
  ctx.moveTo(velX + velW / 2, cyMid + velH / 2 + 6);
  ctx.lineTo(velX + velW / 2, loopY);
  ctx.lineTo(latX + latW / 2, loopY);
  ctx.lineTo(latX + latW / 2, cyMid + latH / 2 + 44);
  ctx.stroke();

  // Animated Euler step packet flowing BACK to Latent x_σ!
  if (!isFinalDecode && p4 > 0.1) {
    const u = p4;
    const fx = lerp(velX + velW / 2, latX + latW / 2, u);
    ctx.shadowColor = PALETTE.img;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fx, loopY, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  drawMathTag(
    ctx,
    `Euler ODE 샘플링 루프:  x_{σ−Δσ} = x_σ − Δσ · v_θ   (σ: ${sigma.toFixed(2)} → ${Math.max(0, sigma - 0.125).toFixed(2)})`,
    (velX + latX + latW) / 2,
    loopY - 12,
    PALETTE.img,
    isFinalDecode ? 0.2 : Math.max(0.45, actVel),
    'center',
    11.5,
  );

  // ---- 7. EXPLICIT VAE DECODER UPSAMPLING PYRAMID -> RGB (FIRES ONLY WHEN σ → 0!) ----
  const vaeX = 924;
  const rgbX = 1020;

  // Arrow from x_0 to VAE Decoder lights up when σ -> 0!
  drawFlowArrow(
    ctx,
    velX + velW + 18,
    cyMid,
    vaeX - 6,
    cyMid,
    isFinalDecode ? PALETTE.attn : 'rgba(148,163,184,0.28)',
    isFinalDecode ? stepPhase : undefined,
    !isFinalDecode,
  );

  // Upsampling trapezoid (VAE Decoder: 1/8 or 1/16 -> 1x RGB)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(vaeX, cyMid - 22);
  ctx.lineTo(vaeX + 64, cyMid - 38);
  ctx.lineTo(vaeX + 64, cyMid + 38);
  ctx.lineTo(vaeX, cyMid + 22);
  ctx.closePath();
  ctx.fillStyle = isFinalDecode ? 'rgba(45,212,191,0.16)' : PALETTE.surface;
  ctx.fill();
  ctx.strokeStyle = isFinalDecode ? PALETTE.attn : PALETTE.border;
  ctx.lineWidth = isFinalDecode ? 1.8 : 1.1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = isFinalDecode ? '#99f6e4' : PALETTE.text2;
  ctx.font = '700 10.5px "Pretendard Variable", sans-serif';
  ctx.fillText('VAE Dec', vaeX + 34, cyMid - 2);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.fillText(isMoss ? '×16 Up' : '×8 Up', vaeX + 34, cyMid + 14);
  ctx.restore();

  drawFlowArrow(ctx, vaeX + 66, cyMid, rgbX - 6, cyMid, isFinalDecode ? PALETTE.attn : 'rgba(148,163,184,0.28)');

  // Final RGB Image Frame (renders crisp 24×24 decoded portrait as σ -> 0!)
  const rgbSize = 76;
  drawCuboid(
    ctx,
    rgbX,
    cyMid - rgbSize / 2,
    rgbSize,
    rgbSize,
    12,
    9,
    isFinalDecode ? PALETTE.attn : 'rgba(148,163,184,0.35)',
    '#080e18',
    0,
  );
  ctx.save();
  ctx.globalAlpha = isFinalDecode ? 1 : 0.22;
  drawDenoisingImage(ctx, rgbX + 2, cyMid - rgbSize / 2 + 2, rgbSize - 4, isFinalDecode ? 0 : sigma, 0, 20);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = isFinalDecode ? '#99f6e4' : PALETTE.muted;
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.fillText(isFinalDecode ? 'RGB (Decoded ✓)' : 'RGB (대기)', rgbX + rgbSize / 2, cyMid + rgbSize / 2 + 20);

  // Straight-line Rectified Flow Trajectory Strip: ε (σ=1) ───●───→ x₀ (σ=0)
  const trajX1 = 300;
  const trajX2 = 760;
  const trajY = H * 0.93;
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(trajX1, trajY);
  ctx.lineTo(trajX2, trajY);
  ctx.stroke();

  const curTx = lerp(trajX1, trajX2, sampleProgress);
  ctx.strokeStyle = PALETTE.attn;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(trajX1, trajY);
  ctx.lineTo(curTx, trajY);
  ctx.stroke();

  ctx.shadowColor = PALETTE.attn;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(curTx, trajY, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = PALETTE.muted;
  ctx.textAlign = 'right';
  ctx.fillText('ε (σ=1.0 순수 노이즈)', trajX1 - 10, trajY + 3.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.attn;
  ctx.fillText('x₀ (σ=0.0 완성 이미지)', trajX2 + 10, trajY + 3.5);
  ctx.restore();
}

/* ============================================================================
 * LEVEL 2 (z = 1): MESO — REAL DIT BLOCK INTERNALS
 *   1. RMSNorm / LayerNorm (vectors collapsing onto unit RMS ring ‖x‖=1!)
 *   2. AdaLN(σ) shift·scale modulation
 *   3. W_Q / W_K / W_V + QK-RMSNorm (head-wise unit norm!) + Multi-freq RoPE
 *   4. Attention Portal + Krea 2 Output Gate shutter
 *   5. Real FFN Geometry (Anima MLP hourglass / MOSS Softcap 2-branch / Krea 2 SwiGLU 2-branch)
 * ============================================================================ */
export function drawMesoScene(
  ctx: CanvasRenderingContext2D,
  modelId: ModelId,
  phase: number,
  sigma: number,
  kreaGate: number,
  portalFade: number,
) {
  const W = WORLD_W;
  const H = WORLD_H;
  const isAnima = modelId === 'anima';
  const isMoss = modelId === 'moss';
  const isKrea = modelId === 'krea2';

  const actNorm = stagePulse(phase, 0.0, 0.24);
  const actQkv = stagePulse(phase, 0.20, 0.50);
  const actAttn = stagePulse(phase, 0.44, 0.76);
  const actFfn = stagePulse(phase, 0.70, 1.0);

  const pNorm = easeInOut(phase / 0.24);
  const pQkv = easeInOut((phase - 0.22) / 0.26);
  const pAttn = easeInOut((phase - 0.46) / 0.28);
  const pFfn = easeInOut((phase - 0.72) / 0.28);

  const railY = H * 0.16;
  const midY = H * 0.52;

  // Residual Highway
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(24, railY);
  ctx.lineTo(W - 24, railY);
  ctx.stroke();

  const rxPulse = lerp(24, W - 24, phase);
  ctx.shadowColor = PALETTE.img;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rxPulse, railY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = PALETTE.img;
  ctx.textAlign = 'left';
  ctx.fillText(isAnima ? 'x [N, 2048]' : isMoss ? 'x [N+L, 3072]' : 'x [T+N, 6144]', 24, railY - 12);
  ctx.textAlign = 'right';
  ctx.fillText('x_out →', W - 24, railY - 12);
  ctx.restore();

  // ---- 1. GEOMETRIC RMSNorm (UNIT CIRCLE) -> AdaLN(σ) AFFINE ELLIPSE DEFORMATION! ----
  const normCx = 78;
  const normCy = midY - 12;
  const normR = 28;
  drawFlowArrow(ctx, normCx, railY, normCx, normCy - normR - 14, PALETTE.img, pNorm > 0.02 && pNorm < 0.5 ? pNorm * 2 : undefined);

  // Live AdaLN affine parameters driven by σ: scale (1+s_x, 1+s_y) & shift (b_x, b_y)
  const scaleX = 0.72 + sigma * 0.65;
  const scaleY = 1.28 - sigma * 0.55;
  const shiftX = (sigma - 0.5) * 14;
  const shiftY = (0.5 - sigma) * 12;

  ctx.save();
  // A) Unit RMSNorm circle (dashed reference: ‖x̂‖ = 1)
  ctx.beginPath();
  ctx.arc(normCx, normCy, normR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // B) AdaLN-deformed Ellipse: (1 + s) ⊙ x̂ + b (physically stretches & shifts off-center!)
  ctx.beginPath();
  ctx.ellipse(normCx + shiftX, normCy + shiftY, normR * scaleX, normR * scaleY, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.gateDim;
  ctx.fill();
  ctx.strokeStyle = actNorm > 0.3 ? '#ffffff' : PALETTE.gate;
  ctx.lineWidth = 1.6 + actNorm * 0.6;
  ctx.stroke();

  // Animated vectors: raw -> unit circle (RMSNorm) -> deformed ellipse (AdaLN)!
  const rawRadii = [42, 14, 46, 18, 40, 15];
  const normPull = easeOut(clamp(pNorm * 1.8, 0, 1));
  const adalnPush = easeInOut(clamp((pNorm - 0.45) / 0.55, 0, 1));
  rawRadii.forEach((rr, i) => {
    const a = (i / rawRadii.length) * Math.PI * 2 - 0.3;
    const ux = normCx + Math.cos(a) * lerp(rr, normR, normPull);
    const uy = normCy + Math.sin(a) * lerp(rr, normR, normPull);
    const ex = normCx + shiftX + Math.cos(a) * (normR * scaleX);
    const ey = normCy + shiftY + Math.sin(a) * (normR * scaleY);
    const vx = lerp(ux, ex, adalnPush);
    const vy = lerp(uy, ey, adalnPush);
    ctx.strokeStyle = adalnPush > 0.4 ? PALETTE.gate : PALETTE.img;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(normCx + shiftX * adalnPush, normCy + shiftY * adalnPush);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(vx, vy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  drawMathTag(ctx, isAnima ? 'LN → (1+s)⊙x̂+b' : 'RMSNorm → (1+s)⊙x̂+b', normCx + 10, normCy - normR - 22, PALETTE.gate, actNorm, 'center', 10.5);

  // Explicit σ -> Sinusoidal MLP -> (s, b, g) modulation source feeding AdaLN from below!
  const sigY = midY + 106;
  drawFlowArrow(ctx, normCx, sigY - 14, normCx, normCy + normR + 18, PALETTE.gate, pNorm > 0.1 ? pNorm : undefined, true);
  drawMathTag(ctx, `σ=${sigma.toFixed(2)} → [s, b, g]`, normCx + 12, sigY, PALETTE.gate, actNorm, 'center', 10.5);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.fillText(isAnima ? '블록별 독립 9벡터' : isMoss ? '전 42블록 공용 6벡터' : '공용 tvec + bias[i]', normCx + 12, sigY + 16);

  // ---- 2. W_Q / W_K / W_V + QK-RMSNORM + MULTI-FREQUENCY RoPE ----
  const splitX = 148;
  const projX = 192;
  const qkNormX = 296;
  const ropeX = 374;
  const qY = midY - 82;
  const kY = midY;
  const vY = midY + 82;

  drawFlowArrow(ctx, normCx + normR + 8, normCy, splitX, midY, PALETTE.img, pQkv > 0.02 && pQkv < 0.4 ? pQkv * 2.5 : undefined);

  ctx.save();
  ctx.strokeStyle = PALETTE.img;
  ctx.lineWidth = 1.4 + actQkv * 0.7;
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.bezierCurveTo(splitX + 18, midY, projX - 18, qY, projX - 4, qY);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.txt;
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.lineTo(projX - 4, kY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(148,163,184,0.6)';
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.bezierCurveTo(splitX + 18, midY, projX - 18, vY, projX - 4, vY);
  ctx.stroke();
  ctx.restore();

  const drawMatrixProj = (y: number, eq: string, sub: string, color: string, vals: number[]) => {
    const mx = projX;
    const my = y - 14;
    roundRect(ctx, mx, my, 28, 28, 4, color + '14', color, 1.1 + actQkv * 0.7);
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx + 9, my); ctx.lineTo(mx + 9, my + 28);
    ctx.moveTo(mx + 19, my); ctx.lineTo(mx + 19, my + 28);
    ctx.moveTo(mx, my + 9); ctx.lineTo(mx + 28, my + 9);
    ctx.moveTo(mx, my + 19); ctx.lineTo(mx + 28, my + 19);
    ctx.stroke();

    drawMathTag(ctx, eq, mx + 32, my - 7, color, actQkv, 'center', 10);

    const vx = mx + 36;
    vals.forEach((v, idx) => {
      const pulseV = clamp(v + actQkv * 0.22 * Math.sin(phase * Math.PI * 6 + idx), 0.1, 1);
      roundRect(ctx, vx + idx * 10, y - 10, 8, 20, 2, color + Math.round((0.18 + pulseV * 0.7) * 255).toString(16).padStart(2, '0'), color, 0.85);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(sub, vx + 18, y + 22);
  };

  drawMatrixProj(qY, 'q=W_Q·h', isKrea ? '48H' : isMoss ? '24H' : '16H', PALETTE.img, [0.85, 0.35, 0.92, 0.5]);
  drawMatrixProj(kY, 'k=W_K·h', isKrea ? '12H GQA' : isMoss ? '24H' : '16H', PALETTE.txt, [0.4, 0.9, 0.72, 0.25]);
  drawMatrixProj(vY, 'v=W_V·h', isKrea ? '12H GQA' : isMoss ? '24H' : '16H', '#94a3b8', [0.6, 0.55, 0.8, 0.7]);

  // Explicit QK-RMSNorm unit circles on Q and K (head-wise normalization before RoPE!)
  const drawMiniNorm = (cx: number, cy: number, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = color + '14';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 + actQkv * 0.6;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RMS', cx, cy + 3);
    ctx.restore();
  };
  drawFlowArrow(ctx, projX + 78, qY, qkNormX - 15, qY, PALETTE.img);
  drawFlowArrow(ctx, projX + 78, kY, qkNormX - 15, kY, PALETTE.txt);
  drawMiniNorm(qkNormX, qY, PALETTE.img);
  drawMiniNorm(qkNormX, kY, PALETTE.txt);
  drawMathTag(ctx, 'QK-Norm', qkNormX, qY - 22, PALETTE.text2, actQkv, 'center', 9.5);

  // Multi-frequency RoPE rotation clocks after QK-Norm!
  drawFlowArrow(ctx, qkNormX + 14, qY, ropeX - 20, qY, PALETTE.img);
  drawFlowArrow(ctx, qkNormX + 14, kY, ropeX - 20, kY, PALETTE.txt);

  const ropeAngleBase = phase * Math.PI * 4;
  [1.0, 0.38].forEach((freq, fIdx) => {
    const dx = ropeX + fIdx * 48;
    drawRopeDial(ctx, dx, qY, 16, -Math.PI / 2 + ropeAngleBase * freq, PALETTE.img, fIdx === 0 ? 'R(θ₀)' : 'R(θ₁)', false);
    const kFrozen = isKrea || isAnima;
    drawRopeDial(
      ctx,
      dx,
      kY,
      16,
      kFrozen ? 0 : -Math.PI / 2 + ropeAngleBase * freq * 0.75,
      PALETTE.txt,
      kFrozen ? (isKrea ? '0°(txt)' : 'OFF') : fIdx === 0 ? 'R(θ₀)' : 'R(θ₁)',
      kFrozen,
    );
  });

  // V bypasses both QK-Norm and RoPE!
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.5)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(projX + 78, vY);
  ctx.lineTo(MESO_TO_MICRO_PORTAL.x - 10, vY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('V: no QK-Norm · no RoPE', ropeX, vY - 8);
  ctx.restore();

  const attn = MESO_TO_MICRO_PORTAL;
  const qkvPulse = pQkv > 0.35 && pQkv < 0.98 ? (pQkv - 0.35) / 0.65 : undefined;
  drawFlowArrow(ctx, ropeX + 66, qY, attn.x - 8, attn.y + 34, PALETTE.img, qkvPulse);
  drawFlowArrow(ctx, ropeX + 66, kY, attn.x - 8, attn.y + attn.h / 2, PALETTE.txt, qkvPulse);
  drawFlowArrow(ctx, attn.x - 14, vY, attn.x - 4, attn.y + attn.h - 24, '#94a3b8');

  // ---- 3. 3D MULTI-HEAD ATTENTION (PORTAL TO MICRO!) ----
  drawDepthStack(ctx, attn.x, attn.y, attn.w, attn.h, PALETTE.attn, 4, 6, -5);
  roundRect(ctx, attn.x, attn.y, attn.w, attn.h, 12, `rgba(6, 9, 16, ${lerp(0.90, 0.15, portalFade)})`, PALETTE.attn, 1.6 + actAttn * 1.4);

  if (portalFade < 0.85) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - portalFade * 1.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#99f6e4';
    ctx.font = '800 13px "Pretendard Variable", sans-serif';
    ctx.fillText(isAnima ? 'Self → ★Cross' : isMoss ? 'Joint Attn ★' : 'GQA Attn ★', attn.x + attn.w / 2, attn.y + 30);
    drawMathTag(ctx, 'softmax(Q·Kᵀ/√128)·V', attn.x + attn.w / 2, attn.y + 52, PALETTE.attn, actAttn, 'center', 10);
    roundRect(ctx, attn.x + attn.w / 2 - 62, attn.y + attn.h - 30, 124, 22, 11, 'rgba(45,212,191,0.16)', 'rgba(45,212,191,0.5)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText('휠/클릭 → 어텐션 ↘', attn.x + attn.w / 2, attn.y + attn.h - 15);
    ctx.restore();
  }

  // Krea 2 Output Gate Aperture
  let sum1X = attn.x + attn.w + 40;
  if (isKrea) {
    const gateX = 752;
    const gateW = 94;
    drawFlowArrow(ctx, attn.x + attn.w + 22, midY, gateX - 6, midY, PALETTE.gate, pAttn > 0.25 && pAttn < 0.95 ? (pAttn - 0.25) / 0.7 : undefined);
    roundRect(ctx, gateX, midY - 52, gateW, 104, 9, PALETTE.gateDim, PALETTE.gate, 1.4 + actAttn);
    drawMathTag(ctx, `σ(Wg·h)=${kreaGate.toFixed(2)}`, gateX + gateW / 2, midY - 64, PALETTE.gate, actAttn, 'center', 10.5);

    const shW = gateW - 20;
    const shH = 44;
    const shX = gateX + 10;
    const shY = midY - 18;
    roundRect(ctx, shX, shY, shW, shH, 6, '#090f19', 'rgba(244,63,94,0.4)', 1);
    const openH = shH * kreaGate;
    roundRect(ctx, shX + 3, shY + (shH - openH) / 2, shW - 6, openH, 4, 'rgba(45,212,191,0.5)', PALETTE.attn, 1);
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⊙ before Wo', gateX + gateW / 2, midY + 42);
    sum1X = gateX + gateW + 14;
  }

  drawFlowArrow(ctx, sum1X, midY - 52, sum1X, railY + 13, PALETTE.attn, pAttn > 0.55 && pAttn < 0.98 ? (pAttn - 0.55) / 0.45 : undefined);
  drawMathTag(ctx, 'x + g₁⊙Attn', sum1X, railY - 16, PALETTE.attn, actAttn, 'center', 10.5);
  ctx.beginPath(); ctx.arc(sum1X, railY, 10, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.attn; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum1X, railY + 4.5);

  // ---- 4. REAL FFN CIRCUIT GEOMETRY (NOT A FLAT BOX!) ----
  const ffnX = 892;
  const ffnW = 196;
  drawFlowArrow(ctx, ffnX + 24, railY, ffnX + 24, midY - 62, PALETTE.img, pFfn > 0.02 && pFfn < 0.4 ? pFfn * 2.5 : undefined);

  if (isAnima) {
    // Anima: Bottleneck Expansion Trapezoid (2048 -> 8192 -> 2048) + GELU
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ffnX + 12, midY - 26);
    ctx.lineTo(ffnX + ffnW / 2, midY - 56);
    ctx.lineTo(ffnX + ffnW - 12, midY - 26);
    ctx.lineTo(ffnX + ffnW - 12, midY + 26);
    ctx.lineTo(ffnX + ffnW / 2, midY + 56);
    ctx.lineTo(ffnX + 12, midY + 26);
    ctx.closePath();
    ctx.fillStyle = actFfn > 0.2 ? 'rgba(56,189,248,0.14)' : PALETTE.surface;
    ctx.fill();
    ctx.strokeStyle = actFfn > 0.2 ? PALETTE.img : PALETTE.border;
    ctx.lineWidth = 1.4 + actFfn;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 11px "Pretendard Variable", sans-serif';
    ctx.fillText('MLP (GELU)', ffnX + ffnW / 2, midY - 6);
    ctx.fillStyle = PALETTE.img;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillText('2048 → 8192 → 2048', ffnX + ffnW / 2, midY + 14);
    ctx.restore();
  } else {
    // MOSS (Softcap Gated FFN) & Krea 2 (SwiGLU): Explicit 2-Branch Gate ⊙ Up -> Down circuit!
    const bTopY = midY - 36;
    const bBotY = midY + 34;
    const mulX = ffnX + 124;

    // 2 parallel branches: Gate branch (top) + Up branch (bottom)
    roundRect(ctx, ffnX + 10, bTopY - 16, 86, 32, 6, PALETTE.gateDim, PALETTE.gate, 1.2 + actFfn * 0.7);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fda4af';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.fillText(isMoss ? 'Softcap Gate' : 'SiLU(W_g·h)', ffnX + 53, bTopY + 3);

    roundRect(ctx, ffnX + 10, bBotY - 16, 86, 32, 6, PALETTE.imgDim, PALETTE.img, 1.2 + actFfn * 0.7);
    ctx.fillStyle = '#bae6fd';
    ctx.fillText(isMoss ? 'Softcap Up' : 'W_up · h', ffnX + 53, bBotY + 3);

    // Converge into ⊙ multiplier -> W_down
    drawFlowArrow(ctx, ffnX + 96, bTopY, mulX - 11, midY - 6, PALETTE.gate);
    drawFlowArrow(ctx, ffnX + 96, bBotY, mulX - 11, midY + 6, PALETTE.img);

    ctx.beginPath();
    ctx.arc(mulX, midY, 11, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.surfaceHi;
    ctx.fill();
    ctx.strokeStyle = PALETTE.attn;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px monospace';
    ctx.fillText('⊙', mulX, midY + 4);

    drawFlowArrow(ctx, mulX + 11, midY, ffnX + 148, midY, PALETTE.attn);
    roundRect(ctx, ffnX + 148, midY - 24, 38, 48, 6, PALETTE.surface, PALETTE.img, 1.2);
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.fillText('W_dn', ffnX + 167, midY + 3);

    drawMathTag(ctx, isMoss ? 'Softcap Gated (8192)' : 'SwiGLU', ffnX + ffnW / 2, midY + 74, PALETTE.img, actFfn, 'center', 10);
  }

  const sum2X = ffnX + ffnW - 22;
  drawFlowArrow(ctx, sum2X, midY - 40, sum2X, railY + 13, PALETTE.img, pFfn > 0.5 && pFfn < 0.98 ? (pFfn - 0.5) * 2 : undefined);
  drawMathTag(ctx, 'x + g₂⊙FFN', sum2X - 14, railY - 16, PALETTE.img, actFfn, 'center', 10.5);
  ctx.beginPath(); ctx.arc(sum2X, railY, 10, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.img; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum2X, railY + 4.5);
}

/* ============================================================================
 * LEVEL 3 (z = 2): MICRO — LIVE ATTENTION SYNCED TO SHARED `phase`
 * ============================================================================ */
export function drawMicroScene(
  ctx: CanvasRenderingContext2D,
  modelId: ModelId,
  phase: number,
  selectedPatch: number,
  selectedToken: number,
  kreaGate: number,
  hitOut?: MicroHitRects,
) {
  const H = WORLD_H;
  const model = MODELS[modelId];
  const isAnima = modelId === 'anima';
  const isMoss = modelId === 'moss';
  const isKrea = modelId === 'krea2';
  const safeTok = Math.min(selectedToken, model.miniTokens.length - 1);
  const cy = H * 0.53;

  const p1 = easeInOut(phase / 0.28);
  const p2 = easeInOut((phase - 0.28) / 0.28);
  const p3 = easeInOut((phase - 0.56) / 0.22);
  const p4 = easeInOut((phase - 0.78) / 0.22);

  const actDot = stagePulse(phase, 0.0, 0.34);
  const actSoft = stagePulse(phase, 0.26, 0.60);
  const actSlice = stagePulse(phase, 0.52, 0.82);
  const actMap = stagePulse(phase, 0.74, 1.0);

  if (hitOut) {
    hitOut.patches = [];
    hitOut.tokens = [];
  }

  const gridSize = 196;
  const gridX = 24;
  const gridY = cy - gridSize / 2;
  const cell = gridSize / 4;

  drawMathTag(ctx, `q_${selectedPatch} ∈ ℝ¹²⁸`, gridX + gridSize / 2, gridY - 18, PALETTE.img, actDot, 'center', 12);

  let selPatchCenter = { x: gridX + gridSize, y: cy };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const cxCell = gridX + c * cell;
      const cyCell = gridY + r * cell;
      const isSel = idx === selectedPatch;
      if (hitOut) hitOut.patches.push({ x: cxCell, y: cyCell, w: cell, h: cell, idx });

      roundRect(
        ctx,
        cxCell + 2,
        cyCell + 2,
        cell - 4,
        cell - 4,
        5,
        isSel ? 'rgba(56, 189, 248, 0.34)' : 'rgba(12, 18, 30, 0.9)',
        isSel ? '#ffffff' : 'rgba(56, 189, 248, 0.28)',
        isSel ? 2 : 1,
      );
      ctx.fillStyle = isSel ? '#ffffff' : PALETTE.text2;
      ctx.font = (isSel ? '700' : '500') + ' 10px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(PATCH_LABELS[idx], cxCell + cell / 2, cyCell + cell / 2 + 3.5);
      if (isSel) selPatchCenter = { x: cxCell + cell, y: cyCell + cell / 2 };
    }
  }

  const keyX = 274;
  const keyW = 264;
  const rowH = 38;
  const listTop = cy - (model.miniTokens.length * rowH) / 2;

  const logits = model.miniTokens.map((tk) => (tk.kind === 'pad' ? 0 : (tk.spatial[selectedPatch] - 0.25) * 4.2));
  const exps = logits.map((v) => Math.exp(v));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  drawMathTag(
    ctx,
    p2 > 0.25
      ? (isAnima ? 'p_ij = exp(s_ij) / (Σ + pad·e⁰)' : 'p_ij = softmax(q_i · k_j / √128)')
      : 's_ij = (q_i · k_j) / √128',
    keyX + keyW / 2,
    listTop - 20,
    p2 > 0.25 ? PALETTE.attn : PALETTE.txt,
    Math.max(actDot, actSoft),
    'center',
    11.5,
  );

  model.miniTokens.forEach((tok, j) => {
    const ty = listTop + j * rowH;
    const isTokSel = j === safeTok;
    const isTrap = tok.kind !== 'prompt';
    if (hitOut) hitOut.tokens.push({ x: keyX, y: ty, w: keyW, h: rowH - 6, idx: j });

    const rayStrength = clamp(probs[j] * 2.2, 0.14, 1);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(selPatchCenter.x, selPatchCenter.y);
    ctx.bezierCurveTo(
      lerp(selPatchCenter.x, keyX, 0.45),
      selPatchCenter.y,
      lerp(selPatchCenter.x, keyX, 0.55),
      ty + (rowH - 6) / 2,
      keyX - 4,
      ty + (rowH - 6) / 2,
    );
    ctx.strokeStyle = isTrap ? PALETTE.gate : isTokSel ? PALETTE.attn : PALETTE.img;
    ctx.globalAlpha = (0.14 + rayStrength * 0.65) * clamp(0.35 + easeOut(p1) * 0.65, 0, 1);
    ctx.lineWidth = isTokSel ? 2.4 : 1.1 + probs[j] * 2.2;
    ctx.stroke();

    if (p1 > 0.02 && p1 < 0.98 && (isTokSel || probs[j] > 0.2)) {
      const px = lerp(selPatchCenter.x, keyX - 4, p1);
      const py = lerp(selPatchCenter.y, ty + (rowH - 6) / 2, easeInOut(p1));
      ctx.globalAlpha = 1;
      ctx.shadowColor = PALETTE.img;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    roundRect(
      ctx,
      keyX,
      ty,
      keyW,
      rowH - 6,
      7,
      isTokSel ? 'rgba(45, 212, 191, 0.14)' : isTrap ? 'rgba(244, 63, 94, 0.08)' : PALETTE.surface,
      isTokSel ? PALETTE.attn : isTrap ? 'rgba(244, 63, 94, 0.45)' : PALETTE.borderSoft,
      isTokSel ? 1.6 : 1,
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = isTrap ? '#fda4af' : isTokSel ? '#99f6e4' : '#fde68a';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(tok.label, keyX + 10, ty + 20);

    const barX = keyX + 92;
    const maxBarW = keyW - 144;
    const logitNorm = clamp((logits[j] + 1.5) / 4.8, 0.05, 1);
    const displayFrac = lerp(logitNorm * clamp(0.35 + easeOut(p1) * 0.65, 0, 1), probs[j], p2);
    roundRect(ctx, barX, ty + 11, maxBarW, 10, 4, 'rgba(148,163,184,0.12)');
    roundRect(ctx, barX, ty + 11, Math.max(4, maxBarW * displayFrac), 10, 4, isTrap ? PALETTE.gate : PALETTE.attn);

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillText(p2 > 0.35 ? `${(probs[j] * 100).toFixed(0)}%` : logits[j].toFixed(1), keyX + keyW - 8, ty + 20);
  });

  const matSize = 172;
  const matX = 582;
  const matY = cy - matSize / 2;

  drawMathTag(ctx, isAnima ? 'A [16, N, L]' : isMoss ? 'A[0:N, N:N+L]' : 'A[T:T+N, 0:T]', matX + matSize / 2 + 8, matY - 24, PALETTE.attn, actSlice, 'center', 11.5);
  drawDepthStack(ctx, matX, matY, matSize, matSize, PALETTE.attn, 4, 6, -5);
  roundRect(ctx, matX, matY, matSize, matSize, 6, '#080e18', PALETTE.border, 1.3);

  let slX: number, slY: number, slW: number, slH: number;
  if (isAnima) {
    ctx.fillStyle = PALETTE.gateDim;
    ctx.fillRect(matX + matSize * 0.74, matY + 3, matSize * 0.24, matSize - 6);
    slX = matX + 3; slY = matY + 3; slW = matSize * 0.69; slH = matSize - 6;
  } else if (isMoss) {
    const split = matSize * 0.62;
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.fillRect(matX + 2, matY + 2, split - 2, split - 2);
    slX = matX + split; slY = matY + 2; slW = matSize - split - 2; slH = split - 2;
  } else {
    const split = matSize * 0.38;
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.fillRect(matX + split, matY + split, matSize - split - 2, matSize - split - 2);
    slX = matX + 2; slY = matY + split; slW = split - 2; slH = matSize - split - 2;
  }

  roundRect(ctx, slX, slY, slW, slH, 4, 'rgba(45, 212, 191, 0.30)', PALETTE.attn, 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Img→Txt', slX + slW / 2, slY + slH / 2 + 4);

  const hmSize = 192;
  const hmX = 900;
  const hmY = cy - hmSize / 2;
  const hmCell = hmSize / 4;

  if (p3 > 0.02 && p3 < 0.98) {
    ctx.save();
    ctx.globalAlpha = Math.sin(p3 * Math.PI) * 0.65;
    roundRect(ctx, lerp(slX, hmX, p3), lerp(slY, hmY, p3), lerp(slW, hmSize, p3), lerp(slH, hmSize, p3), 6, 'rgba(45, 212, 191, 0.25)', PALETTE.attn, 1.8);
    ctx.restore();
  }

  if (isKrea) {
    const gx = (matX + matSize + 24 + hmX) / 2;
    roundRect(ctx, gx - 24, cy - 34, 48, 68, 8, PALETTE.gateDim, PALETTE.gate, 1.4 + actMap * 0.8);
    ctx.fillStyle = '#fda4af';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Gate', gx, cy - 16);
    ctx.fillText(kreaGate.toFixed(2), gx, cy + 26);
    const barH = 26 * kreaGate;
    roundRect(ctx, gx - 12, cy - barH / 2 + 2, 24, barH, 3, PALETTE.attn);
  }

  const activeTok = model.miniTokens[safeTok];
  drawMathTag(ctx, isKrea ? `σ(Wg·h)⊙(A·V) · "${activeTok.label}"` : `Map("${activeTok.label}") = mean_h(A)`, hmX + hmSize / 2, hmY - 18, PALETTE.attn, actMap, 'center', 11.5);

  roundRect(ctx, hmX - 4, hmY - 4, hmSize + 8, hmSize + 8, 10, '#080e18', PALETTE.attn, 1.4 + actMap * 0.8);
  const reveal = clamp(0.42 + p4 * 0.58, 0.42, 1);

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const raw = activeTok.spatial[idx];
      const eff = (isKrea ? raw * kreaGate : raw) * reveal;
      const x = hmX + c * hmCell + 2;
      const y = hmY + r * hmCell + 2;
      const s = hmCell - 4;

      roundRect(
        ctx,
        x,
        y,
        s,
        s,
        5,
        `rgba(45, 212, 191, ${0.06 + eff * 0.86})`,
        idx === selectedPatch ? '#ffffff' : 'rgba(148,163,184,0.16)',
        idx === selectedPatch ? 1.8 : 0.8,
      );
      ctx.fillStyle = eff > 0.52 ? '#042f2e' : '#e2e8f0';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(eff.toFixed(2), x + s / 2, y + s / 2 + 4);
    }
  }
}
