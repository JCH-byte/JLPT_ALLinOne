#!/usr/bin/env node
/**
 * One-shot migration from legacy layout to unified module-based src.
 *
 * Output:
 *   data/src/{level}/vocab.json                 — vocab pool (canonical hash IDs)
 *   data/src/{level}/modules/{moduleId}.json    — module file (vocab inline by id reference)
 *
 * Inputs by level:
 *   n5: data/src/n5.items.json (vocab + assignedDay) + data/src/n5.json (day-keyed content)
 *   n1-n4: content/modules/src/{moduleId}.json (vocabIds, ruleFile) +
 *          data/dist/{level}/module-vocab/{moduleId}.json (authored story/analysis/quiz, optional)
 *
 * Does NOT touch any existing files. Old layout coexists until later cleanup step.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function pad3(n) { return String(n).padStart(3, '0'); }
function moduleOrdinal(moduleId) {
    const m = moduleId.match(/-(\d+)$/);
    return m ? Number(m[1]) : 0;
}

function buildVocabPool(level) {
    const itemsPath = path.join(ROOT, 'data/src', `${level}.items.json`);
    const src = readJson(itemsPath);
    const items = (src.items || []).map(({ id, word, read, mean, tags }) => ({
        id, word, read, mean, tags: Array.isArray(tags) ? tags : []
    }));
    return items;
}

function loadRuleVersion(level, ruleFile) {
    if (!ruleFile) return null;
    const rulePath = path.join(ROOT, 'content/modules/rules', ruleFile);
    if (!fs.existsSync(rulePath)) return null;
    const rule = readJson(rulePath);
    return rule.version || rule.ruleVersion || rule.id || null;
}

function migrateN5() {
    const level = 'n5';
    const items = readJson(path.join(ROOT, 'data/src', `${level}.items.json`)).items || [];
    const content = readJson(path.join(ROOT, 'data/src', `${level}.json`));

    const byDay = new Map();
    for (const it of items) {
        const day = it.assignedDay;
        if (!Number.isInteger(day) || day <= 0) continue;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(it.id);
    }

    const stats = [];
    for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
        const moduleId = `${level}-module-${pad3(day)}`;
        const dayContent = content[String(day)] || {};
        const moduleData = {
            moduleId,
            level,
            ordinal: day,
            title: dayContent.title || `N5 Module ${day}`,
            ruleVersion: null,
            vocabIds: byDay.get(day),
            story: dayContent.story || '',
            analysis: Array.isArray(dayContent.analysis) ? dayContent.analysis : [],
            quiz: Array.isArray(dayContent.quiz) ? dayContent.quiz : []
        };
        writeJson(path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`), moduleData);
        stats.push({ moduleId, hasStory: moduleData.story.length > 50 });
    }
    return stats;
}

function migrateLevelN1ToN4(level) {
    const moduleSrcDir = path.join(ROOT, 'content/modules/src');
    const moduleVocabDir = path.join(ROOT, 'data/dist', level, 'module-vocab');

    const filenames = fs.readdirSync(moduleSrcDir)
        .filter(f => f.startsWith(`${level}-module-`) && f.endsWith('.json'))
        .sort();

    const stats = [];
    for (const filename of filenames) {
        const meta = readJson(path.join(moduleSrcDir, filename));
        const moduleId = meta.moduleId;
        if (!moduleId || !moduleId.startsWith(`${level}-module-`)) continue;
        const ordinal = moduleOrdinal(moduleId);
        const vocabIds = Array.isArray(meta.vocabIds) ? meta.vocabIds : [];

        const mvPath = path.join(moduleVocabDir, `${moduleId}.json`);
        let title = meta.title || `${level.toUpperCase()} Module ${ordinal}`;
        let story = '';
        let analysis = [];
        let quiz = [];
        if (fs.existsSync(mvPath)) {
            const mv = readJson(mvPath);
            if (typeof mv.title === 'string' && mv.title.trim()) title = mv.title;
            if (typeof mv.story === 'string' && mv.story.length > 50) story = mv.story;
            if (Array.isArray(mv.analysis) && mv.analysis.length > 0) analysis = mv.analysis;
            if (Array.isArray(mv.quiz) && mv.quiz.length > 0) quiz = mv.quiz;
        }

        const moduleData = {
            moduleId,
            level,
            ordinal,
            title,
            ruleVersion: loadRuleVersion(level, meta.ruleFile),
            vocabIds,
            story,
            analysis,
            quiz
        };
        writeJson(path.join(ROOT, 'data/src', level, 'modules', `${moduleId}.json`), moduleData);
        stats.push({ moduleId, hasStory: story.length > 50 });
    }
    return stats;
}

function migrate() {
    const summary = [];
    for (const level of LEVELS) {
        const vocab = buildVocabPool(level);
        writeJson(path.join(ROOT, 'data/src', level, 'vocab.json'), { level, items: vocab });
        const stats = level === 'n5' ? migrateN5() : migrateLevelN1ToN4(level);
        const withContent = stats.filter(s => s.hasStory).length;
        summary.push({ level, vocab: vocab.length, modules: stats.length, withContent });
    }
    return summary;
}

const summary = migrate();
console.log('\nMigration complete.');
console.log('Level | vocab | modules | with content');
console.log('------+-------+---------+--------------');
for (const s of summary) {
    console.log(`  ${s.level} | ${String(s.vocab).padStart(5)} | ${String(s.modules).padStart(7)} | ${String(s.withContent).padStart(13)}`);
}
console.log('\nOutput: data/src/{level}/{vocab.json, modules/*.json}');
