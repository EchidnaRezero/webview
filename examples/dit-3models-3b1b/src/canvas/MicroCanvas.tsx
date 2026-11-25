import { useEffect, useRef } from 'react';
import { MODELS, type ModelId } from '../data/models';
import {
  PALETTE,
  clamp,
  drawDepthStack,
  drawGridBg,
  easeInOut,
  easeOut,
  lerp,
  roundRect,
} from './drawUtils';

interface MicroCanvasProps {
  modelId: ModelId;
  /** Continuous progress 0..1 across 4 beats */
  progress: number;
  selectedPatch: number;
  selectedToken: number;
  kreaGate: number;
  onSelectPatch: (idx: number) => void;
  onSelectToken: (idx: number) => void;
}

const PATCH_LABELS = [
  '하늘', '머리', '머리', '하늘',
  '배경', '눈L', '눈R', '배경',
  '배경', '의상', '의상', '배경',
  '하단', '의상', '의상', '하단',
];

export function MicroCanvas({
  modelId,
  progress,
  selectedPatch,
  selectedToken,
  kreaGate,
  onSelectPatch,
  onSelectToken,
}: MicroCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitPatchesRef = useRef<Array<{ x: number; y: number; w: number; h: number; idx: number }>>([]);
  const hitTokensRef = useRef<Array<{ x: number; y: number; w: number; h: number; idx: number }>>([]);

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

    const model = MODELS[modelId];
    const isAnima = modelId === 'anima';
    const isMoss = modelId === 'moss';
    const isKrea = modelId === 'krea2';
    const safeTok = Math.min(selectedToken, model.miniTokens.length - 1);

    const padX = Math.max(32, (W - 1140) / 2);
    const innerW = Math.min(1140, W - padX * 2);
    const sx = (f: number) => padX + innerW * f;
    const cy = H * 0.52;

    // 4 continuous beats:
    // b1 (0.00..0.28): Selected image patch q_i emits rays to Key vectors k_j (q·kᵀ / √128)
    // b2 (0.28..0.55): Softmax normalization (bars normalize; [PAD] / template trap highlighted)
    // b3 (0.55..0.78): 3D Multi-Head Attention Cube [H, Nq, Nk] -> XAI Img->Txt Slice flies out
    // b4 (0.78..1.00): Value weighted sum + (Krea 2 Output Gate shutter) -> 2D Spatial Heatmap
    const b1 = easeInOut(progress / 0.28);
    const b2 = easeInOut((progress - 0.28) / 0.27);
    const b3 = easeInOut((progress - 0.55) / 0.23);
    const b4 = easeInOut((progress - 0.78) / 0.22);

    // ==================== 1. LEFT: INTERACTIVE 4×4 IMAGE PATCH GRID (QUERY SOURCE) ====================
    const gridSize = Math.min(196, innerW * 0.19);
    const gridX = sx(0.01);
    const gridY = cy - gridSize / 2;
    const cell = gridSize / 4;
    hitPatchesRef.current = [];

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.img;
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    ctx.fillText('IMAGE QUERY [N]', gridX + gridSize / 2, gridY - 16);

    let selPatchCenter = { x: gridX + gridSize, y: cy };
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const idx = r * 4 + c;
        const cxCell = gridX + c * cell;
        const cyCell = gridY + r * cell;
        const isSel = idx === selectedPatch;
        hitPatchesRef.current.push({ x: cxCell, y: cyCell, w: cell, h: cell, idx });

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
        ctx.fillText(PATCH_LABELS[idx], cxCell + cell / 2, cyCell + cell / 2 + 3.5);
        if (isSel) {
          selPatchCenter = { x: cxCell + cell, y: cyCell + cell / 2 };
        }
      }
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "Pretendard Variable", sans-serif';
    ctx.fillText(`선택 패치 q_${selectedPatch} (클릭해 변경)`, gridX + gridSize / 2, gridY + gridSize + 20);

    // ==================== 2. CENTER-LEFT: KEY VECTORS + LIVE DOT-PRODUCT & SOFTMAX BARS ====================
    const keyX = sx(0.25);
    const keyW = innerW * 0.24;
    const rowH = 38;
    const listTop = cy - (model.miniTokens.length * rowH) / 2;
    hitTokensRef.current = [];

    // Compute raw logits & softmax probabilities for selectedPatch across all miniTokens
    const logits = model.miniTokens.map((t) => (t.kind === 'pad' ? 0 : (t.spatial[selectedPatch] - 0.25) * 4.2));
    const exps = logits.map((v) => Math.exp(v));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sumExp);

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.txt;
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    ctx.fillText(
      b2 > 0.3 ? 'SOFTMAX(q·kᵀ / √128) → PROB' : 'TEXT KEYS [K_j] · DOT PRODUCT',
      keyX,
      listTop - 16,
    );

    model.miniTokens.forEach((tok, j) => {
      const ty = listTop + j * rowH;
      const isTokSel = j === safeTok;
      const isTrap = tok.kind !== 'prompt';
      hitTokensRef.current.push({ x: keyX, y: ty, w: keyW, h: rowH - 6, idx: j });

      // Animated dot-product ray from selected image patch -> this key vector
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
      ctx.globalAlpha = (0.12 + rayStrength * 0.65) * easeOut(b1);
      ctx.lineWidth = isTokSel ? 2.4 : 1.1 + probs[j] * 2.2;
      ctx.stroke();
      ctx.restore();

      // Token row pill
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

      // Token label
      ctx.textAlign = 'left';
      ctx.fillStyle = isTrap ? '#fda4af' : isTokSel ? '#99f6e4' : '#fde68a';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(tok.label, keyX + 10, ty + 20);

      // Animated probability / logit bar inside row
      const barX = keyX + 90;
      const maxBarW = keyW - 142;
      const logitNorm = clamp((logits[j] + 1.5) / 4.8, 0.05, 1);
      const displayFrac = lerp(logitNorm * easeOut(b1), probs[j], b2);
      roundRect(ctx, barX, ty + 11, maxBarW, 10, 4, 'rgba(148,163,184,0.12)');
      roundRect(
        ctx,
        barX,
        ty + 11,
        Math.max(4, maxBarW * displayFrac),
        10,
        4,
        isTrap ? PALETTE.gate : PALETTE.attn,
      );

      // Numeric value
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      ctx.fillText(
        b2 > 0.35 ? `${(probs[j] * 100).toFixed(0)}%` : logits[j].toFixed(1),
        keyX + keyW - 8,
        ty + 20,
      );
    });

    // Trap note below key list
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gate;
    ctx.font = '500 10.5px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isAnima
        ? '※ [PAD]는 logit=0이지만 exp(0)=1이 softmax 분모에 참여'
        : isMoss
          ? '※ 채팅 템플릿 토큰이 마스크 없이 Key로 포함됨'
          : '※ 꼬리 5토큰이 단방향 요약을 담아 싱크로 작용 가능',
      keyX,
      listTop + model.miniTokens.length * rowH + 16,
    );

    // ==================== 3. CENTER-RIGHT: 3D MULTI-HEAD MATRIX & FLYING XAI SLICE ====================
    const matSize = Math.min(168, innerW * 0.155);
    const matX = sx(0.52);
    const matY = cy - matSize / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.attn;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(
      isAnima ? '3D [16, N, L]' : isMoss ? '3D [24, N+L, N+L]' : '3D [48Q/12KV, T+N, T+N]',
      matX + matSize / 2 + 8,
      matY - 22,
    );

    drawDepthStack(ctx, matX, matY, matSize, matSize, PALETTE.attn, 4, 6, -5);
    roundRect(ctx, matX, matY, matSize, matSize, 6, '#080e18', PALETTE.border, 1.3);

    // Exact XAI slice quadrant inside the 3D matrix
    let slX: number;
    let slY: number;
    let slW: number;
    let slH: number;
    if (isAnima) {
      // Pad tail on right
      ctx.fillStyle = PALETTE.gateDim;
      ctx.fillRect(matX + matSize * 0.74, matY + 3, matSize * 0.24, matSize - 6);
      slX = matX + 3;
      slY = matY + 3;
      slW = matSize * 0.69;
      slH = matSize - 6;
    } else if (isMoss) {
      const split = matSize * 0.62;
      ctx.fillStyle = 'rgba(56,189,248,0.08)';
      ctx.fillRect(matX + 2, matY + 2, split - 2, split - 2);
      slX = matX + split;
      slY = matY + 2;
      slW = matSize - split - 2;
      slH = split - 2;
    } else {
      const split = matSize * 0.38;
      ctx.fillStyle = 'rgba(56,189,248,0.08)';
      ctx.fillRect(matX + split, matY + split, matSize - split - 2, matSize - split - 2);
      slX = matX + 2;
      slY = matY + split;
      slW = split - 2;
      slH = matSize - split - 2;
    }

    // Highlighted slice inside matrix
    roundRect(ctx, slX, slY, slW, slH, 4, 'rgba(45, 212, 191, 0.30)', PALETTE.attn, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Img→Txt', slX + slW / 2, slY + slH / 2 + 4);

    // ==================== 4. RIGHT: LIVE 4×4 SPATIAL XAI HEATMAP (+ KREA 2 OUTPUT GATE) ====================
    const hmSize = Math.min(188, innerW * 0.175);
    const hmX = sx(0.81);
    const hmY = cy - hmSize / 2;
    const hmCell = hmSize / 4;

    // Flying extracted slice ghost moving from matrix -> heatmap during b3
    if (b3 > 0.02 && b3 < 0.98) {
      const fx = lerp(slX, hmX, b3);
      const fy = lerp(slY, hmY, b3);
      const fw = lerp(slW, hmSize, b3);
      const fh = lerp(slH, hmSize, b3);
      ctx.save();
      ctx.globalAlpha = Math.sin(b3 * Math.PI) * 0.55;
      roundRect(ctx, fx, fy, fw, fh, 6, 'rgba(45, 212, 191, 0.22)', PALETTE.attn, 1.6);
      ctx.restore();
    }

    // Krea 2 Output Gate shutter indicator between matrix and heatmap
    if (isKrea) {
      const gx = (matX + matSize + 24 + hmX) / 2;
      roundRect(ctx, gx - 24, cy - 34, 48, 68, 8, PALETTE.gateDim, PALETTE.gate, 1.4);
      ctx.fillStyle = '#fda4af';
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Gate', gx, cy - 16);
      ctx.fillText(kreaGate.toFixed(2), gx, cy + 26);
      const barH = 26 * kreaGate;
      roundRect(ctx, gx - 12, cy - barH / 2 + 2, 24, barH, 3, PALETTE.attn);
    }

    const activeTok = model.miniTokens[safeTok];
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.attn;
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    ctx.fillText(`XAI MAP · "${activeTok.label}"`, hmX + hmSize / 2, hmY - 16);

    roundRect(ctx, hmX - 4, hmY - 4, hmSize + 8, hmSize + 8, 10, '#080e18', PALETTE.attn, 1.5);
    const reveal = clamp(0.25 + b4 * 0.75, 0.25, 1);

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

    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "Pretendard Variable", sans-serif';
    ctx.fillText(
      isKrea ? '유효 기여 = Softmax 확률 × Output Gate' : '텍스트 토큰을 클릭해 공간 히트맵 비교',
      hmX + hmSize / 2,
      hmY + hmSize + 22,
    );
  }, [modelId, progress, selectedPatch, selectedToken, kreaGate]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const p of hitPatchesRef.current) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
        onSelectPatch(p.idx);
        return;
      }
    }
    for (const t of hitTokensRef.current) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        onSelectToken(t.idx);
        return;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-full w-full cursor-pointer"
      aria-label="DiT 어텐션 Q·Kᵀ → Softmax → 3D 슬라이스 → 2D 히트맵 3B1B 애니메이션"
    />
  );
}
