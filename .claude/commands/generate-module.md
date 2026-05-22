---
description: JLPT 학습 모듈 콘텐츠(title/story/analysis/quiz) 생성 — dist 모듈 vocab 활용, ruby 자동 검증, 자가수정 빌드 루프로 src 파일 채움
argument-hint: <level> <selector>
---

# /generate-module

**입력 형식:** `/generate-module <level> <selector>`

- `<level>` ∈ `n1` | `n2` | `n3` | `n4`. **N5는 항상 거부**(이미 콘텐츠 있음).
- `<selector>` ∈
  - `4` — ordinal 4 모듈 1개
  - `4-8` — ordinal 4~8 범위 (최대 5개)
  - `next` — 빈 모듈 중 ordinal 가장 작은 1개 (기본 단일)
  - `next 5` — 빈 모듈 중 ordinal 가장 작은 5개
  - `list` — 해당 레벨의 빈 모듈 ID 목록만 출력 (생성 안 함)

## 사전 검사

1. **dist 동기화 강제**: `node scripts/build-data.js --check` 실행.
   - exit 0이면 통과. 실패(stale)면 `node scripts/build-data.js` 실행해서 동기화 후 진행.
   - 이유: dist index의 `hasContent`는 src 기준으로 계산되므로, build가 한 번이라도 누락되면 `next`/`list` 셀렉터가 잘못된 모듈을 선택할 수 있다.
2. `<level>` 파싱. n5면 즉시 거부.
3. `<selector>` 파싱:
   - `list`면 `node -e "..."` 로 `data/dist/<level>/index.json` 읽어 `hasContent === false`인 moduleId 출력 후 종료.
   - 숫자 단일 또는 범위면 해당 ordinal의 moduleId 결정 (`<level>-module-<NNN>` 형식, 0-pad 3).
   - `next [N]`면 빈 모듈 중 ordinal 오름차순 N개 (기본 1).
4. 대상 모듈 N개가 **6개 이상**이면 사용자에게 확인 후 5개로 잘라서 진행.

## Per-module 생성 워크플로

### Step 1. 입력 자산 수집

다음 파일들을 Read tool로 읽음:

| 파일 | 용도 | 크기 |
|------|------|------|
| `data/dist/<level>/modules/<moduleId>.json` | **vocab 포함** (story/analysis/quiz는 무시) | ~4KB |
| `content/modules/rules/<level>-module-default.json` | 룰 | ~1KB |
| `JLPT_Template_Prompt_N3.txt` | 레벨별 spec — **첫 모듈에서만 읽음** | ~5KB |

> ⚠️ `data/src/<level>/vocab.json` (300KB+)은 읽지 않는다.  
> dist 모듈 파일의 `vocab` 배열이 이미 해당 모듈의 단어를 정확히 포함하고 있음.  
> `content/modules/notebooklm-inputs/` 파일도 읽지 않는다 (레벨에 따라 존재하지 않음).

vocab 목록 = dist 모듈의 `vocab` 배열 (word / read / mean / tags).

---

### Step 1.5. 테마 결정

vocab 목록을 의미 그룹으로 파악하고 스토리 테마를 정한다.

**그룹화 기준 (우선순위 순):**
1. **장소·시설 단어** → 해당 공간을 주배경으로
2. **직업·역할 단어** → 그 직업인의 하루
3. **감정·심리 단어** → 인물의 감정 변화 중심
4. **행위·행동 단어** → 특정 상황(여행, 학교, 직장 등)

vocab 25개 중 가장 많이 속하는 그룹을 배경 테마로 선택.  
테마를 title에 반영하고 story 전체를 해당 테마로 통일.

---

### Step 2. 콘텐츠 생성

Claude가 직접 다음을 생성:

#### title
- 한국어 15자 이내. 형식 `"<LEVEL>: <주제>"` (예: `"N3: 회사 생활과 인간관계"`).
- Step 1.5에서 결정한 테마 반영.

#### story (HTML 문자열)
- 레벨별 장면 수의 `<h3>Scene N. 일본어제목（한국어제목）</h3>` 섹션.
- 장면마다 `<p>...</p>` 4-6 문장.
- **모든 한자에 `<ruby>漢字<rt>よみ</rt></ruby>` 필수** — 누락 시 자동 검증에서 즉시 실패.
- 룰의 `grammarTargets` 적극 활용.
- 총 story 글자 수(plain text 기준) ≤ `maxChars × 장면수` (예: N3는 220 × 4 = 880자).
- 일상적 상황 배경, 자연스러운 일본어.
- vocab의 **80% 이상**이 story 본문에 등장해야 함.

**ruby 누락 주의 체크리스트 — story 완성 후 반드시 확인:**

룰 파일의 `storyRubyReminder`에 나열된 단독 한자들을 특히 주의.  
아래 한자가 `<ruby>` 블록 **바깥**에 있으면 검증 실패:

```
言 見 出 来 話 行 思 書 読 聞 合 入 取 作 開 知 使 切 持 考 会 年 月 日 時 人 子
```

흔한 실수 예시:
- `と言います` → `と<ruby>言<rt>い</rt></ruby>います` ✅
- `を言いました` → `を<ruby>言<rt>い</rt></ruby>いました` ✅
- `思い出` → `<ruby>思<rt>おも</rt></ruby>い<ruby>出<rt>で</rt></ruby>` ✅
- `話し合い` → `<ruby>話<rt>はな</rt></ruby>し<ruby>合<rt>あ</rt></ruby>い` ✅

**ruby 검사는 `<h3>` 제목 안과 `analysis[].sent` 안의 한자도 포함한다.**
- H3 예: `<h3>Scene 1. <ruby>音楽<rt>おんがく</rt></ruby>（음악）</h3>` — 일본어 제목 부분의 한자에도 모두 ruby 필수.
- `(괄호 안 한국어)`는 한자가 아니므로 ruby 불필요.

#### analysis (16~20개, 레벨별 범위 준수)

각 항목 형식:
```json
{
  "sent": "<ruby>...</ruby> 문장 (ruby 태그 포함)",
  "trans": "한국어 번역",
  "grammar": "〜패턴명 — 한국어 설명 (사용 조건)",
  "tags": ["등장 vocab word"]
}
```

`grammar` 필드 포맷: **`〜패턴명 — 설명 (조건)`**  
예: `〜ことになる — '~하게 되다', 결정·상황의 자연스러운 귀결을 나타냄`

#### quiz (정확히 10개)

구성: 읽기(よみ) 4 + 의미 3 + 문장완성 3.  
각 항목:
```json
{
  "q": "일본어 질문",
  "opt": ["A", "B", "C", "D"],
  "ans": 0,
  "comment": "한국어 해설 (정답 어휘의 의미·사용법)"
}
```

---

### Step 3. src 저장 + 사전 검사 (ruby + vocab)

1. 기존 src 파일의 모든 필드를 보존하면서 `title`/`story`/`analysis`/`quiz`만 갱신해서 Write.  
   **`moduleId`/`level`/`ordinal`/`ruleVersion`/`vocabIds` 절대 변경 금지.**  
   JSON 직렬화: 들여쓰기 2 스페이스 + 끝 줄바꿈 1개.

2. 저장 직후 **사전 검사 2개**를 실행 (빌드 없이 빠르게):
   ```bash
   node scripts/check-ruby.js <level> <moduleId>    # story + analysis[].sent 의 ruby 누락 검사
   node scripts/check-vocab.js <level> <moduleId>   # vocab word 80%+ 등장 검사
   ```
   - 둘 다 PASS이면 Step 4로.
   - 어느 하나라도 FAIL이면 src 파일의 해당 필드(story 또는 analysis)만 수정 후 재저장 → 재검사. 빌드 없이 빠르게 반복.

---

### Step 4. 빌드 + 검증

```bash
node scripts/build-data.js
node scripts/build-data.js --check
node scripts/validate-module.js <level> <moduleId>
```

3개 모두 exit 0이면 PASS → Step 6.

---

### Step 5. 자가 수정 루프 (최대 3회)

검증 실패 시 `validate-module.js` stderr 메시지를 읽고 src의 해당 필드만 수정 후 Step 3부터 재실행.  
횟수 카운트 누적.

- **3회 실패**면 이 모듈 건너뛰고 보고서에 기록.

---

### Step 6. 다음 모듈로

루프 종료 조건: 대상 리스트 다 처리.

---

## 보고서 (마지막에 한 번)

```
=== /generate-module 결과 ===
성공: N개
  - n3-module-005 (자가수정 0회)
  - n3-module-006 (ruby 재저장 1회, 자가수정 0회)
스킵: M개
  - n3-module-007: SKIP (3회 자가수정 실패: 사유)

다음 단계:
  - GitHub Desktop으로 변경 검토 후 push
  - 추가 생성: /generate-module <level> next 5
```

git/push는 **자동화하지 않는다.** 사용자가 GitHub Desktop으로 직접.

## 레벨별 spec 요약

| 레벨 | 장면 수 | analysis 범위 | story 총 글자 상한 |
|------|--------|--------------|-----------------|
| N4   | 4장면  | 15–18개      | 800자 (200×4)   |
| N3   | 4장면  | 16–20개      | 880자 (220×4)   |
| N2   | 5장면  | 18–22개      | 1250자 (250×5)  |
| N1   | 5장면  | 20–25개      | 1400자 (280×5)  |

## 금지 사항

- `data/dist/**` 직접 편집 금지 (빌드로만).
- `data/src/<level>/vocab.json` 직접 읽기 금지 (너무 큼, dist 모듈 사용).
- `vocabIds` 변경 금지.
- `moduleId/level/ordinal/ruleVersion` 변경 금지.
- 자가 수정 루프 3회 초과 금지.
- N5 대상 작업 금지.
- git/gh 명령 실행 금지.
