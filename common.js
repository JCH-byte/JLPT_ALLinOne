/**
 * JLPT Scalable System Logic
 * 기능: 동적 스크립트 로딩, 데이터 병합, 뷰어 제어
 * Updated: 섹션 표시 로직 수정 (display:none 해제)
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

/**
 * [핵심] 레벨별 데이터 파일 동적 로드 함수 (재시도 + 디버깅 정보)
 */
function loadLevelData(level, callback) {
    const upperLevel = level.toUpperCase(); // 'N4'
    const varName = `${upperLevel}_DATA`;   // 'N4_DATA'

    // 이미 메모리에 로드되어 있으면 즉시 반환
    if (window[varName]) {
        callback(window[varName]);
        return;
    }

    // 1차 시도: 소문자 파일명 (data/n5_data.js)
    const scriptPath = `data/${level}_data.js`;
    const script = document.createElement('script');
    script.src = scriptPath; 
    
    script.onload = () => {
        // 로드 성공 후 변수 확인
        if (window[varName]) {
            callback(window[varName]);
        } else {
            // 파일은 불러왔는데 window[varName]이 없는 경우 (주로 const 선언 때문)
            // 비상 대책: eval로 전역 변수 접근 시도 (const 호환)
            try {
                const data = eval(varName);
                if (data) {
                    callback(data);
                    return;
                }
            } catch(e) {}

            console.warn(`[Warning] ${scriptPath} 로드됨, 그러나 ${varName} 변수를 찾을 수 없음. (const 대신 var 사용 권장)`);
            callback({}); 
        }
    };

    script.onerror = () => {
        // 1차 실패 시 대문자 파일명 시도 (N5_data.js)
        console.warn(`[Retry] ${scriptPath} 실패. 대문자 파일명 시도...`);
        
        const scriptUpper = document.createElement('script');
        const scriptUpperPath = `data/${level.toUpperCase()}_data.js`;
        scriptUpper.src = scriptUpperPath;

        scriptUpper.onload = () => {
            if (window[varName]) callback(window[varName]);
            else callback({});
        };

        scriptUpper.onerror = () => {
            // 최종 실패 시 에러 메시지를 위해 null 반환
            console.error(`[Error] 파일 로드 최종 실패.`);
            // 화면에 경로를 보여주기 위해 에러 객체에 경로 포함
            callback(null, scriptPath); 
        };

        document.head.appendChild(scriptUpper);
    };

    document.head.appendChild(script);
}

/**
 * 데이터 병합 (파일 데이터 + 로컬 스토리지 프리뷰)
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
        
        // 파일 로드 완전 실패 (404)
        if (fileData === null) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center; line-height:1.8;">
                    <h3 style="color:#e53935;">⚠️ 데이터 파일을 찾을 수 없습니다.</h3>
                    <p>시스템이 다음 경로에서 파일을 찾으려 했습니다:</p>
                    <code style="background:#eee; padding:5px; border-radius:4px; display:block; margin:10px 0;">${errorPath}</code>
                    <ul style="text-align:left; display:inline-block; font-size:0.9rem; color:#555;">
                        <li>1. <b>data</b> 폴더가 있는지 확인하세요.</li>
                        <li>2. 파일명이 <b>${level}_data.js</b>인지 확인하세요.</li>
                        <li>3. 윈도우에서 <b>.js.js</b>로 저장되지 않았는지 확인하세요.</li>
                    </ul>
                </div>`;
            return;
        }

        const allData = getMergedData(level, fileData);
        const data = allData[day];

        if (!day || !data) {
            container.innerHTML = `<div style="padding:40px; text-align:center;">
                <h3>학습 자료 준비 중</h3><p>Day ${day} 데이터를 생성해주세요.</p>
            </div>`;
            return;
        }

        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    document.getElementById('header-title').textContent = data.title || `Day ${day} 학습`;

    // ------------------------------------------------
    // 1. Story & Analysis Section 처리
    // ------------------------------------------------
    const sectionStory = document.getElementById('section-story');
    const storyBox = document.getElementById('story-content');
    const analysisList = document.getElementById('analysis-list');

    if (data.story) {
        // 데이터가 있으면 섹션을 표시
        sectionStory.style.display = 'block';
        storyBox.innerHTML = data.story;

        // Analysis Rendering
        analysisList.innerHTML = ''; 
        if (data.analysis) {
            data.analysis.forEach(item => {
                const div = document.createElement('div');
                div.className = 'analysis-item';
                div.innerHTML = `
                    <span class="jp-sent">${item.sent}</span>
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
        // 데이터가 없으면 섹션 숨김 유지
        sectionStory.style.display = 'none';
    }

    // ------------------------------------------------
    // 2. Vocabulary Section 처리 (항상 표시)
    // ------------------------------------------------
    const vocabTbody = document.getElementById('vocab-tbody');
    vocabTbody.innerHTML = ''; 
    
    if (data.vocab && data.vocab.length > 0) {
        data.vocab.forEach((v) => {
            const tr = document.createElement('tr');
            const checkId = `${level}_day${day}_vocab_${v.word}`;
            const isChecked = localStorage.getItem(checkId) === 'true';

            const reading = v.read || v.reading || ""; 
            const meaning = v.mean || v.meaning || "";

            tr.innerHTML = `
                <td style="text-align:center;"><input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}></td>
                <td style="font-weight:bold;">${v.word}</td>
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
            
            // 초기 상태 반영
            if(isChecked) tr.classList.add('checked-row');
        });
    } else {
        vocabTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">단어 데이터가 없습니다.</td></tr>';
    }

    // Flashcard Setup (첫 번째 카드)
    if (data.vocab && data.vocab.length > 0) {
        window.currentVocabData = data.vocab;
        window.currentCardIndex = 0;
        updateFlashcard();
    }

    // ------------------------------------------------
    // 3. Quiz Section 처리
    // ------------------------------------------------
    const sectionQuiz = document.getElementById('section-quiz');
    const quizContainer = document.getElementById('quiz-container');
    quizContainer.innerHTML = ''; 

    if (data.quiz && data.quiz.length > 0) {
        // 데이터가 있으면 섹션 표시
        sectionQuiz.style.display = 'block';

        data.quiz.forEach((q, i) => {
            const div = document.createElement('div');
            div.className = 'quiz-item';
            
            const questionText = q.q || q.question || "";
            const options = q.opt || q.options || [];
            let answerIndex = q.ans; // 0-based index
            if (answerIndex === undefined) answerIndex = q.answer;
            const comment = q.comment || "";

            // 객관식 버튼 생성
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
        // 데이터가 없으면 섹션 숨김 유지
        sectionQuiz.style.display = 'none';
    }
    
    // ------------------------------------------------
    // Navigation 처리
    // ------------------------------------------------
    const currentDay = parseInt(day);
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    
    if(currentDay > 1) {
        prevBtn.href = `viewer.html?level=${level}&day=${currentDay-1}`;
        prevBtn.classList.remove('disabled');
    } else {
        prevBtn.classList.add('disabled');
    }
    // 다음 Day가 존재하는지 체크하는 로직은 생략(무조건 활성)하거나, 전체 데이터 길이를 알아야 함.
    // 여기서는 일단 활성화
    nextBtn.href = `viewer.html?level=${level}&day=${currentDay+1}`;
    nextBtn.classList.remove('disabled');
}

// --- Vocabulary View Controls ---
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
    
    // 카드 뒤집기 상태 초기화
    card.classList.remove('flipped');

    // 내용 업데이트 (약간의 딜레이로 뒤집힘 효과 후 내용 변경)
    setTimeout(() => {
        const front = card.querySelector('.card-front');
        const back = card.querySelector('.card-back');
        
        front.innerHTML = `
            <div class="fc-word">${vocab.word}</div>
            <div class="fc-hint">클릭해서 뜻 확인</div>
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
    const feedback = parent.nextElementSibling; // .quiz-feedback
    
    // 이미 정답을 맞췄거나 틀린 후 처리가 끝났으면 클릭 방지 (선택 사항)
    // 여기서는 다시 클릭 가능하게 둠, 하지만 정답 표시는 유지

    // 모든 버튼 초기화 (선택 스타일 제거)
    const buttons = parent.querySelectorAll('.quiz-opt-btn');
    buttons.forEach(b => b.classList.add('disabled')); // 다른 버튼 비활성화

    if (selectedIdx === correctIdx) {
        btn.classList.add('correct');
        feedback.classList.add('visible');
        feedback.style.backgroundColor = '#E8F5E9';
        feedback.style.borderColor = '#C5E1A5';
        feedback.style.color = '#2E7D32';
    } else {
        btn.classList.add('wrong');
        // 정답 버튼 표시
        buttons[correctIdx].classList.add('correct');
        
        feedback.classList.add('visible');
        feedback.style.backgroundColor = '#FFEBEE';
        feedback.style.borderColor = '#FFCDD2';
        feedback.style.color = '#C62828';
    }
}