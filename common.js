/**
 * JLPT Scalable System Logic
 * 기능: 동적 스크립트 로딩, 데이터 병합, 뷰어 제어, TTS(음성) 기능 강화
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

/**
 * [핵심] 레벨별 데이터 파일 동적 로드 함수
 */
function loadLevelData(level, callback) {
    const upperLevel = level.toUpperCase();
    const varName = `${upperLevel}_DATA`;

    if (window[varName]) {
        callback(window[varName]);
        return;
    }

    const scriptPath = `data/${level}_data.js`;
    const script = document.createElement('script');
    script.src = scriptPath; 
    
    script.onload = () => {
        if (window[varName]) {
            callback(window[varName]);
        } else {
            try {
                const data = eval(varName);
                if (data) { callback(data); return; }
            } catch(e) {}
            console.warn(`[Warning] ${varName} 변수 없음.`);
            callback({}); 
        }
    };

    script.onerror = () => {
        const scriptUpper = document.createElement('script');
        scriptUpper.src = `data/${level.toUpperCase()}_data.js`;
        scriptUpper.onload = () => callback(window[varName] || {});
        scriptUpper.onerror = () => callback(null, scriptPath);
        document.head.appendChild(scriptUpper);
    };

    document.head.appendChild(script);
}

/**
 * 데이터 병합
 */
function getMergedData(level, fileData) {
    if (!fileData) fileData = {};
    const DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';
    let previewData = {};
    try {
        const localStr = localStorage.getItem(DEV_KEY);
        if (localStr) {
            const parsed = JSON.parse(localStr);
            Object.keys(parsed).forEach(key => {
                if (key.startsWith(`${level}-`)) {
                    const day = key.split('-')[1]; 
                    previewData[day] = parsed[key];
                }
            });
        }
    } catch (e) { console.error(e); }

    const merged = { ...fileData };
    Object.keys(previewData).forEach(day => {
        merged[day] = { ...merged[day] || {}, ...previewData[day] };
    });
    return merged;
}

// ----------------------------------------------------
// Viewer Logic 
// ----------------------------------------------------
function initViewer() {
    const level = getQueryParam('level') || 'n4';
    const day = getQueryParam('day');

    document.body.setAttribute('data-theme', level);

    loadLevelData(level, (fileData, errorPath) => {
        const container = document.body;
        
        if (fileData === null) {
            container.innerHTML = `<div style="padding:40px; text-align:center;"><h3>⚠️ 데이터 로드 실패</h3></div>`;
            return;
        }

        const allData = getMergedData(level, fileData);
        const data = allData[day];

        if (!day || !data) {
            container.innerHTML = `<div style="padding:40px; text-align:center;"><h3>Day ${day} 준비 중</h3></div>`;
            return;
        }

        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    document.getElementById('header-title').textContent = data.title || `Day ${day} 학습`;

    // 1. Story & Analysis
    const sectionStory = document.getElementById('section-story');
    const storyBox = document.getElementById('story-content');
    const analysisList = document.getElementById('analysis-list');

    stopAudio(); // 초기화

    if (data.story) {
        sectionStory.style.display = 'block';
        storyBox.innerHTML = data.story;

        // Analysis Rendering (TTS 버튼 추가됨)
        analysisList.innerHTML = ''; 
        if (data.analysis) {
            data.analysis.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'analysis-item';
                
                // 텍스트 정화 (따옴표 등 처리)
                const safeSent = item.sent.replace(/'/g, "\\'");

                div.innerHTML = `
                    <div class="sent-row">
                        <span class="jp-sent">${item.sent}</span>
                        <button class="btn-audio-mini" id="btn-sent-${idx}" onclick="playText('${safeSent}', 'btn-sent-${idx}')" title="이 문장 듣기">
                            <i class="fas fa-volume-up"></i>
                        </button>
                    </div>
                    <span class="kr-trans">${item.trans}</span>
                    <div style="margin-top:5px;">
                        ${(item.tags || []).map(t => `<span class="vocab-tag">${t}</span>`).join('')}
                    </div>
                    <span class="grammar-point">💡 ${item.grammar}</span>
                `;
                analysisList.appendChild(div);
            });
        }
    } else {
        sectionStory.style.display = 'none';
    }

    // 2. Vocabulary Section
    const vocabTbody = document.getElementById('vocab-tbody');
    vocabTbody.innerHTML = ''; 
    
    if (data.vocab && data.vocab.length > 0) {
        data.vocab.forEach((v, idx) => {
            const tr = document.createElement('tr');
            const checkId = `${level}_day${day}_vocab_${v.word}`;
            const isChecked = localStorage.getItem(checkId) === 'true';

            const reading = v.read || v.reading || ""; 
            const meaning = v.mean || v.meaning || "";
            // 단어는 한자(word)를 읽되, 없으면 reading을 읽음
            const targetText = v.word || reading; 
            const safeWord = targetText.replace(/'/g, "\\'");

            tr.innerHTML = `
                <td style="text-align:center;"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td class="td-word">
                    <span class="word-text">${v.word}</span>
                    <button class="btn-audio-mini" id="btn-vocab-${idx}" onclick="playText('${safeWord}', 'btn-vocab-${idx}')">
                        <i class="fas fa-volume-up"></i>
                    </button>
                </td>
                <td>${reading}</td>
                <td class="col-mean"><span>${meaning}</span></td>
            `;
            vocabTbody.appendChild(tr);

            tr.querySelector('input').addEventListener('change', (e) => {
                if(e.target.checked) {
                    localStorage.setItem(checkId, 'true');
                    tr.classList.add('checked-row');
                } else {
                    localStorage.removeItem(checkId);
                    tr.classList.remove('checked-row');
                }
            });
            
            if(isChecked) tr.classList.add('checked-row');
        });
    } else {
        vocabTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">단어 데이터가 없습니다.</td></tr>';
    }

    // Flashcard
    if (data.vocab && data.vocab.length > 0) {
        window.currentVocabData = data.vocab;
        window.currentCardIndex = 0;
        updateFlashcard();
    }

    // 3. Quiz Section
    const sectionQuiz = document.getElementById('section-quiz');
    const quizContainer = document.getElementById('quiz-container');
    quizContainer.innerHTML = ''; 

    if (data.quiz && data.quiz.length > 0) {
        sectionQuiz.style.display = 'block';
        data.quiz.forEach((q, i) => {
            const div = document.createElement('div');
            div.className = 'quiz-item';
            
            const questionText = q.q || q.question || "";
            const options = q.opt || q.options || [];
            let answerIndex = q.ans !== undefined ? q.ans : q.answer;
            const comment = q.comment || "";

            let optionsHtml = '<div class="quiz-options-grid">';
            if (Array.isArray(options)) {
                options.forEach((optText, idx) => {
                    optionsHtml += `<button class="quiz-opt-btn" onclick="checkQuizAnswer(this, ${idx}, ${answerIndex})">${idx+1}. ${optText}</button>`;
                });
            }
            optionsHtml += '</div>';

            div.innerHTML = `
                <div class="quiz-q">Q${i+1}. ${questionText}</div>
                ${optionsHtml}
                <div class="quiz-feedback">
                    <strong>정답: ${options[answerIndex]}</strong>
                    ${comment}
                </div>
            `;
            quizContainer.appendChild(div);
        });
    } else {
        sectionQuiz.style.display = 'none';
    }
    
    // Navigation
    const currentDay = parseInt(day);
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    
    if(currentDay > 1) {
        prevBtn.href = `viewer.html?level=${level}&day=${currentDay-1}`;
        prevBtn.classList.remove('disabled');
    } else {
        prevBtn.href = "#";
        prevBtn.classList.add('disabled');
    }
    nextBtn.href = `viewer.html?level=${level}&day=${currentDay+1}`;
    nextBtn.classList.remove('disabled');
}

// --- View Controls ---
function toggleViewMode(mode) {
    document.getElementById('view-list').style.display = mode === 'list' ? 'block' : 'none';
    document.getElementById('view-card').style.display = mode === 'card' ? 'block' : 'none';
    
    document.getElementById('btn-mode-list').classList.toggle('active', mode === 'list');
    document.getElementById('btn-mode-card').classList.toggle('active', mode === 'card');
}

function toggleMeanings() {
    const table = document.getElementById('vocab-table');
    table.classList.toggle('hide-meanings');
    const btn = document.getElementById('btn-toggle-mean');
    btn.textContent = table.classList.contains('hide-meanings') ? '🐵 뜻 보이기' : '🙈 뜻 가리기';
}

// --- Flashcard Logic ---
function updateFlashcard() {
    if (!window.currentVocabData) return;
    const vocab = window.currentVocabData[window.currentCardIndex];
    const card = document.getElementById('flashcard');
    
    card.classList.remove('flipped');

    setTimeout(() => {
        const front = card.querySelector('.card-front');
        const back = card.querySelector('.card-back');
        
        front.innerHTML = `
            <div class="fc-word">${vocab.word}</div>
            <div class="fc-hint">클릭해서 뜻 확인</div>
            <button class="btn-audio-float" onclick="event.stopPropagation(); playText('${vocab.word.replace(/'/g, "\\'")}')">
                <i class="fas fa-volume-up"></i>
            </button>
        `;
        
        back.innerHTML = `
            <div class="fc-read">${vocab.read || ""}</div>
            <div class="fc-mean">${vocab.mean || ""}</div>
        `;
        
        document.getElementById('card-counter').textContent = `${window.currentCardIndex + 1} / ${window.currentVocabData.length}`;
    }, 150);
}

function prevCard() {
    if (window.currentCardIndex > 0) {
        window.currentCardIndex--;
        updateFlashcard();
    }
}

function nextCard() {
    if (window.currentVocabData && window.currentCardIndex < window.currentVocabData.length - 1) {
        window.currentCardIndex++;
        updateFlashcard();
    }
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
}

// --- Quiz Logic ---
function checkQuizAnswer(btn, selectedIdx, correctIdx) {
    const parent = btn.parentElement;
    const feedback = parent.nextElementSibling; 
    
    const buttons = parent.querySelectorAll('.quiz-opt-btn');
    buttons.forEach(b => b.classList.add('disabled')); 

    if (selectedIdx === correctIdx) {
        btn.classList.add('correct');
        feedback.classList.add('visible');
        feedback.style.backgroundColor = '#E8F5E9';
        feedback.style.borderColor = '#C5E1A5';
        feedback.style.color = '#2E7D32';
    } else {
        btn.classList.add('wrong');
        buttons[correctIdx].classList.add('correct');
        feedback.classList.add('visible');
        feedback.style.backgroundColor = '#FFEBEE';
        feedback.style.borderColor = '#FFCDD2';
        feedback.style.color = '#C62828';
    }
}

// ================================================
// TTS Logic (Enhanced)
// ================================================
let currentUtterance = null;
let currentBtnId = null;

// 전체 스토리 듣기 토글
function toggleStoryAudio() {
    if (currentUtterance && window.speechSynthesis.speaking) {
        // 이미 재생 중이면 멈춤
        stopAudio();
    } else {
        playStory();
    }
}

// 스토리 텍스트 추출 및 재생
function playStory() {
    const storyBox = document.getElementById('story-content');
    if (!storyBox) return;
    const text = extractTextForTTS(storyBox.innerHTML);
    playText(text, 'btn-play-story');
}

// [핵심] 공용 TTS 재생 함수
function playText(text, btnId = null) {
    if (!('speechSynthesis' in window)) {
        alert("이 브라우저는 음성 듣기를 지원하지 않습니다.");
        return;
    }

    // 기존 음성 중단
    window.speechSynthesis.cancel();
    resetButtons();

    // 텍스트 정제
    const cleanText = text.trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP'; 
    utterance.rate = 0.85; // 조금 더 또박또박하게

    // 이벤트 핸들러
    utterance.onstart = () => {
        if (btnId) setButtonState(btnId, true);
    };
    
    utterance.onend = () => {
        if (btnId) setButtonState(btnId, false);
        currentUtterance = null;
        currentBtnId = null;
    };

    utterance.onerror = () => {
        if (btnId) setButtonState(btnId, false);
    };

    currentUtterance = utterance;
    currentBtnId = btnId;
    window.speechSynthesis.speak(utterance);
}

function stopAudio() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    resetButtons();
}

// 버튼 상태 UI 제어
function setButtonState(btnId, isPlaying) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isPlaying) {
        btn.classList.add('playing');
        // 전체 듣기 버튼인 경우 텍스트 변경
        if (btnId === 'btn-play-story') {
            btn.innerHTML = '<i class="fas fa-stop"></i> 멈춤';
        }
    } else {
        btn.classList.remove('playing');
        if (btnId === 'btn-play-story') {
            btn.innerHTML = '<i class="fas fa-volume-up"></i> 전체 듣기';
        }
    }
}

function resetButtons() {
    document.querySelectorAll('.playing').forEach(el => {
        el.classList.remove('playing');
        if (el.id === 'btn-play-story') {
            el.innerHTML = '<i class="fas fa-volume-up"></i> 전체 듣기';
        }
    });
}

// HTML 태그와 RT 제거 (순수 일본어만 추출)
function extractTextForTTS(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // <rt> 태그 제거
    div.querySelectorAll('rt').forEach(rt => rt.remove());
    return div.textContent || div.innerText || "";
}
