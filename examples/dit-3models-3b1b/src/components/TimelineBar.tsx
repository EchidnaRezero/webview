import { Pause, Play, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { StepSpec } from '../data/models';

interface TimelineBarProps {
  steps: StepSpec[];
  stepIdx: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectStep: (idx: number) => void;
}

export function TimelineBar({
  steps,
  stepIdx,
  isPlaying,
  onTogglePlay,
  onReset,
  onPrev,
  onNext,
  onSelectStep,
}: TimelineBarProps) {
  const progress = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 100;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#0d1422] px-3.5 py-2.5">
      {/* Transport Controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onTogglePlay}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 bg-teal-400/15 px-3 py-1.5 text-xs font-semibold text-teal-200 transition hover:bg-teal-400/25"
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isPlaying ? '일시정지' : '재생'}
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label="처음으로"
          className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-1.5 text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={stepIdx === 0}
          aria-label="이전 스텝"
          className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-1.5 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={stepIdx === steps.length - 1}
          aria-label="다음 스텝"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-35"
        >
          다음
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step Pills & Scrubber */}
      <div className="flex flex-1 min-w-[200px] items-center gap-2">
        <div className="relative flex flex-1 items-center gap-1.5">
          {steps.map((s, idx) => {
            const active = idx === stepIdx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStep(idx)}
                className={`tnum flex-1 rounded-md border px-2 py-1 text-center text-[11px] font-medium transition ${
                  active
                    ? 'border-teal-400/70 bg-teal-400/20 text-teal-200'
                    : idx < stepIdx
                      ? 'border-slate-700 bg-slate-800/80 text-slate-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                }`}
              >
                Step {idx + 1}
              </button>
            );
          })}
        </div>
        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-800 sm:block">
          <div
            className="h-full rounded-full bg-teal-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Keyboard Hints */}
      <div className="hidden items-center gap-2 text-[11px] text-slate-500 xl:flex">
        <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">Space</span>
        <span>재생</span>
        <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">←/→</span>
        <span>스텝</span>
        <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">1·2·3</span>
        <span>줌</span>
      </div>
    </div>
  );
}
