#!/usr/bin/env node
/**
 * check-module.js — 통합 모듈 검사 (ruby + vocab) 한 번에 실행.
 *
 * Usage:
 *   node scripts/check-module.js <level> <moduleId>
 *
 * Exit 0: PASS (ruby + vocab 모두 통과)
 * Exit 1: FAIL (하나라도 실패)
 *
 * 두 검사 모두 끝까지 수행하므로 한 번 호출로 두 가지 문제를 동시에 볼 수 있다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VOCAB_APPEARANCE_RATIO = 1.0;

// ─── 공통 유틸 ───────────────────────────────────────────
function stripHtml(html) {
    return String(html)
        .replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, '')
        .replace(/<rp[^>]*>[\s\S]*?<\/rp>/g, '')
        .replace(/<[^>]+>/g, '');
}

// vocab 활용형 매칭을 위한 검색 후보 생성
function getSearchCandidates(word) {
    const candidates = new Set([word]);
    const isHiragana = c => c >= 'ぁ' && c <= 'ゖ';
    if (word.endsWith('する') && word.length > 2) {
        candidates.add(word.slice(0, -2));
        return candidates;
    }
    if (isHiragana(word.slice(-1))) {
        const stem = word.slice(0, -1);
        if (stem.length >= 1) candidates.add(stem);
    }
    return candidates;
}

// ─── ruby 검사 ───────────────────────────────────────────
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

function reportExposed(html, exposed, sublabel) {
    const plain = stripHtml(html);
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

function checkRuby(data, label) {
    const story = data.story || '';
    const analysis = Array.isArray(data.analysis) ? data.analysis : [];
    const storyHasContent = story.trim().length > 0;
    const analysisHasContent = analysis.some(a => a && typeof a.sent === 'string' && a.sent.trim());

    if (!storyHasContent && !analysisHasContent) {
        console.log(`⚠️  SKIP  ruby  ${label} — story / analysis 모두 비어있음`);
        return true;
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
        console.log(`✅ PASS  ruby  ${label} — 노출 한자 없음 (검사 ${targets.length}개)`);
        return true;
    }

    console.error(`❌ FAIL  ruby  ${label} — 노출 한자 ${totalExposed}개 (${failedTargets.length}/${targets.length} 위치)`);
    for (const t of failedTargets) reportExposed(t.html, t.exposed, t.sublabel);
    console.error('  → 해당 한자를 <ruby>漢字<rt>よみ</rt></ruby> 로 감싸주세요.');
    return false;
}

// ─── vocab 검사 ──────────────────────────────────────────
function checkVocab(mod, vocabById, label) {
    if (!mod.story || mod.story.trim() === '') {
        console.log(`⚠️  SKIP  vocab ${label} — story 비어있음`);
        return true;
    }
    const vocabIds = Array.isArray(mod.vocabIds) ? mod.vocabIds : [];
    if (vocabIds.length === 0) {
        console.log(`⚠️  SKIP  vocab ${label} — vocabIds 비어있음`);
        return true;
    }

    const unknownIds = vocabIds.filter(id => !vocabById.has(id));
    if (unknownIds.length > 0) {
        console.error(`❌ FAIL  vocab ${label} — vocab 풀에 없는 id ${unknownIds.length}개: ${unknownIds.slice(0, 3).join(', ')}${unknownIds.length > 3 ? ' ...' : ''}`);
        return false;
    }

    const vocabWords = vocabIds.map(id => vocabById.get(id).word);
    const plain = stripHtml(mod.story);

    const appearing = [];
    const missing = [];
    const stemMatches = []; // 활용형 매칭 (exact 미일치, stem 일치)
    for (const w of vocabWords) {
        if (plain.includes(w)) {
            appearing.push(w);
            continue;
        }
        const cands = [...getSearchCandidates(w)].filter(c => c !== w);
        const matched = cands.find(c => plain.includes(c));
        if (matched) {
            appearing.push(w);
            stemMatches.push(`${w}(${matched})`);
        } else {
            missing.push(w);
        }
    }

    const ratio = vocabWords.length === 0 ? 1 : appearing.length / vocabWords.length;
    const pct = (ratio * 100).toFixed(0);
    const needPct = (VOCAB_APPEARANCE_RATIO * 100).toFixed(0);

    if (ratio >= VOCAB_APPEARANCE_RATIO) {
        console.log(`✅ PASS  vocab ${label} — 등장률 ${pct}% (${appearing.length}/${vocabWords.length})`);
        if (stemMatches.length > 0) {
            console.log(`   stem 매칭 ${stemMatches.length}개: ${stemMatches.join(', ')}`);
        }
        return true;
    }

    console.error(`❌ FAIL  vocab ${label} — 등장률 ${pct}% (${appearing.length}/${vocabWords.length}), 필요 ${needPct}%`);
    console.error(`  누락 단어 (${missing.length}개): ${missing.join(', ')}`);
    if (stemMatches.length > 0) {
        console.error(`  stem 매칭 ${stemMatches.length}개: ${stemMatches.join(', ')}`);
    }
    console.error('  → 누락 단어를 story 본문에 추가해주세요.');
    return false;
}

// ─── main ────────────────────────────────────────────────
function main() {
    const [, , level, moduleId] = process.argv;
    if (!level || !moduleId) {
        console.error('Usage: node scripts/check-module.js <level> <moduleId>');
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

    const rubyOk = checkRuby(mod, label);
    const vocabOk = checkVocab(mod, vocabById, label);

    process.exit(rubyOk && vocabOk ? 0 : 1);
}

main();
