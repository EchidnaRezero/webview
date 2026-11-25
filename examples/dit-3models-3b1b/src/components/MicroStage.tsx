import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { ModelSpec } from '../data/models';

interface MicroStageProps {
  model: ModelSpec;
  stepIdx: number;
}

const PATCH_LABELS = [
  '하늘L', '머리L', '머리R', '하늘R',
  '배경L', '눈L', '눈R', '배경R',
  '배경', '옷상L', '옷상R', '배경',
  '하단L', '옷하L', '옷하R', '하단R',
];

export function MicroStage({ model, stepIdx }: MicroStageProps) {
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(1);
  const [hoveredPatchIdx, setHoveredPatchIdx] = useState<number | null>(5);
  const [kreaGateValue, setKreaGateValue] = useState(0.85);
  const [gqaSubHead, setGqaSubHead] = useState(0);

  const safeTokenIdx = Math.min(selectedTokenIdx, model.miniTokens.length - 1);
  const activeToken = model.miniTokens[safeTokenIdx];

  const isAnima = model.id === 'anima';
  const isMoss = model.id === 'moss';
  const isKrea = model.id === 'krea2';

  // Build 4x4 spatial heatmap values for the active text token
  const spatialScores = useMemo(() => {
    return activeToken.spatial.map((val, idx) => {
      // Subtle head-dependent variation for Krea 2 GQA demo
      const gqaShift = isKrea ? Math.sin(idx * 1.1 + gqaSubHead * 1.4) * 0.1 : 0;
      const raw = Math.max(0.03, Math.min(0.98, val + gqaShift));
      const effective = isKrea ? raw * kreaGateValue : raw;
      return { raw, effective };
    });
  }, [activeToken, isKrea, gqaSubHead, kreaGateValue]);

  // Representative 6 image patches × 6 text tokens for crisp matrix rendering
  const samplePatches = [0, 1, 5, 6, 9, 13];

  const getCellWeight = (patchIdx: number, tokIdx: number) => {
    const raw = model.miniTokens[tokIdx]?.spatial[patchIdx] ?? 0.08;
    const gqaShift = isKrea ? Math.sin(patchIdx * 0.9 + gqaSubHead * 1.3) * 0.08 : 0;
    return Math.max(0.04, Math.min(0.96, raw + gqaShift));
  };

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {/* Token Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#0c1320] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold text-amber-300">텍스트 Key 토큰:</span>
          {model.miniTokens.map((tok, idx) => {
            const isSelected = idx === safeTokenIdx;
            const isSpecial = tok.kind !== 'prompt';
            return (
              <button
                key={tok.id}
                type="button"
                onClick={() => setSelectedTokenIdx(idx)}
                className={`rounded-md border px-2 py-1 font-mono text-xs transition ${
                  isSelected
                    ? 'border-teal-400 bg-teal-400/20 text-teal-200 shadow-sm'
                    : isSpecial
                      ? 'border-rose-500/35 border-dashed bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/50'
                }`}
              >
                {tok.label}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-400">{activeToken.desc}</div>
      </div>

      {/* Main 3-Column 3B1B Interactive Micro View */}
      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* LEFT (5 cols): Attention Matrix Geometry & XAI Slice */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080d16] p-3 lg:col-span-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-100">
                {isAnima
                  ? 'Cross-Attention 행렬 [N × L]'
                  : isMoss
                    ? 'Joint 행렬 [(N+L) × (N+L)] · [Img | Txt]'
                    : 'Joint 행렬 [(T+N) × (T+N)] · [Txt | Img]'}
              </div>
              <div className="font-mono text-[10.5px] text-teal-300">{model.xaiSliceDesc}</div>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded bg-teal-400/15 px-2 py-0.5 font-mono text-[10px] text-teal-300">
              {isAnima ? '직사각형' : isMoss ? '우상단 슬라이스' : '좌하단 슬라이스'}
            </span>
          </div>

          {/* Matrix Diagram */}
          {isAnima ? (
            <div className="my-auto flex flex-col items-center gap-2">
              <div className="grid w-full max-w-[384px] grid-cols-[68px_repeat(6,1fr)] gap-1 text-center font-mono text-[10px]">
                <div className="text-slate-500">Q \ K</div>
                {model.miniTokens.map((t, j) => (
                  <div
                    key={t.id}
                    className={`truncate rounded py-0.5 ${
                      j === safeTokenIdx
                        ? 'bg-teal-400/25 text-teal-200 font-semibold'
                        : t.kind === 'pad'
                          ? 'text-rose-300'
                          : 'text-amber-300'
                    }`}
                  >
                    {t.label}
                  </div>
                ))}

                {samplePatches.map((pIdx) => (
                  <div key={pIdx} className="contents">
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredPatchIdx(pIdx)}
                      onClick={() => setHoveredPatchIdx(pIdx)}
                      className={`truncate rounded px-1 py-1 text-right ${
                        hoveredPatchIdx === pIdx ? 'bg-sky-400/20 text-sky-200' : 'text-slate-400'
                      }`}
                    >
                      p{pIdx} {PATCH_LABELS[pIdx]}
                    </button>
                    {model.miniTokens.map((t, j) => {
                      const w = getCellWeight(pIdx, j);
                      const isCol = j === safeTokenIdx;
                      const isRow = hoveredPatchIdx === pIdx;
                      return (
                        <motion.div
                          key={`${pIdx}-${t.id}`}
                          layout
                          onMouseEnter={() => {
                            setHoveredPatchIdx(pIdx);
                            setSelectedTokenIdx(j);
                          }}
                          className={`tnum flex h-8 items-center justify-center rounded text-[10px] cursor-pointer border ${
                            t.kind === 'pad'
                              ? 'border-dashed border-rose-400/40'
                              : isCol && isRow
                                ? 'border-white'
                                : isCol
                                  ? 'border-teal-400/70'
                                  : 'border-transparent'
                          }`}
                          style={{
                            backgroundColor:
                              t.kind === 'pad'
                                ? `rgba(251, 113, 133, ${0.12 + w * 0.25})`
                                : `rgba(45, 212, 191, ${0.08 + w * 0.78})`,
                            color: w > 0.55 ? '#042f2e' : '#e2e8f0',
                          }}
                        >
                          {w.toFixed(2)}
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-rose-300/90">
                ※ [PAD] 열은 key=0 → logit=0이지만 exp(0)=1로 softmax 분모에 참여합니다.
              </div>
            </div>
          ) : (
            /* Square 2x2 Quadrant Matrix for Single-Stream MOSS ([Img|Txt]) vs Krea 2 ([Txt|Img]) */
            <div className="my-auto flex flex-col items-center gap-2">
              <div className="grid w-full max-w-[360px] grid-cols-2 gap-2">
                {isMoss ? (
                  <>
                    {/* Top-Left: I -> I */}
                    <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-emerald-300">I → I</span>
                      <span className="mt-1 text-[10px] text-slate-400">이미지 자가 어텐션</span>
                      <span className="font-mono text-[9.5px] text-slate-500">Q[0:N] × K[0:N]</span>
                    </div>
                    {/* Top-Right: I -> T (XAI SLICE!) */}
                    <motion.div
                      animate={{ boxShadow: stepIdx >= 1 ? '0 0 22px rgba(45,212,191,0.28)' : 'none' }}
                      className="flex h-28 flex-col items-center justify-center rounded-lg border-2 border-teal-400 bg-teal-400/15 p-2 text-center"
                    >
                      <span className="font-mono text-xs font-bold text-teal-200">I → T ★ XAI Hook</span>
                      <span className="mt-1 text-[10px] text-teal-100">우상단 슬라이스</span>
                      <span className="font-mono text-[9.5px] text-teal-300">Q[0:N] × K[N:N+L]</span>
                    </motion.div>
                    {/* Bottom-Left: T -> I */}
                    <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/8 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-amber-300">T → I</span>
                      <span className="mt-1 text-[10px] text-amber-200/80">텍스트가 이미지 흡수(공진화)</span>
                    </div>
                    {/* Bottom-Right: T -> T */}
                    <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-slate-300">T → T</span>
                      <span className="mt-1 text-[10px] text-slate-400">텍스트 자가 어텐션</span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Top-Left: T -> T */}
                    <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-slate-300">T → T</span>
                      <span className="mt-1 text-[10px] text-slate-400">텍스트 자가 어텐션</span>
                      <span className="font-mono text-[9.5px] text-slate-500">Q[0:T] × K[0:T]</span>
                    </div>
                    {/* Top-Right: T -> I */}
                    <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/8 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-amber-300">T → I</span>
                      <span className="mt-1 text-[10px] text-amber-200/80">텍스트가 이미지 흡수(공진화)</span>
                    </div>
                    {/* Bottom-Left: I -> T (XAI SLICE!) */}
                    <motion.div
                      animate={{ boxShadow: stepIdx >= 0 ? '0 0 22px rgba(45,212,191,0.28)' : 'none' }}
                      className="flex h-28 flex-col items-center justify-center rounded-lg border-2 border-teal-400 bg-teal-400/15 p-2 text-center"
                    >
                      <span className="font-mono text-xs font-bold text-teal-200">I → T ★ XAI Hook</span>
                      <span className="mt-1 text-[10px] text-teal-100">좌하단 슬라이스</span>
                      <span className="font-mono text-[9.5px] text-teal-300">Q[T:T+N] × K[0:T]</span>
                    </motion.div>
                    {/* Bottom-Right: I -> I */}
                    <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-slate-700/70 bg-slate-900/70 p-2 text-center">
                      <span className="font-mono text-xs font-semibold text-emerald-300">I → I</span>
                      <span className="mt-1 text-[10px] text-slate-400">이미지 자가 어텐션</span>
                      <span className="font-mono text-[9.5px] text-slate-500">Q[T:T+N] × K[T:T+N]</span>
                    </div>
                  </>
                )}
              </div>
              <div className="text-center text-[11px] text-slate-400">
                {isMoss
                  ? '시퀀스 순서 [Img | Txt] → 우상단 블록이 XAI 히트맵 재료'
                  : '시퀀스 순서 [Txt | Img] → 좌하단 블록이 XAI 히트맵 재료'}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT (6 cols): Reconstructed 4×4 Spatial XAI Heatmap + Krea 2 Interactive Gate/GQA */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080d16] p-3 lg:col-span-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-100">
                2D 공간 XAI 히트맵 복원 — 토큰 <span className="font-mono text-teal-300">{`"${activeToken.label}"`}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                {isKrea
                  ? '유효 기여 = 어텐션 확률 × Output Gate σ(Wg·h)'
                  : '16개 패치 어텐션 확률을 (4×4) 공간 격자로 복원'}
              </div>
            </div>
            {hoveredPatchIdx !== null && (
              <span className="tnum rounded bg-sky-400/15 px-2 py-0.5 font-mono text-[10.5px] text-sky-300">
                p{hoveredPatchIdx}: {(spatialScores[hoveredPatchIdx].effective * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {/* 4x4 Heatmap Grid */}
          <div className="my-auto flex flex-col items-center gap-3">
            <div className="grid w-full max-w-[272px] grid-cols-4 gap-1.5">
              {spatialScores.map(({ raw, effective }, idx) => {
                const isHovered = hoveredPatchIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseEnter={() => setHoveredPatchIdx(idx)}
                    onClick={() => setHoveredPatchIdx(idx)}
                    style={{
                      backgroundColor: `rgba(45, 212, 191, ${0.06 + effective * 0.84})`,
                    }}
                    className={`tnum flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-center transition-all duration-200 ${
                      isHovered ? 'border-white scale-[1.03]' : 'border-slate-800/80'
                    }`}
                  >
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: effective > 0.55 ? '#042f2e' : '#cbd5e1' }}
                    >
                      {PATCH_LABELS[idx]}
                    </span>
                    <span
                      className="font-mono text-[11px] font-bold"
                      style={{ color: effective > 0.55 ? '#042f2e' : '#5eead4' }}
                    >
                      {effective.toFixed(2)}
                    </span>
                    {isKrea && kreaGateValue < 0.99 && (
                      <span
                        className="font-mono text-[9px] line-through opacity-75"
                        style={{ color: effective > 0.55 ? '#0f172a' : '#fda4af' }}
                      >
                        {raw.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Krea 2 Interactive Controls: GQA Head + Output Gate Slider */}
            {isKrea ? (
              <div className="w-full space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/8 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-rose-200">Krea 2 Output Gate σ(Wg·h)</span>
                  <span className="tnum font-mono text-rose-300">{kreaGateValue.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={kreaGateValue}
                  onChange={(e) => setKreaGateValue(Number(e.target.value))}
                  aria-label="Krea 2 Output Gate 값 조절"
                  className="h-1.5 w-full cursor-pointer accent-rose-400"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                  <span className="text-slate-300">GQA 4:1 공유 Q-헤드 (KV 그룹 0):</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setGqaSubHead(r)}
                        className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                          gqaSubHead === r
                            ? 'bg-violet-400/30 text-violet-200 border border-violet-400'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        Q#{r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2 text-[11px] text-slate-300">
                <span className="font-semibold text-amber-300">XAI 해석 포인트: </span>
                {model.xaiTrapDesc}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
