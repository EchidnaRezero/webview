# AGENTS.md — MotionGraphic Agent Operating Rules

이 프로젝트에서 작업하는 모든 AI 에이전트는 작업 시작 전 [docs/workspace_guide.md](docs/workspace_guide.md)의 폴더 경계, 상황별 참조 라우팅, 4역할 운영 원칙을 따른다.

---

## 1. 공통 원칙 및 금지사항

1. **문서 경계 준수**
   - `README.md`에는 에이전트 지침·금지사항을 적지 않는다.
   - 설계·방향·실험 계획은 `docs/`에, 마일스톤 작업 지시서·진행 현황은 `plan/`에 둔다.
   - 반복 검증 코드는 `tests/`, 계획된 벤치마크 결과는 `experiments/`, 예상 밖 문제 조사·해결은 `issues/`에 기록한다.
2. **읽기 전용 보호**
   - `docs/reference/`와 `reference_repo/`의 원본 자료는 임의로 수정하지 않는다.
3. **보안 (`local/`)**
   - `local/`의 실제 API 키·토큰·개인 경로를 코드, 문서, 로그, 커밋, `showcase/`에 복사하거나 출력하지 않는다.
4. **사전 확인 필수**
   - 패키지 설치(`npm install` 등), 외부 다운로드, 파일/폴더 삭제, 대규모 렌더링·실행 전에는 반드시 사용자에게 확인을 받는다.
   - 특히 1GB 이상이거나 디스크·RAM 부담이 큰 작업(예: Playwright 브라우저 바이너리, FFmpeg/Chromium 대량 렌더링)은 예상 용량과 부담을 먼저 알린다.
5. **추측 금지**
   - 수치, FPS, 번들 크기, QA 통과 여부는 실제 실행 로그와 스크린샷 근거 없이 지어내지 않는다.

---

## 2. 4역할 운영 규칙

- **Orchestrator**: 사용자와 직접 대화, 작업 분배·검수·재지시, 즉흥 요청 처리.
- **Builder**: `src/` 구현, `tests/` 작성 및 실행, `experiments/` 벤치마크 실행.
- **Reviewer**: 디버깅, 원인 진단, 설계·코드·시각 품질 교차 검토 (가능하면 Orchestrator와 다른 모델 사용).
- **Scribe**: `issues/` RAW 기록, `experiments/` 요약, `plan/status.md`·`README.md`·`*_guide.md` 갱신, `showcase/` 정리.

---

## 3. Project-Specific (STEM Motion & 3D Harness Rules)

### 3.1 하이브리드 엔진 도구 선택 규칙
이 프로젝트는 **Interactive Web/3D 엔진(React + R3F + Motion + KaTeX)**과 **Linear Motion/Video 엔진(Remotion)**을 함께 둔다. 에이전트는 새 씬이나 쇼케이스를 설계할 때 아래 기준으로 도구를 선택한다.

| 표현 목적 | 선택할 엔진 | 이유 |
|---|---|---|
| 마우스 3D 회전/줌, 파라미터 슬라이더, 모델 토글, 표↔3D 카메라 연동, 라이브 PT 키보드 탐색 | **Interactive Engine** (React + R3F + Motion + Zustand Timeline) | 사용자 이벤트 중심 상태와 3D `OrbitControls`가 자연스럽게 동작 |
| 정밀한 프레임 동기화 안무(3B1B 스타일 연속 모핑), MP4/GIF 영상 익스포트가 필요한 설명 시퀀스 | **Remotion** (`@remotion/player` + `@remotion/three`) | `frame` 기반 결정론적 보간(`interpolate`/`spring`)과 60fps 영상 렌더링 지원 |
| 웹 쇼케이스 안에 선형 설명 애니메이션과 자유 탐색 3D 뷰어가 모두 필요한 경우 | **Hybrid** (React 앱 셸 안에 Remotion Player 스테이지 + R3F 인터랙티브 스테이지 조합) | 각 엔진의 강점만 취하고 상태 충돌 방지 |

### 3.2 시각 디자인 & 3B1B-Plus 규약
- **다크 사이언티픽 통일성**: 외부 흰 배경 Matplotlib PNG를 다크 카드에 그대로 붙이지 않는다. 데이터 차트·히트맵·다이어그램은 다크 테마 네이티브(SVG/Canvas/WebGL)로 렌더링한다.
- **웹폰트 필수 로드**: `Pretendard Variable` 및 모노스페이스 폰트는 CSS 선언만 하지 말고 실제 폰트 리소스를 로드한다. 숫자는 `tabular-nums`를 적용한다.
- **시맨틱 컬러 바인딩**: 한 쇼케이스 안에서 수학/알고리즘 개체(예: Query/Key/Value, 설계 후보/양성 대조군/실패 임계값)에 부여한 색상은 수식(KaTeX)·2D 다이어그램·3D 오브젝트·범례에서 끝까지 일관되게 유지한다.
- **객체 연속성**: 스텝 전환 시 요소가 갑자기 사라지거나 점프하지 않도록 보간(easing/spring) 또는 카메라 트랜지션을 사용한다.

### 3.3 Visual QA 완료 조건 (Definition of Done)
새 쇼케이스나 공용 UI 컴포넌트 변경 시, 아래 자동 Visual QA 항목을 통과해야 완료로 간주한다.
1. **3개 뷰포트 검증**: `1440×900`(PT/데스크톱), `1024×768`(노트북/분할), `768×1024`(좁은 화면)에서 렌더링 확인.
2. **레이아웃 무결성**: 헤더/네비게이션 줄바꿈 넘침 없음, 의도치 않은 수평 스크롤(`scrollWidth > clientWidth`) 없음.
3. **텍스트/라벨 충돌 0건**: Canvas 내부 제목·배지 및 3D HTML 콜아웃 라벨 간 bounding box 겹침 방지.
4. **런타임 무결성**: 브라우저 콘솔 에러 0건, 웹폰트 로드 완료, `prefers-reduced-motion` 존중.
5. **정적 배포 호환**: GitHub Pages 등 정적 호스팅에서 상대 경로로 정상 동작.
