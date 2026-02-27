#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const srcDir = path.join(repoRoot, 'data', 'src');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(base, patch) {
    const result = { ...base };
    Object.keys(patch).forEach(key => {
        const baseValue = result[key];
        const patchValue = patch[key];
        if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
            result[key] = mergeObjects(baseValue, patchValue);
            return;
        }
        result[key] = patchValue;
    });
    return result;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertValidPatch(patch) {
    if (!isPlainObject(patch)) {
        throw new Error('Patch는 object(JSON)여야 합니다.');
    }

    const { level, day, data } = patch;
    if (!/^n[1-5]$/.test(String(level || ''))) {
        throw new Error('patch.level은 n1~n5 중 하나여야 합니다.');
    }
    const numericDay = Number(day);
    if (!Number.isInteger(numericDay) || numericDay < 1) {
        throw new Error('patch.day는 1 이상의 정수여야 합니다.');
    }
    if (!isPlainObject(data)) {
        throw new Error('patch.data는 object여야 합니다.');
    }

    return { level, day: numericDay, data };
}

function runBuildCheck() {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'build-data.js'), '--check'], {
        cwd: repoRoot,
        stdio: 'inherit'
    });

    if (result.status !== 0) {
        throw new Error('data/dist 동기화 검증 실패: node scripts/build-data.js --check');
    }
}

function main() {
    const patchPathArg = process.argv[2];
    if (!patchPathArg) {
        throw new Error('사용법: node scripts/apply-day-patch.js <patch.json>');
    }

    const patchPath = path.resolve(process.cwd(), patchPathArg);
    if (!fs.existsSync(patchPath)) {
        throw new Error(`Patch 파일을 찾을 수 없습니다: ${patchPath}`);
    }

    const patch = assertValidPatch(loadJson(patchPath));
    const srcPath = path.join(srcDir, `${patch.level}.json`);

    if (!fs.existsSync(srcPath)) {
        throw new Error(`원천 파일이 없습니다: data/src/${patch.level}.json`);
    }

    const source = loadJson(srcPath);
    if (!isPlainObject(source)) {
        throw new Error(`원천 파일 형식 오류: data/src/${patch.level}.json (top-level object 필요)`);
    }

    const dayKey = String(patch.day);
    const beforeContent = fs.readFileSync(srcPath, 'utf8');
    const existingDayData = isPlainObject(source[dayKey]) ? source[dayKey] : {};
    source[dayKey] = mergeObjects(existingDayData, patch.data);

    const nextContent = `${JSON.stringify(source, null, 4)}\n`;
    const tempPath = `${srcPath}.tmp`;
    fs.writeFileSync(tempPath, nextContent, 'utf8');
    fs.renameSync(tempPath, srcPath);

    try {
        runBuildCheck();
    } catch (error) {
        fs.writeFileSync(srcPath, beforeContent, 'utf8');
        throw error;
    }

    console.log(`✅ Applied patch to data/src/${patch.level}.json (day ${patch.day})`);
    console.log('✅ Verified dist sync via node scripts/build-data.js --check');
}

try {
    main();
} catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
}
