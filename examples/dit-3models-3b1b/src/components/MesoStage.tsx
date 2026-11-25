import { motion } from 'motion/react';
import { ZoomIn } from 'lucide-react';
import type { ModelSpec } from '../data/models';

interface MesoStageProps {
  model: ModelSpec;
  stepIdx: number;
  isPlaying: boolean;
  onZoomMicro: () => void;
}

export function MesoStage({ model, stepIdx, isPlaying, onZoomMicro }: MesoStageProps) {
  const isAnima = model.id === 'anima';
  const isMoss = model.id === 'moss';
  const isKrea = model.id === 'krea2';

  const hiMod = stepIdx === 0;
  const hiAttn1 = stepIdx === 1;
  const hiAttn2 = stepIdx === 2;
  const hiMlp = stepIdx === 3;

  return (
    <div className="relative flex h-full w-full flex-col justify-between gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: model.accent }} />
          <span className="font-semibold text-slate-200">{model.name} — Block[i] 내부 잔차 스트림</span>
          <span className="font-mono text-[11px] text-slate-400">({model.blocks}개 중 1개)</span>
        </div>
        <button
          type="button"
          onClick={onZoomMicro}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-300 transition hover:bg-teal-400/20"
        >
          <ZoomIn className="h-3.5 w-3.5" />
          어텐션 & Hook 내부로 줌인
        </button>
      </div>

      <div className="relative flex-1 min-h-[340px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#080d16]">
        <svg
          viewBox="0 0 880 420"
          className="h-full w-full"
          role="img"
          aria-label={`${model.name} 블록 내부 구조`}
        >
          <defs>
            <pattern id="meso-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="880" height="420" fill="url(#meso-grid)" />

          {/* ---- TOP: AdaLN TIMESTEP MODULATION BUS ---- */}
          <rect
            x="24" y="20" width="832" height="58" rx="12"
            fill={hiMod ? 'rgba(251,113,133,0.14)' : '#0e1624'}
            stroke={hiMod ? '#fb7185' : 'rgba(251,113,133,0.34)'}
            strokeWidth={hiMod ? 2 : 1.2}
          />
          <text x="44" y="45" fill="#fda4af" fontSize="13" fontWeight="700">
            AdaLN 타임스텝 변조 (σ)
          </text>
          <text x="44" y="64" fill="#cbd5e1" fontSize="11">
            {isAnima
              ? '블록마다 독립 9개 벡터 (Self / Cross / MLP 각각 shift · scale · gate)'
              : isMoss
                ? '단 하나의 6개 변조 벡터를 42개 블록 전체가 100% 공유! (gate 그대로 곱셈)'
                : '전 블록 공용 tvec + 블록별 학습 bias → 6개 벡터 (s₁, b₁, g₁, s₂, b₂, g₂)'}
          </text>
          <rect x="690" y="34" width="148" height="28" rx="8" fill="rgba(251,113,133,0.16)" stroke="rgba(251,113,133,0.4)" />
          <text x="764" y="52" textAnchor="middle" fill="#fecdd3" fontSize="10.5" className="font-mono">
            {isAnima ? '[B,1,2048] × 9' : isMoss ? 'shared 6×[1,3072]' : 'tvec + bias[i]'}
          </text>

          {/* ---- RESIDUAL HIGHWAY ---- */}
          <line x1="36" y1="126" x2="844" y2="126" stroke="#34d399" strokeWidth="3" strokeOpacity="0.65" />
          <text x="40" y="114" fill="#6ee7b7" fontSize="11" fontWeight="600" className="font-mono">
            {isAnima ? 'resid_in [B, N, 2048]' : isMoss ? 'resid_in [B, N+L, 3072]' : 'resid_in [B, T+N, 6144]'}
          </text>
          <text x="840" y="114" textAnchor="end" fill="#6ee7b7" fontSize="11" fontWeight="600" className="font-mono">
            resid_out →
          </text>

          {isAnima ? (
            /* ===== ANIMA: 3-SUBLAYER BLOCK (SELF -> CROSS -> MLP) ===== */
            <>
              {/* Sublayer 1: Self-Attn */}
              <g>
                <path d="M 110 126 L 110 218 L 282 218 L 282 138" fill="none" stroke={hiAttn1 ? '#38bdf8' : 'rgba(148,163,184,0.35)'} strokeWidth="2" />
                <rect
                  x="76" y="176" width="184" height="122" rx="12"
                  fill={hiAttn1 ? 'rgba(56,189,248,0.14)' : '#101a2c'}
                  stroke={hiAttn1 ? '#38bdf8' : 'rgba(56,189,248,0.35)'}
                  strokeWidth={hiAttn1 ? 2.2 : 1.2}
                />
                <text x="168" y="202" textAnchor="middle" fill="#7dd3fc" fontSize="13" fontWeight="700">1. Self-Attention</text>
                <text x="168" y="222" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">이미지 ↔ 이미지</text>
                <text x="168" y="242" textAnchor="middle" fill="#94a3b8" fontSize="10" className="font-mono">QK-RMSNorm + 3D RoPE</text>
                <text x="168" y="264" textAnchor="middle" fill="#fda4af" fontSize="10" className="font-mono">× gate₁</text>
                <circle cx="282" cy="126" r="11" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
                <text x="282" y="130" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="700">+</text>
              </g>

              {/* Sublayer 2: Cross-Attn (Clickable Zoom) */}
              <g onClick={onZoomMicro} className="cursor-pointer">
                <path d="M 354 126 L 354 218 L 544 218 L 544 138" fill="none" stroke={hiAttn2 ? '#2dd4bf' : 'rgba(45,212,191,0.45)'} strokeWidth="2.2" />
                <rect
                  x="326" y="176" width="202" height="136" rx="12"
                  fill={hiAttn2 ? 'rgba(45,212,191,0.16)' : '#0f1f2b'}
                  stroke={hiAttn2 ? '#2dd4bf' : 'rgba(45,212,191,0.5)'}
                  strokeWidth={hiAttn2 ? 2.4 : 1.4}
                />
                <text x="427" y="202" textAnchor="middle" fill="#5eead4" fontSize="13" fontWeight="700">2. Cross-Attention ★</text>
                <text x="427" y="222" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">Img Q → 고정 텍스트 ctx</text>
                <text x="427" y="242" textAnchor="middle" fill="#fde68a" fontSize="10" className="font-mono">RoPE 없음 · 마스크 없음</text>
                <text x="427" y="262" textAnchor="middle" fill="#5eead4" fontSize="10" className="font-mono">probs [16, N, L] Hook</text>
                <rect x="369" y="278" width="116" height="22" rx="11" fill="rgba(45,212,191,0.18)" stroke="rgba(45,212,191,0.5)" />
                <text x="427" y="293" textAnchor="middle" fill="#99f6e4" fontSize="10" fontWeight="600">클릭해서 어텐션 줌인 ↗</text>

                {/* Fixed ctx arrow from bottom */}
                <rect x="364" y="346" width="126" height="36" rx="8" fill="rgba(245,158,11,0.16)" stroke="#fbbf24" strokeWidth="1.2" />
                <text x="427" y="368" textAnchor="middle" fill="#fde68a" fontSize="11" className="font-mono">고정 ctx (K, V)</text>
                <path d="M 427 346 L 427 314" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 3" />

                <circle cx="544" cy="126" r="11" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
                <text x="544" y="130" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="700">+</text>
              </g>

              {/* Sublayer 3: MLP */}
              <g>
                <path d="M 616 126 L 616 218 L 788 218 L 788 138" fill="none" stroke={hiMlp ? '#a78bfa' : 'rgba(148,163,184,0.35)'} strokeWidth="2" />
                <rect
                  x="592" y="176" width="178" height="122" rx="12"
                  fill={hiMlp ? 'rgba(167,139,250,0.16)' : '#101a2c'}
                  stroke={hiMlp ? '#a78bfa' : 'rgba(167,139,250,0.35)'}
                  strokeWidth={hiMlp ? 2.2 : 1.2}
                />
                <text x="681" y="204" textAnchor="middle" fill="#c4b5fd" fontSize="13" fontWeight="700">3. MLP</text>
                <text x="681" y="226" textAnchor="middle" fill="#cbd5e1" fontSize="10.5">채널 비선형 변환</text>
                <text x="681" y="250" textAnchor="middle" fill="#fda4af" fontSize="10" className="font-mono">× gate₃</text>
                <circle cx="788" cy="126" r="11" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
                <text x="788" y="130" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="700">+</text>
              </g>
            </>
          ) : (
            /* ===== MOSS-IMAGE & KREA 2: 2-SUBLAYER SINGLE-STREAM BLOCK ===== */
            <>
              {/* Sublayer 1: Joint Attention (+ Krea 2 Output Gate) */}
              <g onClick={onZoomMicro} className="cursor-pointer">
                <path d="M 96 126 L 96 244 L 496 244 L 496 138" fill="none" stroke={hiAttn1 || hiAttn2 ? model.accent : 'rgba(148,163,184,0.4)'} strokeWidth="2.2" />

                <rect
                  x="64" y="168" width={isKrea ? 248 : 388} height="162" rx="14"
                  fill={hiAttn1 || hiAttn2 ? 'rgba(45,212,191,0.14)' : '#0f1c2c'}
                  stroke={hiAttn1 || hiAttn2 ? model.accent : 'rgba(45,212,191,0.45)'}
                  strokeWidth={hiAttn1 || hiAttn2 ? 2.4 : 1.4}
                />
                <text x={isKrea ? 188 : 258} y="196" textAnchor="middle" fill="#5eead4" fontSize="13.5" fontWeight="700">
                  {isMoss ? '1. Joint Self-Attention ([Img | Txt]) ★' : '1. GQA Joint Attention ([Txt | Img]) ★'}
                </text>
                <text x={isKrea ? 188 : 258} y="218" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                  {isMoss
                    ? '24헤드 (128d) · QK-Norm · 4축 RoPE'
                    : '48 Q-헤드 / 12 KV-헤드 (4:1 GQA)'}
                </text>
                <text x={isKrea ? 188 : 258} y="238" textAnchor="middle" fill="#fde68a" fontSize="10.5" className="font-mono">
                  {isMoss ? '행·열: Img=(y,x), Txt=0' : '3축 RoPE: Txt=(0,0,0) 회전 없음!'}
                </text>
                <text x={isKrea ? 188 : 258} y="260" textAnchor="middle" fill="#5eead4" fontSize="10.5" className="font-mono">
                  {isMoss ? 'probs [24, N+L, N+L] → 우상단 Hook' : 'probs [48, T+N, T+N] → 좌하단 Hook'}
                </text>
                <rect x={isKrea ? 128 : 198} y="280" width="120" height="24" rx="12" fill="rgba(45,212,191,0.18)" stroke="rgba(45,212,191,0.5)" />
                <text x={isKrea ? 188 : 258} y="296" textAnchor="middle" fill="#99f6e4" fontSize="10" fontWeight="600">클릭해서 어텐션 줌인 ↗</text>

                {/* Krea 2 Special Output Gate Box */}
                {isKrea && (
                  <g>
                    <path d="M 312 244 L 336 244" stroke="#fb7185" strokeWidth="2.4" />
                    <rect
                      x="336" y="182" width="142" height="134" rx="12"
                      fill={hiAttn2 ? 'rgba(251,113,133,0.22)' : 'rgba(251,113,133,0.10)'}
                      stroke="#fb7185"
                      strokeWidth={hiAttn2 ? 2.4 : 1.5}
                    />
                    <text x="407" y="210" textAnchor="middle" fill="#fda4af" fontSize="12.5" fontWeight="700">Output Gate ★</text>
                    <text x="407" y="232" textAnchor="middle" fill="#fecdd3" fontSize="11" className="font-mono">σ(W_g · h) ⊙</text>
                    <text x="407" y="254" textAnchor="middle" fill="#cbd5e1" fontSize="10">토큰·채널별 다름!</text>
                    <text x="407" y="272" textAnchor="middle" fill="#cbd5e1" fontSize="10">게이트가 닫히면</text>
                    <text x="407" y="288" textAnchor="middle" fill="#fda4af" fontSize="10" fontWeight="600">고확률도 기여 ≈ 0</text>
                  </g>
                )}

                <text x="508" y="160" textAnchor="start" fill="#fda4af" fontSize="10" className="font-mono">× g₁</text>
                <circle cx="496" cy="126" r="11" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
                <text x="496" y="130" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="700">+</text>
              </g>

              {/* Sublayer 2: FFN / SwiGLU */}
              <g>
                <path d="M 556 126 L 556 244 L 792 244 L 792 138" fill="none" stroke={hiMlp ? '#a78bfa' : 'rgba(148,163,184,0.35)'} strokeWidth="2" />
                <rect
                  x="546" y="182" width="224" height="134" rx="14"
                  fill={hiMlp ? 'rgba(167,139,250,0.16)' : '#101a2c'}
                  stroke={hiMlp ? '#a78bfa' : 'rgba(167,139,250,0.38)'}
                  strokeWidth={hiMlp ? 2.2 : 1.2}
                />
                <text x="658" y="212" textAnchor="middle" fill="#c4b5fd" fontSize="13.5" fontWeight="700">
                  {isMoss ? '2. Soft-capped Gated FFN' : '2. SwiGLU MLP'}
                </text>
                <text x="658" y="236" textAnchor="middle" fill="#cbd5e1" fontSize="11">
                  {isMoss ? '폭 8192 확장 → 게이트 + 소프트캡' : '이미지·텍스트 공용 SwiGLU'}
                </text>
                <text x="658" y="260" textAnchor="middle" fill="#94a3b8" fontSize="10.5">
                  {isMoss ? 'RMSNorm + 공용 변조2' : 'RMSNorm + (1+s₂)· + b₂'}
                </text>
                <text x="658" y="286" textAnchor="middle" fill="#fda4af" fontSize="10.5" className="font-mono">× g₂</text>
                <circle cx="792" cy="126" r="11" fill="#0f172a" stroke="#34d399" strokeWidth="2" />
                <text x="792" y="130" textAnchor="middle" fill="#6ee7b7" fontSize="13" fontWeight="700">+</text>
              </g>
            </>
          )}

          {/* Animated pulse along residual stream */}
          {isPlaying && (
            <motion.circle
              cx={40}
              cy={126}
              r="5.5"
              fill={model.accent}
              initial={{ cx: 40, opacity: 0 }}
              animate={{ cx: [40, 282, 544, 835], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </svg>
      </div>

      {/* Bottom 2 key technical invariants */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2">
          <div className="text-[11px] text-slate-400">위치 임베딩 (RoPE)</div>
          <div className="mt-0.5 text-xs font-medium text-sky-300">{model.ropeDesc}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0d1422] px-3 py-2">
          <div className="text-[11px] text-slate-400">AdaLN & 게이팅 특징</div>
          <div className="mt-0.5 text-xs font-medium text-rose-300">{model.adalnDesc}</div>
        </div>
      </div>
    </div>
  );
}
