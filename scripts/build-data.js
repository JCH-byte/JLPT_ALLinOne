#!/usr/bin/env node
/**
 * Build src → dist for module-based JLPT learning data.
 *
 * Reads:
 *   data/src/{level}/vocab.json
 *   data/src/{level}/modules/{moduleId}.json     (vocabIds reference vocab.json)
 *
 * Writes:
 *   data/dist/{level}/modules/{moduleId}.json    (vocab inline; story/analysis/quiz copied)
 *   data/dist/{level}/index.json                 (moduleOrder + module summaries)
 *
 * --check: re-build in memory and exit 1 if disk differs from build output.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
const BUILD_VERSION = 'module-build-v1';

const checkMode = process.argv.includes('--check');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function serialize(data) { return JSON.stringify(data, null, 2) + '\n'; }

function buildLevel(level) {
    const srcDir = path.join(ROOT, 'data/src', level);
    const distDir = path.join(ROOT, 'data/dist', level);
    const modulesSrcDir = path.join(srcDir, 'modules');
    const modulesDistDir = path.join(distDir, 'modules');

    if (!fs.existsSync(srcDir)) {
        throw new Error(`Missing source directory: data/src/${level}`);
    }
    const vocabPath = path.join(srcDir, 'vocab.json');
    if (!fs.existsSync(vocabPath)) {
        throw new Error(`Missing vocab pool: data/src/${level}/vocab.json`);
    }

    const vocabPool = readJson(vocabPath).items || [];
    const vocabById = new Map(vocabPool.map((v) => [v.id, v]));

    const filenames = fs.existsSync(modulesSrcDir)
        ? fs.readdirSync(modulesSrcDir).filter((f) => f.endsWith('.json')).sort()
        : [];

    const builtModules = [];
    for (const filename of filenames) {
        const src = readJson(path.join(modulesSrcDir, filename));
        if (!src.moduleId) {
            throw new Error(`Module missing moduleId: data/src/${level}/modules/${filename}`);
        }
        const vocabIds = Array.isArray(src.vocabIds) ? src.vocabIds : [];
        const vocab = vocabIds.map((id) => {
            const v = vocabById.get(id);
            if (!v) throw new Error(`Unknown vocabId ${id} in ${src.moduleId}`);
            return { id: v.id, word: v.word, read: v.read, mean: v.mean, tags: v.tags || [] };
        });

        const distModule = {
            moduleId: src.moduleId,
            level,
            ordinal: src.ordinal,
            title: src.title || '',
            ruleVersion: src.ruleVersion || null,
            vocab,
            story: src.story || '',
            analysis: Array.isArray(src.analysis) ? src.analysis : [],
            quiz: Array.isArray(src.quiz) ? src.quiz : []
        };
        builtModules.push(distModule);
    }

    // Sort by ordinal for deterministic order
    builtModules.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));

    const index = {
        level,
        manifest: {
            buildVersion: BUILD_VERSION,
            source: `data/src/${level}`,
            generatedAt: null // intentionally omitted for deterministic --check
        },
        moduleOrder: builtModules.map((m) => m.moduleId),
        modules: Object.fromEntries(builtModules.map((m) => [m.moduleId, {
            ordinal: m.ordinal,
            title: m.title,
            hasContent: m.story.length > 50 && m.analysis.length > 0,
            vocabCount: m.vocab.length
        }]))
    };

    // Expected output: { relPath -> content string }
    const expected = new Map();
    expected.set(path.join('modules', `index-placeholder-unused.json`), null); // unused, just placeholder for clarity
    expected.delete(path.join('modules', `index-placeholder-unused.json`));
    expected.set('index.json', serialize(index));
    for (const m of builtModules) {
        expected.set(path.join('modules', `${m.moduleId}.json`), serialize(m));
    }

    if (checkMode) {
        for (const [relPath, content] of expected.entries()) {
            const abs = path.join(distDir, relPath);
            if (!fs.existsSync(abs)) {
                throw new Error(`Missing built file: data/dist/${level}/${relPath} (run: node scripts/build-data.js)`);
            }
            const onDisk = fs.readFileSync(abs, 'utf8');
            if (onDisk !== content) {
                throw new Error(`Out-of-date file: data/dist/${level}/${relPath} (run: node scripts/build-data.js)`);
            }
        }
        // Also: any extra .json file under modules/ that isn't expected indicates a stale build
        if (fs.existsSync(modulesDistDir)) {
            const onDisk = fs.readdirSync(modulesDistDir).filter((f) => f.endsWith('.json'));
            const expectedFilenames = new Set([...expected.keys()]
                .filter((p) => p.startsWith('modules' + path.sep))
                .map((p) => path.basename(p)));
            const stale = onDisk.filter((f) => !expectedFilenames.has(f));
            if (stale.length > 0) {
                throw new Error(`Stale built files in data/dist/${level}/modules: ${stale.join(', ')}`);
            }
        }
        return;
    }

    // Build mode: write all expected files
    fs.mkdirSync(modulesDistDir, { recursive: true });
    for (const [relPath, content] of expected.entries()) {
        const abs = path.join(distDir, relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
    }

    // Remove stale module files (files that aren't in this build)
    const expectedFilenames = new Set([...expected.keys()]
        .filter((p) => p.startsWith('modules' + path.sep))
        .map((p) => path.basename(p)));
    const existing = fs.readdirSync(modulesDistDir).filter((f) => f.endsWith('.json'));
    for (const f of existing) {
        if (!expectedFilenames.has(f)) {
            fs.rmSync(path.join(modulesDistDir, f), { force: true });
        }
    }
}

try {
    for (const level of LEVELS) buildLevel(level);
    console.log(checkMode
        ? '✅ data/dist is in sync with data/src.'
        : '✅ Built data/dist/{level}/{index.json, modules/*.json} from data/src.');
} catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
}
