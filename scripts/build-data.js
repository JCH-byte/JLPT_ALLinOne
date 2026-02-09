#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const levels = ['n1', 'n2', 'n3', 'n4', 'n5'];
const srcDir = path.join(__dirname, '..', 'data', 'src');
const distDir = path.join(__dirname, '..', 'data', 'dist');
const checkMode = process.argv.includes('--check');

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

function buildLevel(level) {
    const srcPath = path.join(srcDir, `${level}.json`);
    const distPath = path.join(distDir, `${level}_data.js`);

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
        normalized[day] = normalizeDay(day, dayData);
    }

    const output = [
        '/**',
        ` * JLPT ${level.toUpperCase()} Data`,
        ` * Auto-generated from data/src/${level}.json`,
        ' */',
        `var ${level.toUpperCase()}_DATA = ${JSON.stringify(normalized, null, 4)};`,
        ''
    ].join('\n');

    if (checkMode) {
        if (!fs.existsSync(distPath)) {
            throw new Error(`Missing generated file: data/dist/${level}_data.js`);
        }

        const current = fs.readFileSync(distPath, 'utf8');
        if (current !== output) {
            throw new Error(`Out-of-date file: data/dist/${level}_data.js (run: node scripts/build-data.js)`);
        }
        return;
    }

    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(distPath, output, 'utf8');
}

try {
    levels.forEach(buildLevel);
    console.log(checkMode ? '✅ data/dist is in sync with data/src.' : '✅ Built data/dist from data/src.');
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
