#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'data', 'src');
const FIELD_ALIASES = {
    reading: 'read',
    meaning: 'mean',
    question: 'q',
    options: 'opt'
};

function normalizeItemKeys(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const normalized = { ...item };

    Object.entries(FIELD_ALIASES).forEach(([legacyKey, canonicalKey]) => {
        if (normalized[canonicalKey] == null && normalized[legacyKey] != null) {
            normalized[canonicalKey] = normalized[legacyKey];
        }
    });

    return normalized;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function lintVocab(file, day, idx, item, issues) {
    const normalized = normalizeItemKeys(item);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
        issues.push(`${file} Day ${day} vocab[${idx}]: must be an object`);
        return;
    }

    const missing = [];
    if (!isNonEmptyString(normalized.word)) missing.push('word');
    if (!isNonEmptyString(normalized.read)) missing.push('read');
    if (!isNonEmptyString(normalized.mean)) missing.push('mean');

    if (missing.length > 0) {
        issues.push(`${file} Day ${day} vocab[${idx}]: missing required field(s): ${missing.join(', ')}`);
    }
}

function lintQuiz(file, day, idx, item, issues) {
    const normalized = normalizeItemKeys(item);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
        issues.push(`${file} Day ${day} quiz[${idx}]: must be an object`);
        return;
    }

    const missing = [];
    if (!isNonEmptyString(normalized.q)) missing.push('q');
    if (!Array.isArray(normalized.opt)) missing.push('opt');
    if (normalized.ans == null || normalized.ans === '') missing.push('ans');

    if (missing.length > 0) {
        issues.push(`${file} Day ${day} quiz[${idx}]: missing required field(s): ${missing.join(', ')}`);
    }
}

function lintDay(file, day, dayData, issues) {
    if (Array.isArray(dayData)) {
        dayData.forEach((item, idx) => lintVocab(file, day, idx, item, issues));
        return;
    }

    if (!dayData || typeof dayData !== 'object') {
        issues.push(`${file} Day ${day}: day data must be an object or vocab array`);
        return;
    }

    const vocab = Array.isArray(dayData.vocab) ? dayData.vocab : [];
    const quiz = Array.isArray(dayData.quiz) ? dayData.quiz : [];

    if (dayData.vocab != null && !Array.isArray(dayData.vocab)) {
        issues.push(`${file} Day ${day}: vocab must be an array`);
    }

    if (dayData.quiz != null && !Array.isArray(dayData.quiz)) {
        issues.push(`${file} Day ${day}: quiz must be an array`);
    }

    vocab.forEach((item, idx) => lintVocab(file, day, idx, item, issues));
    quiz.forEach((item, idx) => lintQuiz(file, day, idx, item, issues));
}

function lintFile(fileName) {
    const filePath = path.join(srcDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const issues = [];

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        issues.push(`${fileName}: invalid JSON (${error.message})`);
        return issues;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        issues.push(`${fileName}: top-level must be an object keyed by day`);
        return issues;
    }

    Object.entries(parsed).forEach(([day, dayData]) => lintDay(fileName, day, dayData, issues));
    return issues;
}

function main() {
    const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.json')).sort();
    const allIssues = [];

    files.forEach((file) => {
        const issues = lintFile(file);
        if (issues.length > 0) {
            allIssues.push(...issues);
        }
    });

    if (allIssues.length === 0) {
        console.log(`✅ Data lint passed (${files.length} files)`);
        return;
    }

    console.error(`❌ Data lint failed with ${allIssues.length} issue(s):`);
    allIssues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
}

main();
