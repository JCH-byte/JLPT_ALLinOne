#!/usr/bin/env node
/**
 * check-vocab.js — src 모듈의 story 본문(plain text)에 vocab word가
 * 100% 등장하는지 빠르게 검사한다.
 *
 * validate-module.js 의 vocab 등장률 체크와 동일한 기준이지만,
 * build / schema 통과 없이도 사전 단계에서 빠르게 돌릴 수 있다.
 *
 * Usage:
 *   node scripts/check-vocab.js <level> <moduleId>
 *
 * Exit 0: 100% (PASS)
 * Exit 1: 미만 (FAIL — 누락 단어 목록 출력)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VOCAB_APPEARANCE_RATIO = 1.0;

function stripHtml(html) {
    return String(html)
        .replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, '')
        .replace(/<rp[^>]*>[\s\S]*?<\/rp>/g, '')
        .replace(/<[^>]+>/g, '');
}

function main() {
    const [, , level, moduleId] = process.argv;
    if (!level || !moduleId) {
        console.error('Usage: node scripts/check-vocab.js <level> <moduleId>');
        process.exit(2);
    }

    const modulePath = path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`);
    const vocabPath = path.join(ROOT, 'data/src', level, 'vocab.json');
    const label = `${level} ${moduleId}`;

    if (!fs.existsSync(modulePath)) {
        console.error(`파일 없음: ${modulePath}`);
        process.exit(2);
    }
    if (!fs.existsSync(vocabPath)) {
        console.error(`vocab 풀 없음: ${vocabPath}`);
        process.exit(2);
    }

    const mod = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
    const vocabPool = JSON.parse(fs.readFileSync(vocabPath, 'utf8')).items || [];
    const vocabById = new Map(vocabPool.map(v => [v.id, v]));

    if (!mod.story || mod.story.trim() === '') {
        console.log(`⚠️  SKIP  ${label} — story 비어있음`);
        process.exit(0);
    }

    const vocabIds = Array.isArray(mod.vocabIds) ? mod.vocabIds : [];
    if (vocabIds.length === 0) {
        console.log(`⚠️  SKIP  ${label} — vocabIds 비어있음`);
        process.exit(0);
    }

    const unknownIds = vocabIds.filter(id => !vocabById.has(id));
    if (unknownIds.length > 0) {
        console.error(`❌ FAIL  ${label} — vocab 풀에 없는 id ${unknownIds.length}개: ${unknownIds.slice(0, 3).join(', ')}${unknownIds.length > 3 ? ' ...' : ''}`);
        process.exit(1);
    }

    const vocabWords = vocabIds.map(id => vocabById.get(id).word);
    const plain = stripHtml(mod.story);
    const appearing = vocabWords.filter(w => plain.includes(w));
    const missing = vocabWords.filter(w => !plain.includes(w));
    const ratio = vocabWords.length === 0 ? 1 : appearing.length / vocabWords.length;
    const pct = (ratio * 100).toFixed(0);
    const needPct = (VOCAB_APPEARANCE_RATIO * 100).toFixed(0);

    if (ratio >= VOCAB_APPEARANCE_RATIO) {
        const note = missing.length === 0
            ? '모든 vocab 등장'
            : `누락 ${missing.length}개: ${missing.join(', ')}`;
        console.log(`✅ PASS  ${label} — vocab 등장률 ${pct}% (${appearing.length}/${vocabWords.length}) — ${note}`);
        process.exit(0);
    }

    console.error(`❌ FAIL  ${label} — vocab 등장률 ${pct}% (${appearing.length}/${vocabWords.length}), 필요 ${needPct}%`);
    console.error(`  누락 단어 (${missing.length}개): ${missing.join(', ')}`);
    console.error('  → 누락 단어를 story 본문에 추가해주세요.');
    process.exit(1);
}

main();
