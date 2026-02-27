#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '..', 'content', 'modules', 'src');

function collectIssues(fileName, moduleData) {
    const issues = [];
    const vocabIds = Array.isArray(moduleData.vocabIds) ? moduleData.vocabIds : [];
    const generationBatches = Array.isArray(moduleData.generationBatches) ? moduleData.generationBatches : [];

    if (generationBatches.length === 0) {
        issues.push(`${fileName}: generationBatches is required and must not be empty`);
        return issues;
    }

    const seenBatchIds = new Set();
    const seenVocabInBatches = new Map();

    generationBatches.forEach((batch, batchIndex) => {
        if (!batch || typeof batch !== 'object' || Array.isArray(batch)) {
            issues.push(`${fileName}: generationBatches[${batchIndex}] must be an object`);
            return;
        }

        const batchId = batch.batchId;
        if (typeof batchId !== 'string' || batchId.trim() === '') {
            issues.push(`${fileName}: generationBatches[${batchIndex}].batchId is required`);
        } else if (seenBatchIds.has(batchId)) {
            issues.push(`${fileName}: duplicated batchId '${batchId}'`);
        } else {
            seenBatchIds.add(batchId);
        }

        ['vocabIds', 'promptTemplateVersion', 'constraints'].forEach((requiredField) => {
            if (batch[requiredField] == null) {
                issues.push(`${fileName}: generationBatches[${batchIndex}].${requiredField} is required`);
            }
        });

        if (!Array.isArray(batch.vocabIds)) {
            issues.push(`${fileName}: generationBatches[${batchIndex}].vocabIds must be an array`);
            return;
        }

        batch.vocabIds.forEach((vocabId) => {
            if (!seenVocabInBatches.has(vocabId)) {
                seenVocabInBatches.set(vocabId, []);
            }
            seenVocabInBatches.get(vocabId).push(batchId || `index-${batchIndex}`);
        });
    });

    const duplicateVocabIds = [];
    seenVocabInBatches.forEach((batchIds, vocabId) => {
        if (batchIds.length > 1) {
            duplicateVocabIds.push(`${vocabId}(${batchIds.join(', ')})`);
        }
    });

    if (duplicateVocabIds.length > 0) {
        issues.push(`${fileName}: duplicated vocab across batches -> ${duplicateVocabIds.join('; ')}`);
    }

    const missingVocabIds = vocabIds.filter((vocabId) => !seenVocabInBatches.has(vocabId));
    if (missingVocabIds.length > 0) {
        issues.push(`${fileName}: missing vocabIds in batches -> ${missingVocabIds.join(', ')}`);
    }

    const unknownBatchVocab = [...seenVocabInBatches.keys()].filter((vocabId) => !vocabIds.includes(vocabId));
    if (unknownBatchVocab.length > 0) {
        issues.push(`${fileName}: batch vocabIds not declared in module vocabIds -> ${unknownBatchVocab.join(', ')}`);
    }

    return issues;
}

function validate() {
    if (!fs.existsSync(modulesDir)) {
        console.log('✅ No module source directory found. Skipping module batch validation.');
        return;
    }

    const files = fs.readdirSync(modulesDir).filter((name) => name.endsWith('.json')).sort();
    const allIssues = [];

    files.forEach((fileName) => {
        const filePath = path.join(modulesDir, fileName);
        const raw = fs.readFileSync(filePath, 'utf8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            allIssues.push(`${fileName}: invalid JSON (${error.message})`);
            return;
        }

        allIssues.push(...collectIssues(fileName, parsed));
    });

    if (allIssues.length > 0) {
        console.error(`❌ Module batch validation failed with ${allIssues.length} issue(s):`);
        allIssues.forEach((issue) => console.error(`- ${issue}`));
        process.exit(1);
    }

    console.log(`✅ Module batch validation passed (${files.length} files).`);
}

validate();
