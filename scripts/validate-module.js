#!/usr/bin/env node
/**
 * Per-module content quality validator.
 * Usage:
 *   node scripts/validate-module.js <level> <moduleId>
 *   node scripts/validate-module.js n3 n3-module-004
 *
 * Checks 7 rules. Prints PASS / FAIL with specific reasons.
 * Exit 0 on pass, 1 on fail (so callers can branch).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Level-specific spec from JLPT_Template_Prompt_N3.txt
const LEVEL_SPEC = {
    n5: { sceneCount: 3, analysisMin: 12, analysisMax: 15 },
    n4: { sceneCount: 4, analysisMin: 15, analysisMax: 18 },
    n3: { sceneCount: 4, analysisMin: 16, analysisMax: 21 },
    n2: { sceneCount: 5, analysisMin: 18, analysisMax: 22 },
    n1: { sceneCount: 5, analysisMin: 20, analysisMax: 25 }
};

const QUIZ_COUNT = 10;
const VOCAB_APPEARANCE_RATIO = 1.0;

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function stripHtml(html) {
    // ruby 본문만 남기고 rt/rp 제거 (vocab 매칭 정확도)
    return String(html)
        .replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, '')
        .replace(/<rp[^>]*>[\s\S]*?<\/rp>/g, '')
        .replace(/<[^>]+>/g, '');
}

// Returns search candidates for a vocab word to match conjugated/inflected forms.
// e.g. 動く→{動く,動}, 考える→{考える,考え}, 大きい→{大きい,大き}, 勉強する→{勉強する,勉強}
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

function wordInText(word, text) {
    return [...getSearchCandidates(word)].some(c => text.includes(c));
}

function validate(level, moduleId) {
    const errors = [];
    const spec = LEVEL_SPEC[level];
    if (!spec) return [`unknown level: ${level}`];

    const modulePath = path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`);
    if (!fs.existsSync(modulePath)) return [`module file not found: ${modulePath}`];

    const vocabPath = path.join(ROOT, 'data/src', level, 'vocab.json');
    if (!fs.existsSync(vocabPath)) return [`vocab pool not found: ${vocabPath}`];

    const rulePath = path.join(ROOT, 'content/modules/rules', `${level}-module-default.json`);
    const rule = fs.existsSync(rulePath) ? readJson(rulePath) : {};

    const mod = readJson(modulePath);
    const vocabPool = readJson(vocabPath).items || [];
    const vocabById = new Map(vocabPool.map((v) => [v.id, v]));

    // 1) 필수 필드 + 타입
    const requiredFields = ['moduleId', 'level', 'ordinal', 'vocabIds', 'story', 'analysis', 'quiz'];
    for (const f of requiredFields) {
        if (mod[f] == null) errors.push(`schema: missing field "${f}"`);
    }
    if (mod.level && mod.level !== level) errors.push(`schema: level mismatch ("${mod.level}" vs "${level}")`);
    if (mod.moduleId && mod.moduleId !== moduleId) errors.push(`schema: moduleId mismatch ("${mod.moduleId}" vs "${moduleId}")`);
    if (typeof mod.story !== 'string') errors.push(`schema: story must be string`);
    if (!Array.isArray(mod.analysis)) errors.push(`schema: analysis must be array`);
    if (!Array.isArray(mod.quiz)) errors.push(`schema: quiz must be array`);
    if (!Array.isArray(mod.vocabIds)) errors.push(`schema: vocabIds must be array`);
    if (errors.length > 0) return errors; // 더 진행 불가

    // 2) vocabIds 정합성: vocab.json 풀에 모두 존재
    const missingIds = mod.vocabIds.filter((id) => !vocabById.has(id));
    if (missingIds.length > 0) {
        errors.push(`vocabIds: ${missingIds.length} id(s) not in vocab pool: ${missingIds.slice(0, 3).join(', ')}${missingIds.length > 3 ? ' ...' : ''}`);
    }

    // 3) story HTML 기초 + ruby 태그 검증
    //    - 닫는 태그 짝, 한자 문자에 ruby 적용 여부
    const story = mod.story;
    if (!story || story.trim().length === 0) {
        errors.push(`story: empty`);
    } else {
        // ruby 태그 짝
        const rubyOpen = (story.match(/<ruby>/g) || []).length;
        const rubyClose = (story.match(/<\/ruby>/g) || []).length;
        if (rubyOpen !== rubyClose) errors.push(`story: ruby tag mismatch (open=${rubyOpen}, close=${rubyClose})`);

        // ruby 바깥에 노출된 한자 검출 (간단 휴리스틱: ruby 영역 제거 후 한자가 남아있으면 누락)
        const withoutRuby = story.replace(/<ruby>[\s\S]*?<\/ruby>/g, '');
        const exposedKanji = withoutRuby.match(/[一-鿿]/g);
        if (exposedKanji && exposedKanji.length > 0) {
            const uniq = [...new Set(exposedKanji)];
            errors.push(`story: ${exposedKanji.length} kanji char(s) not wrapped in <ruby> (e.g. ${uniq.slice(0, 5).join(', ')})`);
        }

        // 장면 수 (h2 또는 h3 양쪽 허용)
        const sceneCount = (story.match(/<h[23]\b/gi) || []).length;
        if (sceneCount !== spec.sceneCount) {
            errors.push(`story: scene count = ${sceneCount}, expected ${spec.sceneCount}`);
        }

        // 길이 상한 (rule.lengthLimit.maxChars: ruby 본문 기준)
        const maxChars = rule?.lengthLimit?.maxChars || rule?.parserThresholds?.maxChars;
        if (Number.isInteger(maxChars)) {
            const plain = stripHtml(story);
            // maxChars는 1 장면 당이 아니라 전체 story 기준으로 간주 (룰 모호: 안전한 쪽으로 sceneCount 곱)
            const totalLimit = maxChars * spec.sceneCount;
            if (plain.length > totalLimit) {
                errors.push(`story: ${plain.length} chars > limit ${totalLimit} (rule maxChars=${maxChars} × ${spec.sceneCount} scenes)`);
            }
        }
    }

    // 4) analysis 항목 수 + 필드
    const aCount = mod.analysis.length;
    if (aCount < spec.analysisMin || aCount > spec.analysisMax) {
        errors.push(`analysis: count ${aCount} outside [${spec.analysisMin}, ${spec.analysisMax}]`);
    }
    mod.analysis.forEach((a, i) => {
        if (!a || typeof a !== 'object') {
            errors.push(`analysis[${i}]: not an object`);
            return;
        }
        ['sent', 'trans', 'grammar'].forEach((f) => {
            if (typeof a[f] !== 'string' || !a[f].trim()) errors.push(`analysis[${i}].${f}: missing or empty`);
        });
        if (!Array.isArray(a.tags)) errors.push(`analysis[${i}].tags: must be array`);
    });

    // 5) quiz: 10개 + 각 4 opt + ans 0-3 + comment
    if (mod.quiz.length !== QUIZ_COUNT) {
        errors.push(`quiz: count ${mod.quiz.length}, expected ${QUIZ_COUNT}`);
    }
    mod.quiz.forEach((q, i) => {
        if (!q || typeof q !== 'object') {
            errors.push(`quiz[${i}]: not an object`);
            return;
        }
        if (typeof q.q !== 'string' || !q.q.trim()) errors.push(`quiz[${i}].q: missing`);
        if (!Array.isArray(q.opt) || q.opt.length !== 4) errors.push(`quiz[${i}].opt: must be array of 4`);
        if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans > 3) errors.push(`quiz[${i}].ans: must be 0-3 integer`);
        if (typeof q.comment !== 'string') errors.push(`quiz[${i}].comment: missing`);
    });

    // 6) vocab 등장률 (story 본문에 vocab의 word가 100% 등장)
    if (mod.vocabIds.length > 0 && mod.story) {
        const plain = stripHtml(mod.story);
        const vocabWords = mod.vocabIds.map((id) => vocabById.get(id)?.word).filter(Boolean);
        const appearing = vocabWords.filter((w) => wordInText(w, plain));
        const ratio = vocabWords.length === 0 ? 1 : appearing.length / vocabWords.length;
        if (ratio < VOCAB_APPEARANCE_RATIO) {
            const missing = vocabWords.filter((w) => !wordInText(w, plain));
            errors.push(`vocab appearance: ${(ratio * 100).toFixed(0)}% (${appearing.length}/${vocabWords.length}), need ${(VOCAB_APPEARANCE_RATIO * 100).toFixed(0)}%. Missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' ...' : ''}`);
        }
    }

    // 7) 레벨 초과 표현 금지 (rule.bannedExpressions 단순 substring 검사)
    if (Array.isArray(rule?.bannedExpressions)) {
        const plain = stripHtml(mod.story);
        const violations = rule.bannedExpressions.filter((expr) => plain.includes(expr));
        if (violations.length > 0) errors.push(`bannedExpressions: ${violations.join(', ')}`);
    }

    return errors;
}

function main() {
    const [, , level, moduleId] = process.argv;
    if (!level || !moduleId) {
        console.error('Usage: node scripts/validate-module.js <level> <moduleId>');
        process.exit(2);
    }
    const errors = validate(level, moduleId);
    if (errors.length === 0) {
        console.log(`✅ PASS  ${level} ${moduleId}`);
        process.exit(0);
    }
    console.error(`❌ FAIL  ${level} ${moduleId}  (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
}

main();
