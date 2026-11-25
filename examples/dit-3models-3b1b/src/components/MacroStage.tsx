import { motion } from 'motion/react';
import { ZoomIn } from 'lucide-react';
import type { ModelSpec } from '../data/models';

interface MacroStageProps {
  model: ModelSpec;
  stepIdx: number;
  isPlaying: boolean;
  onZoomMeso: () => void;
}

export function MacroStage({ model, stepIdx, isPlaying, onZoomMeso }: MacroStageProps) {
  const isAnima = model.id === 'anima';
  const isMoss = model.id === 'moss';

  const activeText = stepIdx === 0;
  const activeEmbed = stepIdx === 1;
  const activeDit = stepIdx === 2;
  const activeOut = stepIdx === 3;

  return (
    <div className="relative flex h-full w-full flex-col justify-between gap-3">
      {/* Top Architecture Meta Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: model.accent }}
          />
          <span className="font-semibold text-slate-200">{model.name}</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-[11px] text-slate-300">{model.streamLabel}</span>
        </div>
        <button
          type="button"
          onClick={onZoomMeso}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-300 transition hover:bg-teal-400/20"
        >
          <ZoomIn className="h-3.5 w-3.5" />
          블록 1개 내부로 줌인
        </button>
      </div>

      {/* Main 3B1B Vector Flow SVG */}
      <div className="relative flex-1 min-h-[340px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#080d16]">
        <svg
          viewBox="0 0 880 420"
          className="h-full w-full"
          role="img"
          aria-label={`${model.name} 전체 아키텍처 흐름도`}
        >
          <defs>
            <pattern id="macro-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
            </pattern>
            <filter id="glow-teal" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="880" height="420" fill="url(#macro-grid)" />

          {/* ---- TEXT BRANCH (TOP) ---- */}
          <g>
            {/* Prompt node */}
            <rect
              x="24" y="42" width="112" height="60" rx="10"
              fill={activeText ? 'rgba(245,158,11,0.14)' : '#0f172a'}
              stroke={activeText ? '#fbbf24' : 'rgba(148,163,184,0.28)'}
              strokeWidth={activeText ? 2 : 1.2}
            />
            <text x="80" y="67" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="600">Prompt</text>
            <text x="80" y="86" textAnchor="middle" fill="#94a3b8" fontSize="10" className="font-mono">
              {isAnima ? 'Qwen + T5' : isMoss ? 'Chat + BPE' : 'Chat (no sys)'}
            </text>

            {/* Arrow Prompt -> TE */}
            <path d="M 136 72 L 172 72" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" opacity={activeText ? 1 : 0.4} />

            {/* Text Encoder Box */}
            <rect
              x="176" y="34" width="164" height="76" rx="10"
              fill={activeText ? 'rgba(245,158,11,0.16)' : '#0f172a'}
              stroke={activeText ? '#fbbf24' : 'rgba(245,158,11,0.35)'}
              strokeWidth={activeText ? 2 : 1.2}
            />
            <text x="258" y="58" textAnchor="middle" fill="#fcd34d" fontSize="12.5" fontWeight="600">
              {isAnima ? 'Qwen3-0.6B + T5' : isMoss ? 'Qwen3.5-9B' : 'Qwen3-VL-4B'}
            </text>
            <text x="258" y="77" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">
              {isAnima ? '단방향 LLM + T5 임베딩' : isMoss ? '마지막 층 (4096d)' : '36층 중 12개 층 스택!'}
            </text>
            <text x="258" y="95" textAnchor="middle" fill="#94a3b8" fontSize="10" className="font-mono">
              {isAnima ? '[1, Lq, 1024]' : isMoss ? '[B, L, 4096]' : '[B, T, 12, 2560]'}
            </text>

            {/* Arrow TE -> Bridge */}
            <path d="M 340 72 L 376 72" stroke="#f59e0b" strokeWidth="2" opacity={activeText ? 1 : 0.45} />

            {/* Text Bridge Box */}
            <rect
              x="380" y="34" width="172" height="76" rx="10"
              fill={activeText ? 'rgba(251,191,36,0.18)' : '#0f172a'}
              stroke={activeText ? '#fbbf24' : 'rgba(251,191,36,0.38)'}
              strokeWidth={activeText ? 2 : 1.2}
            />
            <text x="466" y="58" textAnchor="middle" fill="#fde68a" fontSize="12.5" fontWeight="600">
              {isAnima ? 'LLMAdapter (6blk)' : isMoss ? 'Text Refiner (2blk)' : 'txtfusion + MLP'}
            </text>
            <text x="466" y="77" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">
              {isAnima ? 'T5 Q → Qwen K,V · 512패딩' : isMoss ? '4096→3072 양방향 정제' : '층 축 어텐션 → 토큰 정제'}
            </text>
            <text x="466" y="95" textAnchor="middle" fill="#fbbf24" fontSize="10" className="font-mono">
              {isAnima ? 'ctx [B, L, 1024]' : isMoss ? 'T [B, L, 3072]' : 'T [B, T, 6144]'}
            </text>
          </g>

          {/* ---- IMAGE BRANCH (BOTTOM) ---- */}
          <g>
            <rect
              x="24" y="218" width="112" height="64" rx="10"
              fill={activeEmbed ? 'rgba(52,211,153,0.16)' : '#0f172a'}
              stroke={activeEmbed ? '#34d399' : 'rgba(52,211,153,0.35)'}
              strokeWidth={activeEmbed ? 2 : 1.2}
            />
            <text x="80" y="244" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="600">Latent x_t</text>
            <text x="80" y="264" textAnchor="middle" fill="#94a3b8" fontSize="10" className="font-mono">
              {isAnima ? '16ch · 1/8' : isMoss ? '128ch · 1/16' : '16ch · 1/8'}
            </text>

            <path d="M 136 250 L 172 250" stroke="#34d399" strokeWidth="2" opacity={activeEmbed ? 1 : 0.45} />

            <rect
              x="176" y="214" width="164" height="72" rx="10"
              fill={activeEmbed ? 'rgba(52,211,153,0.18)' : '#0f172a'}
              stroke={activeEmbed ? '#34d399' : 'rgba(52,211,153,0.35)'}
              strokeWidth={activeEmbed ? 2 : 1.2}
            />
            <text x="258" y="240" textAnchor="middle" fill="#6ee7b7" fontSize="12.5" fontWeight="600">
              {isMoss ? 'Flatten + Linear Proj' : '2×2 Patch Embed'}
            </text>
            <text x="258" y="258" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">
              {isMoss ? '추가 패치화 없음 (16px/tok)' : '2×2 묶어 행 우선 펼침'}
            </text>
            <text x="258" y="275" textAnchor="middle" fill="#34d399" fontSize="10" className="font-mono">
              {`[B, N, ${model.hiddenDim}]`}
            </text>
          </g>

          {/* ---- TIMESTEP SIGMA (BOTTOM LEFT) ---- */}
          <g>
            <rect
              x="176" y="330" width="164" height="54" rx="10"
              fill="#0f172a"
              stroke="rgba(251,113,133,0.45)"
              strokeWidth="1.2"
            />
            <text x="258" y="352" textAnchor="middle" fill="#fda4af" fontSize="12" fontWeight="600">Timestep σ ∈ [0, 1]</text>
            <text x="258" y="370" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {isAnima ? '블록별 AdaLN 9벡터' : isMoss ? '전 42블록 공용 6벡터' : '공용 tvec + 블록별 bias'}
            </text>
            <path d="M 340 357 L 535 357 L 535 304" fill="none" stroke="#fb7185" strokeWidth="1.8" strokeDasharray="5 4" opacity="0.7" />
          </g>

          {/* ---- STREAM TOPOLOGY CONNECTOR ---- */}
          {isAnima ? (
            <>
              {/* Anima: ctx goes directly into top of DiT as frozen cross-attn K,V */}
              <path
                d="M 552 72 L 605 72 L 605 154"
                fill="none"
                stroke="#fbbf24"
                strokeWidth={activeDit ? 2.6 : 1.8}
                strokeDasharray="6 4"
              />
              <rect x="562" y="102" width="88" height="24" rx="6" fill="#1e293b" stroke="#fbbf24" strokeWidth="1" />
              <text x="606" y="118" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="600">고정 ctx (K,V)</text>

              {/* Image stream goes straight into DiT */}
              <path d="M 340 250 L 374 250 M 480 250 L 502 250" fill="none" stroke="#34d399" strokeWidth={activeEmbed || activeDit ? 2.8 : 1.8} />
              <rect x="374" y="232" width="106" height="36" rx="8" fill="#09211d" stroke="#34d399" strokeWidth="1.2" />
              <text x="427" y="254" textAnchor="middle" fill="#6ee7b7" fontSize="11" className="font-mono">Img [N]</text>
            </>
          ) : (
            <>
              {/* MOSS & Krea 2: Text merges with Image into a Single Sequence! */}
              <path d="M 466 110 L 466 164 L 427 164 L 427 210" fill="none" stroke="#fbbf24" strokeWidth={activeEmbed || activeText ? 2.4 : 1.6} />
              <path d="M 340 250 L 366 250" fill="none" stroke="#34d399" strokeWidth={activeEmbed ? 2.6 : 1.8} />

              {/* Concatenated Token Sequence Bar */}
              <g>
                <rect
                  x="368" y="216" width="122" height="68" rx="10"
                  fill="#0f172a"
                  stroke={activeEmbed ? '#2dd4bf' : 'rgba(148,163,184,0.35)'}
                  strokeWidth={activeEmbed ? 2 : 1.2}
                />
                <text x="429" y="233" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontWeight="600">단일 시퀀스 결합</text>
                {isMoss ? (
                  <>
                    <rect x="376" y="242" width="60" height="30" rx="5" fill="rgba(52,211,153,0.22)" stroke="#34d399" strokeWidth="1.2" />
                    <text x="406" y="261" textAnchor="middle" fill="#6ee7b7" fontSize="10.5" fontWeight="600">Img N</text>
                    <rect x="440" y="242" width="42" height="30" rx="5" fill="rgba(245,158,11,0.22)" stroke="#fbbf24" strokeWidth="1.2" />
                    <text x="461" y="261" textAnchor="middle" fill="#fde68a" fontSize="10.5" fontWeight="600">Txt L</text>
                  </>
                ) : (
                  <>
                    <rect x="376" y="242" width="42" height="30" rx="5" fill="rgba(245,158,11,0.22)" stroke="#fbbf24" strokeWidth="1.2" />
                    <text x="397" y="261" textAnchor="middle" fill="#fde68a" fontSize="10.5" fontWeight="600">Txt T</text>
                    <rect x="422" y="242" width="60" height="30" rx="5" fill="rgba(52,211,153,0.22)" stroke="#34d399" strokeWidth="1.2" />
                    <text x="452" y="261" textAnchor="middle" fill="#6ee7b7" fontSize="10.5" fontWeight="600">Img N</text>
                  </>
                )}
              </g>

              <path d="M 490 250 L 508 250" fill="none" stroke={model.accent} strokeWidth="2.4" />
            </>
          )}

          {/* ---- DIT BLOCK STACK (CLICKABLE ZOOM TARGET) ---- */}
          <g onClick={onZoomMeso} className="cursor-pointer">
            {/* Stacked depth cards */}
            <rect x="520" y="168" width="168" height="142" rx="14" fill="#0b1322" stroke="rgba(148,163,184,0.18)" />
            <rect x="514" y="162" width="168" height="142" rx="14" fill="#0d1729" stroke="rgba(148,163,184,0.26)" />
            <rect
              x="508" y="156" width="168" height="142" rx="14"
              fill={activeDit ? 'rgba(45,212,191,0.12)' : '#101c30'}
              stroke={activeDit ? model.accent : 'rgba(148,163,184,0.42)'}
              strokeWidth={activeDit ? 2.4 : 1.4}
            />
            <text x="592" y="186" textAnchor="middle" fill="#f8fafc" fontSize="14" fontWeight="700">
              {`DiT Block × ${model.blocks}`}
            </text>
            <text x="592" y="206" textAnchor="middle" fill={model.accent} fontSize="11" className="font-mono">
              {`dim ${model.hiddenDim} · ${model.qHeads}Q/${model.kvHeads}KV`}
            </text>
            <text x="592" y="228" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">
              {isAnima ? 'Self → Cross(ctx) → MLP' : isMoss ? 'Joint Attn → Gated FFN' : 'GQA + OutGate → SwiGLU'}
            </text>
            <text x="592" y="248" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {isAnima ? '텍스트 고정 · 이미지만 진화' : '이미지+텍스트 함께 공진화'}
            </text>
            <rect x="536" y="264" width="112" height="22" rx="11" fill="rgba(45,212,191,0.16)" stroke="rgba(45,212,191,0.45)" />
            <text x="592" y="279" textAnchor="middle" fill="#5eead4" fontSize="10" fontWeight="600">클릭해서 내부 줌인 ↗</text>
          </g>

          {/* ---- OUTPUT: VELOCITY -> X0 -> VAE ---- */}
          <path d="M 676 227 L 714 227" fill="none" stroke="#2dd4bf" strokeWidth={activeOut ? 2.6 : 1.6} />

          <g>
            <rect
              x="718" y="168" width="138" height="118" rx="12"
              fill={activeOut ? 'rgba(45,212,191,0.14)' : '#0f172a'}
              stroke={activeOut ? '#2dd4bf' : 'rgba(45,212,191,0.35)'}
              strokeWidth={activeOut ? 2 : 1.2}
            />
            <text x="787" y="194" textAnchor="middle" fill="#5eead4" fontSize="12.5" fontWeight="700">Final → Velocity v</text>
            <text x="787" y="214" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" className="font-mono">
              x₀ = x_t − σ·v
            </text>
            <text x="787" y="236" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {isAnima ? 'Wan2.1 VAE Decode' : isMoss ? 'Img[0:N] → Flux2 VAE' : 'Img[T:T+N] → Qwen VAE'}
            </text>
            {!isAnima && (
              <text x="787" y="256" textAnchor="middle" fill="#fda4af" fontSize="9.5">
                (텍스트 구간은 여기서 폐기)
              </text>
            )}
            <text x="787" y="274" textAnchor="middle" fill="#34d399" fontSize="10.5" fontWeight="600">→ 생성 이미지</text>
          </g>

          {/* ---- ANIMATED 3B1B SIGNAL PACKETS ---- */}
          {isPlaying && (
            <>
              <motion.circle
                cx={80}
                cy={72}
                r="5"
                fill="#fbbf24"
                filter="url(#glow-teal)"
                initial={{ cx: 80, cy: 72, opacity: 0 }}
                animate={{
                  cx: [80, 258, 466, isAnima ? 605 : 427],
                  cy: [72, 72, 72, isAnima ? 154 : 240],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.circle
                cx={80}
                cy={250}
                r="5.5"
                fill="#34d399"
                filter="url(#glow-teal)"
                initial={{ cx: 80, cy: 250, opacity: 0 }}
                animate={{
                  cx: [80, 258, 430, 592, 787],
                  cy: [250, 250, 250, 227, 227],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{ duration: 3.0, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
              />
            </>
          )}
        </svg>
      </div>

      {/* Bottom 3-Model Quick Contrast Pills */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2">
          <div className="text-[11px] text-slate-400">텍스트 브리지</div>
          <div className="mt-0.5 text-xs font-medium text-amber-200">{model.textBridge}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2">
          <div className="text-[11px] text-slate-400">텍스트 토큰의 운명</div>
          <div className="mt-0.5 text-xs font-medium text-slate-200">{model.textFate}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2">
          <div className="text-[11px] text-slate-400">VAE & 패치</div>
          <div className="mt-0.5 text-xs font-medium text-emerald-300">{model.vae}</div>
        </div>
      </div>
    </div>
  );
}
