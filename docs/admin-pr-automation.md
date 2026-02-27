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
  "author": "kim.dev",
  "changeSummary": "Day 3 quiz 오타 수정",
  "validationReport": "overall: PASS\n...",
  "checklist": { "passed": true, "checks": [], "metrics": {} }
}
```

핵심 필수값은 `level/day/version/dataHash/data`이며, PR 본문 강화를 위해 `author/changeSummary/validationReport`를 함께 보냅니다.

## 2) 서버(Cloud Functions/GitHub App 백엔드) 처리 순서

샘플 구현: `functions/create-content-pr.js`

1. payload 검증 및 `dataHash` 재계산 검증
2. `data/src/n{level}.json`의 해당 `day` 갱신
3. `node scripts/build-data.js` 실행으로 `data/dist/{level}/index.json`, `day-*.json` 재생성
4. 변경 브랜치 생성 → commit → push
5. GitHub Pull Request 자동 생성

## 3) PR 본문 컨텍스트

서버는 PR 본문에 다음 섹션을 포함해야 합니다.

- `author`
- `changeSummary`
- `validation-report`

리뷰어가 별도 추적 없이 변경 배경과 검증 결과를 즉시 볼 수 있도록 구성합니다.

## 4) 엔드포인트/환경변수 예시

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

## 5) Admin UI 동작

- endpoint 입력값은 localStorage(`JLPT_DEV_DATA_OVERRIDE__PR_ENDPOINT`)에 저장됩니다.
- PR 성공 시 URL이 배포 로그와 PR 결과 패널에 저장/표시됩니다.
- 이로써 기존의 "다운로드 → 수동 업로드" 단계를 제거할 수 있습니다.
