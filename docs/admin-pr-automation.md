# Admin PR 자동화 가이드

`admin.html`의 **🪄 PR 생성** 버튼은 서버리스 엔드포인트로 payload를 전송하고, 서버가 자동으로 PR을 여는 플로우를 전제로 동작합니다.

## 1) 프론트엔드 요청 payload

Admin UI는 아래 payload를 `POST`로 전송합니다.

```json
{
  "level": "n4",
  "day": 3,
  "version": 12,
  "dataHash": "sha256...",
  "data": { "title": "...", "story": "...", "analysis": [], "vocab": [], "quiz": [] },
  "itemSource": [{ "id": "v-001", "word": "...", "assignedDay": 3 }],
  "dayDistribution": { "3": [{ "id": "v-001" }] },
  "author": "kim.dev",
  "changeSummary": "Day 3 quiz 오타 수정",
  "validationReport": "overall: PASS\n...",
  "checklist": { "passed": true, "checks": [], "metrics": {} }
}
```

핵심 필수값은 `level/day/version/dataHash/data/itemSource`이며, PR 본문 강화를 위해 `author/changeSummary/validationReport/checklist/dayDistribution`를 함께 보냅니다.

## 2) 서버(Cloud Functions/GitHub App 백엔드) 처리 순서

샘플 구현: `functions/create-content-pr.js`

1. payload 검증 및 `dataHash` 재계산 검증
2. 변경 브랜치 생성 (`automation/{level}-day-{day}-v{version}-{hash}`)
3. `data/src/n{level}.json`의 해당 `day` 갱신 + `data/src/n{level}.items.json` 업데이트
4. `node scripts/build-data.js` 실행으로 `data/dist/{level}/index.json`, `day-*.json` 재생성
5. commit → push
6. GitHub Pull Request 자동 생성

## 3) PR 본문 자동 첨부 컨텍스트

서버는 PR 본문에 다음 섹션을 포함합니다.

- `author`
- `changeSummary`
- `validation-report`
- `change-impact`
  - `changedItems`: 변경 item 수
  - `dayRebalancedCount`: 재배치 영향으로 day가 변경된 수

리뷰어가 별도 추적 없이 변경 배경, 영향도, 검증 결과를 즉시 볼 수 있도록 구성합니다.

## 4) CI 머지 게이트

`.github/workflows/verify-data-sync.yml`은 PR마다 `node scripts/build-data.js --check`를 실행합니다.

브랜치 보호 규칙(Repository settings)에서 **`Verify data dist sync / verify-data-sync`를 Required status check**로 설정하면, 해당 체크가 통과하지 않으면 merge가 차단됩니다.

## 5) 엔드포인트/환경변수 예시

`functions/create-content-pr.js` 기준:

- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BASE_BRANCH` (optional, default: `main`)
- `REPO_ROOT` (optional)

Cloud Functions 예시 라우팅:

```js
const functions = require('@google-cloud/functions-framework');
const { createContentPr } = require('./functions/create-content-pr');
functions.http('createContentPr', createContentPr);
```

## 6) Admin UI 동작

- endpoint 입력값은 localStorage(`JLPT_DEV_DATA_OVERRIDE__PR_ENDPOINT`)에 저장됩니다.
- PR 성공 시 URL/state/number를 배포 로그, 히스토리, PR 상태 패널에 저장/표시합니다.
- 이로써 기존의 "다운로드 → 수동 업로드" 단계를 제거하고 운영자가 GitHub 수작업 없이 진행할 수 있습니다.
