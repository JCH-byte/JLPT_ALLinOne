# 데이터 스키마 명세

이 문서는 `getMergedData` 및 데이터 린트(`scripts/lint-data.js`) 기준의 표준 스키마를 정의합니다.

## 1) Level 파일 최상위 스키마

- 타입: `object`
- 키: Day 번호 문자열 (`"1"`, `"2"`, ...)
- 값: `Day` 객체 또는 구형 호환을 위한 `vocab` 배열

### 구형 호환
- Day 값이 배열인 경우: 해당 배열은 `vocab`으로 간주됩니다.

## 2) Day 스키마

| 필드 | 타입 | 필수 여부 | 기본값 | 설명 |
|---|---|---|---|---|
| `title` | `string` | 선택 | `Day {day} 단어장` | Day 제목 |
| `story` | `string \| null` | 선택 | `null` | 지문/스토리 |
| `analysis` | `array` | 선택 | `[]` | 분석 블록 배열 |
| `vocab` | `array<VocabItem>` | 선택 | `[]` | 단어 목록 |
| `quiz` | `array<QuizItem>` | 선택 | `[]` | 퀴즈 목록 |

## 3) VocabItem 스키마

| 필드 | 타입 | 필수 여부 | 기본값 | 비고 |
|---|---|---|---|---|
| `word` | `string` | **필수** | `""` | 표제어 |
| `read` | `string` | **필수** | `""` | 읽기 |
| `mean` | `string` | **필수** | `""` | 의미 |
| `tags` | `array` | 선택 | `[]` | 태그 |

### Vocab 키 별칭(입력 허용)
- `reading` → `read`
- `meaning` → `mean`

## 4) QuizItem 스키마

| 필드 | 타입 | 필수 여부 | 기본값 | 비고 |
|---|---|---|---|---|
| `q` | `string` | **필수** | `""` | 문제 문장 |
| `opt` | `array` | **필수** | `[]` | 보기 목록 |
| `ans` | `number \| string` | **필수** | `""` | 정답 인덱스 또는 문자열 |
| `comment` | `string` | 선택 | `""` | 해설 |

### Quiz 키 별칭(입력 허용)
- `question` → `q`
- `options` → `opt`

## 5) 필수 필드 누락 처리 원칙

- 키 별칭 정규화 후 필수 필드 누락 여부를 판단합니다.
- 누락 항목은 `console.warn`으로 위치를 포함해 경고합니다.
  - 형식: `Day {day} vocab[{index}] ...`, `Day {day} quiz[{index}] ...`
- 뷰 렌더링 중 오류를 막기 위해 안전한 기본값으로 보정합니다.
