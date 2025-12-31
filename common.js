/**
 * JLPT Scalable System Logic (GitHub Pages 호환성 강화판)
 * 기능: 동적 스크립트 로딩, 데이터 병합, 뷰어 제어, 경로 자동 탐색
 */

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

/**
 * [핵심] 레벨별 데이터 파일 스마트 로드 함수
 * - 경로와 대소문자를 다양하게 시도하여 파일을 찾습니다.
 */
function loadLevelData(level, callback) {
    const upperLevel = level.toUpperCase(); // 'N5'
    const varName = `${upperLevel}_DATA`;   // 'N5_DATA'

    // 이미 메모리에 로드되어 있으면 즉시 반환
    if (window[varName]) {
        callback(window[varName]);
        return;
    }

    // 시도할 경로 목록 (우선순위 순)
    const pathsToTry = [
        `data/${level}_data.js`,       // 1. data/n5_data.js (권장)
        `data/${upperLevel}_data.js`,  // 2. data/N5_data.js (대문자)
        `${level}_data.js`,            // 3. n5_data.js (루트 경로)
        `${upperLevel}_data.js`        // 4. N5_data.js (루트 대문자)
    ];

    // 재귀적으로 경로 시도
    function tryLoad(index) {
        if (index >= pathsToTry.length) {
            console.error(`[Error] 모든 경로에서 데이터 파일을 찾을 수 없습니다.`);
            callback(null, pathsToTry.join(', ')); // 최종 실패
            return;
        }

        const scriptPath = pathsToTry[index];
        const script = document.createElement('script');
        script.src = scriptPath;

        script.onload = () => {
            // 로드 성공 확인
            if (window[varName]) {
                console.log(`[Success] 데이터 로드 성공: ${scriptPath}`);
                callback(window[varName]);
            } else {
                // 파일은 불러왔지만 변수가 없는 경우 (드문 케이스)
                try {
                    const data = eval(varName); // 최후의 수단
                    if (data) {
                        callback(data);
                        return;
                    }
                } catch(e) {}
                console.warn(`[Warning] ${scriptPath} 로드됨, 변수 ${varName} 없음. 다음 경로 시도.`);
                tryLoad(index + 1);
            }
        };

        script.onerror = () => {
            // 로드 실패(404) 시 다음 경로 시도
            // console.log(`[Info] ${scriptPath} 없음. 다음 시도...`);
            tryLoad(index + 1);
        };

        document.head.appendChild(script);
    }

    // 첫 번째 경로부처 시도 시작
    tryLoad(0);
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
        const container = document.getElementById('viewer-content') || document.body;
        
        // 파일 로드 완전 실패 (404)
        if (fileData === null) {
            container.innerHTML = `
                <div style="padding:40px; text-align:center; line-height:1.8; color:#333;">
                    <h3 style="color:#e53935;">⚠️ 데이터를 찾을 수 없습니다.</h3>
                    <p>깃허브 저장소에 파일이 올바르게 있는지 확인해주세요.</p>
                    <div style="background:#f5f5f5; padding:15px; border-radius:8px; text-align:left; font-size:0.9rem; margin:20px auto; max-width:400px;">
                        <strong>확인할 사항:</strong><br>
                        1. <b>data</b> 라는 이름의 폴더가 있나요?<br>
                        2. 그 안에 <b>${level}_data.js</b> 파일이 있나요?<br>
                        3. 파일 내용에 <code>var ${level.toUpperCase()}_DATA = ...</code> 가 있나요?
                    </div>
                </div>`;
            return;
        }

        const allData = getMergedData(level, fileData);
        const data = allData[day];

        if (!day || !data) {
            container.innerHTML = `<div style="padding:50px; text-align:center;">
                <h3>Day ${day} 학습 자료 준비 중</h3>
                <p>아직 데이터가 등록되지 않았습니다.</p>
                <a href="index.html" class="nav-btn list" style="display:inline-block; margin-top:20px;">목록으로</a>
            </div>`;
            return;
        }

        renderViewerContent(level, day, data);
    });
}

function renderViewerContent(level, day, data) {
    document.title = `[${level.toUpperCase()}] Day ${day}`;
    
    // 헤더 및 뱃지 업데이트
    const titleEl = document.getElementById('header-title');
    if(titleEl) titleEl.textContent = data.title || `Day ${day} 학습`;
    const badgeEl = document.getElementById('badge-level');
    if(badgeEl) badgeEl.textContent = level.toUpperCase();

    // 1. Story (스토리가 있을 때만 표시)
    const storySection = document.getElementById('section-story');
    const storyBox = document.getElementById('story-content');
    const analysisList = document.getElementById('analysis-list');
    
    if (data.story || (data.analysis && data.analysis.length > 0)) {
        if(storySection) storySection.style.display = 'block';
        if(storyBox) storyBox.innerHTML = data.story || "";
        
        if (analysisList && data.analysis) {
            analysisList.innerHTML = '';
            data.analysis.forEach(item => {
                const div = document.createElement('div');
                div.className = 'analysis-item';
                div.innerHTML = `
                    <div class="jp-sent">${item.sent}</div>
                    <div class="kr-trans">${item.trans}</div>
                    <div style="margin-top:8px;">
                        ${(item.tags || []).map(t => `<span class="vocab-tag">${t}</span>`).join('')}
                    </div>
                    ${item.grammar ? `<div class="grammar-point">💡 ${item.grammar}</div>` : ''}
                `;
                analysisList.appendChild(div);
            });
        }
    } else {
        if(storySection) storySection.style.display = 'none';
    }

    // 2. Vocabulary
    const vocabTbody = document.getElementById('vocab-tbody');
    if (vocabTbody) {
        vocabTbody.innerHTML = ''; 
        if (data.vocab && data.vocab.length > 0) {
            data.vocab.forEach((v, idx) => {
                const tr = document.createElement('tr');
                const checkId = `${level}_day${day}_vocab_${idx}`; // 인덱스로 고유키 생성
                const isChecked = localStorage.getItem(checkId) === 'true';

                // row 클래스 추가 (체크된 상태 스타일링용)
                if(isChecked) tr.classList.add('checked-row');

                const reading = v.read || v.reading || ""; 
                const meaning = v.mean || v.meaning || "";

                tr.innerHTML = `
                    <td class="col-check" style="text-align:center;">
                        <input type="checkbox" id="${checkId}" ${isChecked ? 'checked' : ''}>
                    </td>
                    <td class="col-word">${v.word}</td>
                    <td class="col-read">${reading}</td>
                    <td class="col-mean"><span>${meaning}</span></td>
                `;
                vocabTbody.appendChild(tr);

                // 체크박스 이벤트 리스너
                const checkbox = tr.querySelector('input');
                checkbox.addEventListener('change', (e) => {
                    if(e.target.checked) {
                        localStorage.setItem(checkId, 'true');
                        tr.classList.add('checked-row');
                    } else {
                        localStorage.removeItem(checkId);
                        tr.classList.remove('checked-row');
                    }
                });
            });
        } else {
            vocabTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">등록된 단어가 없습니다.</td></tr>';
        }
    }

    // 3. Quiz
    const quizSection = document.getElementById('section-quiz');
    const quizContainer = document.getElementById('quiz-container');
    
    if (data.quiz && data.quiz.length > 0) {
        if(quizSection) quizSection.style.display = 'block';
        if(quizContainer) {
            quizContainer.innerHTML = '';
            data.quiz.forEach((q, i) => {
                const div = document.createElement('div');
                div.className = 'quiz-item';
                
                const questionText = q.q || q.question || "";
                
                // 보기 처리
                let optionsHtml = '';
                if (q.opt && Array.isArray(q.opt)) {
                    optionsHtml = `<div class="quiz-options-grid">` + 
                        q.opt.map((opt, idx) => 
                            `<button class="quiz-opt-btn" onclick="checkQuizAnswer(this, ${idx}, ${q.ans})">${idx + 1}. ${opt}</button>`
                        ).join('') + 
                        `</div>`;
                }

                // 정답 해설 텍스트
                let answerText = "";
                let correctLabel = "";
                if (typeof q.ans === 'number' && q.opt) {
                    correctLabel = q.opt[q.ans];
                    answerText = `정답: <strong>${q.ans + 1}번 (${correctLabel})</strong>`;
                }
                if (q.comment) answerText += `<br>${q.comment}`;

                div.innerHTML = `
                    <div class="quiz-q">Q${i+1}. ${questionText}</div>
                    ${optionsHtml}
                    <div class="quiz-feedback">${answerText}</div>
                `;
                quizContainer.appendChild(div);
            });
        }
    } else {
        if(quizSection) quizSection.style.display = 'none';
    }
    
    // Navigation Links
    const currentDay = parseInt(day);
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    
    if(prevBtn) {
        if(currentDay > 1) {
            prevBtn.href = `viewer.html?level=${level}&day=${currentDay-1}`;
            prevBtn.classList.remove('disabled');
        } else {
            prevBtn.classList.add('disabled');
            prevBtn.href = '#';
        }
    }
    
    if(nextBtn) {
        // 다음 데이터가 있는지 확인은 어렵지만, 일단 링크는 활성화 (없으면 "준비중" 뜸)
        nextBtn.href = `viewer.html?level=${level}&day=${currentDay+1}`;
        nextBtn.classList.remove('disabled');
    }
}

// 퀴즈 정답 확인 함수 (전역)
function checkQuizAnswer(btn, selectedIdx, correctIdx) {
    const parent = btn.closest('.quiz-item');
    const feedback = parent.querySelector('.quiz-feedback');
    const allBtns = parent.querySelectorAll('.quiz-opt-btn');

    // 이미 풀었으면 중단
    if (btn.classList.contains('correct') || btn.classList.contains('wrong') || parent.classList.contains('solved')) return;

    parent.classList.add('solved'); // 풀이 완료 플래그

    if (selectedIdx === correctIdx) {
        btn.classList.add('correct');
        // 다른 버튼 비활성화
        allBtns.forEach(b => { if(b !== btn) b.classList.add('disabled'); });
    } else {
        btn.classList.add('wrong');
        // 정답 버튼 표시
        allBtns[correctIdx].classList.add('correct');
        allBtns.forEach(b => b.classList.add('disabled')); // 전체 비활성화
    }

    // 해설 표시
    if(feedback) feedback.classList.add('visible');
}

// 뷰 모드 토글 (리스트 <-> 카드)
function toggleViewMode(mode) {
    document.getElementById('view-list').style.display = (mode === 'list') ? 'block' : 'none';
    document.getElementById('view-card').style.display = (mode === 'card') ? 'block' : 'none';
    
    document.getElementById('btn-mode-list').classList.toggle('active', mode === 'list');
    document.getElementById('btn-mode-card').classList.toggle('active', mode === 'card');

    if(mode === 'card') initFlashcards();
}

// 뜻 가리기 토글
function toggleMeanings() {
    const table = document.getElementById('vocab-table');
    const btn = document.getElementById('btn-toggle-mean');
    
    if (table.classList.contains('hide-meanings')) {
        table.classList.remove('hide-meanings');
        btn.textContent = '🙈 뜻 가리기';
        btn.classList.remove('active');
    } else {
        table.classList.add('hide-meanings');
        btn.textContent = '🐵 뜻 보이기';
        btn.classList.add('active');
    }
}

// --- Flashcard Logic (간단 구현) ---
let currentCardIdx = 0;
let cardData = [];

function initFlashcards() {
    // 현재 테이블의 데이터 읽어오기 (단순화)
    cardData = [];
    document.querySelectorAll('#vocab-tbody tr').forEach(tr => {
        cardData.push({
            word: tr.querySelector('.col-word').textContent,
            read: tr.querySelector('.col-read').textContent,
            mean: tr.querySelector('.col-mean span').textContent
        });
    });
    
    if(cardData.length > 0) {
        currentCardIdx = 0;
        renderCard();
    } else {
        document.getElementById('flashcard').innerHTML = '<div class="card-face card-front">데이터 없음</div>';
    }
}

function renderCard() {
    const item = cardData[currentCardIdx];
    const total = cardData.length;
    const card = document.getElementById('flashcard');
    
    // Reset flip
    card.classList.remove('flipped');
    
    // Front
    card.querySelector('.card-front').innerHTML = `
        <div class="fc-word">${item.word}</div>
        <div class="fc-hint">클릭해서 뜻 확인</div>
    `;
    
    // Back
    card.querySelector('.card-back').innerHTML = `
        <div class="fc-word">${item.word}</div>
        <div class="fc-read">${item.read}</div>
        <div class="fc-mean">${item.mean}</div>
    `;
    
    document.getElementById('card-counter').textContent = `${currentCardIdx + 1} / ${total}`;
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
}

function prevCard() {
    if(currentCardIdx > 0) {
        currentCardIdx--;
        renderCard();
    }
}

function nextCard() {
    if(currentCardIdx < cardData.length - 1) {
        currentCardIdx++;
        renderCard();
    }
}
