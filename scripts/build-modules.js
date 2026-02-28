#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'content', 'modules', 'src');
const distDir = path.join(__dirname, '..', 'content', 'modules', 'dist');
const rulesDir = path.join(__dirname, '..', 'content', 'modules', 'rules');
const notebookLMInputDir = path.join(__dirname, '..', 'content', 'modules', 'notebooklm-inputs');
const dataSrcDir = path.join(__dirname, '..', 'data', 'src');
const checkMode = process.argv.includes('--check');

// In-memory cache: jlptLevel (e.g. 'N4') -> Map<id, {id, word, read, mean}>
const itemsCache = new Map();

function loadItemsForLevel(jlptLevel) {
    if (itemsCache.has(jlptLevel)) return itemsCache.get(jlptLevel);

    const level = jlptLevel.toLowerCase();
    const itemsPath = path.join(dataSrcDir, `${level}.items.json`);
    if (!fs.existsSync(itemsPath)) {
        itemsCache.set(jlptLevel, new Map());
        return itemsCache.get(jlptLevel);
    }

    const raw = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    const itemMap = new Map();
    (raw.items || []).forEach((item) => {
        if (item.id) {
            itemMap.set(item.id, { id: item.id, word: item.word, read: item.read, mean: item.mean });
        }
    });

    itemsCache.set(jlptLevel, itemMap);
    return itemMap;
}

function resolveVocabData(vocabIds, jlptLevel) {
    const itemMap = loadItemsForLevel(jlptLevel);
    return vocabIds.map((id) => itemMap.get(id) || { id, word: null, read: null, mean: null });
}

const JLPT_LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];

function stableStringify(data) {
    return `${JSON.stringify(data, null, 4)}\n`;
}

function sanitizeBatchId(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
}

function splitVocabIds(vocabIds, minSize = 20, maxSize = 25) {
    if (!Array.isArray(vocabIds) || vocabIds.length === 0) return [];
    if (vocabIds.length <= maxSize) return [vocabIds.slice()];

    const batchCount = Math.ceil(vocabIds.length / maxSize);
    const baseSize = Math.floor(vocabIds.length / batchCount);
    const remainder = vocabIds.length % batchCount;

    const sizes = Array.from({ length: batchCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));

    // If possible, rebalance tiny tail chunks toward minSize.
    for (let i = sizes.length - 1; i >= 0; i -= 1) {
        while (sizes[i] < minSize) {
            const donorIndex = sizes.findIndex((size, idx) => idx !== i && size > minSize);
            if (donorIndex === -1) break;
            sizes[donorIndex] -= 1;
            sizes[i] += 1;
        }
    }

    const result = [];
    let cursor = 0;
    sizes.forEach((size) => {
        result.push(vocabIds.slice(cursor, cursor + size));
        cursor += size;
    });

    if (cursor < vocabIds.length) {
        result.push(vocabIds.slice(cursor));
    }

    return result.filter((chunk) => chunk.length > 0);
}

function buildGenerationBatches(moduleData) {
    const promptTemplateVersion = moduleData.promptTemplateVersion || 'notebooklm-v1';
    const baseConstraints = moduleData.constraints && typeof moduleData.constraints === 'object'
        ? moduleData.constraints
        : {};

    const generatedChunks = splitVocabIds(moduleData.vocabIds || []);
    return generatedChunks.map((chunk, index) => ({
        batchId: `${sanitizeBatchId(moduleData.moduleId || 'module')}-batch-${String(index + 1).padStart(2, '0')}`,
        vocabIds: chunk,
        promptTemplateVersion,
        constraints: {
            ...baseConstraints,
            targetWordCount: `${Math.min(20, chunk.length)}-${Math.min(25, chunk.length)}`
        }
    }));
}

function normalizeBatches(moduleData) {
    if (Array.isArray(moduleData.generationBatches) && moduleData.generationBatches.length > 0) {
        return moduleData.generationBatches.map((batch, index) => ({
            batchId: batch.batchId || `${sanitizeBatchId(moduleData.moduleId || 'module')}-batch-${String(index + 1).padStart(2, '0')}`,
            vocabIds: Array.isArray(batch.vocabIds) ? batch.vocabIds : [],
            promptTemplateVersion: batch.promptTemplateVersion || moduleData.promptTemplateVersion || 'notebooklm-v1',
            constraints: batch.constraints && typeof batch.constraints === 'object' ? batch.constraints : {}
        }));
    }

    return buildGenerationBatches(moduleData);
}

function loadRuleSet(moduleData) {
    if (typeof moduleData.ruleFile !== 'string' || moduleData.ruleFile.trim() === '') {
        return {
            rulePath: null,
            ruleData: {
                ruleVersion: 'unversioned',
                parserThresholds: {}
            }
        };
    }

    const rulePath = path.join(rulesDir, moduleData.ruleFile);
    if (!fs.existsSync(rulePath)) {
        throw new Error(`Missing rule file: content/modules/rules/${moduleData.ruleFile}`);
    }

    const raw = fs.readFileSync(rulePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
        rulePath,
        ruleData: parsed && typeof parsed === 'object'
            ? parsed
            : {
                ruleVersion: 'unversioned',
                parserThresholds: {}
            }
    };
}

function isDifficultyViolation(maxAllowedLevel, observedLevel) {
    if (!maxAllowedLevel || !observedLevel) return false;
    const allowedIndex = JLPT_LEVEL_ORDER.indexOf(maxAllowedLevel);
    const observedIndex = JLPT_LEVEL_ORDER.indexOf(observedLevel);
    if (allowedIndex === -1 || observedIndex === -1) return false;
    return observedIndex > allowedIndex;
}

function evaluateBatchViolations(batch, output, ruleData) {
    const parserReport = output && output.parserReport && typeof output.parserReport === 'object'
        ? output.parserReport
        : {};
    const parserThresholds = ruleData && ruleData.parserThresholds && typeof ruleData.parserThresholds === 'object'
        ? ruleData.parserThresholds
        : {};

    const usedVocabIds = Array.isArray(parserReport.usedVocabIds) ? parserReport.usedVocabIds : [];
    const misusedVocabIds = Array.isArray(parserReport.misusedVocabIds) ? parserReport.misusedVocabIds : [];
    const charCount = Number.isFinite(parserReport.charCount) ? parserReport.charCount : null;
    const detectedMaxJlptLevel = typeof parserReport.detectedMaxJlptLevel === 'string'
        ? parserReport.detectedMaxJlptLevel
        : null;

    const missingUsage = batch.vocabIds.filter((vocabId) => !usedVocabIds.includes(vocabId));
    const misuseInBatch = misusedVocabIds.filter((vocabId) => batch.vocabIds.includes(vocabId));

    const violations = [];
    if (missingUsage.length > 0) {
        violations.push({
            type: 'unused_vocab',
            details: {
                vocabIds: missingUsage
            }
        });
    }

    if (misuseInBatch.length > 0) {
        violations.push({
            type: 'misused_vocab',
            details: {
                vocabIds: misuseInBatch
            }
        });
    }

    if (isDifficultyViolation(parserThresholds.maxJlptLevel, detectedMaxJlptLevel)) {
        violations.push({
            type: 'difficulty_drift',
            details: {
                maxAllowedLevel: parserThresholds.maxJlptLevel,
                detectedMaxJlptLevel
            }
        });
    }

    if (Number.isFinite(parserThresholds.maxChars) && Number.isFinite(charCount) && charCount > parserThresholds.maxChars) {
        violations.push({
            type: 'length_exceeded',
            details: {
                maxChars: parserThresholds.maxChars,
                observedChars: charCount
            }
        });
    }

    return {
        parserReport,
        violations,
        passed: violations.length === 0
    };
}

function mergeReviewedNotebookOutputs(moduleData, generationBatches, ruleData) {
    const outputs = moduleData.notebookLMOutputs && typeof moduleData.notebookLMOutputs === 'object'
        ? moduleData.notebookLMOutputs
        : {};

    const items = [];
    const batchProvenance = {};
    const regenerationQueue = [];
    const outputValidation = {};

    generationBatches.forEach((batch) => {
        const output = outputs[batch.batchId];
        if (!output) return;

        const validation = evaluateBatchViolations(batch, output, ruleData);
        outputValidation[batch.batchId] = {
            reviewed: output.reviewed === true,
            ...validation
        };

        if (output.reviewed !== true || validation.passed !== true) {
            if (validation.violations.length > 0) {
                regenerationQueue.push({
                    batchId: batch.batchId,
                    reason: 'parser_rule_violation',
                    violations: validation.violations
                });
            }
            return;
        }

        ['paragraphs', 'sentences', 'quizzes'].forEach((sectionName) => {
            const sectionItems = Array.isArray(output[sectionName]) ? output[sectionName] : [];
            sectionItems.forEach((entry, idx) => {
                const itemId = `${batch.batchId}-${sectionName.slice(0, 3)}-${String(idx + 1).padStart(2, '0')}`;
                items.push({
                    itemId,
                    type: sectionName,
                    payload: entry,
                    metadata: {
                        generatedFromBatchId: batch.batchId,
                        promptTemplateVersion: batch.promptTemplateVersion,
                        ruleVersion: ruleData.ruleVersion || 'unversioned'
                    }
                });
                batchProvenance[itemId] = batch.batchId;
            });
        });
    });

    return {
        items,
        batchProvenance,
        regenerationQueue,
        outputValidation
    };
}

function normalizeModule(moduleData) {
    const { rulePath, ruleData } = loadRuleSet(moduleData);
    const generationBatches = normalizeBatches(moduleData);
    const merged = mergeReviewedNotebookOutputs(moduleData, generationBatches, ruleData);

    const notebookLMInput = generationBatches.map((batch) => ({
        batchId: batch.batchId,
        inputMode: 'rules+vocab-only',
        includes: {
            ruleFile: moduleData.ruleFile || null,
            vocabIds: batch.vocabIds
        },
        excludes: ['long_context', 'previous_generated_paragraphs', 'reference_articles']
    }));

    return {
        ...moduleData,
        generationBatches,
        notebookLMInput,
        items: merged.items,
        regenerationQueue: merged.regenerationQueue,
        outputValidation: merged.outputValidation,
        metadata: {
            ...(moduleData.metadata && typeof moduleData.metadata === 'object' ? moduleData.metadata : {}),
            batchProvenance: merged.batchProvenance,
            ruleVersion: ruleData.ruleVersion || 'unversioned',
            promptTemplateVersion: moduleData.promptTemplateVersion || 'notebooklm-v1',
            ruleFile: moduleData.ruleFile || null,
            ruleResolvedPath: rulePath ? path.relative(path.join(__dirname, '..'), rulePath).replace(/\\/g, '/') : null
        }
    };
}

function getModuleFiles() {
    if (!fs.existsSync(srcDir)) return [];
    return fs.readdirSync(srcDir).filter((name) => name.endsWith('.json')).sort();
}

function main() {
    const moduleFiles = getModuleFiles();
    const expected = new Map();
    const notebookLMInputExpected = new Map();

    moduleFiles.forEach((fileName) => {
        const srcPath = path.join(srcDir, fileName);
        const raw = fs.readFileSync(srcPath, 'utf8');
        const parsed = JSON.parse(raw);
        const normalized = normalizeModule(parsed);
        expected.set(fileName, stableStringify(normalized));

        const jlptLevel = (normalized.constraints && normalized.constraints.jlptLevel) || 'N5';
        normalized.notebookLMInput.forEach((batchInput) => {
            const notebookLMInputFile = `${batchInput.batchId}.json`;
            const batchVocabIds = batchInput.includes.vocabIds;
            notebookLMInputExpected.set(notebookLMInputFile, stableStringify({
                moduleId: normalized.moduleId,
                title: normalized.title,
                promptTemplateVersion: normalized.promptTemplateVersion || 'notebooklm-v1',
                ruleFile: normalized.ruleFile || null,
                ruleVersion: normalized.metadata.ruleVersion,
                batch: {
                    batchId: batchInput.batchId,
                    vocabIds: batchVocabIds
                },
                vocab: resolveVocabData(batchVocabIds, jlptLevel),
                inputMode: batchInput.inputMode,
                excludes: batchInput.excludes
            }));
        });
    });

    if (checkMode) {
        if (!fs.existsSync(distDir)) {
            throw new Error('Missing generated folder: content/modules/dist');
        }

        for (const [fileName, expectedContent] of expected.entries()) {
            const outputPath = path.join(distDir, fileName);
            if (!fs.existsSync(outputPath)) {
                throw new Error(`Missing generated file: content/modules/dist/${fileName}`);
            }
            const currentContent = fs.readFileSync(outputPath, 'utf8');
            if (currentContent !== expectedContent) {
                throw new Error(`Out-of-date module build output: content/modules/dist/${fileName} (run: node scripts/build-modules.js)`);
            }
        }

        const currentFiles = fs.existsSync(distDir)
            ? fs.readdirSync(distDir).filter((name) => name.endsWith('.json'))
            : [];
        const expectedNames = new Set(expected.keys());
        const stale = currentFiles.filter((fileName) => !expectedNames.has(fileName));
        if (stale.length > 0) {
            throw new Error(`Stale generated files in content/modules/dist: ${stale.join(', ')}`);
        }

        if (!fs.existsSync(notebookLMInputDir)) {
            throw new Error('Missing generated folder: content/modules/notebooklm-inputs');
        }

        for (const [fileName, expectedContent] of notebookLMInputExpected.entries()) {
            const outputPath = path.join(notebookLMInputDir, fileName);
            if (!fs.existsSync(outputPath)) {
                throw new Error(`Missing generated file: content/modules/notebooklm-inputs/${fileName}`);
            }
            const currentContent = fs.readFileSync(outputPath, 'utf8');
            if (currentContent !== expectedContent) {
                throw new Error(`Out-of-date NotebookLM input file: content/modules/notebooklm-inputs/${fileName} (run: node scripts/build-modules.js)`);
            }
        }

        const currentInputFiles = fs.readdirSync(notebookLMInputDir).filter((name) => name.endsWith('.json'));
        const expectedInputNames = new Set(notebookLMInputExpected.keys());
        const staleInput = currentInputFiles.filter((fileName) => !expectedInputNames.has(fileName));
        if (staleInput.length > 0) {
            throw new Error(`Stale generated files in content/modules/notebooklm-inputs: ${staleInput.join(', ')}`);
        }

        console.log(`✅ Module build output is in sync (${moduleFiles.length} files).`);
        return;
    }

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.rmSync(notebookLMInputDir, { recursive: true, force: true });
    fs.mkdirSync(notebookLMInputDir, { recursive: true });

    for (const [fileName, content] of expected.entries()) {
        fs.writeFileSync(path.join(distDir, fileName), content, 'utf8');
    }

    for (const [fileName, content] of notebookLMInputExpected.entries()) {
        fs.writeFileSync(path.join(notebookLMInputDir, fileName), content, 'utf8');
    }

    console.log(`✅ Built module artifacts (${moduleFiles.length} files).`);
}

try {
    main();
} catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
}
