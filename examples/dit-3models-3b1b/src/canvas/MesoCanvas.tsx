import { useEffect, useRef } from 'react';
import type { ModelId } from '../data/models';
import {
  PALETTE,
  drawDepthStack,
  drawFlowArrow,
  drawGridBg,
  drawRopeDial,
  easeInOut,
  lerp,
  roundRect,
} from './drawUtils';

interface MesoCanvasProps {
  modelId: ModelId;
  /** Continuous progress 0..1 across 4 beats */
  progress: number;
  kreaGate: number;
  onZoomMicro: () => void;
}

export function MesoCanvas({ modelId, progress, kreaGate, onZoomMicro }: MesoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const attnBoxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

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

    const padX = Math.max(36, (W - 1100) / 2);
    const innerW = Math.min(1100, W - padX * 2);
    const sx = (f: number) => padX + innerW * f;

    const isAnima = modelId === 'anima';
    const isMoss = modelId === 'moss';
    const isKrea = modelId === 'krea2';

    // 4 beats:
    // b1 (0.00..0.25): Pre-Norm + AdaLN modulation shifting/scaling token vectors
    // b2 (0.25..0.52): Q/K/V split + QK-Norm + live rotating RoPE phasors
    // b3 (0.52..0.78): 3D Multi-Head Attention (+ Cross-Attn for Anima / Output Gate shutter for Krea 2)
    // b4 (0.78..1.00): Residual gate ×g + MLP/SwiGLU/Softcap FFN + curved residual summation
    const b1 = easeInOut(progress / 0.25);
    const b2 = easeInOut((progress - 0.25) / 0.27);
    const b3 = easeInOut((progress - 0.52) / 0.26);
    const b4 = easeInOut((progress - 0.78) / 0.22);

    const railY = H * 0.22;
    const midY = H * 0.56;

    // ==================== TOP: RESIDUAL HIGHWAY & AdaLN BUS ====================
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx(0.02), railY);
    ctx.lineTo(sx(0.98), railY);
    ctx.stroke();

    // Animated pulse gliding along residual highway
    const rxPulse = lerp(sx(0.02), sx(0.98), progress);
    ctx.shadowColor = PALETTE.img;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rxPulse, railY, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = PALETTE.img;
    ctx.textAlign = 'left';
    ctx.fillText(
      isAnima ? 'resid_in [B, N, 2048]' : isMoss ? 'resid_in [B, N+L, 3072]' : 'resid_in [B, T+N, 6144]',
      sx(0.02),
      railY - 12,
    );
    ctx.textAlign = 'right';
    ctx.fillText('resid_out →', sx(0.98), railY - 12);
    ctx.restore();

    // ==================== 1. AdaLN MODULATION (LEFT) ====================
    const modX = sx(0.02);
    const modW = innerW * 0.16;
    roundRect(
      ctx,
      modX,
      midY - 68,
      modW,
      136,
      10,
      b1 > 0.05 && b1 < 0.95 ? PALETTE.gateDim : PALETTE.surface,
      b1 > 0.05 && b1 < 0.95 ? PALETTE.gate : PALETTE.border,
      1.5,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fda4af';
    ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
    ctx.fillText('Norm + AdaLN(σ)', modX + modW / 2, midY - 42);
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '500 10.5px "JetBrains Mono", monospace';
    ctx.fillText('(1+s)⊙Norm(x)+b', modX + modW / 2, midY - 22);

    // Animated vector bars physically stretching/shifting with AdaLN!
    const barBaseY = midY + 46;
    const rawHeights = [26, 44, 18, 38, 30];
    const modScale = 1 + Math.sin(b1 * Math.PI) * 0.42;
    rawHeights.forEach((bh, i) => {
      const bx = modX + 22 + i * ((modW - 44) / 5);
      const h = bh * modScale;
      roundRect(ctx, bx, barBaseY - h, 14, h, 3, PALETTE.imgDim, PALETTE.img, 1.1);
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? '블록별 독립 9벡터' : isMoss ? '전 42블록 공용 6벡터' : '공용 tvec + bias[i]',
      modX + modW / 2,
      midY + 62,
    );

    // Drop from residual rail into AdaLN
    drawFlowArrow(ctx, modX + modW / 2, railY, modX + modW / 2, midY - 70, PALETTE.img, b1);

    // ==================== 2. Q / K / V SPLIT + QK-NORM + LIVE RoPE DIALS ====================
    const qkvX = sx(0.22);
    const qkvW = innerW * 0.21;
    drawFlowArrow(ctx, modX + modW + 6, midY, qkvX - 8, midY, PALETTE.img, b2 > 0.05 && b2 < 0.95 ? b2 : undefined);

    roundRect(
      ctx,
      qkvX,
      midY - 86,
      qkvW,
      172,
      12,
      PALETTE.surface,
      b2 > 0.05 && b2 < 0.95 ? PALETTE.img : PALETTE.border,
      1.4,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isKrea ? 'GQA 투영 (48Q / 12KV) + RoPE' : isMoss ? 'Q·K·V 투영 (24H) + 4축 RoPE' : 'Q·K·V + QK-RMSNorm + RoPE',
      qkvX + qkvW / 2,
      midY - 62,
    );

    // Live RoPE Phasor Dials!
    const spinAngle = -Math.PI / 4 + progress * Math.PI * 3.5;
    drawRopeDial(
      ctx,
      qkvX + qkvW * 0.28,
      midY - 12,
      24,
      spinAngle,
      PALETTE.img,
      isAnima ? 'Self Q (3D)' : isMoss ? 'Img Q (y,x)' : 'Img Q (y,x)',
      false,
    );
    drawRopeDial(
      ctx,
      qkvX + qkvW * 0.72,
      midY - 12,
      24,
      isKrea || isAnima ? 0 : spinAngle * 0.65,
      PALETTE.txt,
      isAnima ? 'Cross (OFF)' : isMoss ? 'Txt K (seq)' : 'Txt (0,0,0)!',
      isKrea || isAnima,
    );

    // V bypass note (never rotated)
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10.5px "JetBrains Mono", monospace';
    ctx.fillText(
      isKrea ? 'Q 4개당 KV 1개 공유 · V는 RoPE 없음' : 'V와 잔차에는 RoPE 미적용',
      qkvX + qkvW / 2,
      midY + 66,
    );

    // ==================== 3. 3D MULTI-HEAD ATTENTION + (KREA 2 OUTPUT GATE) ====================
    const attnX = sx(0.47);
    const attnW = isKrea ? innerW * 0.17 : innerW * 0.24;
    const attnH = 152;
    const attnY = midY - attnH / 2;
    attnBoxRef.current = { x: attnX, y: attnY, w: attnW, h: attnH };

    drawFlowArrow(ctx, qkvX + qkvW + 6, midY, attnX - 8, midY, PALETTE.attn, b3 > 0.05 && b3 < 0.95 ? b3 : undefined);

    drawDepthStack(ctx, attnX, attnY, attnW, attnH, PALETTE.attn, 4, 6, -5);
    roundRect(
      ctx,
      attnX,
      attnY,
      attnW,
      attnH,
      12,
      b3 > 0.05 && b3 < 0.95 ? 'rgba(45, 212, 191, 0.14)' : PALETTE.surfaceHi,
      PALETTE.attn,
      1.8,
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = '#99f6e4';
    ctx.font = '800 13.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? 'Self → ★Cross-Attn' : isMoss ? 'Joint Self-Attn ★' : 'GQA Joint Attn ★',
      attnX + attnW / 2,
      attnY + 34,
    );
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillText(
      isAnima ? '[16, N, L] · 고정 ctx' : isMoss ? '[24, N+L, N+L]' : '[48, T+N, T+N]',
      attnX + attnW / 2,
      attnY + 58,
    );
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? '이미지 Q → 텍스트 ctx' : isMoss ? '우상단 Img→Txt Hook' : '좌하단 Img→Txt Hook',
      attnX + attnW / 2,
      attnY + 80,
    );

    // Click-to-zoom pill
    roundRect(ctx, attnX + attnW / 2 - 64, attnY + 106, 128, 24, 12, 'rgba(45,212,191,0.18)', 'rgba(45,212,191,0.55)', 1);
    ctx.fillStyle = '#99f6e4';
    ctx.font = '600 10px "Pretendard Variable", sans-serif';
    ctx.fillText('클릭해 어텐션 줌인 ↗', attnX + attnW / 2, attnY + 122);

    // Krea 2 Special: Animated Output Gate Shutter σ(Wg·h)
    let afterAttnX = attnX + attnW + 26;
    if (isKrea) {
      const gateX = sx(0.67);
      const gateW = innerW * 0.11;
      drawFlowArrow(ctx, attnX + attnW + 24, midY, gateX - 6, midY, PALETTE.gate, b3 > 0.2 ? (b3 - 0.2) / 0.8 : undefined);

      roundRect(ctx, gateX, midY - 62, gateW, 124, 10, PALETTE.gateDim, PALETTE.gate, 1.6);
      ctx.fillStyle = '#fda4af';
      ctx.font = '700 11.5px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Output Gate', gateX + gateW / 2, midY - 38);
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      ctx.fillText(`σ(Wg·h)=${kreaGate.toFixed(2)}`, gateX + gateW / 2, midY - 20);

      // Physical aperture shutter bar
      const shW = gateW - 24;
      const shH = 44;
      const shX = gateX + 12;
      const shY = midY - 4;
      roundRect(ctx, shX, shY, shW, shH, 6, '#090f19', 'rgba(244,63,94,0.4)', 1);
      const openH = shH * kreaGate;
      roundRect(ctx, shX + 3, shY + (shH - openH) / 2, shW - 6, openH, 4, 'rgba(45,212,191,0.45)', PALETTE.attn, 1);

      ctx.fillStyle = PALETTE.text2;
      ctx.font = '500 9.5px "Pretendard Variable", sans-serif';
      ctx.fillText('Wo 직전 토큰별 ⊙', gateX + gateW / 2, midY + 52);
      afterAttnX = gateX + gateW + 8;
    }

    // Summation node (+) on residual rail after Attention
    const sum1X = afterAttnX + 10;
    drawFlowArrow(ctx, sum1X, midY - 64, sum1X, railY + 13, PALETTE.attn, b3 > 0.6 ? (b3 - 0.6) / 0.4 : undefined);
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('× g₁', sum1X + 8, (midY - 64 + railY) / 2);

    ctx.beginPath();
    ctx.arc(sum1X, railY, 11, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.bg;
    ctx.fill();
    ctx.strokeStyle = PALETTE.attn;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+', sum1X, railY + 5);

    // ==================== 4. FFN / SwiGLU / SOFT-CAPPED GATED FFN ====================
    const ffnX = sx(0.81);
    const ffnW = innerW * 0.16;
    drawFlowArrow(ctx, ffnX + ffnW * 0.25, railY, ffnX + ffnW * 0.25, midY - 62, PALETTE.img, b4 > 0.05 ? b4 : undefined);

    roundRect(
      ctx,
      ffnX,
      midY - 60,
      ffnW,
      120,
      12,
      b4 > 0.1 ? 'rgba(56, 189, 248, 0.10)' : PALETTE.surface,
      b4 > 0.1 ? PALETTE.img : PALETTE.border,
      1.5,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 12.5px "Pretendard Variable", sans-serif';
    ctx.fillText(isAnima ? 'MLP' : isMoss ? 'Softcap Gated FFN' : 'SwiGLU MLP', ffnX + ffnW / 2, midY - 22);
    ctx.fillStyle = PALETTE.text2;
    ctx.font = '500 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima ? '채널 비선형 변환' : isMoss ? '폭 8192 · 게이트+소프트캡' : '이미지·텍스트 공용',
      ffnX + ffnW / 2,
      midY + 2,
    );
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.fillText(isAnima ? '× gate₃' : '× g₂', ffnX + ffnW / 2, midY + 34);

    // Summation node (+) after FFN
    const sum2X = ffnX + ffnW * 0.8;
    drawFlowArrow(ctx, sum2X, midY - 60, sum2X, railY + 13, PALETTE.img, b4 > 0.45 ? (b4 - 0.45) / 0.55 : undefined);
    ctx.beginPath();
    ctx.arc(sum2X, railY, 11, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.bg;
    ctx.fill();
    ctx.strokeStyle = PALETTE.img;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 14px sans-serif';
    ctx.fillText('+', sum2X, railY + 5);

    // Bottom Anima fixed ctx supply note
    if (isAnima) {
      roundRect(ctx, attnX + 20, H * 0.85, attnW - 40, 32, 8, PALETTE.txtDim, PALETTE.txt, 1.2);
      ctx.fillStyle = '#fde68a';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText('고정 텍스트 ctx [512, 1024] (K, V)', attnX + attnW / 2, H * 0.85 + 20);
      drawFlowArrow(ctx, attnX + attnW / 2, H * 0.85 - 2, attnX + attnW / 2, attnY + attnH + 4, PALETTE.txt, b3, true);
    }
  }, [modelId, progress, kreaGate]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const b = attnBoxRef.current;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      onZoomMicro();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-full w-full cursor-pointer"
      aria-label="DiT 1-블록 내부 회로 3B1B 애니메이션"
    />
  );
}
