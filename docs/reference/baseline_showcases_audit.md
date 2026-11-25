# Baseline Portfolio Showcases Audit (2026-11-26)

신규 하네스 설계의 출발점이 된 기존 포트폴리오 쇼케이스 3종을 실제 브라우저에서 점검한 기준선 기록이다.

---

## 1. 대상 URL 3종 요약

### ① `https://echidnarezero.github.io/hbr_dataset_maker/`
- **스택**: 순수 HTML/CSS/JS + 인라인 SVG 6종 + 라이트박스 (외부 라이브러리 0)
- **강점**: Apple Dark Mode HIG 스타일 편집, 깔끔한 인라인 SVG(pHash, 텐서 흐름, 2D 결정 평면), 라이트박스 확대
- **한계/결함**:
  - ~16,300px 단일 롱스크롤이라 PT 발표 호흡에 길음
  - ~750px 폭에서 고정 높이(`52px`) `.nav` 내부 링크 줄바꿈 넘침
  - 다크 카드 위에 흰 배경 Matplotlib PNG(t-SNE 등)가 올라가 시각적 이질감 발생

### ② `https://echidnarezero.github.io/XAI_DiT/showcase/`
- **스택**: 순수 HTML/CSS/JS + 인라인 SVG 13종 + HTML5 2D Canvas 5단계 애니메이션
- **강점**: 4개 탭 기반 PT 덱 구조, 3단계 줌인 아키텍처 SVG(`End-to-End → 1-Block → Hook`), 인터랙티브 Canvas 파이프라인 애니메이션(`일시정지/리셋/이전/다음/스크러버` + 3모델 실시간 토글)
- **한계/결함**:
  - CSS에 `Pretendard Variable` 선언만 있고 실제 웹폰트 로드 누락
  - `.topbar-inner` 2줄 래핑 발생
  - Canvas 내부 스텝 제목과 우상단 `MODEL: Anima` 배지가 좁은 폭(`689px`)에서 직접 충돌
  - 결과 비교 그리드에 여전히 흰 배경 Matplotlib PNG 혼재

### ③ `https://hisameogasahara.github.io/tmp_protein/report/summary-report-findings.html`
- **스택**: 순수 HTML/CSS/JS + `Pretendard Variable` CDN + 인라인 SVG + iframe 설계 라운드 애니메이션(`design-rounds.html`) + 커스텀 WebGL 3D 복합체 7종 뷰어(`#gl-canvas`)
- **강점**: 셋 중 가장 높은 시각적 완성도. 외부 흰 배경 그림 없이 모든 SVG·애니메이션·3D WebGL·서열 정렬을 다크 테마 네이티브로 렌더링. 표의 `"3D 보기"` 버튼과 WebGL 카메라 프리셋·표현 토글 연동이 강력함
- **한계/결함**:
  - ~750px 폭에서 6열 비교표와 서열 정렬표가 수평 스크롤/우측 잘림 발생
  - `전체 7종` 3D 뷰에서 부유 HTML 콜아웃 라벨들이 우하단에 밀집·겹침

---

## 2. 하네스 설계로 직결되는 시사점

1. **공용화 최우선 대상**: 타임라인 컨트롤러(`XAI_DiT` Canvas ↔ `tmp_protein` design-rounds 중복), 다크 네이티브 차트(흰 배경 PNG 제거), 3D 카메라 프리셋 & 라벨 겹침 방지, Pretendard 폰트 및 디자인 토큰.
2. **Visual QA 자동화 타겟**: 위 3종에서 관찰된 모든 버그(헤더 줄바꿈, Canvas 텍스트 충돌, 표 수평 넘침, 3D 라벨 밀집, 폰트 미로드)는 Playwright 3-뷰포트(`1440/1024/768`) 자동 검증으로 100% 사전 차단 가능하다.
