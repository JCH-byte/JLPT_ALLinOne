#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'content', 'modules', 'src');
const distDir = path.join(__dirname, '..', 'content', 'modules', 'dist');
const checkMode = process.argv.includes('--check');

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

function mergeReviewedNotebookOutputs(moduleData, generationBatches) {
    const outputs = moduleData.notebookLMOutputs && typeof moduleData.notebookLMOutputs === 'object'
        ? moduleData.notebookLMOutputs
        : {};

    const items = [];
    const batchProvenance = {};

    generationBatches.forEach((batch) => {
        const output = outputs[batch.batchId];
        if (!output || output.reviewed !== true) return;

        ['paragraphs', 'sentences', 'quizzes'].forEach((sectionName) => {
            const sectionItems = Array.isArray(output[sectionName]) ? output[sectionName] : [];
            sectionItems.forEach((entry, idx) => {
                const itemId = `${batch.batchId}-${sectionName.slice(0, 3)}-${String(idx + 1).padStart(2, '0')}`;
                items.push({
                    itemId,
                    type: sectionName,
                    payload: entry,
                    metadata: {
                        generatedFromBatchId: batch.batchId
                    }
                });
                batchProvenance[itemId] = batch.batchId;
            });
        });
    });

    return {
        items,
        batchProvenance
    };
}

function normalizeModule(moduleData) {
    const generationBatches = normalizeBatches(moduleData);
    const merged = mergeReviewedNotebookOutputs(moduleData, generationBatches);

    return {
        ...moduleData,
        generationBatches,
        items: merged.items,
        metadata: {
            ...(moduleData.metadata && typeof moduleData.metadata === 'object' ? moduleData.metadata : {}),
            batchProvenance: merged.batchProvenance
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

    moduleFiles.forEach((fileName) => {
        const srcPath = path.join(srcDir, fileName);
        const raw = fs.readFileSync(srcPath, 'utf8');
        const parsed = JSON.parse(raw);
        const normalized = normalizeModule(parsed);
        expected.set(fileName, stableStringify(normalized));
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

        console.log(`✅ Module build output is in sync (${moduleFiles.length} files).`);
        return;
    }

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    for (const [fileName, content] of expected.entries()) {
        fs.writeFileSync(path.join(distDir, fileName), content, 'utf8');
    }

    console.log(`✅ Built module artifacts (${moduleFiles.length} files).`);
}

try {
    main();
} catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
}
