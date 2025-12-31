/**
 * JLPT Learning System Logic (Enhanced)
 * 기능: 데이터 로드, 정규화, TTS(후리가나 제거), UI 상태 관리
 * Updated: 퀴즈 버그 수정 (인용부호 충돌 방지 및 data 속성 활용)
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 음성 목록 캐싱
let availableVoices = [];

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        availableVoices = window.speechSynthesis.getVoices();
    };
}

// TTS 기능
function speak(text) {
    if (!text) return;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('rt, rp').forEach(el => el.remove());
    const cleanText = tempDiv.textContent || tempDiv.innerText;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP'; 
    utterance.rate = 0.9;

    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }
    const jpVoices = availableVoices.filter(voice => voice.lang === 'ja-JP' || voice.lang === 'ja_JP');
    let selectedVoice = jpVoices.find(v => v.name.includes('Google')) 
                     || jpVoices.find(v => v.name.includes('Microsoft'))
                     || jpVoices.find(v => v.name.includes('Hattori'))
                     || jpVoices.find(v => v.name.includes('O-ren'))
                     || jpVoices[0];

    if (selectedVoice) utterance.voice = selectedVoice;
    window.speechSynthesis.speak(utterance);
}

function loadLevelData(level, callback) {
    const upperLevel = level.toUpperCase();
    const varName = `${upperLevel}_DATA`;
    if (window[varName]) { callback(window[varName]); return; }

    const script = document.createElement('script');
    script.src = `data/${level}_data.js`; 
    script.onload = () => {
        if (window[varName]) callback(window[varName]);
        else callback({});
    };
    script.onerror = () => { callback({}); };
    document.head.appendChild(script);
}

function getMergedData(level, fileData) {
    if (!fileData) fileData = {};
    const DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';
    try {
        const localStr = localStorage.getItem(DEV_KEY);
        if (localStr) {
            const parsed = JSON.parse(localStr);
            Object.keys(parsed).forEach(key => {
                if (key.startsWith(`${level}-`)) {
                    const day = key.split('-')[1]; 
                    fileData[day] = parsed[key];
                }
            });
        }
    } catch (e) { console.error(e); }

    const normalized = {};
    Object.keys(fileData).forEach(day => {
        let dayData = fileData[day];
        if (Array.isArray(dayData)) dayData = { vocab: dayData };
        normalized[day] = {
            title: dayData.title || `Day ${day} 단어장`,
            story: dayData.story || null,
            analysis: dayData.analysis || [],
            vocab: dayData.vocab || [],
            quiz: dayData.quiz || []
        };
    });
    return normalized;
}

// ----------------------------------------------------
// Viewer Controller
// ----------------------------------------------------
function initViewer() {
    const level = getQueryParam('level') || 'n4';
    const day = getQueryParam('day');
    document.body.setAttribute('data-theme', level);

    loadLevelData(level, (fileData) => {
        const allData = getMergedData(level, fileData);
        const data = allData[day];
        const container = document.getElementById('viewer-content') || document.body;

        if (!day || !data) {
            const msg = `<div class="empty-state" style="padding:40px; text-align:center;"><h3>데이터 없음</h3><p>Day ${day || '?'} 데이터를 불러올 수 없습니다.</p></div>`;
            if (document.getElementById('viewer-content')) container.innerHTML = msg;
            else document.body.innerHTML = msg;
            return;
        }
        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = data.title;
    const badge = document.getElementById('badge-level');
    if (badge) badge.textContent = level.toUpperCase();

    // Story Section
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

    // Vocab Section
    const vocabTbody = document.getElementById('vocab-tbody');
    const vocabSection = document.getElementById('section-vocab') || (vocabTbody ? vocabTbody.closest('section') : null);

    if (vocabTbody && data.vocab.length > 0) {
        if(vocabSection) vocabSection.style.display = 'block';
        vocabTbody.innerHTML = '';
        data.vocab.forEach((v, idx) => {
            const tr = document.createElement('tr');
            const checkId = `${level}_day${day}_v_${idx}`;
            const isChecked = localStorage.getItem(checkId) === 'true';
            tr.className = isChecked ? 'checked-row' : '';
            tr.innerHTML = `
                <td class="col-check"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td class="col-word" onclick="speak('${v.word || ""}')">🔊 ${v.word || ""}</td>
                <td class="col-read">${v.read || v.reading || ""}</td>
                <td class="col-mean"><span>${v.mean || v.meaning || ""}</span></td>
            `;
            tr.querySelector('input').addEventListener('change', (e) => {
                if(e.target.checked) { localStorage.setItem(checkId, 'true'); tr.classList.add('checked-row'); }
                else { localStorage.removeItem(checkId); tr.classList.remove('checked-row'); }
            });
            vocabTbody.appendChild(tr);
        });
        if(typeof renderFlashcards === 'function') renderFlashcards(data.vocab);
    } else if (vocabSection) {
        vocabSection.style.display = 'none';
    }

    // Quiz Section
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

            // [수정] 해설 텍스트 안전하게 처리 (따옴표 이스케이프)
            const comment = q.comment || "정답입니다!";
            const safeComment = comment.replace(/"/g, '&quot;'); 

            let html = `<div class="quiz-q">Q${i+1}. ${qText}</div>`;
            
            if (Array.isArray(opts) && opts.length > 0) {
                html += `<div class="quiz-options-grid">`;
                opts.forEach((opt, oIdx) => {
                    // [수정] 인라인 함수 호출 대신 data 속성 사용
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

    updateNavButtons(level, parseInt(day));
}

// [수정] 퀴즈 정답 체크 (Dataset 활용)
function checkAnswer(btn) {
    // data 속성에서 값 읽기 (문자열로 반환됨)
    const isCorrect = btn.dataset.isCorrect === 'true';
    const correctIdx = btn.dataset.correctIdx; // 문자열 상태 ('0', '1' 등)
    const comment = btn.dataset.comment;

    const parent = btn.parentElement; 
    const feedbackEl = parent.nextElementSibling;
    const allBtns = parent.querySelectorAll('.quiz-opt-btn');

    if (parent.classList.contains('solved')) return;
    parent.classList.add('solved');

    allBtns.forEach((b, idx) => {
        b.classList.add('disabled');
        // idx는 숫자, correctIdx는 문자열이므로 느슨한 비교(==) 유지
        if (idx == correctIdx) b.classList.add('correct');
    });

    if (isCorrect) {
        btn.classList.add('correct');
        feedbackEl.innerHTML = `<strong>⭕ 정답입니다!</strong>${comment}`;
        feedbackEl.classList.add('visible');
    } else {
        btn.classList.add('wrong');
        // 정답 번호 표시 (0부터 시작하므로 +1)
        feedbackEl.innerHTML = `<strong>❌ 아쉽네요!</strong>정답은 ${parseInt(correctIdx)+1}번 입니다.<br>${comment}`;
        feedbackEl.classList.add('visible');
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

// UI Helpers (Flashcard, Toggle)
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

// Flashcard Logic
let currentCardIndex = 0;
let cardData = [];
function renderFlashcards(vocab) { cardData = vocab; currentCardIndex = 0; showFlashcard(0); }
function showFlashcard(index) {
    if (!cardData || cardData.length === 0) return;
    if (index < 0) index = 0; if (index >= cardData.length) index = cardData.length - 1;
    currentCardIndex = index;
    const v = cardData[index];
    const card = document.getElementById('flashcard');
    const counter = document.getElementById('card-counter');
    if (card) {
        const front = card.querySelector('.card-front');
        const back = card.querySelector('.card-back');
        if(front) front.innerHTML = `<div class="fc-word">${v.word}</div><div class="fc-read">${v.read||v.reading||''}</div><div class="fc-hint">클릭해서 뜻 확인</div>`;
        if(back) back.innerHTML = `<div class="fc-mean">${v.mean||v.meaning}</div><div class="fc-actions"><button onclick="speak('${v.word}'); event.stopPropagation();">🔊 발음 듣기</button></div>`;
        card.classList.remove('flipped');
    }
    if (counter) counter.textContent = `${index + 1} / ${cardData.length}`;
}
function flipCard() { const card = document.getElementById('flashcard'); if(card) card.classList.toggle('flipped'); }
function prevCard() { showFlashcard(currentCardIndex - 1); }
function nextCard() { showFlashcard(currentCardIndex + 1); }