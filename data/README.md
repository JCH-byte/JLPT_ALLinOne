# JLPT 데이터 관리 규칙

## 단일 원천 포맷
- 원천 데이터는 `data/src/n{1..5}.json`만 수정합니다.
- `data/dist/n{1..5}_data.js`는 배포/런타임용 **생성물**입니다.

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
