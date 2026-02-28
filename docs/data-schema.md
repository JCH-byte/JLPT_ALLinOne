# 데이터 스키마 명세 (Module/Item 전환안)

이 문서는 `Day` 중심 데이터 구조를 `Module/Item` 구조로 전환하기 위한 **최종 스키마 초안**입니다.
전환기에는 레거시 `day` 데이터와 병행 운영하며, 본 문서의 규칙을 승인 게이트로 사용합니다.

## 0) 문서 승인 게이트

- 본 문서(스키마) 리뷰/승인 전에는 다음 작업을 **진행하지 않습니다**.
  - 생성기(generator) 로직 변경
  - 빌드(build) 로직 변경
  - 검증(validation/lint) 로직 변경
- 승인 이후에만 아래 작업을 시작합니다.
  - Admin 입력 스키마/폼 변경
  - 빌드 파이프라인 반영
  - 검증 규칙 반영

---

## 학습 단위 원칙

- 학습 단위는 `module`을 기본으로 사용합니다.
- `day` 필드는 신규 진입 단위가 아니며 레거시 호환을 위한 보조 식별자(`legacyDay`)로만 유지합니다.
- Viewer 및 Dashboard UI 진입 경로는 `moduleId`를 기준으로 구성하고, 필요 시에만 `legacyDay`를 fallback으로 사용합니다.

---

## 1) 최상위 스키마

### 1.0 원천 데이터 원칙 (신규)

- `vocab item`이 원천 데이터(source of truth)입니다.
- `day`는 원천 데이터가 아니라, `vocab item`의 힌트(`assignedDay`, `dayHint`)를 이용해 생성되는 **파생 뷰**입니다.
- 신규 입력/수정은 `item` 단위로만 수행하고, `day` 단위 편집은 금지합니다.
- `id`는 사람이 수동 수정하지 않는 안정 식별자(stable ID)여야 하며, UUID 또는 해시 기반 규칙으로 고정합니다.

- 타입: `object`
- 권장 키
  - `version`: `string` (예: `"2.0"`)
  - `modules`: `array<Module>`
- 전환기 호환 키
  - `days`: `object` (레거시 Day 맵; 구형 데이터 로드용)

```json
{
  "version": "2.0",
  "modules": [
    {
      "moduleId": "n3-001",
      "title": "N3 문법/어휘 모듈 1",
      "vocabIds": ["v-1001", "v-1002"],
      "generationRules": {
        "quizTypes": ["meaning-choice", "reading-choice"],
        "itemCount": 20
      },
      "constraints": {
        "jlptLevel": "N3",
        "maxNewItemsPerSet": 10
      },
      "items": [
        {
          "itemId": "i-0001",
          "type": "vocab",
          "payload": {
            "word": "準備",
            "read": "じゅんび",
            "mean": "준비"
          },
          "legacyDay": "12",
          "dayIndex": 3
        }
      ]
    }
  ],
  "days": {
    "12": {
      "title": "Day 12",
      "vocab": []
    }
  }
}
```

---

## 2) Module 스키마

### 2.1 필수 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `moduleId` | `string` | 모듈 고유 ID (전역 유일) |
| `vocabIds` | `array<string>` | 모듈이 참조하는 어휘 ID 목록 |
| `generationRules` | `object` | 문제/세트 생성 규칙 |
| `constraints` | `object` | 생성/구성 시 강제 제약 |

### 2.2 선택 필드

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `title` | `string` | `""` | 모듈 표시명 |
| `description` | `string` | `""` | 모듈 설명 |
| `items` | `array<Item>` | `[]` | 모듈에 포함된 항목 |
| `tags` | `array<string>` | `[]` | 검색/분류 태그 |
| `metadata` | `object` | `{}` | 확장 메타데이터 (`batchProvenance` 포함) |
| `isActive` | `boolean` | `true` | 노출/활성 여부 |

### 2.3 `generationRules` 세부(초안)

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `quizTypes` | `array<string>` | 필수 | 허용 퀴즈 타입 목록 |
| `itemCount` | `number` | 필수 | 생성 목표 문항 수 |
| `difficulty` | `string` | 선택 | 난이도 힌트 (`easy/normal/hard`) |
| `shuffle` | `boolean` | 선택 | 셔플 여부 |

### 2.4 `constraints` 세부(초안)

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `jlptLevel` | `string` | 필수 | 대상 레벨 (`N5`~`N1`) |
| `maxNewItemsPerSet` | `number` | 필수 | 세트당 신규 항목 상한 |
| `allowDuplicates` | `boolean` | 선택 | 중복 허용 여부 |
| `forbiddenTags` | `array<string>` | 선택 | 제외 태그 목록 |

### 2.5 `generationBatches` 세부(신규)

모듈 내부 생성 단위는 `generation batch`를 기본 단위로 사용합니다.
각 배치는 **20~25개 단어 묶음**을 목표로 하며(말단 배치는 예외 허용), NotebookLM 산출물 검수/병합 기준 단위로 사용합니다.

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `batchId` | `string` | 필수 | 배치 고유 식별자(모듈 내 유일) |
| `vocabIds` | `array<string>` | 필수 | 해당 배치의 단어 ID 묶음(목표 20~25개) |
| `promptTemplateVersion` | `string` | 필수 | NotebookLM 프롬프트 템플릿 버전 |
| `constraints` | `object` | 필수 | 배치 단위 생성 제약(레벨/금지어/길이 등) |

추가 규칙:
- 모듈 `vocabIds`는 `generationBatches[*].vocabIds`의 합집합과 일치해야 합니다.
- 배치 간 `vocabIds` 중복은 금지합니다.
- NotebookLM 산출물(`paragraphs/sentences/quizzes`)은 배치 단위 검수(`reviewed=true`) 후에만 모듈 `items`로 병합합니다.

---

## 3) Item 스키마

### 3.1 필수 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `itemId` | `string` | 항목 고유 ID |
| `type` | `string` | 항목 타입 (`vocab`, `quiz`, `reading` 등) |
| `payload` | `object` | 타입별 실제 데이터 본문 |

### 3.2 선택 필드

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `title` | `string` | `""` | 항목 제목 |
| `tags` | `array<string>` | `[]` | 항목 태그 |
| `difficulty` | `string` | `"normal"` | 항목 난이도 |
| `source` | `string` | `""` | 출처/생성 근거 |
| `metadata` | `object` | `{}` | 확장 정보 |

### 3.3 전환기 레거시 호환 필드 (고정)

아래 2개 필드는 **전환기 동안 명시적으로 유지**합니다.

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `legacyDay` | `string \| number` | 선택(전환기 권장) | 원본 Day 식별자 |
| `dayIndex` | `number` | 선택(전환기 권장) | Day 내부 순번(0-based) |

전환기 규칙:
- 신규 데이터는 `moduleId`/`itemId` 체계를 우선 사용합니다.
- 레거시 소스에서 마이그레이션된 항목은 `legacyDay`, `dayIndex`를 함께 기록합니다.
- `legacyDay`, `dayIndex`는 조회/추적 및 롤백 확인용이며, 전환 완료 후 제거 여부를 별도 RFC로 결정합니다.

---

## 4) Day 레거시 호환 스키마(유지)

기존 Day 구조는 전환기 동안 읽기 호환을 위해 유지합니다.

### 4.1 Day

| 필드 | 타입 | 필수 여부 | 기본값 | 설명 |
|---|---|---|---|---|
| `title` | `string` | 선택 | `Day {day} 단어장` | Day 제목 |
| `story` | `string \| null` | 선택 | `null` | 지문/스토리 |
| `analysis` | `array` | 선택 | `[]` | 분석 블록 배열 |
| `vocab` | `array<VocabItem>` | 선택 | `[]` | 단어 목록 |
| `quiz` | `array<QuizItem>` | 선택 | `[]` | 퀴즈 목록 |

### 4.2 VocabItem

| 필드 | 타입 | 필수 여부 | 기본값 | 비고 |
|---|---|---|---|---|
| `word` | `string` | 필수 | `""` | 표제어 |
| `read` | `string` | 필수 | `""` | 읽기 |
| `mean` | `string` | 필수 | `""` | 의미 |
| `tags` | `array` | 선택 | `[]` | 태그 |

입력 별칭:
- `reading` → `read`
- `meaning` → `mean`

### 4.3 QuizItem

| 필드 | 타입 | 필수 여부 | 기본값 | 비고 |
|---|---|---|---|---|
| `q` | `string` | 필수 | `""` | 문제 문장 |
| `opt` | `array` | 필수 | `[]` | 보기 목록 |
| `ans` | `number \| string` | 필수 | `""` | 정답 인덱스 또는 문자열 |
| `comment` | `string` | 선택 | `""` | 해설 |

입력 별칭:
- `question` → `q`
- `options` → `opt`

---

## 5) 검증 원칙 (문서 승인 이후 구현)

- 필수/선택 필드는 본 문서를 단일 기준(source of truth)으로 삼습니다.
- 키 별칭 정규화 이후 필수 필드 누락 여부를 판단합니다.
- 누락 항목은 위치 포함 경고로 수집합니다.
- generation batch 검증에서 `vocabIds`의 배치 간 중복/누락을 자동 점검합니다.
- 모듈 빌드 산출물에는 `metadata.batchProvenance`로 각 item의 생성 배치 ID를 기록합니다.
- 단, 본 섹션 구현(생성기/빌드/검증 코드 반영)은 **문서 승인 이후**에만 착수합니다.
