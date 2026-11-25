import { useEffect, useRef } from 'react';
import type { ModelId } from '../data/models';
import {
  PALETTE,
  clamp,
  drawCuboid,
  drawDepthStack,
  drawFlowArrow,
  drawGridBg,
  easeInOut,
  easeOut,
  lerp,
  roundRect,
} from './drawUtils';

interface MacroCanvasProps {
  modelId: ModelId;
  /** Continuous progress 0..1 across 4 beats */
  progress: number;
  onZoomMeso: () => void;
}

export function MacroCanvas({ modelId, progress, onZoomMeso }: MacroCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ditBoxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = rect.width;
    const H = rect.height;
    drawGridBg(ctx, W, H);

    // Coordinate scaling to keep generous margins at any width
    const padX = Math.max(36, (W - 1100) / 2);
    const innerW = Math.min(1100, W - padX * 2);
    const sx = (f: number) => padX + innerW * f;
    const cyTop = H * 0.24;
    const cyMid = H * 0.60;

    // 4 continuous beats:
    // b1 (0.00..0.28): Latent Patchify + Text Encoder/Bridge (12-layer txtfusion / Refiner / LLMAdapter)
    // b2 (0.28..0.54): Sequence Assembly (Separate ctx vs [Img|Txt] vs [Txt|Img])
    // b3 (0.54..0.80): 3D DiT Block Tunnel Traversal + Text Co-evolution vs Frozen
    // b4 (0.80..1.00): Text discard (MOSS/Krea2) + Velocity v -> x0 = xt - σv -> RGB VAE
    const b1 = easeInOut(progress / 0.28);
    const b2 = easeInOut((progress - 0.28) / 0.26);
    const b3 = easeInOut((progress - 0.54) / 0.26);
    const b4 = easeInOut((progress - 0.80) / 0.20);

    const isAnima = modelId === 'anima';
    const isMoss = modelId === 'moss';
    const isKrea = modelId === 'krea2';

    // ==================== 1. TEXT ENCODER & BRIDGE (TOP TRACK) ====================
    const teX = sx(0.02);
    const teW = innerW * 0.17;
    const bridgeX = sx(0.24);
    const bridgeW = innerW * 0.19;

    // Text Encoder
    ctx.save();
    if (isKrea) {
      // Krea 2: Draw 12 stacked layer sheets from Qwen3-VL-4B (36L, stride 3)
      const collapse = easeOut(b1);
      for (let k = 7; k >= 0; k--) {
        const off = k * (4.5 - collapse * 1.4);
        roundRect(
          ctx,
          teX + off,
          cyTop - 34 - off * 0.7,
          teW,
          68,
          8,
          'rgba(245, 158, 11, 0.06)',
          `rgba(245, 158, 11, ${0.18 + (1 - k / 8) * 0.45})`,
          1,
        );
      }
      roundRect(ctx, teX, cyTop - 34, teW, 68, 8, PALETTE.surface, PALETTE.txt, 1.5);
      ctx.fillStyle = PALETTE.txt;
      ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Qwen3-VL-4B', teX + teW / 2, cyTop - 8);
      ctx.fillStyle = PALETTE.text2;
      ctx.font = '500 11px "Pretendard Variable", sans-serif';
      ctx.fillText('36층 중 12층 스택 추출', teX + teW / 2, cyTop + 10);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText('[B, T, 12, 2560]', teX + teW / 2, cyTop + 26);
    } else if (isAnima) {
      // Anima: Dual track Qwen3-0.6B (K,V) + T5 Embed (Q)
      roundRect(ctx, teX, cyTop - 42, teW, 36, 7, PALETTE.txtDim, PALETTE.txt, 1.3);
      ctx.fillStyle = '#fde68a';
      ctx.font = '700 11.5px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Qwen3-0.6B (K, V)', teX + teW / 2, cyTop - 20);

      roundRect(ctx, teX, cyTop + 4, teW, 36, 7, PALETTE.imgDim, PALETTE.img, 1.3);
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('T5 임베딩 테이블 (Q)', teX + teW / 2, cyTop + 26);
    } else {
      // MOSS-Image: Qwen3.5-9B last layer
      roundRect(ctx, teX, cyTop - 34, teW, 68, 8, PALETTE.surface, PALETTE.txt, 1.4);
      ctx.fillStyle = PALETTE.txt;
      ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Qwen3.5-9B', teX + teW / 2, cyTop - 8);
      ctx.fillStyle = PALETTE.text2;
      ctx.font = '500 11px "Pretendard Variable", sans-serif';
      ctx.fillText('마지막 층 + 최종 norm', teX + teW / 2, cyTop + 10);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText('[B, L, 4096]', teX + teW / 2, cyTop + 26);
    }

    drawFlowArrow(ctx, teX + teW + 8, cyTop, bridgeX - 8, cyTop, PALETTE.txt, b1 > 0.05 && b1 < 0.95 ? b1 : undefined);

    // Text Bridge (LLMAdapter / Text Refiner / txtfusion)
    drawDepthStack(ctx, bridgeX, cyTop - 34, bridgeW, 68, PALETTE.txt, isAnima ? 4 : isMoss ? 2 : 3, 5, -4);
    roundRect(ctx, bridgeX, cyTop - 34, bridgeW, 68, 8, PALETTE.surfaceHi, PALETTE.txt, 1.6);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      isAnima ? 'LLMAdapter (6블록)' : isMoss ? 'Text Refiner (2블록)' : 'txtfusion (층축→토큰축)',
      bridgeX + bridgeW / 2,
      cyTop - 8,
    );
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '500 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? 'T5 Q → Qwen K,V · 512 패딩' : isMoss ? '4096→3072 · 양방향 정제' : '12층 혼합 → 1층 → MLP 6144',
      bridgeX + bridgeW / 2,
      cyTop + 10,
    );
    ctx.fillStyle = PALETTE.txt;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText(
      isAnima ? 'ctx [B, 512, 1024]' : isMoss ? 'T [B, L, 3072]' : 'T [B, T, 6144]',
      bridgeX + bridgeW / 2,
      cyTop + 26,
    );
    ctx.restore();

    // ==================== 2. 3D LATENT CUBOID -> PATCHIFY (BOTTOM LEFT) ====================
    const latX = sx(0.03);
    const latW = 64;
    const latH = 64;
    drawCuboid(ctx, latX, cyMid - latH / 2, latW, latH, 18, 12, PALETTE.img, '#091322', isMoss ? 4 : 2);
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 12px "Pretendard Variable", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Latent x_t', latX + latW / 2, cyMid + latH / 2 + 22);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillText(isMoss ? '[128, h, w] 1/16' : '[16, h, w] 1/8', latX + latW / 2, cyMid + latH / 2 + 38);

    // Animated flying patch tiles from Latent -> Token Sequence Bar
    const seqAreaX = sx(0.22);
    const seqAreaW = innerW * 0.22;
    const ditX = sx(0.50);
    const ditW = innerW * 0.22;
    const ditH = 136;
    const ditY = cyMid - ditH / 2;
    ditBoxRef.current = { x: ditX, y: ditY, w: ditW, h: ditH };

    drawFlowArrow(ctx, latX + latW + 24, cyMid, seqAreaX - 10, cyMid, PALETTE.img, b1 > 0.05 && b1 < 0.98 ? b1 : undefined);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isMoss ? 'Flatten Proj' : '2×2 Patchify', (latX + latW + 24 + seqAreaX) / 2, cyMid - 30);

    // ==================== 3. DYNAMIC TOKEN SEQUENCE MORPHING (3B1B CORE) ====================
    // 6 Image token tiles + 4 Text token tiles physically move into their model-specific topology!
    const tileW = 18;
    const tileH = 38;
    const tileGap = 4;
    const imgCount = 6;
    const txtCount = 4;

    // Where do the text tokens live?
    // Beat 1: right of Bridge. Beat 2: move to parked-above-DiT (Anima) OR snap to RIGHT (MOSS) OR snap to LEFT (Krea2)!
    const imgBaseX = isKrea ? seqAreaX + (txtCount * (tileW + tileGap) + 10) * b2 : seqAreaX;
    const ribbonShiftX = b3 * (ditX + ditW * 0.52 - seqAreaX - 60);

    // Draw Image Tokens
    for (let i = 0; i < imgCount; i++) {
      // Beat 1: emerge from latent grid into a 1D row
      const gx = latX + (i % 3) * 18 + 8;
      const gy = cyMid - 18 + Math.floor(i / 3) * 20;
      const targetX = imgBaseX + i * (tileW + tileGap) + ribbonShiftX;
      const targetY = cyMid - tileH / 2;
      const x = lerp(gx, targetX, easeOut(b1));
      const y = lerp(gy, targetY, easeOut(b1));
      const alpha = b4 > 0.2 ? clamp(1 - (b4 - 0.2) * 1.4, 0.25, 1) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      roundRect(ctx, x, y, tileW, tileH, 4, PALETTE.imgDim, PALETTE.img, 1.2);
      ctx.fillStyle = '#bae6fd';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`I${i}`, x + tileW / 2, y + tileH / 2 + 3);
      ctx.restore();
    }

    // Draw Text Tokens (Anima: stay frozen above DiT + 0-pad; MOSS/Krea2: merge into ribbon & co-evolve!)
    for (let j = 0; j < txtCount; j++) {
      const startX = bridgeX + bridgeW + 18 + j * (tileW + tileGap);
      const startY = cyTop - tileH / 2;
      let targetX: number;
      let targetY: number;

      if (isAnima) {
        // Park directly above DiT as frozen ctx
        targetX = ditX + 22 + j * (tileW + 8);
        targetY = cyTop - tileH / 2;
      } else if (isMoss) {
        // Snap onto RIGHT of image tokens [Img | Txt]
        targetX = seqAreaX + imgCount * (tileW + tileGap) + 8 + j * (tileW + tileGap) + ribbonShiftX;
        targetY = cyMid - tileH / 2;
      } else {
        // Snap onto LEFT of image tokens [Txt | Img]
        targetX = seqAreaX + j * (tileW + tileGap) + ribbonShiftX;
        targetY = cyMid - tileH / 2;
      }

      const x = lerp(startX, targetX, b2);
      const y = lerp(startY, targetY, b2);

      // Co-evolution visual: in MOSS/Krea2 during b3, text tokens absorb Cyan image tint; during b4 they fade/drop!
      const coevolve = !isAnima ? b3 : 0;
      const discardAlpha = !isAnima && b4 > 0.05 ? clamp(1 - b4 * 1.35, 0.12, 1) : 1;
      const discardDropY = !isAnima && b4 > 0.05 ? b4 * 42 : 0;

      ctx.save();
      ctx.globalAlpha = discardAlpha;
      const isPadOrSink = j === txtCount - 1;
      const stroke = isPadOrSink ? PALETTE.gate : coevolve > 0.35 ? PALETTE.attn : PALETTE.txt;
      const fill = isPadOrSink
        ? PALETTE.gateDim
        : coevolve > 0.35
          ? 'rgba(45, 212, 191, 0.22)'
          : PALETTE.txtDim;

      roundRect(ctx, x, y + discardDropY, tileW, tileH, 4, fill, stroke, 1.2);
      ctx.fillStyle = isPadOrSink ? '#fda4af' : coevolve > 0.35 ? '#99f6e4' : '#fde68a';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isPadOrSink ? (isAnima ? '0' : 'S') : `T${j}`, x + tileW / 2, y + discardDropY + tileH / 2 + 3);
      ctx.restore();
    }

    // Sequence topology caption
    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    if (isAnima) {
      ctx.fillStyle = PALETTE.txt;
      ctx.fillText('고정 ctx [512, 1024] (28블록 불변 · 끝단 0-pad)', ditX + ditW / 2, cyTop - 30);
      // Cross-attention supply beams down into DiT
      for (let k = 0; k < 3; k++) {
        const bx = ditX + 46 + k * 46;
        drawFlowArrow(ctx, bx, cyTop + 26, bx, ditY - 12, PALETTE.txt, b3 > 0.05 ? (b3 * 2 + k * 0.25) % 1 : undefined, true);
      }
    } else {
      ctx.fillStyle = PALETTE.attn;
      ctx.fillText(
        isMoss ? '단일 시퀀스 [Img N | Txt L] → 공진화' : '단일 시퀀스 [Txt T | Img N] → 공진화',
        seqAreaX + seqAreaW / 2,
        cyMid + 46,
      );
      if (b4 > 0.15) {
        ctx.fillStyle = PALETTE.gate;
        ctx.font = '600 10.5px "Pretendard Variable", sans-serif';
        ctx.fillText('최종 출력 직전 텍스트 구간 폐기 ↓', ditX + ditW * 0.45, cyMid + 90);
      }
    }
    ctx.restore();

    // ==================== 4. 3D STACKED DIT BLOCKS (CLICK TO ZOOM MESO) ====================
    drawDepthStack(ctx, ditX, ditY, ditW, ditH, PALETTE.attn, 5, 7, -5);
    roundRect(
      ctx,
      ditX,
      ditY,
      ditW,
      ditH,
      12,
      b3 > 0.1 && b3 < 0.95 ? 'rgba(45, 212, 191, 0.12)' : 'rgba(12, 18, 30, 0.94)',
      PALETTE.attn,
      b3 > 0.1 && b3 < 0.95 ? 2.2 : 1.5,
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 16px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? 'DiT Block × 28' : isMoss ? 'DiT Block × 42' : 'DiT Block × 28',
      ditX + ditW / 2,
      ditY + 34,
    );
    ctx.fillStyle = PALETTE.attn;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(
      isAnima ? 'dim 2048 · 16H (128d)' : isMoss ? 'dim 3072 · 24H (128d)' : 'dim 6144 · 48Q/12KV GQA',
      ditX + ditW / 2,
      ditY + 56,
    );
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '500 11px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? 'Self → Cross(ctx) → MLP' : isMoss ? 'Joint Attn → Softcap FFN' : 'GQA + OutGate → SwiGLU',
      ditX + ditW / 2,
      ditY + 78,
    );

    // Click-to-zoom pill inside DiT stack
    roundRect(ctx, ditX + ditW / 2 - 66, ditY + 98, 132, 24, 12, 'rgba(45,212,191,0.16)', 'rgba(45,212,191,0.55)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText('클릭해 블록 내부 줌인 ↗', ditX + ditW / 2, ditY + 114);

    // Timestep σ -> AdaLN pulse from bottom
    const sigY = H * 0.87;
    roundRect(ctx, ditX + 12, sigY - 20, ditW - 24, 34, 8, PALETTE.gateDim, 'rgba(244,63,94,0.5)', 1.2);
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(
      isAnima ? 'σ → 블록별 AdaLN 9벡터' : isMoss ? 'σ → 전 42블록 공용 6벡터' : 'σ → 공용 tvec + bias[i]',
      ditX + ditW / 2,
      sigY + 1,
    );
    drawFlowArrow(ctx, ditX + ditW / 2, sigY - 22, ditX + ditW / 2, ditY + ditH + 6, PALETTE.gate, b3 > 0.05 ? b3 : undefined, true);

    // ==================== 5. 3D VELOCITY v -> x0 -> 3D RGB OUTPUT ====================
    const velX = sx(0.79);
    const rgbX = sx(0.91);
    drawFlowArrow(ctx, ditX + ditW + 38, cyMid, velX - 10, cyMid, PALETTE.attn, b4 > 0.05 ? b4 : undefined);

    drawCuboid(ctx, velX, cyMid - 28, 52, 52, 14, 10, PALETTE.img, '#0b1424', 2);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('v', velX + 26, cyMid + 4);
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillText('x₀ = x_t − σv', velX + 30, cyMid + 48);

    drawFlowArrow(ctx, velX + 68, cyMid, rgbX - 8, cyMid, PALETTE.attn, b4 > 0.35 ? (b4 - 0.35) / 0.65 : undefined);

    drawCuboid(ctx, rgbX, cyMid - 28, 56, 56, 14, 10, PALETTE.attn, '#091c1e', 0);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText('RGB', rgbX + 28, cyMid + 4);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText(isAnima ? 'Wan2.1 VAE' : isMoss ? 'Flux2 VAE' : 'Qwen VAE', rgbX + 32, cyMid + 48);
  }, [modelId, progress]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const b = ditBoxRef.current;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      onZoomMeso();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-full w-full cursor-pointer"
      aria-label="DiT 전체 아키텍처 3B1B 애니메이션"
    />
  );
}
