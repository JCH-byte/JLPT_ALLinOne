# JLPT 데이터 관리 규칙

## 단일 원천 포맷
- 원천 데이터는 `data/src/n{1..5}.json`만 수정합니다.
- `data/dist/{level}/index.json`, `data/dist/{level}/day-{n}.json`은 배포/런타임용 **생성물**입니다.

## 빌드
```bash
node scripts/build-data.js
```

## 검증(동기화 확인)
```bash
node scripts/build-data.js --check
```

> 규칙: **수정은 src만, dist는 생성물**

## pre-commit 훅(선택)
리포지토리 훅 경로를 설정하면 커밋 전에 자동으로 dist를 재생성/검증합니다.

```bash
git config core.hooksPath .githooks
```

## N4 공개 범위 정책(환경별)
- `n4` 레벨 공개 범위는 `N4_MAX_DAY` 환경변수로 제어합니다.
- 기본값은 `28`이며, 설정하지 않으면 Day 28까지 생성됩니다.
- `N4_MAX_DAY`는 `1`~`28` 정수만 허용됩니다.

### N4 Day 11+ 콘텐츠 정책
- Day 11 이후는 환각 리스크를 줄이기 위해 **vocab만 공개**합니다.
- `story`는 `null`, `analysis`와 `quiz`는 빈 배열로 생성됩니다.
- Day 1~10은 기존처럼 전체 콘텐츠(`title/story/analysis/vocab/quiz`)를 생성합니다.

## 배포 체크리스트
- 배포 환경의 `N4_MAX_DAY` 값 확인(기본: `28`, 필요 시 축소).
- `node scripts/build-data.js --check` 실행으로 `data/src`와 `data/dist` 동기화 확인.
