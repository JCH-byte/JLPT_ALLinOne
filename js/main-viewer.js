/**
 * main-viewer.js
 * 기능: 페이지 초기화, 데이터 렌더링, UI 모드 전환, 네비게이션
 * 의존성: utils.js, data-service.js, bookmark-service.js, quiz-controller.js, flashcard-controller.js
 */

function initViewer() {
    const level = getQueryParam('level') || 'n4';
    const day = getQueryParam('day');
    
    // 테마 설정을 위해 body 속성 설정
    document.body.setAttribute('data-theme', level);

    loadLevelData(level, (fileData) => {
        const allData = getMergedData(level, fileData);
        const data = allData[day];
        const container = document.getElementById('viewer-content') || document.body;

        if (!day || !data) {
            const msg = `<div class="empty-state" style="padding:40px; text-align:center;">
                            <h3>데이터 없음</h3>
                            <p>Day ${day || '?'} 데이터를 불러올 수 없습니다.</p>
                         </div>`;
            if (document.getElementById('viewer-content')) container.innerHTML = msg;
            else document.body.innerHTML = msg;
            return;
        }
        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    
    // 헤더 업데이트
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = data.title;
    const badge = document.getElementById('badge-level');
    if (badge) badge.textContent = level.toUpperCase();

    // 1. Story & Analysis Section
    renderStorySection(data);

    // 2. Vocab Section (리스트 + 플래시카드 데이터 설정)
    renderVocabSection(level, day, data);

    // 3. Quiz Section
    renderQuizSection(data);

    // 4. Navigation Buttons
    updateNavButtons(level, parseInt(day));
}

// --- 내부 렌더링 헬퍼 함수들 ---

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

function renderVocabSection(level, day, data) {
    const vocabTbody = document.getElementById('vocab-tbody');
    const vocabSection = document.getElementById('section-vocab') || (vocabTbody ? vocabTbody.closest('section') : null);

    if (vocabTbody && data.vocab.length > 0) {
        if(vocabSection) vocabSection.style.display = 'block';
        vocabTbody.innerHTML = '';
        
        data.vocab.forEach((v, idx) => {
            const tr = document.createElement('tr');
            
            // 체크박스 상태 로드
            const checkId = `${level}_day${day}_v_${idx}`;
            const isChecked = localStorage.getItem(checkId) === 'true';
            
            // 별표 상태 확인 (bookmark-service.js)
            const isStar = isStarred(level, day, v.word);
            
            tr.className = isChecked ? 'checked-row' : '';
            
            // HTML 속성에 넣기 위해 JSON 문자열 이스케이프
            const vJson = JSON.stringify(v).replace(/"/g, '&quot;');

            tr.innerHTML = `
                <td class="col-star">
                    <button class="star-btn ${isStar ? 'active' : ''}" 
                            onclick="toggleStar('${level}', '${day}', ${vJson}, this); event.stopPropagation();">
                        ${isStar ? '★' : '☆'}
                    </button>
                </td>
                <td class="col-check"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td class="col-word" onclick="speak('${v.word || ""}')">🔊 ${v.word || ""}</td>
                <td class="col-read">${v.read || v.reading || ""}</td>
                <td class="col-mean"><span>${v.mean || v.meaning || ""}</span></td>
            `;
            
            // 체크박스 이벤트 리스너
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
        
        // 플래시카드 데이터 초기화 (flashcard-controller.js)
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
            
            // 정답 인덱스 파싱 (숫자 혹은 "1. 설명" 형식)
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
                // 객관식
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
                // 주관식/단답형 (간이)
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

function updateNavButtons(level, currentDay) {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    if (prevBtn) {
        if (currentDay > 1) {
            prevBtn.href = `viewer.html?level=${level}&day=${currentDay - 1}`;
            prevBtn.classList.remove('disabled');
        } else {
            prevBtn.classList.add('disabled');
            prevBtn.removeAttribute('href');
        }
    }
    if (nextBtn) nextBtn.href = `viewer.html?level=${level}&day=${currentDay + 1}`;
}

// UI Helpers (Toggle)
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
            // Flashcard controller 호출
            showFlashcard(0);
        } else {
            list.style.display = 'block'; card.style.display = 'none';
            if(btnList) btnList.classList.add('active');
            if(btnCard) btnCard.classList.remove('active');
        }
    }
}