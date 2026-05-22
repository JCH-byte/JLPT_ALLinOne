#!/usr/bin/env node
/**
 * check-ruby.js — story HTML 및 analysis[].sent 에서 <ruby> 바깥에 노출된
 * 한자를 감지하고 컨텍스트와 함께 보고한다.
 *
 * Usage:
 *   node scripts/check-ruby.js <level> <moduleId>   # src 파일 검사
 *   node scripts/check-ruby.js --file <path.json>   # 임의 JSON 파일 검사
 *
 * 검사 범위:
 *   - data.story (전체)
 *   - data.analysis[i].sent (각 항목)
 *
 * Exit 0: 노출 한자 없음 (PASS)
 * Exit 1: 노출 한자 발견 (FAIL)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function findExposedKanji(html) {
    const withoutRuby = String(html).replace(/<ruby>[\s\S]*?<\/ruby>/g, '___');
    const exposed = [];
    const kanji = /[一-鿿]/g;
    let m;
    while ((m = kanji.exec(withoutRuby)) !== null) {
        exposed.push({ char: m[0], index: m.index });
    }
    return exposed;
}

function stripForContext(html) {
    return String(html)
        .replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, '')
        .replace(/<rp[^>]*>[\s\S]*?<\/rp>/g, '')
        .replace(/<[^>]+>/g, '');
}

function reportExposed(html, exposed, sublabel) {
    const plain = stripForContext(html);
    const uniqChars = [...new Set(exposed.map(e => e.char))];
    console.error(`  [${sublabel}] 노출 한자 ${exposed.length}개: ${uniqChars.join(', ')}`);
    const seen = new Set();
    for (const ch of uniqChars) {
        if (seen.has(ch)) continue;
        seen.add(ch);
        const pos = plain.indexOf(ch);
        if (pos !== -1) {
            const start = Math.max(0, pos - 20);
            const end = Math.min(plain.length, pos + 21);
            const ctx = plain.slice(start, end).replace(/\n/g, ' ');
            console.error(`    「${ch}」 컨텍스트: ...${ctx}...`);
        }
    }
}

function checkModule(data, label) {
    const story = data.story || '';
    const analysis = Array.isArray(data.analysis) ? data.analysis : [];

    const storyHasContent = story.trim().length > 0;
    const analysisHasContent = analysis.some(a => a && typeof a.sent === 'string' && a.sent.trim());

    if (!storyHasContent && !analysisHasContent) {
        console.log(`⚠️  SKIP  ${label} — story / analysis 모두 비어있음`);
        return 0;
    }

    const targets = [];
    if (storyHasContent) targets.push({ sublabel: 'story', html: story });
    analysis.forEach((a, i) => {
        if (a && typeof a.sent === 'string' && a.sent.trim()) {
            targets.push({ sublabel: `analysis[${i}].sent`, html: a.sent });
        }
    });

    let totalExposed = 0;
    const failedTargets = [];
    for (const t of targets) {
        const exposed = findExposedKanji(t.html);
        if (exposed.length > 0) {
            totalExposed += exposed.length;
            failedTargets.push({ ...t, exposed });
        }
    }

    if (totalExposed === 0) {
        console.log(`✅ PASS  ${label} — 노출 한자 없음 (검사 대상 ${targets.length}개)`);
        return 0;
    }

    console.error(`❌ FAIL  ${label} — 노출 한자 ${totalExposed}개 (${failedTargets.length}/${targets.length} 위치)`);
    for (const t of failedTargets) {
        reportExposed(t.html, t.exposed, t.sublabel);
    }
    console.error('  → 해당 한자를 <ruby>漢字<rt>よみ</rt></ruby> 로 감싸주세요.');
    return 1;
}

function main() {
    const args = process.argv.slice(2);
    let data = null;
    let label = '';

    if (args[0] === '--file') {
        const filePath = args[1];
        if (!filePath) { console.error('Usage: check-ruby.js --file <path.json>'); process.exit(2); }
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        label = path.basename(filePath);
    } else if (args.length === 2) {
        const [level, moduleId] = args;
        const srcPath = path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`);
        if (!fs.existsSync(srcPath)) {
            console.error(`파일 없음: ${srcPath}`);
            process.exit(2);
        }
        data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        label = `${level} ${moduleId}`;
    } else {
        console.error('Usage:');
        console.error('  node scripts/check-ruby.js <level> <moduleId>');
        console.error('  node scripts/check-ruby.js --file <path.json>');
        process.exit(2);
    }

    process.exit(checkModule(data, label));
}

main();
