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
 * SHARED SCHEMATIC ATTENTION COMPUTATION (used identically by Micro list & heatmap)
 * ============================================================================ */
export const ANIMA_CTX_LEN = 512;
export const ANIMA_REAL_TOKENS = 5; // silver, eyes, night, dress, </s>
export const ANIMA_PAD_SLOTS = ANIMA_CTX_LEN - ANIMA_REAL_TOKENS; // 507 zero-padded slots

export interface PatchAttentionResult {
  logits: number[];
  probs: number[];
  /** Non-null for joint self-attention models (MOSS-Image, Krea 2): aggregated probability mass on all N image keys */
  imgKeyProb: number | null;
  /** Non-null for Anima: number of zero-padded slots (512 - Lt) */
  padCount: number | null;
}

/**
 * Deterministic schematic 1-head attention distribution for a given query patch.
 * Both the Micro token probability list and the 4x4 spatial heatmap call this exact function,
 * guaranteeing that cell (i, j) in the heatmap matches row j for patch i in the list,
 * and that probabilities over the full key set S sum to 1.0.
 */
export function computePatchAttention(modelId: ModelId, patchIdx: number): PatchAttentionResult {
  const model = MODELS[modelId];
  const isAnima = modelId === 'anima';

  if (isAnima) {
    // Anima Cross-Attention: key set S = L=512 fixed ctx slots (Lt real + (512-Lt) zero-padded slots with logit=0).
    // With QK-RMSNorm, matching tokens reach schematic logits ~6..8 so real tokens remain visible alongside 507*exp(0).
    const logits = model.miniTokens.map((tk) =>
      tk.kind === 'pad' ? 0 : (tk.spatial[patchIdx] - 0.15) * 9.5,
    );
    const exps = model.miniTokens.map((tk, idx) =>
      tk.kind === 'pad' ? ANIMA_PAD_SLOTS * Math.exp(0) : Math.exp(logits[idx]),
    );
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sumExp);
    return { logits, probs, imgKeyProb: null, padCount: ANIMA_PAD_SLOTS };
  }

  // MOSS-Image ([Img|Txt]) & Krea 2 ([Txt|Img]) Joint Self-Attention:
  // Key set S = N image tokens U L text tokens. Image keys take a substantial share of the softmax denominator.
  const scale = modelId === 'moss' ? 7.6 : 7.9;
  const logits = model.miniTokens.map((tk) => (tk.spatial[patchIdx] - 0.15) * scale);
  const textExps = logits.map((v) => Math.exp(v));
  const textSum = textExps.reduce((a, b) => a + b, 0);
  // Schematic aggregated exp-sum over N image keys (varies slightly per patch so image-vs-text balance feels organic)
  const imgExpAgg = (modelId === 'moss' ? 540 : 620) + ((patchIdx * 37) % 140);
  const totalSum = textSum + imgExpAgg;
  const probs = textExps.map((e) => e / totalSum);
  return {
    logits,
    probs,
    imgKeyProb: imgExpAgg / totalSum,
    padCount: null,
  };
}

/* ============================================================================
 * LEVEL 2 (z = 1): MESO — REAL DIT BLOCK INTERNALS
 *   - Anima: 3 sequential sub-layers:
 *       1) Self-Attn (Image Q,K,V + 3D RoPE on BOTH Q & K) -> x + g1*SA
 *       2) Cross-Attn (Image Q, fixed ctx rail K,V + RoPE OFF on BOTH Q & K) -> x + g2*CA
 *       3) MLP (GELU) -> x + g3*MLP
 *   - MOSS-Image / Krea 2:
 *       Joint Self-Attn ([Img|Txt] or [Txt|Img] -> Q,K,V) + modality-accurate RoPE dials on BOTH Q & K
 *       + Krea 2 Output Gate before Wo + Gated FFN
 * ============================================================================ */
function drawAnimaMesoScene(
  ctx: CanvasRenderingContext2D,
  phase: number,
  sigma: number,
  portalFade: number,
) {
  const W = WORLD_W;
  const ctxRailY = 58;
  const railY = 114;
  const midY = 320;

  const actNorm = stagePulse(phase, 0.0, 0.22);
  const actSelf = stagePulse(phase, 0.16, 0.46);
  const actCross = stagePulse(phase, 0.42, 0.76);
  const actMlp = stagePulse(phase, 0.72, 1.0);

  const pNorm = easeInOut(phase / 0.22);
  const pSelf = easeInOut((phase - 0.18) / 0.28);
  const pCross = easeInOut((phase - 0.44) / 0.30);
  const pMlp = easeInOut((phase - 0.72) / 0.28);

  // ---- TOP RAIL 1: FIXED EXTERNAL TEXT CTX [L, 1024] (matches Macro's amber ctx arrows) ----
  ctx.save();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 4]);
  ctx.beginPath();
  ctx.moveTo(24, ctxRailY);
  ctx.lineTo(W - 24, ctxRailY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '600 10.5px "JetBrains Mono", monospace';
  ctx.fillStyle = PALETTE.txt;
  ctx.textAlign = 'left';
  ctx.fillText('고정 ctx [L, 1024]  (블록 외부 · 갱신 없음)', 24, ctxRailY - 10);
  ctx.textAlign = 'right';
  ctx.fillText('ctx 불변 →', W - 24, ctxRailY - 10);
  ctx.restore();

  // ---- TOP RAIL 2: IMAGE RESIDUAL HIGHWAY x [N, 2048] ----
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(24, railY);
  ctx.lineTo(W - 24, railY);
  ctx.stroke();

  const rxPulse = lerp(24, W - 24, phase);
  ctx.shadowColor = PALETTE.img;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rxPulse, railY, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '600 10.5px "JetBrains Mono", monospace';
  ctx.fillStyle = PALETTE.img;
  ctx.textAlign = 'left';
  ctx.fillText('x_img [N, 2048]', 24, railY - 10);
  ctx.textAlign = 'right';
  ctx.fillText('x_out →', W - 20, railY + 20);
  ctx.restore();

  // ---- 0. LN + AdaLN(σ) (9 modulation vectors: 3 sub-layers × 3) ----
  const normCx = 66;
  const normCy = midY;
  const normR = 24;
  drawFlowArrow(ctx, normCx, railY, normCx, normCy - normR - 14, PALETTE.img, pNorm > 0.02 && pNorm < 0.6 ? pNorm * 1.6 : undefined);

  const scaleX = 0.74 + sigma * 0.6;
  const scaleY = 1.24 - sigma * 0.5;
  const shiftX = (sigma - 0.5) * 11;
  const shiftY = (0.5 - sigma) * 9;

  ctx.save();
  ctx.beginPath();
  ctx.arc(normCx, normCy, normR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.1;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.ellipse(normCx + shiftX, normCy + shiftY, normR * scaleX, normR * scaleY, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.gateDim;
  ctx.fill();
  ctx.strokeStyle = actNorm > 0.3 ? '#ffffff' : PALETTE.gate;
  ctx.lineWidth = 1.5 + actNorm * 0.6;
  ctx.stroke();

  const rawRadii = [34, 13, 36, 16, 32, 14];
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
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(normCx + shiftX * adalnPush, normCy + shiftY * adalnPush);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(vx, vy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  drawMathTag(ctx, 'LN → AdaLN', normCx + 4, normCy - normR - 22, PALETTE.gate, actNorm, 'center', 10);
  const sigY = midY + 96;
  drawFlowArrow(ctx, normCx, sigY - 14, normCx, normCy + normR + 18, PALETTE.gate, pNorm > 0.1 ? pNorm : undefined, true);
  drawMathTag(ctx, `σ=${sigma.toFixed(2)}`, normCx, sigY, PALETTE.gate, actNorm, 'center', 10);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.fillText('9벡터 (3×3)', normCx, sigY + 14);

  // ---- 1. SUB-LAYER 1: SELF-ATTENTION (Image Q, K, V + 3D RoPE on BOTH Q & K) ----
  const saSplitX = 122;
  const saProjX = 148;
  const saRopeX = 224;
  const saBoxX = 266;
  const saBoxW = 84;
  const saBoxY = midY - 62;
  const saBoxH = 124;
  const saQY = midY - 58;
  const saKY = midY;
  const saVY = midY + 58;

  drawFlowArrow(ctx, normCx + normR + 8, normCy, saSplitX, midY, PALETTE.img, pSelf > 0.02 && pSelf < 0.35 ? pSelf * 2.8 : undefined);

  // All 3 branches come from Image hidden h (cyan!)
  ctx.save();
  ctx.strokeStyle = PALETTE.img;
  ctx.lineWidth = 1.3 + actSelf * 0.6;
  [saQY, saKY, saVY].forEach((ty) => {
    ctx.beginPath();
    ctx.moveTo(saSplitX, midY);
    ctx.bezierCurveTo(saSplitX + 12, midY, saProjX - 10, ty, saProjX - 2, ty);
    ctx.stroke();
  });
  ctx.restore();

  const drawCompactProj = (x: number, y: number, label: string, color: string, act: number) => {
    roundRect(ctx, x, y - 12, 46, 24, 5, color + '1a', color, 1.1 + act * 0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillText(label, x + 23, y + 3.5);
  };

  drawCompactProj(saProjX, saQY, 'q=W_Q·h', PALETTE.img, actSelf);
  drawCompactProj(saProjX, saKY, 'k=W_K·h', PALETTE.img, actSelf);
  drawCompactProj(saProjX, saVY, 'v=W_V·h', PALETTE.img, actSelf);

  // Both Q and K get QK-RMSNorm + 3D RoPE (BOTH rotating!)
  const ropeAngle = -Math.PI / 2 + phase * Math.PI * 4;
  drawFlowArrow(ctx, saProjX + 46, saQY, saRopeX - 16, saQY, PALETTE.img);
  drawFlowArrow(ctx, saProjX + 46, saKY, saRopeX - 16, saKY, PALETTE.img);
  drawRopeDial(ctx, saRopeX, saQY, 13, ropeAngle, PALETTE.img, '3D RoPE', false);
  drawRopeDial(ctx, saRopeX, saKY, 13, ropeAngle * 0.85, PALETTE.img, '3D RoPE', false);

  // V bypasses RoPE
  ctx.save();
  ctx.strokeStyle = 'rgba(56,189,248,0.45)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(saProjX + 46, saVY);
  ctx.lineTo(saBoxX - 6, saVY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 8.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('no RoPE', saRopeX, saVY - 7);
  ctx.restore();

  drawFlowArrow(ctx, saRopeX + 15, saQY, saBoxX - 4, saBoxY + 28, PALETTE.img, pSelf > 0.3 && pSelf < 0.85 ? (pSelf - 0.3) / 0.55 : undefined);
  drawFlowArrow(ctx, saRopeX + 15, saKY, saBoxX - 4, midY, PALETTE.img, pSelf > 0.3 && pSelf < 0.85 ? (pSelf - 0.3) / 0.55 : undefined);
  drawFlowArrow(ctx, saBoxX - 8, saVY, saBoxX - 3, saBoxY + saBoxH - 22, PALETTE.img);

  // Self-Attn box
  roundRect(ctx, saBoxX, saBoxY, saBoxW, saBoxH, 10, PALETTE.surface, PALETTE.img, 1.4 + actSelf * 0.9);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bae6fd';
  ctx.font = '800 11.5px "Pretendard Variable", sans-serif';
  ctx.fillText('1. Self-Attn', saBoxX + saBoxW / 2, midY - 12);
  ctx.fillStyle = PALETTE.text2;
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.fillText('Img ↔ Img', saBoxX + saBoxW / 2, midY + 6);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('QK-Norm+RoPE', saBoxX + saBoxW / 2, midY + 22);

  // Residual add #1: x + g1 ⊙ SA
  const sum1X = 362;
  drawFlowArrow(ctx, saBoxX + saBoxW, midY, sum1X, midY, PALETTE.img);
  drawFlowArrow(ctx, sum1X, midY, sum1X, railY + 12, PALETTE.img, pSelf > 0.55 && pSelf < 0.98 ? (pSelf - 0.55) / 0.43 : undefined);
  drawMathTag(ctx, 'x + g₁⊙SA', sum1X, railY - 14, PALETTE.img, actSelf, 'center', 10);
  ctx.beginPath(); ctx.arc(sum1X, railY, 9.5, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.img; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum1X, railY + 4);

  // ---- 2. SUB-LAYER 2: CROSS-ATTENTION (Image Q, Fixed ctx K & V, RoPE OFF on BOTH) ----
  const attn = MESO_TO_MICRO_PORTAL; // { x: 514, y: 244, w: 204, h: 132 }
  const caCtxDropX = 382;
  const caBoxX = 398;
  const caBoxW = 56;
  const caImgDropX = caBoxX + caBoxW / 2;
  const caRopeX = 482;
  const caQY = 264;
  const caKY = 326;
  const caVY = 388;

  // Image h drops from residual rail (AFTER Self-Attn add!) -> straight into top of Q box
  drawFlowArrow(ctx, caImgDropX, railY, caImgDropX, caQY - 14, PALETTE.img, pCross > 0.02 && pCross < 0.4 ? pCross * 2.5 : undefined);

  // Fixed ctx drops cleanly along the LEFT of K/V boxes from TOP amber rail (y=58) -> K and V!
  ctx.save();
  ctx.strokeStyle = PALETTE.txt;
  ctx.lineWidth = 1.6 + actCross * 0.6;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(caCtxDropX, ctxRailY);
  ctx.lineTo(caCtxDropX, caVY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Small bridge dot at ctx rail
  ctx.fillStyle = PALETTE.txt;
  ctx.beginPath();
  ctx.arc(caCtxDropX, ctxRailY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawFlowArrow(ctx, caCtxDropX, caKY, caBoxX - 2, caKY, PALETTE.txt, pCross > 0.05 && pCross < 0.45 ? (pCross - 0.05) * 2.5 : undefined);
  drawFlowArrow(ctx, caCtxDropX, caVY, caBoxX - 2, caVY, PALETTE.txt);

  const drawCrossProj = (y: number, label: string, color: string) => {
    roundRect(ctx, caBoxX, y - 12, caBoxW, 24, 5, color + '1a', color, 1.1 + actCross * 0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.fillText(label, caBoxX + caBoxW / 2, y + 3);
  };
  drawCrossProj(caQY, 'q=W_Q·h', PALETTE.img);
  drawCrossProj(caKY, 'k=W_K·ctx', PALETTE.txt);
  drawCrossProj(caVY, 'v=W_V·ctx', PALETTE.txt);

  // RoPE is OFF for BOTH Q and K in Cross-Attention!
  drawFlowArrow(ctx, caBoxX + caBoxW, caQY, caRopeX - 14, caQY, PALETTE.img);
  drawFlowArrow(ctx, caBoxX + caBoxW, caKY, caRopeX - 14, caKY, PALETTE.txt);
  drawRopeDial(ctx, caRopeX, caQY, 11.5, 0, PALETTE.img, 'OFF', true);
  drawRopeDial(ctx, caRopeX, caKY, 11.5, 0, PALETTE.txt, 'OFF', true);

  drawFlowArrow(ctx, caRopeX + 13, caQY, attn.x - 4, attn.y + 30, PALETTE.img, pCross > 0.3 && pCross < 0.85 ? (pCross - 0.3) / 0.55 : undefined);
  drawFlowArrow(ctx, caRopeX + 13, caKY, attn.x - 4, attn.y + attn.h / 2, PALETTE.txt, pCross > 0.3 && pCross < 0.85 ? (pCross - 0.3) / 0.55 : undefined);
  drawFlowArrow(ctx, caBoxX + caBoxW, caVY, attn.x - 4, attn.y + attn.h - 20, PALETTE.txt);

  // Cross-Attn Portal (zooms into Micro!)
  drawDepthStack(ctx, attn.x, attn.y, attn.w, attn.h, PALETTE.attn, 4, 6, -5);
  roundRect(ctx, attn.x, attn.y, attn.w, attn.h, 12, `rgba(6, 9, 16, ${lerp(0.90, 0.15, portalFade)})`, PALETTE.attn, 1.6 + actCross * 1.4);

  if (portalFade < 0.85) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - portalFade * 1.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#99f6e4';
    ctx.font = '800 13px "Pretendard Variable", sans-serif';
    ctx.fillText('2. Cross-Attn ★', attn.x + attn.w / 2, attn.y + 28);
    drawMathTag(ctx, 'softmax(Q_img·K_ctxᵀ/√128)·V_ctx', attn.x + attn.w / 2, attn.y + 50, PALETTE.attn, actCross, 'center', 9.2);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText('QK-RMSNorm만 적용 · RoPE 없음', attn.x + attn.w / 2, attn.y + 68);
    roundRect(ctx, attn.x + attn.w / 2 - 62, attn.y + attn.h - 30, 124, 22, 11, 'rgba(45,212,191,0.16)', 'rgba(45,212,191,0.5)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText('휠/클릭 → 어텐션 ↘', attn.x + attn.w / 2, attn.y + attn.h - 15);
    ctx.restore();
  }

  // Residual add #2: x + g2 ⊙ CA
  const sum2X = 766;
  drawFlowArrow(ctx, attn.x + attn.w + 22, midY - 10, sum2X, midY - 10, PALETTE.attn);
  drawFlowArrow(ctx, sum2X, midY - 10, sum2X, railY + 12, PALETTE.attn, pCross > 0.55 && pCross < 0.98 ? (pCross - 0.55) / 0.43 : undefined);
  drawMathTag(ctx, 'x + g₂⊙CA', sum2X, railY - 14, PALETTE.attn, actCross, 'center', 10);
  ctx.beginPath(); ctx.arc(sum2X, railY, 9.5, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.attn; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum2X, railY + 4);

  // ---- 3. SUB-LAYER 3: MLP (GELU) -> x + g3 ⊙ MLP ----
  const ffnX = 836;
  const ffnW = 228;
  drawFlowArrow(ctx, ffnX + 26, railY, ffnX + 26, midY - 56, PALETTE.img, pMlp > 0.02 && pMlp < 0.4 ? pMlp * 2.5 : undefined);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ffnX + 12, midY - 26);
  ctx.lineTo(ffnX + ffnW / 2, midY - 56);
  ctx.lineTo(ffnX + ffnW - 12, midY - 26);
  ctx.lineTo(ffnX + ffnW - 12, midY + 26);
  ctx.lineTo(ffnX + ffnW / 2, midY + 56);
  ctx.lineTo(ffnX + 12, midY + 26);
  ctx.closePath();
  ctx.fillStyle = actMlp > 0.2 ? 'rgba(56,189,248,0.14)' : PALETTE.surface;
  ctx.fill();
  ctx.strokeStyle = actMlp > 0.2 ? PALETTE.img : PALETTE.border;
  ctx.lineWidth = 1.4 + actMlp;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 11.5px "Pretendard Variable", sans-serif';
  ctx.fillText('3. MLP (GELU)', ffnX + ffnW / 2, midY - 6);
  ctx.fillStyle = PALETTE.img;
  ctx.font = '600 9.5px "JetBrains Mono", monospace';
  ctx.fillText('2048 → 8192 → 2048', ffnX + ffnW / 2, midY + 14);
  ctx.restore();

  const sum3X = ffnX + ffnW - 22;
  drawFlowArrow(ctx, sum3X, midY - 40, sum3X, railY + 12, PALETTE.img, pMlp > 0.5 && pMlp < 0.98 ? (pMlp - 0.5) * 2 : undefined);
  drawMathTag(ctx, 'x + g₃⊙MLP', sum3X - 10, railY - 14, PALETTE.img, actMlp, 'center', 10);
  ctx.beginPath(); ctx.arc(sum3X, railY, 9.5, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.img; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum3X, railY + 4);
}

export function drawMesoScene(
  ctx: CanvasRenderingContext2D,
  modelId: ModelId,
  phase: number,
  sigma: number,
  kreaGate: number,
  portalFade: number,
) {
  if (modelId === 'anima') {
    drawAnimaMesoScene(ctx, phase, sigma, portalFade);
    return;
  }

  const W = WORLD_W;
  const H = WORLD_H;
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

  // Dual-modality Residual Highway (both Image & Text flow together in one sequence!)
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(24, railY - 2);
  ctx.lineTo(W - 24, railY - 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(24, railY + 2.5);
  ctx.lineTo(W - 24, railY + 2.5);
  ctx.stroke();

  const rxPulse = lerp(24, W - 24, phase);
  ctx.shadowColor = PALETTE.attn;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rxPulse, railY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = PALETTE.text2;
  ctx.textAlign = 'left';
  ctx.fillText(isMoss ? 'z = [Img N | Txt L] · 3072d' : 'z = [Txt T | Img N] · 6144d', 24, railY - 12);
  ctx.textAlign = 'right';
  ctx.fillText('z_out →', W - 20, railY + 22);
  ctx.restore();

  // ---- 1. GEOMETRIC RMSNorm (UNIT CIRCLE) -> AdaLN(σ) AFFINE ELLIPSE DEFORMATION! ----
  const normCx = 78;
  const normCy = midY - 12;
  const normR = 28;
  drawFlowArrow(ctx, normCx, railY, normCx, normCy - normR - 14, PALETTE.text2, pNorm > 0.02 && pNorm < 0.5 ? pNorm * 2 : undefined);

  const scaleX = 0.72 + sigma * 0.65;
  const scaleY = 1.28 - sigma * 0.55;
  const shiftX = (sigma - 0.5) * 14;
  const shiftY = (0.5 - sigma) * 12;

  ctx.save();
  ctx.beginPath();
  ctx.arc(normCx, normCy, normR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.ellipse(normCx + shiftX, normCy + shiftY, normR * scaleX, normR * scaleY, 0, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.gateDim;
  ctx.fill();
  ctx.strokeStyle = actNorm > 0.3 ? '#ffffff' : PALETTE.gate;
  ctx.lineWidth = 1.6 + actNorm * 0.6;
  ctx.stroke();

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
    ctx.strokeStyle = adalnPush > 0.4 ? PALETTE.gate : i % 2 === 0 ? PALETTE.img : PALETTE.txt;
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

  drawMathTag(ctx, 'RMSNorm → (1+s)⊙ẑ+b', normCx + 10, normCy - normR - 22, PALETTE.gate, actNorm, 'center', 10.5);

  const sigY = midY + 106;
  drawFlowArrow(ctx, normCx, sigY - 14, normCx, normCy + normR + 18, PALETTE.gate, pNorm > 0.1 ? pNorm : undefined, true);
  drawMathTag(ctx, `σ=${sigma.toFixed(2)} → [s, b, g]`, normCx + 12, sigY, PALETTE.gate, actNorm, 'center', 10.5);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.fillText(isMoss ? '전 42블록 공용 6벡터' : '공용 tvec + bias[i]', normCx + 12, sigY + 16);

  // ---- 2. JOINT W_Q / W_K / W_V (BOTH Img & Txt produce q, k, v!) + QK-RMSNORM + MODALITY-TRUE RoPE ----
  const splitX = 148;
  const projX = 186;
  const qkNormX = 290;
  const ropeX = 368;
  const qY = midY - 82;
  const kY = midY;
  const vY = midY + 82;

  drawFlowArrow(ctx, normCx + normR + 8, normCy, splitX, midY, PALETTE.text2, pQkv > 0.02 && pQkv < 0.4 ? pQkv * 2.5 : undefined);

  // Neutral role lines (role is q/k/v glyph; fill color is strictly Img=cyan, Txt=amber)
  ctx.save();
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
  ctx.lineWidth = 1.4 + actQkv * 0.6;
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.bezierCurveTo(splitX + 18, midY, projX - 16, qY, projX - 4, qY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.lineTo(projX - 4, kY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(splitX, midY);
  ctx.bezierCurveTo(splitX + 18, midY, projX - 16, vY, projX - 4, vY);
  ctx.stroke();
  ctx.restore();

  // Dual-token projection: both Image (cyan) and Text (amber) tokens are projected into q, k, v!
  const drawJointMatrixProj = (y: number, eq: string, sub: string, vals: number[]) => {
    const mx = projX;
    const my = y - 14;
    roundRect(ctx, mx, my, 28, 28, 4, 'rgba(148,163,184,0.10)', '#cbd5e1', 1.1 + actQkv * 0.6);
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx + 9, my); ctx.lineTo(mx + 9, my + 28);
    ctx.moveTo(mx + 19, my); ctx.lineTo(mx + 19, my + 28);
    ctx.moveTo(mx, my + 9); ctx.lineTo(mx + 28, my + 9);
    ctx.moveTo(mx, my + 19); ctx.lineTo(mx + 28, my + 19);
    ctx.stroke();

    drawMathTag(ctx, eq, mx + 34, my - 7, PALETTE.text2, actQkv, 'center', 10);

    // 4 token bars colored by modality order: MOSS = [Img,Img | Txt,Txt], Krea 2 = [Txt,Txt | Img,Img]
    const vx = mx + 36;
    vals.forEach((v, idx) => {
      const isImgBar = isMoss ? idx < 2 : idx >= 2;
      const barCol = isImgBar ? PALETTE.img : PALETTE.txt;
      const pulseV = clamp(v + actQkv * 0.22 * Math.sin(phase * Math.PI * 6 + idx), 0.1, 1);
      roundRect(
        ctx,
        vx + idx * 10,
        y - 10,
        8,
        20,
        2,
        barCol + Math.round((0.18 + pulseV * 0.7) * 255).toString(16).padStart(2, '0'),
        barCol,
        0.85,
      );
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(sub, vx + 18, y + 22);
  };

  drawJointMatrixProj(qY, 'q=W_Q·h', isKrea ? '48H (Img+Txt)' : '24H (Img+Txt)', [0.85, 0.45, 0.9, 0.55]);
  drawJointMatrixProj(kY, 'k=W_K·h', isKrea ? '12H GQA' : '24H (Img+Txt)', [0.45, 0.88, 0.72, 0.35]);
  drawJointMatrixProj(vY, 'v=W_V·h', isKrea ? '12H GQA' : '24H (Img+Txt)', [0.6, 0.55, 0.8, 0.7]);

  // QK-RMSNorm unit circles on Q and K
  const drawMiniNorm = (cx: number, cy: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.10)';
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2 + actQkv * 0.6;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RMS', cx, cy + 3);
    ctx.restore();
  };
  drawFlowArrow(ctx, projX + 78, qY, qkNormX - 15, qY, '#cbd5e1');
  drawFlowArrow(ctx, projX + 78, kY, qkNormX - 15, kY, '#cbd5e1');
  drawMiniNorm(qkNormX, qY);
  drawMiniNorm(qkNormX, kY);
  drawMathTag(ctx, 'QK-Norm', qkNormX, qY - 22, PALETTE.text2, actQkv, 'center', 9.5);

  // Modality-accurate RoPE clocks on BOTH Q and K rows!
  // Krea 2: BOTH Q and K have Text tokens frozen at 0° (0,0,0) and Image tokens rotating!
  // MOSS-Image: BOTH Q and K rotate Image tokens (4-axis) and Text tokens (seq axis)!
  drawFlowArrow(ctx, qkNormX + 14, qY, ropeX - 20, qY, '#cbd5e1');
  drawFlowArrow(ctx, qkNormX + 14, kY, ropeX - 20, kY, '#cbd5e1');

  const ropeAngleBase = phase * Math.PI * 4;
  [qY, kY].forEach((rowY) => {
    if (isKrea) {
      // [Txt | Img] order: Txt is 0° frozen, Img rotates — IDENTICAL for Q and K!
      drawRopeDial(ctx, ropeX, rowY, 15, 0, PALETTE.txt, '0°(txt)', true);
      drawRopeDial(ctx, ropeX + 52, rowY, 15, -Math.PI / 2 + ropeAngleBase, PALETTE.img, 'R(img)', false);
    } else {
      // [Img | Txt] order: BOTH Img and Txt rotate in 4-axis RoPE — IDENTICAL for Q and K!
      drawRopeDial(ctx, ropeX, rowY, 15, -Math.PI / 2 + ropeAngleBase, PALETTE.img, 'R(img)', false);
      drawRopeDial(ctx, ropeX + 52, rowY, 15, -Math.PI / 2 + ropeAngleBase * 0.45, PALETTE.txt, 'R(txt)', false);
    }
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
  ctx.fillText('V: no QK-Norm · no RoPE', ropeX + 20, vY - 8);
  ctx.restore();

  const attn = MESO_TO_MICRO_PORTAL;
  const qkvPulse = pQkv > 0.35 && pQkv < 0.98 ? (pQkv - 0.35) / 0.65 : undefined;
  drawFlowArrow(ctx, ropeX + 70, qY, attn.x - 8, attn.y + 34, '#cbd5e1', qkvPulse);
  drawFlowArrow(ctx, ropeX + 70, kY, attn.x - 8, attn.y + attn.h / 2, '#cbd5e1', qkvPulse);
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
    ctx.fillText(isMoss ? 'Joint Self-Attn ★' : 'GQA Joint Attn ★', attn.x + attn.w / 2, attn.y + 30);
    drawMathTag(ctx, 'softmax(Q·Kᵀ/√128)·V', attn.x + attn.w / 2, attn.y + 52, PALETTE.attn, actAttn, 'center', 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(isMoss ? 'key = Img N + Txt L' : 'key = Txt T + Img N', attn.x + attn.w / 2, attn.y + 68);
    roundRect(ctx, attn.x + attn.w / 2 - 62, attn.y + attn.h - 30, 124, 22, 11, 'rgba(45,212,191,0.16)', 'rgba(45,212,191,0.5)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText('휠/클릭 → 어텐션 ↘', attn.x + attn.w / 2, attn.y + attn.h - 15);
    ctx.restore();
  }

  // Krea 2 Output Gate Aperture (after A·V, before W_o)
  let sum1X = attn.x + attn.w + 40;
  if (isKrea) {
    const gateX = 752;
    const gateW = 96;
    drawFlowArrow(ctx, attn.x + attn.w + 22, midY, gateX - 6, midY, PALETTE.gate, pAttn > 0.25 && pAttn < 0.95 ? (pAttn - 0.25) / 0.7 : undefined);
    roundRect(ctx, gateX, midY - 52, gateW, 104, 9, PALETTE.gateDim, PALETTE.gate, 1.4 + actAttn);
    drawMathTag(ctx, `σ(Wg·hᵢ)=${kreaGate.toFixed(2)}`, gateX + gateW / 2, midY - 64, PALETTE.gate, actAttn, 'center', 10);

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
    ctx.fillText('⊙ before W_o', gateX + gateW / 2, midY + 42);
    sum1X = gateX + gateW + 14;
  }

  drawFlowArrow(ctx, sum1X, midY - 52, sum1X, railY + 13, PALETTE.attn, pAttn > 0.55 && pAttn < 0.98 ? (pAttn - 0.55) / 0.45 : undefined);
  drawMathTag(ctx, 'z + g₁⊙Attn', sum1X, railY - 16, PALETTE.attn, actAttn, 'center', 10.5);
  ctx.beginPath(); ctx.arc(sum1X, railY, 10, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.attn; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum1X, railY + 4.5);

  // ---- 4. REAL FFN CIRCUIT GEOMETRY (MOSS Softcap Gated / Krea 2 SwiGLU) ----
  const ffnX = 892;
  const ffnW = 196;
  drawFlowArrow(ctx, ffnX + 24, railY, ffnX + 24, midY - 62, PALETTE.text2, pFfn > 0.02 && pFfn < 0.4 ? pFfn * 2.5 : undefined);

  const bTopY = midY - 36;
  const bBotY = midY + 34;
  const mulX = ffnX + 124;

  roundRect(ctx, ffnX + 10, bTopY - 16, 86, 32, 6, PALETTE.gateDim, PALETTE.gate, 1.2 + actFfn * 0.7);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fda4af';
  ctx.font = '700 9.5px "JetBrains Mono", monospace';
  ctx.fillText(isMoss ? 'Softcap Gate' : 'SiLU(W_g·h)', ffnX + 53, bTopY + 3);

  roundRect(ctx, ffnX + 10, bBotY - 16, 86, 32, 6, PALETTE.imgDim, PALETTE.img, 1.2 + actFfn * 0.7);
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(isMoss ? 'Softcap Up' : 'W_up · h', ffnX + 53, bBotY + 3);

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

  drawMathTag(ctx, isMoss ? 'Softcap Gated (8192)' : 'SwiGLU', ffnX + ffnW / 2, midY + 74, PALETTE.text2, actFfn, 'center', 10);

  const sum2X = ffnX + ffnW - 22;
  drawFlowArrow(ctx, sum2X, midY - 40, sum2X, railY + 13, PALETTE.text2, pFfn > 0.5 && pFfn < 0.98 ? (pFfn - 0.5) * 2 : undefined);
  drawMathTag(ctx, 'z + g₂⊙FFN', sum2X - 14, railY - 16, PALETTE.text2, actFfn, 'center', 10.5);
  ctx.beginPath(); ctx.arc(sum2X, railY, 10, 0, Math.PI * 2); ctx.fillStyle = PALETTE.bg; ctx.fill(); ctx.strokeStyle = PALETTE.text2; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+', sum2X, railY + 4.5);
}

/* ============================================================================
 * LEVEL 3 (z = 2): MICRO — LIVE ATTENTION SYNCED TO SHARED `phase`
 *   - Unified softmax denominator (Anima: 5 real + 507 PAD; MOSS/Krea 2: Img N + Txt L)
 *   - List % and 4x4 Heatmap use the exact same `computePatchAttention()` probabilities
 *   - `reveal` affects cell fill opacity only (never mutates printed numbers)
 *   - Krea 2 Output Gate shown separately after A·V and before W_o (not multiplied into heatmap)
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
  const cy = isKrea ? H * 0.48 : H * 0.53;

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

  // ---- ALWAYS-VISIBLE SCHEMATIC DISCLAIMER BADGE ----
  ctx.save();
  roundRect(ctx, 24, 14, 246, 24, 12, 'rgba(245, 158, 11, 0.10)', 'rgba(245, 158, 11, 0.45)', 1);
  ctx.fillStyle = '#fde68a';
  ctx.font = '600 10.5px "Pretendard Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('도식용 예시 값 · 실제 모델 실측 아님', 24 + 123, 30);
  ctx.restore();

  // ---- 1. 4×4 QUERY IMAGE PATCH GRID ----
  const gridSize = 192;
  const gridX = 24;
  const gridY = cy - gridSize / 2;
  const cell = gridSize / 4;

  drawMathTag(ctx, `q_${selectedPatch} ∈ ℝ¹²⁸ (이미지 query)`, gridX + gridSize / 2, gridY - 18, PALETTE.img, actDot, 'center', 11);

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

  // ---- 2. KEY LIST & EXACT SOFTMAX PROBABILITIES (SUM = 100%) ----
  const keyX = 264;
  const keyW = 282;
  const rowH = 36;
  const totalRows = isAnima ? model.miniTokens.length : model.miniTokens.length + 1;
  const listTop = cy - (totalRows * rowH) / 2;

  const selAttn = computePatchAttention(modelId, selectedPatch);
  const { logits, probs, imgKeyProb } = selAttn;

  drawMathTag(
    ctx,
    p2 > 0.25
      ? (isAnima
        ? `p_ij = e^{s_ij} / (Σ_{u<5} e^{s_iu} + ${ANIMA_PAD_SLOTS}·e⁰)`
        : 'p_ij = e^{s_ij} / Σ_{u∈Img∪Txt} e^{s_iu}')
      : 's_ij = (q_i · k_j) / √128',
    keyX + keyW / 2,
    listTop - 26,
    p2 > 0.25 ? PALETTE.attn : PALETTE.txt,
    Math.max(actDot, actSoft),
    'center',
    10.5,
  );
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9.5px "Pretendard Variable", sans-serif';
  ctx.fillText(
    isAnima ? 'key 축 = 고정 텍스트 ctx 512슬롯 전체 (합=100%)' : 'key 축 = 이미지 N개 + 텍스트 L개 전체 (합=100%)',
    keyX + keyW / 2,
    listTop - 10,
  );
  ctx.restore();

  model.miniTokens.forEach((tok, j) => {
    const ty = listTop + j * rowH;
    const isTokSel = j === safeTok;
    const isTrap = tok.kind !== 'prompt';
    if (hitOut) hitOut.tokens.push({ x: keyX, y: ty, w: keyW, h: rowH - 5, idx: j });

    const rayStrength = clamp(probs[j] * 2.4, 0.14, 1);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(selPatchCenter.x, selPatchCenter.y);
    ctx.bezierCurveTo(
      lerp(selPatchCenter.x, keyX, 0.45),
      selPatchCenter.y,
      lerp(selPatchCenter.x, keyX, 0.55),
      ty + (rowH - 5) / 2,
      keyX - 4,
      ty + (rowH - 5) / 2,
    );
    ctx.strokeStyle = isTrap ? PALETTE.gate : isTokSel ? PALETTE.attn : PALETTE.txt;
    ctx.globalAlpha = (0.14 + rayStrength * 0.65) * clamp(0.35 + easeOut(p1) * 0.65, 0, 1);
    ctx.lineWidth = isTokSel ? 2.4 : 1.1 + probs[j] * 2.4;
    ctx.stroke();

    if (p1 > 0.02 && p1 < 0.98 && (isTokSel || probs[j] > 0.18)) {
      const px = lerp(selPatchCenter.x, keyX - 4, p1);
      const py = lerp(selPatchCenter.y, ty + (rowH - 5) / 2, easeInOut(p1));
      ctx.globalAlpha = 1;
      ctx.shadowColor = PALETTE.img;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    roundRect(
      ctx,
      keyX,
      ty,
      keyW,
      rowH - 5,
      7,
      isTokSel ? 'rgba(45, 212, 191, 0.14)' : isTrap ? 'rgba(244, 63, 94, 0.08)' : PALETTE.surface,
      isTokSel ? PALETTE.attn : isTrap ? 'rgba(244, 63, 94, 0.45)' : PALETTE.borderSoft,
      isTokSel ? 1.6 : 1,
    );

    const rowLabel = tok.kind === 'pad' ? `[PAD] ×${ANIMA_PAD_SLOTS}` : tok.label;
    ctx.textAlign = 'left';
    ctx.fillStyle = isTrap ? '#fda4af' : isTokSel ? '#99f6e4' : '#fde68a';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.fillText(rowLabel, keyX + 9, ty + 19);

    const barX = keyX + 104;
    const maxBarW = keyW - 156;
    const logitNorm = clamp((logits[j] + 1.5) / 9.5, 0.04, 1);
    const displayFrac = lerp(logitNorm * clamp(0.35 + easeOut(p1) * 0.65, 0, 1), probs[j], p2);
    roundRect(ctx, barX, ty + 10, maxBarW, 10, 4, 'rgba(148,163,184,0.12)');
    roundRect(ctx, barX, ty + 10, Math.max(3, maxBarW * displayFrac), 10, 4, isTrap ? PALETTE.gate : PALETTE.attn);

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText(p2 > 0.35 ? `${(probs[j] * 100).toFixed(1)}%` : logits[j].toFixed(1), keyX + keyW - 8, ty + 19);
  });

  // Aggregated Image Keys row for MOSS-Image and Krea 2 (so total = 100.0%!)
  if (imgKeyProb !== null) {
    const ty = listTop + model.miniTokens.length * rowH;
    // Ray from selected image patch to aggregated image keys
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(selPatchCenter.x, selPatchCenter.y);
    ctx.bezierCurveTo(
      lerp(selPatchCenter.x, keyX, 0.45),
      selPatchCenter.y,
      lerp(selPatchCenter.x, keyX, 0.55),
      ty + (rowH - 5) / 2,
      keyX - 4,
      ty + (rowH - 5) / 2,
    );
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    roundRect(ctx, keyX, ty, keyW, rowH - 5, 7, 'rgba(100, 116, 139, 0.14)', 'rgba(148, 163, 184, 0.38)', 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText('img keys (×N)', keyX + 9, ty + 19);

    const barX = keyX + 104;
    const maxBarW = keyW - 156;
    const displayFrac = lerp(0.55 * clamp(0.35 + easeOut(p1) * 0.65, 0, 1), imgKeyProb, p2);
    roundRect(ctx, barX, ty + 10, maxBarW, 10, 4, 'rgba(148,163,184,0.12)');
    roundRect(ctx, barX, ty + 10, Math.max(4, maxBarW * displayFrac), 10, 4, '#64748b');

    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText(p2 > 0.35 ? `${(imgKeyProb * 100).toFixed(1)}%` : 'Σ_img', keyX + keyW - 8, ty + 19);
  }

  // ---- 3. ATTENTION MATRIX & XAI SLICE ----
  const matSize = 172;
  const matX = 590;
  const matY = cy - matSize / 2;

  drawMathTag(
    ctx,
    isAnima ? 'A [16, N, 512]' : isMoss ? 'A[0:N, N:N+L]' : 'A[T:T+N, 0:T]',
    matX + matSize / 2 + 8,
    matY - 24,
    PALETTE.attn,
    actSlice,
    'center',
    11.5,
  );
  drawDepthStack(ctx, matX, matY, matSize, matSize, PALETTE.attn, 4, 6, -5);
  roundRect(ctx, matX, matY, matSize, matSize, 6, '#080e18', PALETTE.border, 1.3);

  let slX: number, slY: number, slW: number, slH: number;
  if (isAnima) {
    ctx.fillStyle = PALETTE.gateDim;
    ctx.fillRect(matX + matSize * 0.74, matY + 3, matSize * 0.24, matSize - 6);
    slX = matX + 3; slY = matY + 3; slW = matSize * 0.69; slH = matSize - 6;
  } else if (isMoss) {
    const split = matSize * 0.62;
    ctx.fillStyle = 'rgba(56,189,248,0.10)';
    ctx.fillRect(matX + 2, matY + 2, split - 2, split - 2);
    slX = matX + split; slY = matY + 2; slW = matSize - split - 2; slH = split - 2;
  } else {
    const split = matSize * 0.38;
    ctx.fillStyle = 'rgba(56,189,248,0.10)';
    ctx.fillRect(matX + split, matY + split, matSize - split - 2, matSize - split - 2);
    slX = matX + 2; slY = matY + split; slW = split - 2; slH = matSize - split - 2;
  }

  roundRect(ctx, slX, slY, slW, slH, 4, 'rgba(45, 212, 191, 0.30)', PALETTE.attn, 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Img→Txt', slX + slW / 2, slY + slH / 2 + 4);

  // ---- 4. 4×4 PROBABILITY HEATMAP (EXACT SAME SOFTMAX AS LIST, NEVER MULTIPLIED BY REVEAL OR KREA GATE!) ----
  const hmSize = 192;
  const hmX = 892;
  const hmY = cy - hmSize / 2;
  const hmCell = hmSize / 4;

  if (p3 > 0.02 && p3 < 0.98) {
    ctx.save();
    ctx.globalAlpha = Math.sin(p3 * Math.PI) * 0.65;
    roundRect(ctx, lerp(slX, hmX, p3), lerp(slY, hmY, p3), lerp(slW, hmSize, p3), lerp(slH, hmSize, p3), 6, 'rgba(45, 212, 191, 0.25)', PALETTE.attn, 1.8);
    ctx.restore();
  }

  drawFlowArrow(ctx, matX + matSize + 24, cy, hmX - 10, cy, PALETTE.attn, p3 > 0.05 && p3 < 0.95 ? p3 : undefined);

  const activeTok = model.miniTokens[safeTok];
  const tokDisplay = activeTok.kind === 'pad' ? `[PAD]×${ANIMA_PAD_SLOTS}` : activeTok.label;
  drawMathTag(ctx, `p_{i, "${tokDisplay}"} (예시 1-head)`, hmX + hmSize / 2, hmY - 18, PALETTE.attn, actMap, 'center', 11);

  roundRect(ctx, hmX - 4, hmY - 4, hmSize + 8, hmSize + 8, 10, '#080e18', PALETTE.attn, 1.4 + actMap * 0.8);
  // `reveal` modulates cell fill opacity ONLY — printed probabilities never drift during animation!
  const revealAlpha = clamp(0.45 + p4 * 0.55, 0.45, 1);

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const cellAttn = computePatchAttention(modelId, idx);
      const pVal = cellAttn.probs[safeTok];
      // Visual fill scaled for legibility across full [0, 1] probability range
      const visIntensity = clamp(pVal * 1.45, 0, 1);
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
        `rgba(45, 212, 191, ${(0.06 + visIntensity * 0.84) * revealAlpha})`,
        idx === selectedPatch ? '#ffffff' : 'rgba(148,163,184,0.18)',
        idx === selectedPatch ? 1.8 : 0.8,
      );
      ctx.fillStyle = visIntensity * revealAlpha > 0.52 ? '#042f2e' : '#e2e8f0';
      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pVal.toFixed(2), x + s / 2, y + s / 2 + 4);
    }
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '500 9.5px "Pretendard Variable", sans-serif';
  ctx.fillText(`선택 패치(흰 테두리) 값 = 좌측 리스트 ${(probs[safeTok] * 100).toFixed(1)}%`, hmX + hmSize / 2, hmY + hmSize + 20);
  ctx.restore();

  // ---- 5. KREA 2 OUTPUT GATE: SEPARATE POST-(A·V) STAGE BEFORE W_o (INDEPENDENT OF KEY j!) ----
  if (isKrea) {
    const stripX = 590;
    const stripY = 472;
    const stripW = 494;
    const stripH = 104;
    roundRect(ctx, stripX, stripY, stripW, stripH, 10, 'rgba(244, 63, 94, 0.06)', 'rgba(244, 63, 94, 0.35)', 1.2);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fda4af';
    ctx.font = '700 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText(`Krea 2 출력 게이트 위치 (V 가중합 뒤 · W_o 앞) — 선택 패치 q_${selectedPatch}의 채널별 예시 값`, stripX + 14, stripY + 20);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 9.5px "Pretendard Variable", sans-serif';
    ctx.fillText('key 토큰 j와 무관하므로 위 확률 히트맵에 곱하지 않고, A·V 출력 뒤에 별도 적용됨', stripX + 14, stripY + 36);

    const rowY = stripY + 68;
    // Box 1: A·V
    roundRect(ctx, stripX + 16, rowY - 18, 96, 36, 6, PALETTE.surface, PALETTE.attn, 1.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#99f6e4';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.fillText('Σ_j p_ij · V_j', stripX + 64, rowY + 4);

    drawFlowArrow(ctx, stripX + 114, rowY, stripX + 144, rowY, PALETTE.attn);

    // Box 2: Gate ⊙ σ(Wg·h_i) with interactive shutter
    const gBoxX = stripX + 148;
    const gBoxW = 148;
    roundRect(ctx, gBoxX, rowY - 20, gBoxW, 40, 7, PALETTE.gateDim, PALETTE.gate, 1.4);
    ctx.fillStyle = '#fda4af';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText(`⊙ σ(Wg·h_${selectedPatch}) = ${kreaGate.toFixed(2)}`, gBoxX + gBoxW / 2, rowY - 4);
    roundRect(ctx, gBoxX + 14, rowY + 5, gBoxW - 28, 8, 4, '#090f19', 'rgba(244,63,94,0.4)', 0.9);
    roundRect(ctx, gBoxX + 15, rowY + 6, Math.max(4, (gBoxW - 30) * kreaGate), 6, 3, PALETTE.attn);

    drawFlowArrow(ctx, gBoxX + gBoxW + 4, rowY, stripX + 328, rowY, PALETTE.gate);

    // Box 3: W_o
    roundRect(ctx, stripX + 332, rowY - 18, 54, 36, 6, PALETTE.surface, PALETTE.border, 1.2);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText('W_o', stripX + 359, rowY + 4);

    drawFlowArrow(ctx, stripX + 388, rowY, stripX + 414, rowY, PALETTE.attn);

    // Box 4: AttnOut_i
    roundRect(ctx, stripX + 418, rowY - 18, 62, 36, 6, 'rgba(45,212,191,0.14)', PALETTE.attn, 1.2);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.fillText('AttnOut', stripX + 449, rowY + 4);
    ctx.restore();
  }
}
