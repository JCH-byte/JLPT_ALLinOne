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

## N4 day11+ 비활성화 정책
- `n4` 레벨은 운영 정책상 Day 10까지만 제공합니다.
- 빌드 단계(`node scripts/build-data.js`)에서 `n4`의 Day 11 이상 데이터는 자동으로 제외됩니다.
- 따라서 `data/dist/n4/`에는 `day-1.json`~`day-10.json` 및 `index.json`만 존재해야 합니다.

