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
4. 대상 모듈 N개가 **11개 이상**이면 사용자에게 확인 후 10개로 잘라서 진행.

## 다중 모듈 처리 (N ≥ 2): 서브에이전트 위임

대상 모듈이 **2개 이상**이면 메인 에이전트는 각 모듈을 `Agent` tool로 위임한다.  
이유: 모듈 1개당 컨텍스트에 누적되는 ruby HTML·analysis 문장이 매우 크기 때문.  
서브에이전트를 쓰면 메인 컨텍스트에는 "결과 한 줄"만 남아 모바일 환경에서도 안정적으로 동작한다.

**병렬 호출 OK**: 서브에이전트는 **src 파일 저장 + 사전 검사(check-module.js)까지만** 수행한다. 빌드와 validate-module은 메인이 모든 서브에이전트 완료 후 일괄 1회 실행한다 → build 스크립트 충돌 없음, 속도 3~4배.

**메인 에이전트 절차:**
1. 사전 검사(dist 동기화 + 모듈 목록 결정)는 메인이 직접 수행.
2. 프로젝트 루트를 동적으로 확인: `pwd` (Bash) 또는 `(Get-Location).Path` (PowerShell) 결과를 `{projectRoot}`로 사용.
3. 각 moduleId에 대해 **Agent tool을 병렬로** 호출 (단일 메시지 안에 여러 Agent 호출 블록 사용).
   **⚠️ N개를 한 번에 전부 동시 호출할 것 — 1개 먼저 실행 후 나머지를 별도 메시지로 호출하면 안 됨.**
   - `description`: `"Generate {level} {moduleId}"`
   - `prompt`: 아래 **서브에이전트 프롬프트 템플릿**을 변수 치환해서 사용.
4. 모든 서브에이전트 완료 대기 → 결과 한 줄씩 수집.
5. **메인이 일괄 빌드+검증**:
   ```bash
   node scripts/build-data.js
   node scripts/build-data.js --check
   # 각 성공 모듈에 대해 validate
   node scripts/validate-module.js <level> <moduleId>
   ```
6. validate-module 실패한 모듈은 직접 수정 또는 SKIP 처리 후 보고서 출력.

### 서브에이전트 프롬프트 템플릿

```
당신은 JLPT 학습 모듈 생성 에이전트입니다.
프로젝트 루트: {projectRoot}

먼저 `.claude/commands/generate-module.md`를 읽고,
**Per-module 생성 워크플로 Step 1~3** 만 실행하세요. (빌드/validate는 메인이 일괄 수행)

- level: {level}
- moduleId: {moduleId}

⚠️ Gemini CLI 호출 시 반드시 `gemini-3.1-pro-preview` 모델만 사용할 것.
다른 모델 ID(gemini-2.0-flash 등)는 품질 저하 또는 ModelNotFoundError 발생.
⚠️ Gemini CLI는 반드시 포그라운드(run_in_background=false)로 실행할 것.
백그라운드 실행 시 결과를 기다리지 않고 즉시 리턴되어 파일이 저장되지 않음.

## 자가수정을 유발하는 가장 흔한 실패 원인 (반드시 숙지)
1. **vocab 100% 누락** — dist 모듈의 vocab 배열 단어 중 1개라도 story에 없으면 즉시 실패.
   (활용형은 검증기가 자동 인정함 - 例: 動く가 story에 動いて로만 있어도 OK)
2. **h3 ruby 누락** — `<h3>` 태그 안 일본어 제목의 한자에도 `<ruby>` 필수.
   JSON 파싱 직후 인라인 검증(node -e)이 저장 전에 검출함. exit 1이면 파일 미저장 상태이므로
   Gemini 재호출 또는 Claude 직접 수정 후 재시도.

완료 후 마지막 응답은 아래 형식 한 줄로만:
성공: `{moduleId}: 성공 (자가수정 N회)` — 자가수정이 있었다면 사유도 괄호 안에 추가
  예) `n3-module-017: 성공 (자가수정 1회 — h3 ruby 누락 수정)`
실패: `{moduleId}: SKIP (사유)`
```

> N=1이면 서브에이전트 없이 메인 에이전트가 직접 Per-module 워크플로(Step 1~5)를 수행한다.

---

## Per-module 생성 워크플로

### Step 1. 입력 자산 수집

다음 파일들을 Read tool로 읽음:

| 파일 | 용도 | 크기 |
|------|------|------|
| `data/dist/<level>/modules/<moduleId>.json` | **vocab 포함** (story/analysis/quiz는 무시) | ~4KB |
| `content/modules/rules/<level>-module-default.json` | 룰 | ~1KB |

> ⚠️ `data/src/<level>/vocab.json` (300KB+)은 읽지 않는다.  
> dist 모듈 파일의 `vocab` 배열이 이미 해당 모듈의 단어를 정확히 포함하고 있음.  
> `content/modules/notebooklm-inputs/` 파일도 읽지 않는다 (레벨에 따라 존재하지 않음).  
> `JLPT_Template_Prompt_N3.txt`도 읽지 않는다 — 모든 spec은 이 스킬 파일에 내장되어 있음.

vocab 목록 = dist 모듈의 `vocab` 배열 (word / read / mean / tags).

**grammar 타겟 선택 (ordinal 기반 로테이션):**
룰 파일의 `grammarPool`이 있으면 `ordinal % pool.length` 인덱스로 grammar 페어를 선택. 없으면 fallback으로 `grammarTargets` 사용.

```js
const pool = rule.grammarPool;
const grammarPair = pool
  ? pool[(mod.ordinal - 1) % pool.length]
  : rule.grammarTargets;
// 예) ordinal=47, pool 12개 → index 46 % 12 = 10 → ["〜だけでなく", "〜はもちろん"]
```

이 페어를 Gemini 프롬프트의 "문법 타겟" 자리에 그대로 삽입한다.

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

### Step 2. 콘텐츠 생성 — Gemini CLI 위임 (우선)

Gemini CLI가 사용 가능한 환경이므로 생성은 Gemini에게 위임한다.  
Claude 직접 생성보다 토큰 ~80% 절감.

#### Gemini 호출

```bash
gemini -m gemini-3.1-pro-preview -p "$(cat <<'PROMPT'
당신은 JLPT N3 일본어 학습 자료를 만드는 전문 교육자입니다.
아래 vocab과 규칙에 따라 학습 모듈 콘텐츠를 JSON으로 생성하세요.

## vocab ({N}개)
{vocab을 "word(read):mean," 형식으로 나열}

## 생성 규칙

### title
한국어 15자 이내, 형식: "N3: 주제"

### story (HTML 문자열)
- 4개 장면: <h3>Scene N. 日本語タイトル（한국어）</h3>
- 장면당 <p>...</p> 4~6문장
- **모든 한자에 반드시 <ruby>漢字<rt>よみ</rt></ruby> 태그 필수**
- 특히 아래 단독 한자는 ruby 없이 절대 쓰지 말 것:
  言 見 出 来 話 行 思 書 読 聞 合 入 取 作 開 知 使 切 持 考 会 年 月 日 時 人 子
  예) と言います → と<ruby>言<rt>い</rt></ruby>います

### ⚠️ h3 제목 안 ruby 필수 (가장 흔한 실수)
<h3> 안의 일본어 제목에도 모든 한자에 ruby 필수:
✅ <h3>Scene 1. <ruby>新<rt>あたら</rt></ruby>しい<ruby>商店<rt>しょうてん</rt></ruby>（새로운 상점）</h3>
❌ <h3>Scene 1. 新しい商店（새로운 상점）</h3>  ← 이렇게 하면 검증 실패

- 문법 타겟 반드시 사용: {grammarPair[0]}, {grammarPair[1]}  ← Step 1에서 선택한 페어 삽입
- 장면당 plain text 220자 이하
- vocab 25개 **전부** story에 등장 (100% 필수)

### ⚠️ vocab 100% 자가검증 (출력 전 필수 — 이 단계를 건너뛰면 검증 실패)
story 완성 후 JSON 출력 전에 반드시 아래 순서로 확인하세요:
1. vocab 목록의 각 word를 순서대로 나열
2. 해당 단어(또는 직접 활용형)가 story HTML 어딘가에 있는지 한 줄씩 체크
3. 누락 단어가 있으면 가장 자연스러운 장면에 한 문장 추가 후 다시 체크
4. 모두 확인된 후에만 JSON 출력

**절대 누락 상태로 JSON을 출력하지 말 것. 한 단어라도 빠지면 빌드 검증에서 자동 실패.**

### analysis (16~20개)
⚠️ **grammar 필드 절대 누락 금지 — 모든 항목에 필수.**
형식: `{ "sent": "ruby 포함 문장", "trans": "한국어", "grammar": "〜패턴 — 설명 (조건)", "tags": ["vocab word"] }`
- grammar 예시: `"〜ことになる — '~하게 되다', 결정·상황의 자연스러운 귀결을 나타냄 (비의도적 결과)"`
- grammar가 빈 문자열이거나 필드 자체가 없으면 검증 실패.
- vocab이 없는 문장은 `"tags": []` (grammar는 여전히 필수)

### quiz (정확히 10개)
읽기(よみ) 4 + 의미 3 + 문장완성 3
{ "q": "질문", "opt": ["A","B","C","D"], "ans": 0~3, "comment": "한국어 해설" }

## 출력
**순수 JSON만. 마크다운 코드블록(\`\`\`) 없이.**
{ "title": "...", "story": "...", "analysis": [...], "quiz": [...] }
PROMPT
)" 2>&1
```

#### JSON 파싱 + 사전 검증 + src 저장

Gemini 출력은 **`tmp/gemini/{moduleId}.txt`**로 리다이렉트한다 (`tmp/`는 gitignore됨). 출력 앞에 경고 줄이 붙을 수 있으므로 첫 `{` 위치부터 파싱.  
**파일 쓰기 전** vocab 100% 및 h3 ruby를 인라인으로 검증해 불필요한 check 스크립트·빌드 호출을 방지한다.

```bash
mkdir -p tmp/gemini
gemini -m gemini-3.1-pro-preview -p "..." > tmp/gemini/{moduleId}.txt 2>&1

node -e "
const fs = require('fs');
const raw = fs.readFileSync('tmp/gemini/{moduleId}.txt', 'utf8');
const g = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const src = JSON.parse(fs.readFileSync('data/src/{level}/modules/{moduleId}.json', 'utf8'));

// ── 사전 검증 1: vocab 100% (활용형 포함) ────────────────
const storyText = g.story.replace(/<[^>]*>/g, '');
function getSearchCandidates(word) {
  const s = new Set([word]);
  const isH = c => c >= 'ぁ' && c <= 'ゖ';
  if (word.endsWith('する') && word.length > 2) { s.add(word.slice(0, -2)); return s; }
  if (isH(word.slice(-1))) { const stem = word.slice(0, -1); if (stem.length >= 1) s.add(stem); }
  return s;
}
const wordInText = (w, t) => [...getSearchCandidates(w)].some(c => t.includes(c));
const missing = src.vocab.map(v => v.word).filter(w => !wordInText(w, storyText));
if (missing.length > 0) { console.error('VOCAB_MISSING: ' + missing.join(', ')); process.exit(1); }

// ── 사전 검증 2: h3 안의 한자에 ruby 없는 경우 ───────────
const kanjiRe = /[一-鿿]/;
const h3s = g.story.match(/<h3>[\s\S]*?<\/h3>/g) || [];
for (const h3 of h3s) {
  const noRuby = h3.replace(/<ruby>[\s\S]*?<\/ruby>/g, '').replace(/<[^>]*>/g, '');
  if (kanjiRe.test(noRuby)) { console.error('H3_RUBY_MISSING: ' + h3.slice(0, 100)); process.exit(1); }
}

// ── 저장 ─────────────────────────────────────────────────
src.title = g.title; src.story = g.story; src.analysis = g.analysis; src.quiz = g.quiz;
fs.writeFileSync('data/src/{level}/modules/{moduleId}.json', JSON.stringify(src, null, 2) + '\n');
console.log('SAVED_OK');
"
```

- `SAVED_OK` 출력 → Step 3의 check 스크립트로 진행.
- `VOCAB_MISSING` 또는 `H3_RUBY_MISSING` exit 1 → **파일 미저장 상태**이므로 Gemini를 재호출하거나 Step 2-B로 폴백. check 스크립트·빌드 호출 불필요.

> Gemini 호출이 실패하거나 JSON 파싱 오류 시 → **Step 2-B**로 폴백.

---

### Step 2-B. 콘텐츠 생성 — Claude 직접 (폴백)

Gemini를 쓸 수 없을 때 Claude가 직접 다음을 생성:

#### title
- 한국어 15자 이내. 형식 `"<LEVEL>: <주제>"` (예: `"N3: 회사 생활과 인간관계"`).
- Step 1.5에서 결정한 테마 반영.

#### story (HTML 문자열)
- 레벨별 장면 수의 `<h3>Scene N. 일본어제목（한국어제목）</h3>` 섹션.
- 장면마다 `<p>...</p>` 4-6 문장.
- **모든 한자에 `<ruby>漢字<rt>よみ</rt></ruby>` 필수** — 누락 시 자동 검증에서 즉시 실패.
- 룰의 `grammarTargets` 적극 활용.
- 총 story 글자 수(plain text 기준) ≤ `maxChars × 장면수` (예: N3는 220 × 4 = 880자). **`validate-module.js`가 자동으로 검사함 — 초과 시 빌드 검증 단계에서 실패.**
- 일상적 상황 배경, 자연스러운 일본어.
- vocab **전부(100%)**가 story 본문에 등장해야 함.

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

> `tags`: 해당 문장에 vocab word가 직접 등장하지 않으면 빈 배열 `[]` 허용. 억지로 채우지 말 것.

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

### Step 3. src 저장 + 사전 검사 (ruby + vocab 통합)

1. 기존 src 파일의 모든 필드를 보존하면서 `title`/`story`/`analysis`/`quiz`만 갱신해서 Write.  
   **`moduleId`/`level`/`ordinal`/`ruleVersion`/`vocabIds` 절대 변경 금지.**  
   JSON 직렬화: 들여쓰기 2 스페이스 + 끝 줄바꿈 1개.

2. 저장 직후 **통합 검사 1회 호출** (ruby + vocab 동시):
   ```bash
   node scripts/check-module.js <level> <moduleId>
   ```
   - PASS이면 서브에이전트 작업 종료 (메인이 빌드/validate 처리).
   - FAIL이면 stderr 메시지를 읽고 src의 해당 필드(story 또는 analysis)만 수정 후 재저장 → 재검사. 빌드 없이 빠르게 반복 (최대 3회).
   - 출력에 "stem 매칭" 줄이 있으면 활용형으로 통과한 것 — 정상.

---

### Step 4. 빌드 + 검증 (메인 에이전트가 일괄 실행)

다중 모듈에서는 **모든 서브에이전트가 Step 3까지 완료된 후** 메인이 한 번만:
```bash
node scripts/build-data.js
node scripts/build-data.js --check
# 각 성공 모듈에 대해
node scripts/validate-module.js <level> <moduleId>
```
단일 모듈(N=1)에서는 메인이 직접 Step 1~3 후 이 빌드 단계까지 수행.

---

### Step 5. 자가 수정 루프 (validate-module 실패 시 메인이 직접 수정, 최대 3회)

`validate-module.js` 실패한 모듈은 메인이 stderr 메시지를 읽고 src의 해당 필드만 수정 후 Step 4 재실행.  
- 빌드는 모듈 단위로 다시 돌릴 필요 없음 (전체 빌드 1회 유지).
- **3회 실패**면 해당 모듈 SKIP 처리.

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
- `JLPT_Template_Prompt_N3.txt` 읽기 금지 (레거시 파일, spec은 이 스킬에 내장됨).
- `vocabIds` 변경 금지.
- `moduleId/level/ordinal/ruleVersion` 변경 금지.
- 자가 수정 루프 3회 초과 금지.
- N5 대상 작업 금지.
- git/gh 명령 실행 금지.
- 서브에이전트 안에서 `build-data.js`/`validate-module.js` 호출 금지 (빌드는 메인이 일괄 1회). 병렬 호출 시 충돌 방지를 위함.
- Gemini 출력 파싱 시 `JSON.parse(raw)` 직접 호출 금지 — 앞에 경고 줄이 붙으므로 반드시 `raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)` 사용.
