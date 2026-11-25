# Experiment & Benchmark Design — MotionGraphic

이 문서는 하네스와 쇼케이스의 **시각 품질(Visual QA), 런타임 성능, 영상 익스포트 품질**을 객관적으로 측정·비교하기 위한 벤치마크 설계서다. 실제 실행 결과는 `experiments/_template.md` 형식으로 `experiments/`에 기록한다.

---

## 1. Visual QA 자동 검증 기준 (Playwright)

모든 쇼케이스와 공용 컴포넌트 변경 후 아래 항목을 3개 뷰포트(`1440×900`, `1024×768`, `768×1024`)에서 측정한다.

| 검증 항목 | 통과 기준 | 배경 (기존 결함 방지) |
|---|---|---|
| 수평 오버플로우 | `document.documentElement.scrollWidth <= window.innerWidth` | `tmp_protein` 750px 표 넘침 방지 |
| 상단바/네비게이션 무결성 | 헤더 높이 초과·줄바꿈 겹침 0건 | `hbr` nav 넘침, `XAI_DiT` topbar 래핑 방지 |
| 텍스트·배지·라벨 충돌 | 주요 오버레이/콜아웃 요소 간 BoundingBox 교차 면적 `0` | `XAI_DiT` Canvas 제목-배지 충돌, `tmp_protein` 3D 라벨 겹침 방지 |
| 웹폰트 로드 | `document.fonts`에서 `Pretendard` 로드 상태 `loaded` 확인 | `XAI_DiT` 폰트 미로드 방지 |
| 런타임 에러 | `console.error` 및 `pageerror` 0건 | WebGL/Remotion 런타임 오류 차단 |

---

## 2. 런타임 성능 및 번들 벤치마크

| 지표 | 목표 기준 | 측정 방법 |
|---|---|---|
| 초기 인터랙티브 로드(TTI / FCP) | 로컬 프리뷰 기준 FCP < 1.5s | Playwright Performance Timing |
| 3D / 애니메이션 프레임레이트 | 1440px 기준 55~60 FPS 유지 (드롭 최소화) | `requestAnimationFrame` 5초 샘플링 |
| 정적 번들 크기 | 코어 + 1개 쇼케이스 gzip 합계 추적(회귀 감시) | `vite build` 리포트 |

---

## 3. Remotion 영상 익스포트 검증

| 항목 | 기준 |
|---|---|
| 출력 스펙 | `1920×1080`, `30fps` 또는 `60fps`, H.264 MP4 |
| 키프레임 일치성 | 웹 `@remotion/player`의 프레임 $t$ 스냅샷과 CLI 렌더링 프레임 $t$가 시각적으로 일치 |
| 렌더링 소요 시간 | 10초(300~600프레임) 씬 기준 로컬 렌더링 시간 및 메모리 피크 기록 |
