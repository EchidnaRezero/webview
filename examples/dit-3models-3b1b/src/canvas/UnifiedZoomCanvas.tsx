import { useEffect, useRef, useState } from 'react';
import type { ModelId } from '../data/models';
import { PALETTE, clamp, drawGridBg, easeInOut } from './drawUtils';
import {
  MACRO_TO_MESO_PORTAL,
  MESO_TO_MICRO_PORTAL,
  WORLD_H,
  WORLD_W,
  drawMacroScene,
  drawMesoScene,
  drawMicroScene,
  type MicroHitRects,
} from './scenes';

interface UnifiedZoomCanvasProps {
  modelId: ModelId;
  /** Interactive-only camera depth: 0 = Macro, 1 = Meso, 2 = Micro (NEVER auto-zoomed) */
  camDepth: number;
  /** Interactive pan offset in screen pixels (drag left/right/up/down) */
  pan: { x: number; y: number };
  /** Shared live 60fps forward-pass clock within one ODE step (0..1) */
  phase: number;
  /** Outer Rectified Flow sampling progress (0..1, σ = 1 - sampleProgress) */
  sampleProgress: number;
  selectedPatch: number;
  selectedToken: number;
  kreaGate: number;
  onZoomTo: (depth: number) => void;
  onWheelDepth: (delta: number) => void;
  onPanChange: (next: { x: number; y: number }) => void;
  onSelectPatch: (idx: number) => void;
  onSelectToken: (idx: number) => void;
}

export function UnifiedZoomCanvas({
  modelId,
  camDepth,
  pan,
  phase,
  sampleProgress,
  selectedPatch,
  selectedToken,
  kreaGate,
  onZoomTo,
  onWheelDepth,
  onPanChange,
  onSelectPatch,
  onSelectToken,
}: UnifiedZoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const microHitsRef = useRef<MicroHitRects>({ patches: [], tokens: [] });
  const viewFitRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ active: boolean; moved: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

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

    const fitScale = Math.min((W - 24) / WORLD_W, (H - 16) / WORLD_H);
    const fitOx = (W - WORLD_W * fitScale) / 2;
    const fitOy = (H - WORLD_H * fitScale) / 2;
    viewFitRef.current = { scale: fitScale, ox: fitOx, oy: fitOy };

    const z = clamp(camDepth, 0, 2);

    // Map shared forward-pass `phase` into synchronized Meso & Micro sub-clocks so all 3 levels pulse together!
    const mesoPhase = (phase * 1.5) % 1;
    const microPhase = (phase * 1.5) % 1;

    const renderNestedPair = (
      localZ: number,
      portal: { x: number; y: number; w: number; h: number },
      drawParent: (portalFade: number) => void,
      drawChild: () => void,
    ) => {
      const e = easeInOut(localZ);
      const targetScale = Math.min(WORLD_W / portal.w, WORLD_H / portal.h);
      const camZoom = Math.pow(targetScale, e);

      const worldCx = WORLD_W / 2;
      const worldCy = WORLD_H / 2;
      const portalCx = portal.x + portal.w / 2;
      const portalCy = portal.y + portal.h / 2;

      const invRatio = targetScale > 1.001 ? (1 - 1 / camZoom) / (1 - 1 / targetScale) : e;
      const camCx = worldCx + (portalCx - worldCx) * invRatio;
      const camCy = worldCy + (portalCy - worldCy) * invRatio;

      const parentAlpha = clamp(1 - (e - 0.65) / 0.35, 0, 1);
      if (parentAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = parentAlpha;
        ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
        ctx.scale(fitScale * camZoom, fitScale * camZoom);
        ctx.translate(-camCx, -camCy);
        drawParent(e);
        ctx.restore();
      }

      const childAlpha = clamp(0.24 + e * 0.92, 0, 1);
      ctx.save();
      ctx.globalAlpha = childAlpha;
      ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
      ctx.scale(fitScale * camZoom, fitScale * camZoom);
      ctx.translate(-camCx, -camCy);

      ctx.translate(portal.x, portal.y);
      ctx.scale(portal.w / WORLD_W, portal.h / WORLD_H);

      if (e < 0.92) {
        ctx.beginPath();
        ctx.rect(0, 0, WORLD_W, WORLD_H);
        ctx.clip();
      }
      drawChild();
      ctx.restore();
    };

    const sigma = clamp(1 - sampleProgress, 0, 1);

    if (z <= 1) {
      renderNestedPair(
        z,
        MACRO_TO_MESO_PORTAL,
        (portalFade) => drawMacroScene(ctx, modelId, phase, sampleProgress, portalFade),
        () => drawMesoScene(ctx, modelId, mesoPhase, sigma, kreaGate, 0),
      );
    } else {
      const localZ = z - 1;
      renderNestedPair(
        localZ,
        MESO_TO_MICRO_PORTAL,
        (portalFade) => drawMesoScene(ctx, modelId, mesoPhase, sigma, kreaGate, portalFade),
        () =>
          drawMicroScene(
            ctx,
            modelId,
            microPhase,
            selectedPatch,
            selectedToken,
            kreaGate,
            localZ > 0.85 ? microHitsRef.current : undefined,
          ),
      );
    }

    const mag = Math.pow(4.7, z);
    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'right';
    ctx.fillText(`ZOOM ${mag.toFixed(1)}×  ·  드래그 이동 · 휠 확대/축소`, W - 20, 24);
    ctx.restore();
  }, [modelId, camDepth, pan, phase, sampleProgress, selectedPatch, selectedToken, kreaGate]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) {
      onPanChange({
        x: clamp(d.origX + dx, -560, 560),
        y: clamp(d.origY + dy, -320, 320),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const wasDrag = d.moved;
    d.active = false;
    setDragging(false);
    if (wasDrag) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = viewFitRef.current;
    const wx = (e.clientX - rect.left - ox - pan.x) / scale;
    const wy = (e.clientY - rect.top - oy - pan.y) / scale;

    if (camDepth < 0.45) {
      const p = MACRO_TO_MESO_PORTAL;
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) onZoomTo(1);
    } else if (camDepth >= 0.55 && camDepth < 1.45) {
      const p = MESO_TO_MICRO_PORTAL;
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) onZoomTo(2);
    } else if (camDepth >= 1.55) {
      for (const patch of microHitsRef.current.patches) {
        if (wx >= patch.x && wx <= patch.x + patch.w && wy >= patch.y && wy <= patch.y + patch.h) {
          onSelectPatch(patch.idx);
          return;
        }
      }
      for (const tok of microHitsRef.current.tokens) {
        if (wx >= tok.x && wx <= tok.x + tok.w && wy >= tok.y && wy <= tok.y + tok.h) {
          onSelectToken(tok.idx);
          return;
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    onWheelDepth(e.deltaY < 0 ? 0.14 : -0.14);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={() => onPanChange({ x: 0, y: 0 })}
      onWheel={handleWheel}
      className={`h-full w-full touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      aria-label="DiT 전체·블록·어텐션 동시 연동 60fps 3B1B 애니메이션 (드래그 이동 · 휠 확대/축소)"
    />
  );
}
