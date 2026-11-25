# M1 — First Example First (Example-Driven Harvest)

> **전제 조건**: 패키지 설치 전 사용자 확인 필수 (`AGENTS.md` 1.4절). 무거운 바이너리(별도 Chromium, Remotion CLI 등)는 지금 깔지 않는다.

## 목표
추측으로 `kit/`을 먼저 만들지 않고, **`examples/attention-xai/`**에 실제 3B1B-Plus 수준의 딥러닝 어텐션/아키텍처 인터랙티브 쇼케이스 1편을 먼저 완성한 뒤, 거기서 검증된 요소만 `kit/` · `cli/` · `skill/`로 역수입한다.

---

## 초경량 의존성 전략
- **지금 설치 (필수 최소)**: `react`, `react-dom`, `vite`, `typescript`, `tailwindcss`, `katex`, `motion`, `three`, `@react-three/fiber`, `@react-three/drei` (상태 관리는 별도 라이브러리 없이 React 기본 훅 사용)
- **나중/경량 대체**:
  - Visual QA(`mg check`): 별도 Chromium(300~500MB) 대신 PC에 이미 있는 **Edge/Chrome**을 쓰는 `playwright-core`(수 MB) 활용
  - Remotion(`@remotion/cli` 등): 실제로 MP4 영상 익스포트 예제를 만들 시점에 추가 설치

---

## 체크리스트
- [ ] `examples/attention-xai/` 초경량 프로젝트 세팅 (사용자 확인 후 `npm install`)
- [ ] 3B1B-Plus 어텐션 내부 동작 쇼케이스 구현 (수식 KaTeX 시맨틱 컬러 연동 + 2D 아키텍처/히트맵 + 3D 토큰/어텐션 스테이지 + Report/PT 전환 + 타임라인 컨트롤러)
- [ ] 로컬 Edge/Chrome 기반 경량 시각 점검 스크립트로 1440/1024/768 레이아웃·겹침·폰트 확인
- [ ] 재사용 가치가 검증된 부품 목록을 추려 M2(`kit/` · `cli/` · `skill/` 역수입)로 이관
