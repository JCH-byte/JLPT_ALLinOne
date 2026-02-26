#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const levels = ['n1', 'n2', 'n3', 'n4', 'n5'];
const srcDir = path.join(__dirname, '..', 'data', 'src');
const distDir = path.join(__dirname, '..', 'data', 'dist');
const checkMode = process.argv.includes('--check');
const DEFAULT_N4_MAX_DAY = 28;
const MAX_DAY_LIMIT = 28;

function resolveN4MaxDay() {
    const configured = process.env.N4_MAX_DAY;
    if (!configured) return DEFAULT_N4_MAX_DAY;

    const parsed = Number(configured);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAY_LIMIT) {
        throw new Error(
            `Invalid N4_MAX_DAY: ${configured}. Expected an integer between 1 and ${MAX_DAY_LIMIT}.`
        );
    }

    return parsed;
}

const N4_MAX_DAY = resolveN4MaxDay();

function normalizeDay(day, dayData) {
    if (Array.isArray(dayData)) {
        return {
            title: `Day ${day} 단어장`,
            story: null,
            analysis: [],
            vocab: dayData,
            quiz: []
        };
    }

    return {
        title: dayData?.title || `Day ${day} 단어장`,
        story: dayData?.story || null,
        analysis: dayData?.analysis || [],
        vocab: dayData?.vocab || [],
        quiz: dayData?.quiz || []
    };
}

function normalizeForLevel(level, day, dayData) {
    const normalized = normalizeDay(day, dayData);

    // N4 Day 11+는 환각 리스크가 높은 story/analysis/quiz를 제외하고
    // 검증된 단어(vocab)만 공개한다.
    if (level === 'n4' && Number(day) > 10) {
        return {
            title: normalized.title,
            story: null,
            analysis: [],
            vocab: normalized.vocab,
            quiz: []
        };
    }

    return normalized;
}

function stableStringify(data) {
    return `${JSON.stringify(data, null, 4)}\n`;
}

function shouldIncludeDay(level, day) {
    const numericDay = Number(day);
    if (!Number.isFinite(numericDay)) return false;
    if (level === 'n4' && numericDay > N4_MAX_DAY) return false;
    return true;
}

function buildLevel(level) {
    const srcPath = path.join(srcDir, `${level}.json`);
    const levelDistDir = path.join(distDir, level);

    if (!fs.existsSync(srcPath)) {
        throw new Error(`Missing source file: data/src/${level}.json`);
    }

    const raw = fs.readFileSync(srcPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid source shape in data/src/${level}.json (top-level must be object)`);
    }

    const normalized = {};
    for (const [day, dayData] of Object.entries(parsed)) {
        normalized[day] = normalizeForLevel(level, day, dayData);
    }

    const expectedFiles = new Map();
    const indexData = {};

    Object.entries(normalized).forEach(([day, dayData]) => {
        if (!shouldIncludeDay(level, day)) return;
        const fileName = `day-${day}.json`;
        expectedFiles.set(fileName, stableStringify(dayData));
        indexData[day] = { title: dayData.title };
    });

    expectedFiles.set('index.json', stableStringify(indexData));


    const legacyDistPath = path.join(distDir, `${level}_data.js`);
    if (checkMode) {
        if (fs.existsSync(legacyDistPath)) {
            throw new Error(`Stale legacy file found: data/dist/${level}_data.js`);
        }
    } else {
        fs.rmSync(legacyDistPath, { force: true });
    }

    if (checkMode) {
        if (!fs.existsSync(levelDistDir)) {
            throw new Error(`Missing generated folder: data/dist/${level}`);
        }

        for (const [fileName, expected] of expectedFiles.entries()) {
            const filePath = path.join(levelDistDir, fileName);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Missing generated file: data/dist/${level}/${fileName}`);
            }
            const current = fs.readFileSync(filePath, 'utf8');
            if (current !== expected) {
                throw new Error(`Out-of-date file: data/dist/${level}/${fileName} (run: node scripts/build-data.js)`);
            }
        }

        const currentFiles = fs.readdirSync(levelDistDir).filter(name => name.endsWith('.json') || name.endsWith('.js'));
        const expectedNames = new Set(expectedFiles.keys());
        const staleFiles = currentFiles.filter(name => !expectedNames.has(name));
        if (staleFiles.length > 0) {
            throw new Error(`Stale generated files in data/dist/${level}: ${staleFiles.join(', ')}`);
        }
        return;
    }

    fs.rmSync(levelDistDir, { recursive: true, force: true });
    fs.mkdirSync(levelDistDir, { recursive: true });

    for (const [fileName, content] of expectedFiles.entries()) {
        const outputPath = path.join(levelDistDir, fileName);
        fs.writeFileSync(outputPath, content, 'utf8');
    }
}

try {
    levels.forEach(buildLevel);
    console.log(checkMode ? '✅ data/dist is in sync with data/src.' : '✅ Built data/dist from data/src.');
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
