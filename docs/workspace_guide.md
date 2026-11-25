# Workspace & Role Guide (Template)

`AGENTS.md`에서 에이전트가 **언제 어떤 문서·폴더를 읽고 써야 하는지** 찾을 때 참조하는 범용 가이드다.
AI 연구·일반 소프트웨어 개발 모두에 재사용할 수 있도록 설계했다. 프로젝트별 세부 제약만 `AGENTS.md` 하단(`Project-Specific`)과 각 `*_guide.md`에서 채운다.

---

## 1. 폴더·문서 구조 한눈에 보기 (루트 단일 Git 리포 기준)

프로젝트 루트 자체가 하나의 Git 리포지토리다. 코드·테스트·문서·계획·결과·이슈·시각화가 함께 원격에 올라가며, 외부 클론·로컬 시크릿·실행 로그·대용량 파일만 `.gitignore`로 뺀다.

```text
<project-root>/                        # Git 리포지토리 루트
├── README.md                          # 프로젝트 소개 · 성과 요약 · 문서 & 폴더 지도 (지침 작성 금지)
├── AGENTS.md                          # 에이전트 전용 지침 · 금지사항 · 4역할 운영 규칙
├── .gitignore                         # reference_repo/* (!guide 제외), local/* (!.env.example 제외), logs/, 대용량·PDF 등
├── src/                               # 실제 프로젝트 코드 (패키지·모듈)
├── tests/                             # 단위·통합 테스트 코드 (git 추적)
├── plan/                              # 마일스톤 작업 지시서 · 체크리스트 · 현재 진행 현황
│   ├── status.md                      # 지금 어디까지 왔고 다음 마일스톤은 무엇인지
│   └── <milestone>.md                 # 단계별 작업 지시서·체크리스트
├── docs/
│   ├── workspace_guide.md             # (이 문서) 상황·역할별 문서/폴더 참조 가이드
│   ├── direction.md                   # 프로젝트 큰 방향 · 목표 · 범위
│   ├── architecture.md                # 전체 아키텍처 · 모듈/어댑터 구조 · 폴더 구조
│   ├── experiment_design.md                  # 실험(AI) 또는 성능측정·벤치마크(일반 개발) 설계서
│   ├── setup.md                       # 공개용(GitHub) 설치·실행 가이드
│   ├── reference_guide.md             # "어떨 때 docs/reference/의 무엇을 보나" 인덱스
│   └── reference/                     # 구체적 참조 자료 (조사 정리, 대상 스펙, 논문 등)
├── experiments/                       # docs/experiment_design.md에서 계획한 실험·성능측정 결과
│   └── _template.md
├── issues/                            # 하다가 예상 밖으로 생긴 문제 조사·해결 RAW (포폴 기반)
│   └── _template.md
├── showcase/                          # 한눈에 보는 시각 자료 (HTML · 슬라이드 · 포폴용)
├── reference_repo/                    # 외부 참조 리포 (.gitignore 대상, 읽기 전용)
│   ├── reference_repo_guide.md        # 리포별 참조 의도 · 커밋 · 라이선스 · 크레딧 (git 추적)
│   └── <external-repos>/
└── local/                             # 로컬 전용 환경 설정 · API 키 등 민감 정보 (.gitignore 대상)
    ├── .env.example                   # 필요한 키·로컬 경로 변수 목록 예시 (값 비움, git 추적)
    └── <env-and-keys>                 # 실제 .env, API 키, 로컬 경로 설정 (커밋·외부 노출 금지)
```

---

## 2. 핵심 경계 4가지

### ① `README.md` vs `AGENTS.md`
| 파일 | 대상 | 담는 내용 | 절대 넣지 말 것 |
|---|---|---|---|
| **`README.md`** | 사람 · 외부 · 포폴 | 이 프로젝트가 뭔지, 뭘 했고 뭐가 나왔는지, 어디에 뭐가 있는지(문서·폴더 지도) | "~해야 한다", 금지사항 같은 에이전트 지침·원칙 |
| **`AGENTS.md`** | 에이전트 | 공통 방침, 금지사항, 역할 분배, `workspace_guide.md` 참조 지시, 프로젝트 전용 제약 | 프로젝트 홍보·긴 성과 소개 |

### ② `docs/` vs `plan/`
- **`docs/`**: 방향(`direction.md`), 구조(`architecture.md`), 실험·성능측정 설계(`experiment_design.md`), 공개 실행법(`setup.md`), 그리고 **프로젝트에서 참고·이해해야 할 배경 문서(`reference_guide.md` + `reference/` — 예: AI 프로젝트면 대상 모델 구조·동작·논문 조사, 일반 개발이면 도메인 스펙·외부 API 문서)**.
- **`plan/`**: 마일스톤 단위의 **작업 지시서·체크리스트·진행 현황(`status.md`)**. 설계나 실험 계획 자체는 `docs/`에 쓴다.

### ③ 상시·반복(`tests/`, `experiments/`) vs 이벤트성(`issues/`)
가장 중요한 기준: **최초 설계에 있었거나, 하다가 앞으로 반복 사용·기능으로 편입하기로 한 것은 `tests/`·`experiments/`**로 두고, **예상 밖으로 터진 이벤트성 문제의 조사·해결 과정은 `issues/`**에 남긴다. (이슈를 해결한 뒤 재발 방지를 위해 계속 돌릴 검증은 `tests/` 등으로 승격한다.)

| 폴더 | 기준 | 성격 |
|---|---|---|
| **`tests/`** | 앞으로 **반복해서 돌리는** 검증 코드 | 단위·통합·회귀 테스트 (git 추적) |
| **`experiments/`** | **설계(`docs/experiment_design.md`)·편입된** 실험·성능측정 결과 | 객관적 실행 데이터(설정·수치·출력물) |
| **`issues/`** | 예상 밖으로 생긴 **이벤트성** 문제의 조사·해결 | 포폴·회고용 RAW 스토리 (`문제 → 관찰 → 원인 → 해결 → 검증`, 이미지는 링크만) |

### ④ `docs/setup.md` vs `local/`
- **`docs/setup.md`**: 사람·에이전트가 읽는 **공개용 설치·실행 설명서** (git 추적).
- **`local/`**: 코드가 불러오는 **내 PC 전용 값·API 키·시크릿** (`.gitignore`, `!local/.env.example`만 추적).

---

## 3. 상황별 참조 라우팅 ("이럴 땐 여기부터 본다")

| 상황 / 질문 | 먼저 열 파일 | 그다음 볼 곳 |
|---|---|---|
| 이 프로젝트가 뭔지, 어디에 뭐가 있는지 | `README.md` | `showcase/` |
| 지켜야 할 규칙·금지사항·역할 분배 | `AGENTS.md` | `docs/workspace_guide.md` |
| 지금 어디까지 진행됐고 다음 작업이 뭔지 | `plan/status.md` | `plan/<현재 마일스톤>.md` |
| 큰 목표·범위를 확인할 때 | `docs/direction.md` | — |
| 모듈·어댑터·폴더 설계를 볼 때 | `docs/architecture.md` | `src/`, `tests/` |
| 실험·성능측정 기준과 계획을 볼 때 | `docs/experiment_design.md` | `experiments/_template.md` → `experiments/` |
| 설치·실행 방법을 확인할 때 | `docs/setup.md` | `local/.env.example` |
| 논문·이론·대상 스펙을 찾을 때 | `docs/reference_guide.md` | `docs/reference/` |
| 외부 리포 코드·라이선스·크레딧 확인 | `reference_repo/reference_repo_guide.md` | `reference_repo/<repo>/` |
| 예상 밖 버그·이상 현상 원인을 찾을 때 | `issues/_template.md` | `issues/<issue-id>.md` |
| 남에게 보여줄 시각 자료를 만들/볼 때 | `showcase/` | `experiments/`, `issues/` (근거 링크) |
| 로컬 경로·API 키 등 환경 변수가 필요할 때 | `local/.env.example` | `local/` (실제 값 출력·문서 복사 절대 금지) |

---

## 4. 역할별 가이드 (4역할 팀)

```text
사용자 ↔ Orchestrator ──┬──► Builder   (코드 · 테스트 · 실행)
                        ├──► Reviewer  (디버깅 · 원인 진단 · 교차 검토 / 다른 모델)
                        └──► Scribe    (기록 · 요약 · 시각화 / 경량 모델 가능)
```

| 역할 | 담당 | 모델 기준 |
|---|---|---|
| **Orchestrator** | 사용자와 직접 대화, 작업 분배·지시·검수·재지시, 예정 밖 즉흥 요청 직접 처리 | 메인 세션 모델 |
| **Reviewer** | 디버깅, 원인 진단, 설계·코드·실험 결과 교차 검토 | **오케스트레이터와 다른 모델** |
| **Builder** | 코드(`src/`), 테스트(`tests/`), 계획된 실험·성능측정(`experiments/`) 실행 | 코딩 성능이 높은 모델 |
| **Scribe** | `issues/` RAW 기록, `experiments/` 요약, `plan/status.md`·`README.md`·`*_guide.md` 갱신, `showcase/` 시각화 | 경량·고속 모델 가능 |

- 각 역할이 읽어야 할 구체적 문서·파일은 오케스트레이터가 작업 지시 시 3절 라우팅을 참고해 필요한 것만 넘긴다.
- **실제 모델명 매핑**(어떤 모델이 Orchestrator·Reviewer·Builder·Scribe인지)은 이 문서에 고정하지 않고 **`AGENTS.md`**에서 다룬다. 별도 포맷이 필요한 툴(예: Claude Code의 `.claude/agents/*.md` YAML frontmatter, `CLAUDE.md`의 `@AGENTS.md`)만 필요 시 얇게 추가한다.
- `Reviewer`는 추정 대신 코드·로그·문서 근거로 진단하고, `Scribe`는 RAW에 없는 수치를 지어내지 않는다.

---

## 5. 공통 보호 원칙 (모든 역할)

- **읽기 전용**: `docs/reference/`와 `reference_repo/`는 원본 참고 자료이므로 임의로 수정하지 않는다.
- **보안 (`local/`)**: `local/*`는 `.gitignore` 대상(`!local/.env.example`만 예외). 실제 API 키·토큰·개인 경로를 문서, 로그, 커밋, `showcase/`에 복사하거나 출력하지 않는다.
- **사전 확인**: 패키지 설치, 외부 다운로드, 삭제, 대규모 실행은 사용자 확인 후 진행한다. 특히 사용자가 규모를 모를 수 있으므로 **1GB 이상의 무거운 패키지·파일을 다루거나 RAM·디스크(HDD/SSD)에 부담이 되는 작업**은 예상 용량과 부담을 미리 알리고 확인받는다.

---

## 6. 새 프로젝트에 재사용할 때 체크리스트

1. `AGENTS.md`, `docs/workspace_guide.md`, `experiments/_template.md`, `issues/_template.md`, `.gitignore`를 그대로 복사한다.
2. `AGENTS.md` 하단의 `## Project-Specific`만 새 프로젝트에 맞게 교체한다.
3. `docs/direction.md`, `architecture.md`, `experiment_design.md`, `setup.md`, `reference_guide.md`, `plan/status.md`, `reference_repo/reference_repo_guide.md`, `README.md`를 새 프로젝트 내용으로 채운다.
