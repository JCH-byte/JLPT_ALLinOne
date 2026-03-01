#!/usr/bin/env node
/**
 * generate-module-vocab.js
 * 역할: content/modules/src/{level}-module-*.json + data/src/{level}.items.json
 *      → data/dist/{level}/module-vocab/{moduleId}.json (단어 목록)
 *      → data/dist/{level}/index.json (새 모듈 구조)
 *
 * 대상 레벨: n4, n3, n2, n1  (n5는 변경 없음)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEVELS = ['n4', 'n3', 'n2', 'n1'];

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function processLevel(level) {
    // 1. 단어 아이템 맵 로드 (id → item)
    const itemsPath = path.join(ROOT, 'data/src', `${level}.items.json`);
    const itemsData = loadJson(itemsPath);
    const itemsMap = {};
    for (const item of itemsData.items) {
        itemsMap[item.id] = item;
    }

    // 2. 모듈 src 파일 목록 수집 (번호 순 정렬)
    const srcDir = path.join(ROOT, 'content/modules/src');
    const moduleFiles = fs.readdirSync(srcDir)
        .filter(f => f.startsWith(`${level}-module-`) && f.endsWith('.json'))
        .sort();

    if (moduleFiles.length === 0) {
        console.warn(`[${level.toUpperCase()}] 모듈 파일 없음 — 건너뜀`);
        return;
    }

    // 3. 출력 디렉토리 준비
    const levelDir = path.join(ROOT, 'data/dist', level);
    const moduleVocabDir = path.join(levelDir, 'module-vocab');
    if (!fs.existsSync(moduleVocabDir)) {
        fs.mkdirSync(moduleVocabDir, { recursive: true });
    }

    // 4. 모듈별 처리
    const modulesObj = {};
    const moduleToDay = {};   // moduleSeq 값 사용 (dashboard.js 정렬용)
    const moduleToFile = {};  // module-vocab 파일 경로 (직접 로딩용)

    let missingIds = 0;

    moduleFiles.forEach((file, idx) => {
        const moduleSeq = idx + 1;
        const modData = loadJson(path.join(srcDir, file));
        const moduleId = modData.moduleId;
        const levelLabel = level.toUpperCase();
        const seqLabel = String(moduleSeq).padStart(3, '0');
        const title = `${levelLabel} 모듈 ${seqLabel}`;

        // vocabIds → 실제 단어 resolve
        const vocab = (modData.vocabIds || []).map(id => {
            const item = itemsMap[id];
            if (!item) {
                console.warn(`  [${level}] ID 없음: ${id} (${moduleId})`);
                missingIds++;
                return null;
            }
            return {
                word: item.word,
                read: item.read,
                mean: item.mean,
                tags: item.tags || [],
                moduleId,
                legacyDay: item.assignedDay || null
            };
        }).filter(Boolean);

        // module-vocab 파일 기록
        writeJson(path.join(moduleVocabDir, `${moduleId}.json`), {
            title,
            moduleId,
            vocab
        });

        // index 엔트리
        modulesObj[moduleId] = {
            moduleId,
            level,
            title,
            moduleSeq,
            vocabCount: vocab.length
        };
        moduleToDay[moduleId] = moduleSeq;
        moduleToFile[moduleId] = `module-vocab/${moduleId}`;
    });

    // 5. index.json 기록
    const indexData = {
        manifest: {
            assignmentVersion: 'module-vocab-v1',
            source: 'content/modules/src/',
            learningUnit: 'module'
        },
        modules: modulesObj,
        days: {},         // 빈 객체: filterIndexByExistingDayFiles를 통과시키기 위함
        dayToModule: {},
        moduleToDay,
        moduleToFile
    };
    writeJson(path.join(levelDir, 'index.json'), indexData);

    const missing = missingIds > 0 ? ` (ID 불일치: ${missingIds}개)` : '';
    console.log(`[${level.toUpperCase()}] ${moduleFiles.length}개 모듈 생성 완료${missing}`);
}

console.log('=== generate-module-vocab.js 시작 ===\n');
for (const level of LEVELS) {
    processLevel(level);
}
console.log('\n완료!');
