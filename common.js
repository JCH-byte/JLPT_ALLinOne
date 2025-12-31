/**
 * JLPT Scalable System Logic
 * 기능: 동적 스크립트 로딩, 데이터 병합, 뷰어 제어, 고급 TTS(설정 포함)
 * Updated: Microsoft 음성 우선 순위 적용, 속도 조절 및 설정 UI 추가
 */

// ----------------------------------------------------
// Advanced TTS (Text-to-Speech) Logic
// ----------------------------------------------------
let ttsSynth = window.speechSynthesis;
let jpVoice = null;

// 사용자 설정 로드 (기본값: 속도 0.9)
let ttsPreferences = {
    voiceURI: localStorage.getItem('jlpt_tts_voice') || null,
    rate: parseFloat(localStorage.getItem('jlpt_tts_rate') || '0.9')
};

function initTTS() {
    // 음성 목록이 로드될 때까지 기다림
    const checkVoices = () => {
        const voices = ttsSynth.getVoices();
        if (voices.length > 0) {
            setBestVoice(voices);
        }
    };

    if (ttsSynth.onvoiceschanged !== undefined) {
        ttsSynth.onvoiceschanged = checkVoices;
    }
    checkVoices(); // 즉시 실행 시도
}

function setBestVoice(voices) {
    const jaVoices = voices.filter(v => v.lang.startsWith('ja'));
    
    // 1. 사용자가 저장한 목소리가 있으면 그걸 우선 사용
    if (ttsPreferences.voiceURI) {
        const savedVoice = jaVoices.find(v => v.voiceURI === ttsPreferences.voiceURI);
        if (savedVoice) {
            jpVoice = savedVoice;
            return;
        }
    }

    // 2. 저장된 게 없으면 우선순위 로직 (Microsoft > Google > Apple > 기타)
    // Microsoft 음성이 품질이 좋은 경우가 많으므로 최우선 검색
    jpVoice = jaVoices.find(v => v.name.includes('Microsoft')) || 
              jaVoices.find(v => v.name.includes('Google')) ||
              jaVoices.find(v => v.name.includes('Otoya') || v.name.includes('Kyoko')) || // macOS
              jaVoices.find(v => v.lang === 'ja-JP');
}

function playTTS(text) {
    if (!ttsSynth) return;
    ttsSynth.cancel(); // 이전 음성 중지

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ja-JP';
    
    // 설정된 목소리 적용
    if (jpVoice) utter.voice = jpVoice;
    
    // 설정된 속도 적용
    utter.rate = ttsPreferences.rate; 
    
    ttsSynth.speak(utter);
}

// ----------------------------------------------------
// TTS Settings UI (설정 모달)
// ----------------------------------------------------
function openTTSSettings() {
    // 이미 모달이 있으면 제거
    const oldModal = document.getElementById('tts-settings-modal');
    if (oldModal) oldModal.remove();

    const voices = ttsSynth.getVoices().filter(v => v.lang.startsWith('ja'));
    
    // 모달 HTML 생성
    const modal = document.createElement('div');
    modal.id = 'tts-settings-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 1000;
        display: flex; justify-content: center; align-items: center;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white; padding: 25px; border-radius: 12px;
        width: 90%; max-width: 400px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-family: 'Pretendard', sans-serif;
    `;

    // 목소리 옵션 생성
    let voiceOptions = voices.map(v => 
        `<option value="${v.voiceURI}" ${jpVoice && jpVoice.voiceURI === v.voiceURI ? 'selected' : ''}>
            ${v.name} (${v.lang})
        </option>`
    ).join('');

    if (voices.length === 0) {
        voiceOptions = `<option disabled>일본어 음성을 찾을 수 없습니다.</option>`;
    }

    content.innerHTML = `
        <h3 style="margin-top:0;">🔊 음성 설정</h3>
        
        <label style="display:block; margin-bottom:5px; font-weight:bold;">목소리 선택</label>
        <select id="tts-voice-select" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ddd; border-radius:4px;">
            ${voiceOptions}
        </select>

        <label style="display:block; margin-bottom:5px; font-weight:bold;">말하기 속도: <span id="rate-value">${ttsPreferences.rate}</span>x</label>
        <input type="range" id="tts-rate-range" min="0.5" max="2.0" step="0.1" value="${ttsPreferences.rate}" style="width:100%; margin-bottom:20px;">

        <div style="display:flex; gap:10px;">
            <button id="btn-test-tts" style="flex:1; padding:10px; background:#e0e0e0; border:none; border-radius:6px; cursor:pointer;">미리듣기 🔈</button>
            <button id="btn-save-tts" style="flex:1; padding:10px; background:#4CAF50; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">저장</button>
        </div>
        <button id="btn-close-tts" style="margin-top:10px; background:none; border:none; color:#666; text-decoration:underline; cursor:pointer; width:100%;">닫기</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // 이벤트 리스너 연결
    const select = document.getElementById('tts-voice-select');
    const range = document.getElementById('tts-rate-range');
    const rateVal = document.getElementById('rate-value');

    range.addEventListener('input', (e) => {
        rateVal.textContent = e.target.value;
    });

    // 미리듣기
    document.getElementById('btn-test-tts').onclick = () => {
        const selectedURI = select.value;
        const selectedRate = parseFloat(range.value);
        
        const testVoice = voices.find(v => v.voiceURI === selectedURI);
        
        ttsSynth.cancel();
        const utter = new SpeechSynthesisUtterance("こんにちは。日本語のテストです。"); // 안녕하세요. 일본어 테스트입니다.
        utter.lang = 'ja-JP';
        if (testVoice) utter.voice = testVoice;
        utter.rate = selectedRate;
        ttsSynth.speak(utter);
    };

    // 저장
    document.getElementById('btn-save-tts').onclick = () => {
        ttsPreferences.voiceURI = select.value;
        ttsPreferences.rate = parseFloat(range.value);
        
        // 로컬 스토리지에 저장
        localStorage.setItem('jlpt_tts_voice', ttsPreferences.voiceURI);
        localStorage.setItem('jlpt_tts_rate', ttsPreferences.rate);

        // 현재 설정에 즉시 반영
        const savedVoice = voices.find(v => v.voiceURI === ttsPreferences.voiceURI);
        if (savedVoice) jpVoice = savedVoice;

        modal.remove();
        alert('설정이 저장되었습니다.');
    };

    document.getElementById('btn-close-tts').onclick = () => modal.remove();
}

// TTS 버튼 CSS 주입
const ttsStyle = document.createElement('style');
ttsStyle.innerHTML = `
    .btn-tts { background:none; border:none; cursor:pointer; font-size:1.2rem; margin-right:5px; vertical-align:middle; transition: transform 0.2s; }
    .btn-tts:active { transform: scale(0.9); }
    .btn-tts-sm { background:none; border:none; cursor:pointer; font-size:1rem; margin-left:5px; color:#666; }
    .btn-tts-float { position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.8); border-radius:50%; width:30px; height:30px; border:1px solid #ddd; cursor:pointer; z-index:10; }
    .analysis-sent-row { display:flex; align-items:baseline; }
    .btn-settings { background:none; border:none; font-size:1.2rem; cursor:pointer; margin-left:10px; color:#555; }
    .btn-settings:hover { color:#333; }
`;
document.head.appendChild(ttsStyle);


// ----------------------------------------------------
// Core Logic
// ----------------------------------------------------

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

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
                if (data) {
                    callback(data);
                    return;
                }
            } catch(e) {}
            console.warn(`[Warning] 변수 찾기 실패`);
            callback({}); 
        }
    };

    script.onerror = () => {
        // Retry logic
        const scriptUpper = document.createElement('script');
        scriptUpper.src = `data/${level.toUpperCase()}_data.js`;
        scriptUpper.onload = () => {
            if (window[varName]) callback(window[varName]);
            else callback({});
        };
        scriptUpper.onerror = () => callback(null, scriptPath);
        document.head.appendChild(scriptUpper);
    };

    document.head.appendChild(script);
}

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
    } catch (e) { }
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
    initTTS(); // TTS 초기화 확인

    const level = getQueryParam('level') || 'n4';
    const day = getQueryParam('day');

    document.body.setAttribute('data-theme', level);

    loadLevelData(level, (fileData, errorPath) => {
        const container = document.body;
        
        if (fileData === null) {
            container.innerHTML = `<div style="padding:40px; text-align:center;"><h3>데이터 로드 실패</h3><p>${errorPath}</p></div>`;
            return;
        }

        const allData = getMergedData(level, fileData);
        const data = allData[day];

        if (!day || !data) {
            container.innerHTML = `<div style="padding:40px; text-align:center;"><h3>준비 중</h3></div>`;
            return;
        }

        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    
    // 헤더 타이틀 + 설정 버튼 추가
    const headerTitle = document.getElementById('header-title');
    headerTitle.innerHTML = `
        ${data.title || `Day ${day} 학습`}
        <button class="btn-settings" onclick="openTTSSettings()" title="음성 설정">⚙️</button>
    `;

    // 1. Story
    const sectionStory = document.getElementById('section-story');
    const storyBox = document.getElementById('story-content');
    const analysisList = document.getElementById('analysis-list');

    if (data.story) {
        sectionStory.style.display = 'block';
        storyBox.innerHTML = data.story;

        analysisList.innerHTML = ''; 
        if (data.analysis) {
            data.analysis.forEach(item => {
                const safeSent = item.sent.replace(/'/g, "\\'");
                const div = document.createElement('div');
                div.className = 'analysis-item';
                div.innerHTML = `
                    <div class="analysis-sent-row">
                        <button class="btn-tts" onclick="playTTS('${safeSent}')">🔊</button>
                        <span class="jp-sent">${item.sent}</span>
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

    // 2. Vocabulary
    const vocabTbody = document.getElementById('vocab-tbody');
    vocabTbody.innerHTML = ''; 
    
    if (data.vocab && data.vocab.length > 0) {
        data.vocab.forEach((v) => {
            const tr = document.createElement('tr');
            const checkId = `${level}_day${day}_vocab_${v.word}`;
            const isChecked = localStorage.getItem(checkId) === 'true';

            const reading = v.read || v.reading || ""; 
            const meaning = v.mean || v.meaning || "";
            const safeWord = v.word.replace(/'/g, "\\'");

            tr.innerHTML = `
                <td style="text-align:center;"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td style="font-weight:bold;">
                    ${v.word}
                    <button class="btn-tts-sm" onclick="playTTS('${safeWord}')">🔊</button>
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
        vocabTbody.innerHTML = '<tr><td colspan="4">단어 없음</td></tr>';
    }

    // Flashcard
    if (data.vocab && data.vocab.length > 0) {
        window.currentVocabData = data.vocab;
        window.currentCardIndex = 0;
        updateFlashcard();
    }

    // 3. Quiz
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
            
            let optionsHtml = '<div class="quiz-options-grid">';
            options.forEach((optText, idx) => {
                optionsHtml += `<button class="quiz-opt-btn" onclick="checkQuizAnswer(this, ${idx}, ${answerIndex})">${idx+1}. ${optText}</button>`;
            });
            optionsHtml += '</div>';

            div.innerHTML = `
                <div class="quiz-q">Q${i+1}. ${questionText}</div>
                ${optionsHtml}
                <div class="quiz-feedback">
                    <strong>정답: ${options[answerIndex]}</strong>
                    ${q.comment || ""}
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
        prevBtn.classList.add('disabled');
    }
    nextBtn.href = `viewer.html?level=${level}&day=${currentDay+1}`;
    nextBtn.classList.remove('disabled');
}

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

function updateFlashcard() {
    if (!window.currentVocabData) return;
    const vocab = window.currentVocabData[window.currentCardIndex];
    const card = document.getElementById('flashcard');
    const safeWord = vocab.word.replace(/'/g, "\\'");
    
    card.classList.remove('flipped');
    setTimeout(() => {
        card.querySelector('.card-front').innerHTML = `
            <div class="fc-word">${vocab.word}</div>
            <button class="btn-tts-float" onclick="event.stopPropagation(); playTTS('${safeWord}')">🔊</button>
            <div class="fc-hint">클릭해서 뜻 확인</div>
        `;
        card.querySelector('.card-back').innerHTML = `
            <div class="fc-read">${vocab.read || ""}</div>
            <div class="fc-mean">${vocab.mean || ""}</div>
            <button class="btn-tts-float" onclick="event.stopPropagation(); playTTS('${safeWord}')">🔊</button>
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
function flipCard() { document.getElementById('flashcard').classList.toggle('flipped'); }

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
