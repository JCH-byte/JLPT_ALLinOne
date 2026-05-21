#!/usr/bin/env node
/**
 * check-ruby.js — story HTML에서 <ruby> 바깥에 노출된 한자를 감지하고
 * 해당 문장 컨텍스트와 함께 보고한다.
 *
 * Usage:
 *   node scripts/check-ruby.js <level> <moduleId>   # src 파일의 story 검사
 *   node scripts/check-ruby.js --file <path.json>   # 임의 JSON 파일의 story 검사
 *
 * Exit 0: 노출 한자 없음 (PASS)
 * Exit 1: 노출 한자 발견 (FAIL)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function checkStory(story, label) {
    // ruby 블록 전체 제거
    const withoutRuby = story.replace(/<ruby>[\s\S]*?<\/ruby>/g, '___');
    // 남은 한자 감지
    const exposed = [];
    const kanji = /[一-鿿]/g;
    let m;
    while ((m = kanji.exec(withoutRuby)) !== null) {
        exposed.push({ char: m[0], index: m.index });
    }

    if (exposed.length === 0) {
        console.log(`✅ PASS  ${label} — 노출 한자 없음`);
        return 0;
    }

    console.error(`❌ FAIL  ${label} — 노출 한자 ${exposed.length}개`);

    // 컨텍스트 추출: rt/rp 제거 후 plain text에서 주변 30자 표시
    const plain = story
        .replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, '')
        .replace(/<rp[^>]*>[\s\S]*?<\/rp>/g, '')
        .replace(/<[^>]+>/g, '');

    // 노출 한자를 original story의 html-stripped 위치에서 찾아 컨텍스트 출력
    const uniqChars = [...new Set(exposed.map(e => e.char))];
    console.error(`  노출 한자: ${uniqChars.join(', ')}`);

    // plain text에서 각 한자 위치 찾아 컨텍스트 출력
    const seen = new Set();
    for (const ch of uniqChars) {
        if (seen.has(ch)) continue;
        seen.add(ch);
        const pos = plain.indexOf(ch);
        if (pos !== -1) {
            const start = Math.max(0, pos - 20);
            const end = Math.min(plain.length, pos + 21);
            const ctx = plain.slice(start, end).replace(/\n/g, ' ');
            console.error(`  「${ch}」 컨텍스트: ...${ctx}...`);
        }
    }
    console.error('  → 해당 한자를 <ruby>漢字<rt>よみ</rt></ruby> 로 감싸주세요.');
    return 1;
}

function main() {
    const args = process.argv.slice(2);
    let story = null;
    let label = '';

    if (args[0] === '--file') {
        const filePath = args[1];
        if (!filePath) { console.error('Usage: check-ruby.js --file <path.json>'); process.exit(2); }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        story = data.story || '';
        label = path.basename(filePath);
    } else if (args.length === 2) {
        const [level, moduleId] = args;
        const srcPath = path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`);
        if (!fs.existsSync(srcPath)) {
            console.error(`파일 없음: ${srcPath}`);
            process.exit(2);
        }
        const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        story = data.story || '';
        label = `${level} ${moduleId}`;
    } else {
        console.error('Usage:');
        console.error('  node scripts/check-ruby.js <level> <moduleId>');
        console.error('  node scripts/check-ruby.js --file <path.json>');
        process.exit(2);
    }

    if (!story.trim()) {
        console.log(`⚠️  SKIP  ${label} — story 비어있음`);
        process.exit(0);
    }

    process.exit(checkStory(story, label));
}

main();
