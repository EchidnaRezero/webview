# Setup & Usage Guide

> **현재 상태 (M0)**: 도구 구조 및 유지보수 문서 구성 완료. 패키지 설치 및 CLI 구현은 M1에서 사용자 확인 후 진행합니다.

---

## 1. 사전 요구사항

- **Node.js**: v20 LTS 이상
- **패키지 매니저**: `npm` (또는 `pnpm`)
- **Visual QA (`mg check`)**: Playwright Chromium
- **영상 렌더링 (`mg render`, 선택)**: Remotion CLI / FFmpeg

---

## 2. 예정 설치 및 로컬 CLI 링크 (M1 완료 후)

```powershell
# 1) 이 리포에서 의존성 설치 및 로컬 CLI 등록
npm install
npm link

# 2) 다른 프로젝트 폴더에서 바로 사용
cd C:\Projects\SomeOtherProject
mg init ./showcase
mg check ./showcase
mg build ./showcase
```
