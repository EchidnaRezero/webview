import { useEffect, useRef, useState } from 'react';
import { Pause, Play, ZoomIn, ZoomOut } from 'lucide-react';
import { MODEL_LIST, ZOOM_TABS, type ModelId, type ZoomLevel } from './data/models';
import { UnifiedZoomCanvas } from './canvas/UnifiedZoomCanvas';
import { clamp } from './canvas/drawUtils';

const STEP_SEC = 4.2; // 1 ODE step duration
const TOTAL_STEPS = 8; // 8 animated Rectified Flow sampling steps (σ: 1.00 -> 0.00)

export default function App() {
  const [modelId, setModelId] = useState<ModelId>('anima');
  // Camera zoom & pan are 100% interactive-only (NEVER hijacked by animation!)
  const [camDepth, setCamDepth] = useState(0);
  const [targetDepth, setTargetDepth] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Continuous Rectified Flow sampling loop (0..1 across 8 ODE steps; each step has inner forward phase 0..1)
  const [sampleProgress, setSampleProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const [selectedPatch, setSelectedPatch] = useState(5);
  const [selectedToken, setSelectedToken] = useState(1);
  const [kreaGate, setKreaGate] = useState(0.85);

  const lastTsRef = useRef<number>(performance.now());
  const targetDepthRef = useRef<number | null>(null);
  targetDepthRef.current = targetDepth;

  useEffect(() => {
    let rafId = 0;
    lastTsRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - lastTsRef.current) / 1000));
      lastTsRef.current = now;

      // 1) Continuous synchronized Rectified Flow sampling (8 ODE steps, σ: 1.0 -> 0.0)
      if (isPlaying) {
        setSampleProgress((prev) => {
          const next = prev + dt / (STEP_SEC * TOTAL_STEPS);
          return next >= 1 ? next - 1 : next;
        });
      }

      // 2) Smooth interactive camera flight ONLY when user clicked a zoom target
      if (targetDepthRef.current !== null) {
        setCamDepth((cur) => {
          const to = targetDepthRef.current!;
          const diff = to - cur;
          if (Math.abs(diff) < 0.004) {
            setTargetDepth(null);
            return to;
          }
          return cur + diff * Math.min(1, dt * 9);
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const activeZoom: ZoomLevel = camDepth < 0.5 ? 'macro' : camDepth < 1.5 ? 'meso' : 'micro';
  const phase = (sampleProgress * TOTAL_STEPS) % 1;
  const sigma = clamp(1 - sampleProgress, 0, 1);

  const flyToDepth = (depth: number) => {
    setPan({ x: 0, y: 0 });
    setTargetDepth(clamp(depth, 0, 2));
  };

  const handleWheelDepth = (delta: number) => {
    setTargetDepth(null);
    setCamDepth((cur) => clamp(cur + delta, 0, 2));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === '1') flyToDepth(0);
      else if (e.key === '2') flyToDepth(1);
      else if (e.key === '3') flyToDepth(2);
      else if (e.key === 'ArrowLeft') setPan((p) => ({ ...p, x: clamp(p.x + 60, -560, 560) }));
      else if (e.key === 'ArrowRight') setPan((p) => ({ ...p, x: clamp(p.x - 60, -560, 560) }));
      else if (e.key === 'ArrowUp') setPan((p) => ({ ...p, y: clamp(p.y + 60, -320, 320) }));
      else if (e.key === 'ArrowDown') setPan((p) => ({ ...p, y: clamp(p.y - 60, -320, 320) }));
      else if (e.key.toLowerCase() === 'r') setPan({ x: 0, y: 0 });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#060910] text-slate-100">
      {/* Ultra-slim Minimal Top Bar */}
      <header className="z-20 flex h-13 shrink-0 items-center justify-between gap-4 border-b border-slate-800/60 bg-[#060910]/90 px-5 backdrop-blur">
        <div className="flex items-center gap-1.5">
          {MODEL_LIST.map((m) => {
            const active = m.id === modelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelId(m.id)}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? 'bg-teal-400/20 text-teal-200 ring-1 ring-teal-400/60'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {m.shortName}
              </button>
            );
          })}
        </div>

        <nav className="flex items-center gap-1" aria-label="카메라 줌 깊이">
          {ZOOM_TABS.map((t, idx) => {
            const active = activeZoom === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => flyToDepth(idx)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  active ? 'bg-slate-800/90 text-white' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <span className="mr-1.5 font-mono text-[10px] text-teal-400/80">{t.num}</span>
                {t.short}
              </button>
            );
          })}
          <div className="ml-2 flex items-center gap-0.5 border-l border-slate-800 pl-2">
            <button
              type="button"
              onClick={() => flyToDepth(Math.max(0, Math.round(camDepth) - 1))}
              aria-label="축소"
              className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => flyToDepth(Math.min(2, Math.round(camDepth) + 1))}
              aria-label="확대"
              className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </nav>

        <div className="hidden items-center gap-3 text-[11px] text-slate-400 lg:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> Image / Q
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Text / K
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2dd4bf]" /> Attention / XAI
          </span>
        </div>
      </header>

      {/* FULL-SCREEN LIVE 60FPS SYNCHRONIZED CANVAS (ALL MATH TERMS LIVE ON THE TENSORS!) */}
      <main className="relative flex-1 min-h-0 w-full">
        <UnifiedZoomCanvas
          modelId={modelId}
          camDepth={camDepth}
          pan={pan}
          phase={phase}
          sampleProgress={sampleProgress}
          selectedPatch={selectedPatch}
          selectedToken={selectedToken}
          kreaGate={kreaGate}
          onZoomTo={flyToDepth}
          onWheelDepth={handleWheelDepth}
          onPanChange={setPan}
          onSelectPatch={setSelectedPatch}
          onSelectToken={setSelectedToken}
        />
      </main>

      {/* Razor-thin Control Strip: Play/Pause + Interactive Zoom + Live σ / Gate */}
      <footer className="z-20 shrink-0 border-t border-slate-800/50 bg-[#060910]/95 px-5 py-2">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-teal-400/15 px-2.5 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/40 hover:bg-teal-400/25"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? '일시정지' : '재생'}
            </button>

            <label className="flex items-center gap-2 text-slate-400">
              <span className="font-mono text-teal-400">ZOOM</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={camDepth}
                onChange={(e) => {
                  setTargetDepth(null);
                  setCamDepth(Number(e.target.value));
                }}
                className="h-1 w-32 cursor-pointer accent-teal-400"
              />
              <span className="tnum w-10 font-mono text-slate-300">{Math.pow(4.7, camDepth).toFixed(1)}×</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-slate-400">
              <span className="font-mono text-sky-400">ODE σ (1→0)</span>
              <input
                type="range"
                min={0}
                max={0.999}
                step={0.005}
                value={sampleProgress}
                onChange={(e) => setSampleProgress(Number(e.target.value))}
                className="h-1 w-28 cursor-pointer accent-sky-400"
              />
              <span className="tnum w-10 font-mono text-slate-200">{sigma.toFixed(2)}</span>
            </label>

            {modelId === 'krea2' && activeZoom !== 'macro' && (
              <label className="flex items-center gap-2 text-rose-300">
                <span className="font-mono">σ(Wg·h)</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={kreaGate}
                  onChange={(e) => setKreaGate(Number(e.target.value))}
                  className="h-1 w-24 cursor-pointer accent-rose-400"
                />
                <span className="tnum w-8 font-mono text-rose-200">{kreaGate.toFixed(2)}</span>
              </label>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
