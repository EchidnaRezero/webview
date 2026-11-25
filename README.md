# MotionGraphic — Local STEM Showcase Kit, CLI & AI Skill

다른 프로젝트(딥러닝, 바이오, 수학, 3D, 물리 등)에서 작업 중인 AI 에이전트가 **인터랙티브 3D 쇼케이스 HTML, PT 덱, 3Blue1Brown 스타일 모션그래픽(MP4/GIF)**을 매번 맨땅에 새로 짜지 않고 일관된 품질로 생성·검증할 수 있도록 돕는 **로컬 제작 도구 및 AI 하네스**입니다.

---

## 핵심 구성

- **`kit/`**: 대상 프로젝트의 `showcase/`에 바로 적용하는 공용 스타터 & 부품 (다크 사이언티픽 토큰, Pretendard, Report/PT 셸, 타임라인 컨트롤러, KaTeX 수식 연동, R3F 3D / Remotion 스테이지)
- **`cli/`**: 로컬 터미널 명령어 (`mg init`, `mg check`, `mg build`, `mg render`)
- **`skill/`**: 다른 프로젝트의 AI 에이전트에게 제공하는 사용 지침서 (`SKILL.md` — 도구 선택 기준, 제작 패턴, Visual QA 루프)
- **`examples/`**: 키트 동작 검증 및 AI 참조(Few-shot)용 최소 예제 쇼케이스

---

## 문서 & 폴더 지도

| 경로 | 설명 |
|---|---|
| `kit/` | 공용 UI·타임라인·수식·3D·Remotion 스타터 및 프리미티브 |
| `cli/` | 스캐폴딩(`init`), 자동 Visual QA(`check`), 정적 빌드/영상 렌더링(`build`/`render`) CLI |
| `skill/` | 외부 프로젝트 AI 에이전트용 하네스 지침 (`SKILL.md`) |
| `examples/` | 키트 검증 및 AI 참조용 STEM 쇼케이스 예제 |
| `tests/` | CLI 및 Playwright Visual QA 회귀 테스트 |
| [docs/direction.md](docs/direction.md) | 도구 유지보수·업그레이드 방향 및 범위 |
| [docs/architecture.md](docs/architecture.md) | `kit` · `cli` · `skill` 구조 및 하이브리드 도구 선택 설계 |
| [docs/setup.md](docs/setup.md) | 로컬 CLI 설치·링크 및 실행 방법 |
| [docs/experiment_design.md](docs/experiment_design.md) | Visual QA·성능·영상 출력 검증 기준 |
| [docs/reference_guide.md](docs/reference_guide.md) | 기존 쇼케이스 감사 등 배경 자료 인덱스 |
| [plan/status.md](plan/status.md) | 현재 진행 현황 및 마일스톤 |
