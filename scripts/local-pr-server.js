#!/usr/bin/env node
/**
 * scripts/local-pr-server.js
 * 모듈 스토리/퀴즈 컨텐츠를 GitHub API로 직접 PR 생성하는 로컬 서버.
 * 로컬 git 조작 없이 GitHub API만 사용합니다.
 *
 * 사용법:
 *   GITHUB_TOKEN=ghp_xxx node scripts/local-pr-server.js
 *
 * Admin UI 엔드포인트:
 *   http://localhost:3456/create-pr
 */
'use strict';

const http = require('http');

const PORT       = Number(process.env.PORT || 3456);
const TOKEN      = process.env.GITHUB_TOKEN || '';
const OWNER      = process.env.GITHUB_OWNER || 'JCH-byte';
const REPO       = process.env.GITHUB_REPO  || 'JLPT_ALLinOne';
const BASE       = process.env.GITHUB_BASE_BRANCH || 'main';
const API_ROOT   = 'https://api.github.com';

// ── GitHub API helpers ───────────────────────────────────────────────────────

async function ghFetch(path, options = {}) {
    const url = `${API_ROOT}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.message || data?.error || JSON.stringify(data);
        throw new Error(`GitHub API ${res.status}: ${msg}`);
    }
    return data;
}

async function getBaseSha() {
    const ref = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${BASE}`);
    return ref.object.sha;
}

async function createBranch(branchName, sha) {
    await ghFetch(`/repos/${OWNER}/${REPO}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha })
    });
}

async function getFileSha(filePath, branch) {
    try {
        const d = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);
        return d.sha || null;
    } catch {
        return null;
    }
}

async function getFileContent(filePath, branch) {
    try {
        const d = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);
        return JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
    } catch {
        return null;
    }
}

async function putFile(filePath, content, message, branch, sha) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch
    };
    if (sha) body.sha = sha;
    return ghFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

async function createPr(title, body, head) {
    return ghFetch(`/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, head, base: BASE, body })
    });
}

// ── Business logic ───────────────────────────────────────────────────────────

async function handleModulePr(payload) {
    if (!TOKEN) throw new Error('GITHUB_TOKEN 환경변수를 설정하세요.\n예: GITHUB_TOKEN=ghp_xxx node scripts/local-pr-server.js');

    const { level, moduleId, story, analysis, quiz, dataHash, author, changeSummary } = payload;

    if (!/^n[1-5]$/.test(String(level)))    throw new Error('level은 n1~n5 중 하나여야 합니다.');
    if (!moduleId || !moduleId.trim())        throw new Error('moduleId가 없습니다.');
    if (story == null && !Array.isArray(quiz)) throw new Error('story 또는 quiz 중 하나는 필요합니다.');

    const filePath   = `data/dist/${level}/module-vocab/${moduleId}.json`;
    const branchName = `automation/${level}-module-${moduleId}-${String(dataHash || '').slice(0, 8)}`;

    // 베이스 브랜치 최신 SHA 가져오기
    const baseSha = await getBaseSha();

    // 브랜치 생성 (이미 존재하면 무시)
    try {
        await createBranch(branchName, baseSha);
    } catch (e) {
        if (!e.message.includes('Reference already exists')) throw e;
    }

    // 기존 파일 내용 병합
    const existing = (await getFileContent(filePath, BASE)) || {};
    const merged   = { ...existing, title: existing.title || moduleId, moduleId };
    if (story != null)        merged.story    = story;
    if (Array.isArray(analysis)) merged.analysis = analysis;
    if (Array.isArray(quiz))     merged.quiz     = quiz;

    // 파일 업서트
    const existingSha = await getFileSha(filePath, branchName);
    await putFile(
        filePath,
        `${JSON.stringify(merged, null, 2)}\n`,
        `chore(data): update ${level} ${moduleId} story/quiz`,
        branchName,
        existingSha
    );

    // PR 생성
    const prBody = [
        `Automated content sync for **${level.toUpperCase()} Module ${moduleId}**.`,
        '',
        '## Admin context',
        `- author: ${author || 'unknown'}`,
        `- changeSummary: ${changeSummary || 'N/A'}`,
        '',
        '## PR metadata',
        `- dataHash: ${dataHash || 'N/A'}`,
        `- sourceBranch: ${branchName}`
    ].join('\n');

    const pr = await createPr(
        `chore(data): ${level.toUpperCase()} ${moduleId} story/quiz update`,
        prBody,
        branchName
    );

    return { ok: true, prUrl: pr.html_url, prNumber: pr.number, branch: branchName };
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method !== 'POST' || req.url !== '/create-pr') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `${req.method} ${req.url} not found` }));
        return;
    }

    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }));
            return;
        }

        try {
            const result = await handleModulePr(payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log(`PR 서버 실행: http://localhost:${PORT}/create-pr`);
    console.log('Admin UI 엔드포인트 입력창에 위 주소를 붙여넣으세요.');
    console.log('');
    if (!TOKEN) {
        console.warn('경고: GITHUB_TOKEN이 설정되지 않았습니다.');
        console.warn('  GITHUB_TOKEN=ghp_xxx node scripts/local-pr-server.js');
    } else {
        console.log(`GitHub: ${OWNER}/${REPO}  base: ${BASE}`);
    }
    console.log('');
});

server.on('error', e => {
    console.error('서버 실행 실패:', e.message);
    process.exit(1);
});
