/**
 * main-viewer.js
 * 기능: 페이지 초기화, 데이터 렌더링, UI 모드 전환, 네비게이션
 * 의존성: utils.js, data-service.js, bookmark-service.js, quiz-controller.js, flashcard-controller.js
 */

function initViewer() {
    const level = getQueryParam('level') || 'n4';
    const moduleId = getQueryParam('module');
    const day = getQueryParam('day');

    document.body.setAttribute('data-theme', level);

    loadViewerData(level, { module: moduleId, day }, (result) => {
        const container = document.getElementById('viewer-content') || document.body;
        const resolvedDay = result?.day;
        const resolvedModule = result?.moduleId || moduleId || '';
        const data = result?.data;

        if ((!resolvedDay && !resolvedModule) || !data) {
            const msg = `<div class="empty-state" style="padding:40px; text-align:center;">
                            <h3>데이터 없음</h3>
                            <p>Module ${resolvedModule || '?'} 데이터를 불러올 수 없습니다.</p>
                         </div>`;
            if (document.getElementById('viewer-content')) container.innerHTML = msg;
            else document.body.innerHTML = msg;
            return;
        }

        renderViewerContent(level, resolvedDay, resolvedModule, data, result?.indexData || null);
    });
}

function renderViewerContent(level, day, moduleId, data, indexData) {
    document.title = `[${level.toUpperCase()}] ${data.title || moduleId || `Day ${day}`}`;

    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = data.title;
    const badge = document.getElementById('badge-level');
    if (badge) badge.textContent = level.toUpperCase();

    renderStorySection(data);
    renderVocabSection(level, day, moduleId, data);
    renderQuizSection(data);
    updateNavButtons(level, day, moduleId, indexData);
}

function renderStorySection(data) {
    const storyContent = document.getElementById('story-content');
    const analysisList = document.getElementById('analysis-list');
    const storySection = document.getElementById('section-story') || (storyContent ? storyContent.closest('section') : null);

    if (data.story && storyContent) {
        if(storySection) storySection.style.display = 'block';
        storyContent.innerHTML = data.story;

        if(analysisList) {
            analysisList.innerHTML = '';
            data.analysis.forEach(item => {
                const div = document.createElement('div');
                div.className = 'analysis-item';
                div.onclick = () => speak(item.sent);
                div.innerHTML = `
                    <div class="jp-sent">🔊 ${item.sent}</div>
                    <div class="kr-trans">${item.trans}</div>
                    <div class="tags">${(item.tags || []).map(t => `<span class="vocab-tag">${t}</span>`).join('')}</div>
                    ${item.grammar ? `<div class="grammar-point">💡 ${item.grammar}</div>` : ''}
                `;
                analysisList.appendChild(div);
            });
        }
    } else if (storySection) {
        storySection.style.display = 'none';
    }
}

function renderVocabSection(level, day, moduleId, data) {
    const vocabTbody = document.getElementById('vocab-tbody');
    const vocabSection = document.getElementById('section-vocab') || (vocabTbody ? vocabTbody.closest('section') : null);

    if (vocabTbody && data.vocab.length > 0) {
        if(vocabSection) vocabSection.style.display = 'block';
        vocabTbody.innerHTML = '';

        // day가 null이면 moduleId를 북마크 키로 사용 (null → "null" 문자열 변환 방지)
        const bookmarkKey = (day != null && String(day) !== 'null') ? String(day) : moduleId;

        data.vocab.forEach((v, idx) => {
            const tr = document.createElement('tr');
            const progressKeyBase = moduleId || `day${day}`;
            const checkId = `${level}_${progressKeyBase}_v_${idx}`;
            const isChecked = localStorage.getItem(checkId) === 'true';
            const isStar = isStarred(level, bookmarkKey, v.word);

            tr.className = isChecked ? 'checked-row' : '';
            const vJson = JSON.stringify(v).replace(/"/g, '&quot;');

            tr.innerHTML = `
                <td class="col-star">
                    <button class="star-btn ${isStar ? 'active' : ''}"
                            onclick="toggleStar('${level}', '${bookmarkKey}', ${vJson}, this); event.stopPropagation();">
                        ${isStar ? '★' : '☆'}
                    </button>
                </td>
                <td class="col-check"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td class="col-word" onclick="speak('${v.word || ""}')">🔊 ${v.word || ""}</td>
                <td class="col-read">${v.read || v.reading || ""}</td>
                <td class="col-mean"><span>${v.mean || v.meaning || ""}</span></td>
            `;

            tr.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                if(e.target.checked) {
                    localStorage.setItem(checkId, 'true');
                    tr.classList.add('checked-row');
                } else {
                    localStorage.removeItem(checkId);
                    tr.classList.remove('checked-row');
                }
            });
            vocabTbody.appendChild(tr);
        });

        if(typeof renderFlashcards === 'function') renderFlashcards(data.vocab);

    } else if (vocabSection) {
        vocabSection.style.display = 'none';
    }
}

function renderQuizSection(data) {
    const quizContainer = document.getElementById('quiz-container');
    const quizSection = document.getElementById('section-quiz') || (quizContainer ? quizContainer.closest('section') : null);

    if (quizContainer && data.quiz && data.quiz.length > 0) {
        if(quizSection) quizSection.style.display = 'block';
        quizContainer.innerHTML = '';

        data.quiz.forEach((q, i) => {
            const div = document.createElement('div');
            div.className = 'quiz-item';

            const qText = q.q || q.question || "";
            let opts = q.opt || q.options || [];

            let ansIdx = -1;
            if (typeof q.ans === 'number') {
                ansIdx = q.ans;
            } else if (typeof q.ans === 'string') {
                const match = q.ans.match(/^(\d+)\./);
                if (match) ansIdx = parseInt(match[1]) - 1;
            }

            const comment = q.comment || "정답입니다!";
            const safeComment = comment.replace(/"/g, '&quot;');

            let html = `<div class="quiz-q">Q${i+1}. ${qText}</div>`;

            if (Array.isArray(opts) && opts.length > 0) {
                html += `<div class="quiz-options-grid">`;
                opts.forEach((opt, oIdx) => {
                    html += `<button class="quiz-opt-btn"
                                data-is-correct="${oIdx === ansIdx}"
                                data-correct-idx="${ansIdx}"
                                data-comment="${safeComment}"
                                onclick="checkAnswer(this)">
                                ${oIdx + 1}. ${opt}
                             </button>`;
                });
                html += `</div>`;
                html += `<div class="quiz-feedback" id="quiz-feedback-${i}"></div>`;

            } else {
                html += `<div class="quiz-opt" style="background:#f9f9f9; padding:10px; margin-bottom:10px;">${opts}</div>`;
                html += `<button class="btn-check-answer" onclick="this.nextElementSibling.classList.toggle('visible')">정답 확인</button>`;
                html += `<div class="quiz-ans">${q.ans} <br><small>${comment}</small></div>`;
            }

            div.innerHTML = html;
            quizContainer.appendChild(div);
        });
    } else if (quizSection) {
        quizSection.style.display = 'none';
    }
}

function updateNavButtons(level, currentDay, currentModuleId, indexData) {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');

    if (currentModuleId && indexData && indexData.moduleToDay) {
        const modules = Object.keys(indexData.moduleToDay)
            .map((moduleId) => ({ moduleId, day: Number(indexData.moduleToDay[moduleId]) }))
            .filter((entry) => Number.isInteger(entry.day) && entry.day > 0)
            .sort((a, b) => a.day - b.day);

        const currentIndex = modules.findIndex(entry => entry.moduleId === currentModuleId);
        const prev = currentIndex > 0 ? modules[currentIndex - 1] : null;
        const next = currentIndex >= 0 && currentIndex < modules.length - 1 ? modules[currentIndex + 1] : null;

        if (prevBtn) {
            if (prev) {
                prevBtn.href = `viewer.html?level=${level}&module=${encodeURIComponent(prev.moduleId)}`;
                prevBtn.classList.remove('disabled');
            } else {
                prevBtn.classList.add('disabled');
                prevBtn.removeAttribute('href');
            }
        }
        if (nextBtn) {
            if (next) {
                nextBtn.href = `viewer.html?level=${level}&module=${encodeURIComponent(next.moduleId)}`;
                nextBtn.classList.remove('disabled');
            } else {
                nextBtn.classList.add('disabled');
                nextBtn.removeAttribute('href');
            }
        }
        return;
    }

    const numericDay = Number(currentDay);
    if (prevBtn) {
        if (numericDay > 1) {
            prevBtn.href = `viewer.html?level=${level}&day=${numericDay - 1}`;
            prevBtn.classList.remove('disabled');
        } else {
            prevBtn.classList.add('disabled');
            prevBtn.removeAttribute('href');
        }
    }
    if (nextBtn) nextBtn.href = `viewer.html?level=${level}&day=${numericDay + 1}`;
}

function toggleMeanings() {
    const table = document.getElementById('vocab-table');
    const btn = document.getElementById('btn-toggle-mean');
    if(table && btn) {
        const isHidden = table.classList.toggle('hide-meanings');
        btn.textContent = isHidden ? "👀 뜻 보이기" : "🙈 뜻 가리기";
        btn.classList.toggle('active', isHidden);
    }
}

function toggleViewMode(mode) {
    const list = document.getElementById('view-list');
    const card = document.getElementById('view-card');
    const btnList = document.getElementById('btn-mode-list');
    const btnCard = document.getElementById('btn-mode-card');
    if(list && card) {
        if (mode === 'card') {
            list.style.display = 'none'; card.style.display = 'flex';
            if(btnList) btnList.classList.remove('active');
            if(btnCard) btnCard.classList.add('active');
            showFlashcard(0);
        } else {
            list.style.display = 'block'; card.style.display = 'none';
            if(btnList) btnList.classList.add('active');
            if(btnCard) btnCard.classList.remove('active');
        }
    }
}
