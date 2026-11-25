# Architecture — MotionGraphic (`kit` + `cli` + `skill` + `examples`)

## 1. 전체 사용 흐름 (다른 프로젝트에서 쓰는 그림)

```text
[외부 프로젝트: C:\Projects\MyPaper]
   │
   ├── 1. AI가 MotionGraphic/skill/SKILL.md 참조
   ├── 2. `mg init ./showcase` → kit/ 스타터 & 공용 부품 복사/세팅
   ├── 3. AI가 논문/데이터에 맞춰 씬 작성
   │        ├─ 자유 조작 3D · PT 인터랙션 → R3F + Motion + KaTeX
   │        └─ 선형 3B1B 모션 · MP4 필요 → Remotion Player/Composition
   ├── 4. `mg check ./showcase` → Playwright 1440/1024/768 자동 Visual QA
   │        └─ 겹침/넘침/폰트/콘솔 리포트 → AI가 0 에러까지 수정
   └── 5. `mg build` (정적 HTML/GitHub Pages) / `mg render` (MP4/GIF)
```

---

## 2. 4개 핵심 디렉토리 역할

### ① `kit/` — 공용 스타터 & STEM 프리미티브
다른 프로젝트 `showcase/`의 뼈대가 되는 최소 부품 집합:
- **Design Tokens & Typography**: 다크 사이언티픽 팔레트, 시맨틱 컬러, `Pretendard Variable` + Mono 로드, `tabular-nums`
- **Dual Shell**: `Report`(웹 스크롤/탭) ↔ `PT`(16:9 발표 모드, 키보드 탐색)
- **Timeline Core**: 선언적 `Step[]` + 재생/일시정지/리셋/이전·다음/스크러버 (Zustand)
- **Math Sync**: KaTeX 수식 토큰 ↔ 2D/3D 그래픽 시맨틱 하이라이트 연동
- **Stage Primitives**:
  - 2D: `ArchitectureFlow`, `MatrixHeatmap`, `DarkChart`
  - 3D: `Stage3D`(R3F + `CameraRig` 프리셋 보간 + `CalloutManager` 겹침 방지)
  - Linear Motion: `RemotionStage`(`@remotion/player` 임베드 + 공통 컴포넌트 공유)

### ② `cli/` — 로컬 커맨드 (`mg`)
로컬 PC에 `npm link` 등으로 연결해 어느 프로젝트 폴더에서나 바로 호출:
- `mg init <dir>`: `<dir>`에 Vite + React + TS + `kit/` 기반 쇼케이스 스타터 생성
- `mg check <url|dir>`: Playwright로 `1440×900`, `1024×768`, `768×1024` 스냅샷 및 레이아웃·겹침·폰트·콘솔 검증 결과를 JSON/요약으로 출력
- `mg build <dir>`: GitHub Pages 호환 정적 빌드(`dist/`)
- `mg render <dir> <composition>`: Remotion CLI를 감싸 MP4/GIF 출력

### ③ `skill/` — AI 에이전트용 하네스 지침 (`SKILL.md`)
- 다른 프로젝트에서 작업 중인 AI에게 글로벌/프로젝트 스킬로 제공
- 포함 내용: 하이브리드 도구 선택 매트릭스(Interactive R3F vs Remotion), 3B1B-Plus 시각 규칙, `mg init → 작성 → mg check → 수정 → mg build` 표준 루프

### ④ `examples/` — 검증 및 Few-shot 예제
- `examples/attention-xai/`: 딥러닝 어텐션·아키텍처 2D/3D 인터랙티브 + Remotion 모션 시퀀스 예제 (키트 업그레이드 시 회귀 검증 타겟이자 AI 참조 템플릿)

---

## 3. 기술 스택

- **Web/UI/2D**: React, TypeScript, Vite, Tailwind CSS, Motion, KaTeX, Zustand
- **3D**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Linear Motion/Video**: `remotion`, `@remotion/player`, `@remotion/three`, `@remotion/cli`
- **CLI & QA**: Node.js (TS), Playwright, Vitest
