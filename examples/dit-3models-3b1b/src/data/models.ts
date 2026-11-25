export type ModelId = 'anima' | 'moss' | 'krea2';
export type ZoomLevel = 'macro' | 'meso' | 'micro';

export interface StepSpec {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  tex: string;
  highlightKeys: Array<'q' | 'k' | 'v' | 'attn' | 'gate' | 'img' | 'txt'>;
  callout: string;
}

export interface MiniToken {
  id: string;
  label: string;
  kind: 'prompt' | 'template' | 'pad' | 'eos';
  desc: string;
  /** 4x4 spatial attention target pattern (16 values in 0..1) */
  spatial: number[];
}

export interface ModelSpec {
  id: ModelId;
  name: string;
  shortName: string;
  badge: string;
  accent: string;
  params: string;
  blocks: number;
  hiddenDim: number;
  qHeads: number;
  kvHeads: number;
  headDim: number;
  vae: string;
  streamOrder: 'separate' | 'img-txt' | 'txt-img';
  streamLabel: string;
  textEncoder: string;
  textBridge: string;
  textFate: string;
  ropeDesc: string;
  adalnDesc: string;
  xaiSliceDesc: string;
  xaiTrapDesc: string;
  miniTokens: MiniToken[];
  steps: Record<ZoomLevel, StepSpec[]>;
}

const SPATIAL_HAIR = [
  0.2, 0.92, 0.95, 0.25,
  0.15, 0.85, 0.88, 0.18,
  0.08, 0.35, 0.32, 0.1,
  0.05, 0.08, 0.07, 0.04,
];
const SPATIAL_EYES = [
  0.06, 0.12, 0.14, 0.05,
  0.12, 0.94, 0.91, 0.14,
  0.08, 0.25, 0.22, 0.07,
  0.04, 0.06, 0.05, 0.04,
];
const SPATIAL_SKY = [
  0.92, 0.35, 0.3, 0.94,
  0.86, 0.12, 0.15, 0.88,
  0.72, 0.18, 0.2, 0.76,
  0.45, 0.22, 0.24, 0.48,
];
const SPATIAL_DRESS = [
  0.04, 0.05, 0.05, 0.04,
  0.08, 0.14, 0.12, 0.08,
  0.18, 0.88, 0.91, 0.22,
  0.25, 0.95, 0.93, 0.28,
];
const SPATIAL_SINK = [
  0.75, 0.18, 0.16, 0.72,
  0.14, 0.1, 0.12, 0.16,
  0.12, 0.09, 0.1, 0.15,
  0.68, 0.15, 0.14, 0.71,
];
const SPATIAL_PAD = [
  0.08, 0.08, 0.08, 0.08,
  0.08, 0.08, 0.08, 0.08,
  0.08, 0.08, 0.08, 0.08,
  0.08, 0.08, 0.08, 0.08,
];

export const MODELS: Record<ModelId, ModelSpec> = {
  anima: {
    id: 'anima',
    name: 'Anima',
    shortName: 'Anima',
    badge: '2B · Cross-Attn',
    accent: '#2dd4bf',
    params: 'DiT ~2B (+ Adapter 0.13B)',
    blocks: 28,
    hiddenDim: 2048,
    qHeads: 16,
    kvHeads: 16,
    headDim: 128,
    vae: 'Wan2.1 VAE (16ch, 8× → 2×2 패치)',
    streamOrder: 'separate',
    streamLabel: '이미지 [B, N, 2048] ⊥ 고정 ctx [B, L, 1024]',
    textEncoder: 'Qwen3-0.6B (단방향 LLM) + T5 임베딩 테이블',
    textBridge: 'LLMAdapter 6블록 (T5 Q → Qwen K,V) → 512 0-패딩',
    textFate: '28개 블록 동안 텍스트 ctx가 갱신되지 않고 고정됨',
    ropeDesc: 'Self-Attn의 q·k에만 3D RoPE (Cross-Attn은 RoPE 없음)',
    adalnDesc: '블록마다 서브층 3개 × (shift, scale, gate) = 9개 변조 벡터',
    xaiSliceDesc: 'block[i].cross_attn.probs [16, N, L] → 앞 Lt 슬롯만 추출',
    xaiTrapDesc: 'Lt~511의 0-패딩은 key=0 → logit=0이지만 마스크가 없어 softmax 분모에 참여함',
    miniTokens: [
      { id: 't0', label: 'silver', kind: 'prompt', desc: 'T5 토큰 0 — 상단 머리카락 영역에 집중', spatial: SPATIAL_HAIR },
      { id: 't1', label: 'eyes', kind: 'prompt', desc: 'T5 토큰 1 — 중앙 눈 영역에 집중', spatial: SPATIAL_EYES },
      { id: 't2', label: 'night', kind: 'prompt', desc: 'T5 토큰 2 — 배경 하늘 영역에 집중', spatial: SPATIAL_SKY },
      { id: 't3', label: 'dress', kind: 'prompt', desc: 'T5 토큰 3 — 하단 의상 영역에 집중', spatial: SPATIAL_DRESS },
      { id: 't4', label: '</s>', kind: 'eos', desc: 'T5 종료 토큰 — 실제 임베딩을 가지며 어텐션 싱크 역할 가능', spatial: SPATIAL_SINK },
      { id: 't5', label: '[PAD]', kind: 'pad', desc: '0-패딩 슬롯(Lt..511) — logit=0이지만 softmax 분모에 포함됨', spatial: SPATIAL_PAD },
    ],
    steps: {
      macro: [
        {
          id: 'm1',
          title: '1. 이중 토크나이즈 & LLMAdapter 브리지',
          subtitle: 'Qwen3-0.6B (K,V) + T5 임베딩 (Q) → ctx [B, L, 1024]',
          body: 'Anima는 Qwen3 출력을 DiT로 바로 보내지 않습니다. T5 토큰 임베딩을 Query로 삼아 6블록 LLMAdapter가 Qwen hidden을 읽은 뒤, 512 길이까지 0-패딩해 고정 문맥 ctx를 만듭니다.',
          tex: '\\htmlClass{sem-txt}{\\text{ctx}} = \\text{Pad}_{512}\\!\\big(\\text{LLMAdapter}(\\htmlClass{sem-q}{E_{\\text{T5}}}, \\htmlClass{sem-k}{H_{\\text{Qwen}}})\\big)',
          highlightKeys: ['txt', 'q', 'k'],
          callout: 'DiT의 텍스트 슬롯 j는 항상 j번째 T5 토큰에 대응됩니다.',
        },
        {
          id: 'm2',
          title: '2. 2×2 패치 임베딩 & 분리 스트림 진입',
          subtitle: 'Latent x_t → [B, N, 2048] (이미지만 잔차 스트림 통과)',
          body: 'Wan2.1 VAE latent를 2×2 패치로 묶어 N개 이미지 토큰(1024px 기준 64×64=4096)을 만듭니다. 텍스트는 이 시퀀스에 합쳐지지 않고 별도 ctx로 옆에 대기합니다.',
          tex: '\\htmlClass{sem-img}{X^{(0)}} = \\text{PatchEmbed}_{2\\times 2}(x_t) \\in \\mathbb{R}^{B \\times N \\times 2048}',
          highlightKeys: ['img'],
          callout: '이미지 토큰만 28개 블록의 잔차 스트림을 타고 흐릅니다.',
        },
        {
          id: 'm3',
          title: '3. 28개 DiT 블록 순회 (고정 ctx 참조)',
          subtitle: '모든 블록이 동일한 ctx를 Cross-Attention으로 읽음',
          body: '28개 블록을 통과하는 동안 이미지 토큰은 계속 진화하지만, 텍스트 ctx는 절대 바뀌지 않습니다. 따라서 깊은 블록에서도 슬롯 j는 순수한 텍스트 의미를 유지합니다.',
          tex: '\\htmlClass{sem-img}{X^{(i+1)}} = \\text{Block}_i\\!\\big(\\htmlClass{sem-img}{X^{(i)}},\\; \\htmlClass{sem-txt}{\\text{ctx}},\\; \\sigma\\big)',
          highlightKeys: ['img', 'txt'],
          callout: '블록마다 바뀌는 것은 이미지 Query뿐입니다.',
        },
        {
          id: 'm4',
          title: '4. Rectified Flow Velocity & 깨끗한 latent 복원',
          subtitle: 'FinalLayer → v → x₀ = x_t − σ·v → Wan2.1 VAE',
          body: '최종 층에서 예측한 velocity v로 깨끗한 latent x₀를 복원하고 VAE 디코더로 이미지를 생성합니다.',
          tex: 'x_0 = x_t - \\sigma \\cdot \\htmlClass{sem-attn}{v}, \\qquad x_t = \\sigma \\varepsilon + (1-\\sigma) x_0',
          highlightKeys: ['attn'],
          callout: '타임스텝 입력은 σ ∈ [0, 1] 자체입니다.',
        },
      ],
      meso: [
        {
          id: 'b1',
          title: '1. 블록별 AdaLN 변조 (9개 벡터)',
          subtitle: 'σ 임베딩 → Self / Cross / MLP용 shift·scale·gate',
          body: 'Anima는 각 블록마다 서브층 3개(Self-Attn, Cross-Attn, MLP)에 대해 총 9개의 변조 벡터를 생성해 정규화된 입력을 변조하고 출력을 게이팅합니다.',
          tex: '\\tilde{x} = (1 + \\htmlClass{sem-gate}{s}) \\odot \\text{LN}(x) + \\htmlClass{sem-gate}{b}',
          highlightKeys: ['gate'],
          callout: '9개 변조 벡터는 블록마다 독립 파라미터로 생성됩니다.',
        },
        {
          id: 'b2',
          title: '2. Self-Attention (이미지 ↔ 이미지 + 3D RoPE)',
          subtitle: 'head별 QK-RMSNorm 후 3D RoPE(t, y, x) 적용',
          body: '먼저 이미지 토큰끼리 공간 구조를 맞춥니다. Q와 K에 head별 RMSNorm을 걸고 3D RoPE를 적용해 상대적 위치 관계를 인코딩합니다.',
          tex: '\\htmlClass{sem-attn}{\\text{SelfAttn}}(\\text{RoPE}(\\htmlClass{sem-q}{Q_{\\text{img}}}),\\; \\text{RoPE}(\\htmlClass{sem-k}{K_{\\text{img}}}),\\; \\htmlClass{sem-v}{V_{\\text{img}}})',
          highlightKeys: ['q', 'k', 'v', 'attn'],
          callout: '3D RoPE는 Self-Attn에만 걸리고 Cross-Attn에는 걸리지 않습니다.',
        },
        {
          id: 'b3',
          title: '3. Cross-Attention (이미지 Q → 고정 텍스트 ctx)',
          subtitle: 'XAI 히트맵의 직접적인 추출 지점 (block[i].cross_attn.probs)',
          body: '이미지 토큰이 Query가 되어 고정된 텍스트 ctx의 Key·Value를 조회합니다. 16개 헤드, head 차원 128로 [B, 16, N, L] 확률 행렬이 만들어집니다.',
          tex: '\\htmlClass{sem-attn}{A_{\\text{cross}}} = \\text{softmax}\\!\\left(\\frac{\\htmlClass{sem-q}{Q_{\\text{img}}}\\htmlClass{sem-k}{K_{\\text{ctx}}^T}}{\\sqrt{128}}\\right) \\in \\mathbb{R}^{16 \\times N \\times L}',
          highlightKeys: ['q', 'k', 'attn'],
          callout: 'Cross-Attn에는 위치 임베딩(RoPE)과 패딩 마스크가 없습니다.',
        },
        {
          id: 'b4',
          title: '4. 게이트 MLP & 잔차 누적',
          subtitle: '세 서브층 출력이 각각 gate와 곱해져 잔차에 합산',
          body: '마지막으로 MLP 서브층을 통과해 채널별 특징을 비선형 변환한 뒤 gate를 곱해 잔차 스트림에 더합니다.',
          tex: 'x_{\\text{out}} = x + \\htmlClass{sem-gate}{g_1}\\odot\\text{Self} + \\htmlClass{sem-gate}{g_2}\\odot\\text{Cross} + \\htmlClass{sem-gate}{g_3}\\odot\\text{MLP}',
          highlightKeys: ['gate'],
          callout: '텍스트 ctx는 이 블록을 거쳐도 전혀 수정되지 않습니다.',
        },
      ],
      micro: [
        {
          id: 'a1',
          title: '1. Query(이미지)와 Key·Value(고정 텍스트) 분리 투영',
          subtitle: 'Q [N, 128] vs K, V [L, 128] (head별 RMSNorm)',
          body: '이미지 패치 16개(4×4)는 Query로, 텍스트 슬롯(프롬프트 + </s> + [PAD])은 Key·Value로 투영됩니다. 패치를 클릭하거나 호버해 연결을 확인해 보세요.',
          tex: '\\htmlClass{sem-q}{Q} = \\text{RMSNorm}(X_{\\text{img}}W_Q), \\quad \\htmlClass{sem-k}{K} = \\text{RMSNorm}(\\text{ctx}W_K)',
          highlightKeys: ['q', 'k'],
          callout: 'Anima는 이미지-텍스트 전용 직사각형 N×L 행렬을 만듭니다.',
        },
        {
          id: 'a2',
          title: '2. 내적 스코어 & 0-패딩의 Softmax 분모 참여',
          subtitle: 'logit = q·kᵀ / √128 — [PAD]는 logit=0이지만 exp(0)=1',
          body: 'Cross-Attention에 마스크가 없으므로 0-패딩 슬롯도 Key로 들어갑니다. Value가 0이라 출력 기여는 0이지만, exp(0)=1이 softmax 분모에 더해져 확률 총합을 살짝 희석합니다.',
          tex: '\\htmlClass{sem-attn}{p_{ij}} = \\frac{\\exp(\\htmlClass{sem-q}{q_i}\\cdot\\htmlClass{sem-k}{k_j}/\\sqrt{128})}{\\sum_{u < L_t} e^{s_{iu}} + \\htmlClass{sem-gate}{(L - L_t)\\cdot e^0}}',
          highlightKeys: ['q', 'k', 'attn', 'gate'],
          callout: '오른쪽 행렬의 [PAD] 열을 확인해 보세요.',
        },
        {
          id: 'a3',
          title: '3. XAI Hook 슬라이스 → 2D 공간 히트맵 복원',
          subtitle: 'probs[:, :, :Lt]만 잘라 N을 (h/2, w/2) 그리드로 복원',
          body: '특정 단어 토큰 열(j)을 선택해 N개 이미지 패치의 어텐션 확률을 2D 공간 그리드로 되돌리면, 해당 단어가 이미지의 어느 영역을 그리는지 바로 시각화됩니다.',
          tex: '\\htmlClass{sem-attn}{\\text{Map}}(t_j) = \\text{Reshape}_{h/2 \\times w/2}\\!\\Big(\\frac{1}{16}\\sum_{h=1}^{16} A^{(h)}_{:,\\, j}\\Big)',
          highlightKeys: ['attn', 'img'],
          callout: '아래 텍스트 토큰을 눌러 각 단어의 4×4 히트맵을 비교해 보세요.',
        },
      ],
    },
  },

  moss: {
    id: 'moss',
    name: 'MOSS-Image',
    shortName: 'MOSS-Image',
    badge: '5B · [Img|Txt]',
    accent: '#38bdf8',
    params: 'DiT ~5B (42블록, FFN 8192)',
    blocks: 42,
    hiddenDim: 3072,
    qHeads: 24,
    kvHeads: 24,
    headDim: 128,
    vae: 'Flux2 VAE (1/16 해상도 128ch, 패치화 없음)',
    streamOrder: 'img-txt',
    streamLabel: '단일 시퀀스 [이미지 N | 텍스트 L] · dim 3072',
    textEncoder: 'Qwen3.5-9B (마지막 층 + 최종 norm, 4096d)',
    textBridge: 'Text Refiner: 4096→3072 사영 + 텍스트 양방향 블록 2개',
    textFate: '42개 블록 내내 이미지와 함께 잔차 스트림에서 공진화(마지막에 버림)',
    ropeDesc: '4축 RoPE (참조번호, 시퀀스 위치, 행, 열) — QK-norm 뒤 q·k 적용',
    adalnDesc: '타임스텝 변조 6벡터를 전 42개 블록과 모든 토큰이 100% 공용!',
    xaiSliceDesc: 'block[i].attn.probs [24, N+L, N+L] → 우상단 Q[0:N] × K[N:N+L]',
    xaiTrapDesc: '패딩은 없으나 채팅 템플릿 토큰이 L에 포함되고, 깊은 층 텍스트 key는 이미지 정보와 섞임',
    miniTokens: [
      { id: 'm0', label: '<|user|>', kind: 'template', desc: '채팅 템플릿 접두부 — 단방향 LLM이라 프롬프트 내용을 담지 않음', spatial: SPATIAL_SINK },
      { id: 'm1', label: 'silver', kind: 'prompt', desc: '프롬프트 토큰 — 상단 머리카락 영역과 강하게 결합', spatial: SPATIAL_HAIR },
      { id: 'm2', label: 'eyes', kind: 'prompt', desc: '프롬프트 토큰 — 중앙 눈 영역과 결합', spatial: SPATIAL_EYES },
      { id: 'm3', label: 'night', kind: 'prompt', desc: '프롬프트 토큰 — 배경 밤하늘 영역과 결합', spatial: SPATIAL_SKY },
      { id: 'm4', label: 'dress', kind: 'prompt', desc: '프롬프트 토큰 — 하단 의상 영역과 결합', spatial: SPATIAL_DRESS },
      { id: 'm5', label: '<|think|>', kind: 'template', desc: '채팅 템플릿 꼬리 — 단방향 요약이 모여 어텐션 싱크화 가능', spatial: SPATIAL_SINK },
    ],
    steps: {
      macro: [
        {
          id: 'm1',
          title: '1. Qwen3.5-9B + Text Refiner (양방향 정제 2블록)',
          subtitle: '채팅 템플릿 감싸기 → 4096d → Refiner 2블록 → 3072d',
          body: '단방향 LLM인 Qwen3.5-9B의 마지막 층 출력을 3072차원으로 사영한 뒤, 텍스트끼리 양방향 어텐션하는 Refiner 블록 2개를 통과시켜 문맥을 고르게 펼칩니다.',
          tex: '\\htmlClass{sem-txt}{T^{(0)}} = \\text{Refiner}_{2\\times}\\!\\big(W_{\\text{proj}} H_{\\text{Qwen3.5}}\\big) \\in \\mathbb{R}^{B \\times L \\times 3072}',
          highlightKeys: ['txt'],
          callout: '패딩은 없지만 채팅 템플릿 토큰이 시퀀스 앞뒤에 포함됩니다.',
        },
        {
          id: 'm2',
          title: '2. 단일 시퀀스 결합: [이미지 N | 텍스트 L]',
          subtitle: 'Flux2 VAE (1/16, 128ch) → 추가 패치화 없이 바로 사영',
          body: 'MOSS-Image는 이미지 토큰을 앞에, 텍스트 토큰을 뒤에 이어 붙여 하나의 시퀀스 [B, N+L, 3072]로 만듭니다. 마스크 없이 서로 전면 양방향 어텐션합니다.',
          tex: 'Z^{(0)} = \\big[\\,\\htmlClass{sem-img}{X_{\\text{img}}^{(0)}} \\;\\big|\\; \\htmlClass{sem-txt}{T^{(0)}}\\,\\big] \\in \\mathbb{R}^{B \\times (N+L) \\times 3072}',
          highlightKeys: ['img', 'txt'],
          callout: '이미지가 앞 [0, N), 텍스트가 뒤 [N, N+L)에 놓입니다.',
        },
        {
          id: 'm3',
          title: '3. 42개 단일 스트림 블록 & 전 블록 공용 AdaLN',
          subtitle: '텍스트 토큰도 매 블록 이미지 정보를 흡수하며 함께 갱신됨',
          body: '42개 블록을 통과하며 이미지와 텍스트가 같은 가중치·같은 타임스텝 변조 6벡터로 갱신됩니다. 따라서 후반 블록의 텍스트 Key는 순수 텍스트가 아니라 이미지 정보가 섞인 상태입니다.',
          tex: 'Z^{(i+1)} = \\text{SingleBlock}_i\\!\\big(Z^{(i)},\\; \\htmlClass{sem-gate}{\\text{mod}_{\\text{shared}}(\\sigma)}\\big)',
          highlightKeys: ['gate', 'img', 'txt'],
          callout: '하나의 변조 출력(6벡터)을 42개 블록 전부가 공유합니다!',
        },
        {
          id: 'm4',
          title: '4. 텍스트 구간 폐기 & Velocity 복원',
          subtitle: '앞 N개 이미지 토큰만 추출 → v → x₀ = x_t − σ·v',
          body: '마지막 층에서는 앞쪽 N개 이미지 토큰만 취해 velocity v [B, 128, h, w]를 예측하고, 텍스트 구간 L개는 버립니다.',
          tex: '\\htmlClass{sem-attn}{v} = \\text{FinalProj}\\!\\big(\\htmlClass{sem-img}{Z^{(42)}_{[0:N]}}\\big), \\quad x_0 = x_t - \\sigma \\htmlClass{sem-attn}{v}',
          highlightKeys: ['img', 'attn'],
          callout: 'Flux2 VAE 1/16 격자라 토큰 1개 = 원본 16×16 픽셀입니다.',
        },
      ],
      meso: [
        {
          id: 'b1',
          title: '1. 전 블록 공용 AdaLN 6벡터 (shift · scale · gate)',
          subtitle: '블록 간 차이는 오직 각 블록의 가중치에서만 발생',
          body: '타임스텝 σ에서 만든 6개 변조 벡터가 42개 블록 전체와 이미지·텍스트 토큰 모두에 동일하게 주입됩니다. 게이트는 (1+gate)가 아니라 gate 값 그대로 곱해집니다.',
          tex: '\\tilde{z} = (1 + \\htmlClass{sem-gate}{s_1}) \\odot \\text{RMSNorm}(z) + \\htmlClass{sem-gate}{b_1}',
          highlightKeys: ['gate'],
          callout: '특정 채널의 gate가 0에 가까우면 그 스텝에선 잔차 기여가 꺼집니다.',
        },
        {
          id: 'b2',
          title: '2. QK-Norm & 4축 RoPE (참조 · 시퀀스 · 행 · 열)',
          subtitle: '텍스트는 시퀀스 축 순서, 이미지는 텍스트 뒤 한 자리 + (행, 열) 좌표',
          body: '24개 헤드(128d)의 Q·K에 RMSNorm을 건 뒤 4축 RoPE를 적용합니다. 텍스트는 행·열=0, 생성 이미지는 그리드 중앙 기준 좌표를 받습니다.',
          tex: '\\htmlClass{sem-q}{Q} = \\text{RoPE}_{4\\text{D}}(\\text{RMSNorm}(zW_Q)), \\quad \\htmlClass{sem-k}{K} = \\text{RoPE}_{4\\text{D}}(\\text{RMSNorm}(zW_K))',
          highlightKeys: ['q', 'k'],
          callout: 'V와 잔차 스트림에는 위치 임베딩이 직접 더해지지 않습니다.',
        },
        {
          id: 'b3',
          title: '3. Joint Self-Attention ([Img|Txt] 전면 양방향)',
          subtitle: '하나의 (N+L)×(N+L) 어텐션 행렬에서 4개 블록 상호작용이 동시 발생',
          body: '이미지→이미지, 이미지→텍스트, 텍스트→이미지, 텍스트→텍스트가 한 번의 어텐션으로 동시에 계산됩니다.',
          tex: '\\htmlClass{sem-attn}{A} = \\text{softmax}\\!\\left(\\frac{\\htmlClass{sem-q}{Q}\\htmlClass{sem-k}{K^T}}{\\sqrt{128}}\\right) \\in \\mathbb{R}^{24 \\times (N+L) \\times (N+L)}',
          highlightKeys: ['q', 'k', 'attn'],
          callout: 'XAI 히트맵은 이 정사각형 행렬의 우상단 직사각형 영역입니다.',
        },
        {
          id: 'b4',
          title: '4. Soft-capped Gated FFN (폭 8192)',
          subtitle: 'FFN 확장 출력을 절반으로 나눠 게이트 활성 + 소프트캡 적용',
          body: '어텐션 결과를 gate1과 곱해 잔차에 더한 뒤, 소프트캡이 걸린 게이트 FFN(폭 8192) 결과를 gate2와 곱해 잔차에 누적합니다.',
          tex: 'z\'\' = z\' + \\htmlClass{sem-gate}{g_2} \\odot \\text{FFN}_{\\text{softcap-gate}}(\\text{Mod}_2(z\'))',
          highlightKeys: ['gate'],
          callout: '이미지와 텍스트 토큰이 동일한 FFN 가중치를 공유합니다.',
        },
      ],
      micro: [
        {
          id: 'a1',
          title: '1. [Img | Txt] 정사각형 행렬의 4분면 구조',
          subtitle: '좌상단(I→I) · 우상단(I→T) · 좌하단(T→I) · 우하단(T→T)',
          body: '단일 스트림이므로 어텐션 행렬은 (N+L)×(N+L) 정사각형입니다. 이미지가 앞[0..N), 텍스트가 뒤[N..N+L)에 있어 4개 상호작용 영역이 뚜렷이 나뉩니다.',
          tex: '\\htmlClass{sem-attn}{A} = \\begin{pmatrix} I\\!\\to\\!I & \\htmlClass{sem-attn}{I\\!\\to\\!T} \\\\ T\\!\\to\\!I & T\\!\\to\\!T \\end{pmatrix}',
          highlightKeys: ['attn', 'img', 'txt'],
          callout: '행렬의 우상단(Teal 테두리)이 이미지 Query → 텍스트 Key 구간입니다.',
        },
        {
          id: 'a2',
          title: '2. 우상단 XAI 슬라이스 추출: Q[0:N] × K[N:N+L]',
          subtitle: '채팅 템플릿 토큰(<|user|>, <|think|>) 구분 필수',
          body: '우상단 블록만 잘라내면 이미지 패치가 각 텍스트 토큰을 얼마나 보는지 알 수 있습니다. 단, 앞뒤 채팅 템플릿 토큰이 마스크 없이 key로 들어가므로 프롬프트 단어와 구분해 해석해야 합니다.',
          tex: '\\htmlClass{sem-attn}{A_{\\text{XAI}}} = A_{[:,\\; \\htmlClass{sem-img}{0:N},\\; \\htmlClass{sem-txt}{N:N+L}]}',
          highlightKeys: ['attn', 'img', 'txt'],
          callout: '템플릿 토큰(<|user|>, <|think|>)을 눌러 싱크 패턴을 비교해 보세요.',
        },
        {
          id: 'a3',
          title: '3. 텍스트 공진화(Co-evolution) 주의점 & 2D 히트맵',
          subtitle: '좌하단(T→I) 때문에 깊은 블록 텍스트 Key에는 이미지 정보가 섞임',
          body: 'Anima와 달리 MOSS-Image는 좌하단(T→I) 어텐션으로 텍스트 토큰도 계속 갱신됩니다. 따라서 후반 층 히트맵은 "프롬프트 + 현재 생성 중인 이미지 문맥"이 결합된 표현입니다.',
          tex: '\\htmlClass{sem-txt}{T^{(i+1)}} \\leftarrow \\htmlClass{sem-txt}{T^{(i)}} + \\text{Attn}(T^{(i)},\\, \\htmlClass{sem-img}{X^{(i)}})',
          highlightKeys: ['txt', 'img'],
          callout: '프롬프트 단어 토큰을 클릭해 4×4 히트맵을 확인해 보세요.',
        },
      ],
    },
  },

  krea2: {
    id: 'krea2',
    name: 'Krea 2',
    shortName: 'Krea 2',
    badge: '12.8B · [Txt|Img] GQA+Gate',
    accent: '#a78bfa',
    params: 'DiT ~12.8B (28블록, 폭 6144)',
    blocks: 28,
    hiddenDim: 6144,
    qHeads: 48,
    kvHeads: 12,
    headDim: 128,
    vae: 'Qwen-Image VAE (16ch, 8× → 2×2 패치)',
    streamOrder: 'txt-img',
    streamLabel: '단일 시퀀스 [텍스트 T | 이미지 N] · dim 6144',
    textEncoder: 'Qwen3-VL-4B (36층 중 3층 간격 12개 층 스택!)',
    textBridge: 'txtfusion (12층 축 어텐션 → 선형 혼합 → 토큰 축 양방향 정제)',
    textFate: '매 블록 이미지와 공진화 (RoPE=(0,0,0)이라 위치 회전 없음)',
    ropeDesc: '3축 RoPE (참조, 행, 열) — 이미지만 (y,x), 텍스트는 전부 (0,0,0)!',
    adalnDesc: '공용 tvec + 블록별 학습 bias → 6벡터 + 토큰·채널별 Output Gate σ(Wg·h)',
    xaiSliceDesc: 'block[i].attn.probs [48, T+N, T+N] → 좌하단 Q[T:T+N] × K[0:T]',
    xaiTrapDesc: '확률만 보면 착시 발생! Output Gate σ(Wg·h)가 닫히면 높은 확률도 잔차 기여≈0 + 꼬리 5토큰',
    miniTokens: [
      { id: 'k0', label: 'silver', kind: 'prompt', desc: '프롬프트 토큰 — 상단 머리카락 영역', spatial: SPATIAL_HAIR },
      { id: 'k1', label: 'eyes', kind: 'prompt', desc: '프롬프트 토큰 — 중앙 눈 영역', spatial: SPATIAL_EYES },
      { id: 'k2', label: 'night', kind: 'prompt', desc: '프롬프트 토큰 — 배경 밤하늘 영역', spatial: SPATIAL_SKY },
      { id: 'k3', label: 'dress', kind: 'prompt', desc: '프롬프트 토큰 — 하단 의상 영역', spatial: SPATIAL_DRESS },
      { id: 'k4', label: '<|im_end|>', kind: 'template', desc: '꼬리 5토큰 중 하나 — 단방향 LLM이 프롬프트 전체를 요약한 상태', spatial: SPATIAL_SINK },
      { id: 'k5', label: 'assistant', kind: 'template', desc: '꼬리 5토큰 끝부분 — 마스크 없이 key로 들어가 강한 싱크 형성 가능', spatial: SPATIAL_SINK },
    ],
    steps: {
      macro: [
        {
          id: 'm1',
          title: '1. Qwen3-VL-4B 12개 층 스택 → txtfusion',
          subtitle: '36층 중 3층 간격 12층 추출 → 층 축 어텐션 → 토큰 축 정제',
          body: '최종 층 하나만 쓰지 않고 12개 중간층을 쌓아([B, T, 12, 2560]) DiT 안의 txtfusion에 넘깁니다. system 접두부는 잘라내고, 꼬리 5토큰은 유지합니다.',
          tex: '\\htmlClass{sem-txt}{T^{(0)}} = \\text{MLP}\\!\\Big(\\text{txtfusion}\\big(H_{\\text{12-layers}}\\big)\\Big) \\in \\mathbb{R}^{B \\times T \\times 6144}',
          highlightKeys: ['txt'],
          callout: '어느 층의 언어 정보를 쓸지 txtfusion이 학습으로 직접 혼합합니다.',
        },
        {
          id: 'm2',
          title: '2. 단일 시퀀스 결합: [텍스트 T | 이미지 N]',
          subtitle: 'MOSS와 정반대 순서! 텍스트가 앞 [0, T), 이미지가 뒤 [T, T+N)',
          body: '2×2 패치로 묶은 이미지 토큰 [B, N, 6144]를 텍스트 뒤에 이어 붙여 폭 6144의 초대형 단일 시퀀스 [텍스트 | 이미지]를 구성합니다.',
          tex: 'Z^{(0)} = \\big[\\,\\htmlClass{sem-txt}{T^{(0)}} \\;\\big|\\; \\htmlClass{sem-img}{X_{\\text{img}}^{(0)}}\\,\\big] \\in \\mathbb{R}^{B \\times (T+N) \\times 6144}',
          highlightKeys: ['txt', 'img'],
          callout: '시퀀스 순서가 반대라 어텐션 행렬에서 XAI 슬라이스 위치도 좌하단으로 바뀝니다.',
        },
        {
          id: 'm3',
          title: '3. 28개 GQA + Output Gate DiT 블록 (~12.8B)',
          subtitle: '48 Q-헤드가 12 KV-헤드를 4:1 공유 + 토큰별 출력 게이트',
          body: '28개 블록을 통과하며 이미지와 텍스트가 공진화합니다. 텍스트 토큰은 RoPE 좌표가 전부 (0,0,0)이라 회전되지 않으며, 단어 순서는 인코더 상태 안에만 남습니다.',
          tex: 'Z^{(i+1)} = \\text{KreaBlock}_i\\!\\big(Z^{(i)},\\; \\text{tvec}(\\sigma) + \\text{bias}_i\\big)',
          highlightKeys: ['img', 'txt', 'gate'],
          callout: '모든 블록이 tvec을 공유하되, 블록별 학습 bias를 더해 차별화합니다.',
        },
        {
          id: 'm4',
          title: '4. 뒤쪽 이미지 구간만 추출 → Velocity 복원',
          subtitle: '텍스트 구간 [0:T] 폐기 → x₀ = x_σ − σ·v → Qwen-Image VAE',
          body: '최종 출력에서 앞쪽 텍스트 구간 T개를 버리고 이미지 구간 [T:T+N]만 원래 latent 격자로 되돌려 velocity v를 얻습니다.',
          tex: '\\htmlClass{sem-attn}{v} = \\text{Unpatch}\\!\\big(\\htmlClass{sem-img}{Z^{(28)}_{[T:T+N]}}\\big), \\quad x_0 = x_\\sigma - \\sigma \\htmlClass{sem-attn}{v}',
          highlightKeys: ['img', 'attn'],
          callout: '홀수 해상도 latent는 짝수 패딩 후 출력 시 잘라냅니다.',
        },
      ],
      meso: [
        {
          id: 'b1',
          title: '1. 공용 tvec + 블록별 Bias AdaLN',
          subtitle: 'h = (1 + s₁) ⊙ RMSNorm(x) + b₁',
          body: '공용 타임스텝 벡터 tvec에 각 블록 고유의 bias를 더해 6개 변조 벡터(s₁, b₁, g₁, s₂, b₂, g₂)를 만듭니다.',
          tex: 'h = (1 + \\htmlClass{sem-gate}{s_1}) \\odot \\text{RMSNorm}(x) + \\htmlClass{sem-gate}{b_1}',
          highlightKeys: ['gate'],
          callout: 'Anima(완전 독립)와 MOSS(완전 공유)의 절충형 설계입니다.',
        },
        {
          id: 'b2',
          title: '2. GQA (48 Q / 12 KV) + 3축 RoPE (텍스트=(0,0,0))',
          subtitle: 'Q-헤드 4개가 하나의 KV-헤드를 공유 (4:1 그룹)',
          body: 'Q는 48헤드, K·V는 12헤드로 투영 후 QK-norm과 3축 RoPE를 적용합니다. 이미지는 (0, y, x) 좌표를 받지만 텍스트는 전부 (0, 0, 0)이라 회전되지 않습니다.',
          tex: '\\htmlClass{sem-q}{Q} \\in \\mathbb{R}^{48 \\times (T+N) \\times 128}, \\quad \\htmlClass{sem-k}{K}, \\htmlClass{sem-v}{V} \\in \\mathbb{R}^{12 \\times (T+N) \\times 128}',
          highlightKeys: ['q', 'k', 'v'],
          callout: '같은 그룹의 Q-헤드 4개는 동일한 K·V 위에서 다른 확률 분포만 만듭니다.',
        },
        {
          id: 'b3',
          title: '3. 핵심 차별점: 토큰·채널별 Output Gate σ(Wg·h)',
          subtitle: '어텐션 확률이 높아도 게이트가 닫히면 잔차에 닿지 못함!',
          body: '어텐션 컨텍스트에 Wo를 곱하기 직전, 입력 h에서 계산한 시그모이드 게이트 σ(Wg·h)를 원소별로 곱합니다. 타임스텝 게이트 g₁과 달리 토큰 내용마다 값이 다릅니다.',
          tex: '\\text{AttnOut} = W_o\\Big(\\htmlClass{sem-gate}{\\sigma(W_g h)} \\odot \\htmlClass{sem-attn}{\\text{Attn}(Q,K,V)}\\Big)',
          highlightKeys: ['gate', 'attn'],
          callout: 'Krea 2 XAI에서는 확률(probs)뿐 아니라 출력 게이트를 반드시 함께 봐야 합니다!',
        },
        {
          id: 'b4',
          title: '4. 타임스텝 게이트 g₁·g₂ & SwiGLU MLP',
          subtitle: 'x ← x + g₁ ⊙ AttnOut,  x ← x + g₂ ⊙ SwiGLU(h₂)',
          body: '출력 게이트와 Wo를 통과한 어텐션 결과에 다시 타임스텝 게이트 g₁을 곱해 잔차에 더하고, 이어서 SwiGLU MLP와 g₂로 블록을 마무리합니다.',
          tex: 'x_{\\text{out}} = x + \\htmlClass{sem-gate}{g_1} \\odot \\text{AttnOut} + \\htmlClass{sem-gate}{g_2} \\odot \\text{SwiGLU}(h_2)',
          highlightKeys: ['gate'],
          callout: '어텐션 기여는 확률 × Output Gate × g₁의 삼중 필터를 거칩니다.',
        },
      ],
      micro: [
        {
          id: 'a1',
          title: '1. [Txt | Img] 행렬 & 좌하단 XAI 슬라이스',
          subtitle: '텍스트가 앞 [0:T], 이미지가 뒤 [T:T+N] → 좌하단 Q[T:T+N] × K[0:T]',
          body: 'Krea 2는 텍스트가 시퀀스 앞에 오므로, 이미지 Query가 텍스트 Key를 보는 XAI 히트맵 구간은 정사각형 행렬의 좌하단 블록입니다.',
          tex: '\\htmlClass{sem-attn}{A_{\\text{XAI}}} = A_{[:,\\; \\htmlClass{sem-img}{T:T+N},\\; \\htmlClass{sem-txt}{0:T}]}',
          highlightKeys: ['attn', 'img', 'txt'],
          callout: 'MOSS(우상단)와 XAI 슬라이스 위치가 대각선 반대입니다!',
        },
        {
          id: 'a2',
          title: '2. GQA 4:1 공유 (48 Q-헤드 → 12 KV-헤드)',
          subtitle: '같은 KV 그룹에 속한 Q-헤드 4개가 서로 다른 공간 초점을 형성',
          body: '12개 KV-헤드가 각각 4개의 Q-헤드에 복제(repeat)되어 공유됩니다. 따라서 메모리 대역폭을 줄이면서도 48개의 다양한 어텐션 패턴을 얻습니다.',
          tex: '\\htmlClass{sem-attn}{A^{(4g+r)}} = \\text{softmax}\\!\\left(\\frac{\\htmlClass{sem-q}{Q^{(4g+r)}}\\htmlClass{sem-k}{(K^{(g)})^T}}{\\sqrt{128}}\\right), \\quad r \\in \\{0,1,2,3\\}',
          highlightKeys: ['q', 'k', 'attn'],
          callout: '오른쪽에서 GQA 헤드 그룹을 바꿔 보며 분포 차이를 확인해 보세요.',
        },
        {
          id: 'a3',
          title: '3. Output Gate σ(Wg·h) — 확률 착시 체험하기',
          subtitle: '게이트 슬라이더를 내려 확률은 높지만 실제 기여가 0에 가까워지는 현상 확인',
          body: '어텐션 확률 p_ij가 0.9라도 해당 토큰의 Output Gate σ(Wg·h)가 0.05라면 잔차에 전달되는 유효 신호는 거의 사라집니다. 아래 게이트 슬라이더를 직접 움직여 보세요!',
          tex: '\\htmlClass{sem-gate}{\\text{Effective}} = \\htmlClass{sem-gate}{\\sigma(W_g h_i)} \\odot \\Big(\\sum_j \\htmlClass{sem-attn}{A_{ij}} \\htmlClass{sem-v}{V_j}\\Big)',
          highlightKeys: ['gate', 'attn', 'v'],
          callout: '우측 하단 Output Gate 슬라이더로 실제 히트맵 감쇠를 직접 테스트해 보세요.',
        },
      ],
    },
  },
};

export const MODEL_LIST: ModelSpec[] = [MODELS.anima, MODELS.moss, MODELS.krea2];

export const ZOOM_TABS: Array<{ id: ZoomLevel; num: string; label: string; short: string }> = [
  { id: 'macro', num: '01', label: '전체 흐름 (Macro)', short: '전체 흐름' },
  { id: 'meso', num: '02', label: '블록 1개 내부 (Meso)', short: '블록 내부' },
  { id: 'micro', num: '03', label: '어텐션 & XAI Hook (Micro)', short: '어텐션·Hook' },
];
