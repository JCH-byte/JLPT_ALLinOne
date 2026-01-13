/**
 * JLPT Learning System Logic (Hybrid Sync Enhanced)
 * 기능: Firebase 연동, 데이터 동기화, UI 로직 추상화
 * * [설계 변경점]
 * 1. Firebase Modular SDK를 Dynamic Import로 로드 (viewer.html 수정 불필요)
 * 2. DataManager: 로컬 스토리지와 Firestore 간의 데이터 중개
 * 3. initViewer 등 주요 함수를 비동기 대기 후 실행하도록 래핑
 */

// 1. Firebase Config (사용자 입력 적용됨)
const firebaseConfig = {
    apiKey: "AIzaSyCAaKmb4w9Ddyf5ZtelmK3cBAmjUvAD6vI",
    authDomain: "jlpt-project-01.firebaseapp.com",
    projectId: "jlpt-project-01",
    storageBucket: "jlpt-project-01.firebasestorage.app",
    messagingSenderId: "828971360762",
    appId: "1:828971360762:web:d9f14ee8d9e75597d20443",
    measurementId: "G-L2Y3GNWLE8"
};

// 2. Global State & DataManager
window.AppState = {
    user: null,
    isFirebaseReady: false,
    firestoreData: { bookmarks: [], progress: {} }, // 메모리 캐시
    pendingWrites: null // 디바운싱용
};

// 데이터 추상화 객체 (LocalStorage와 Firestore를 투명하게 연결)
const DataManager = {
    // 읽기: 로그인 시 메모리 캐시(Firestore 데이터) 우선, 아니면 로컬스토리지
    get: (key) => {
        if (window.AppState.user && window.AppState.isFirebaseReady) {
            return window.AppState.firestoreData.progress[key] ? 'true' : null;
        }
        return localStorage.getItem(key);
    },
    
    // 쓰기: 로그인 시 메모리 캐시 업데이트 + Firestore 저장, 아니면 로컬스토리지
    set: (key, value) => {
        if (window.AppState.user) {
            window.AppState.firestoreData.progress[key] = true; // Firestore 구조에 맞게 저장
            scheduleFirestoreWrite();
            // 오프라인 백업용으로 로컬에도 저장
            localStorage.setItem(key, value); 
        } else {
            localStorage.setItem(key, value);
        }
    },

    remove: (key) => {
        if (window.AppState.user) {
            delete window.AppState.firestoreData.progress[key];
            scheduleFirestoreWrite();
            localStorage.removeItem(key);
        } else {
            localStorage.removeItem(key);
        }
    },

    // 북마크 로드
    getBookmarks: () => {
        if (window.AppState.user && window.AppState.isFirebaseReady) {
            return window.AppState.firestoreData.bookmarks || [];
        }
        try {
            return JSON.parse(localStorage.getItem('JLPT_BOOKMARKS') || '[]');
        } catch (e) { return []; }
    },

    // 북마크 저장
    saveBookmarks: (bookmarks) => {
        if (window.AppState.user) {
            window.AppState.firestoreData.bookmarks = bookmarks;
            scheduleFirestoreWrite();
            localStorage.setItem('JLPT_BOOKMARKS', JSON.stringify(bookmarks));
        } else {
            localStorage.setItem('JLPT_BOOKMARKS', JSON.stringify(bookmarks));
        }
    }
};

// 글로벌 노출 (다른 파일에서 접근 가능하도록)
window.DataManager = DataManager;


// 3. Firebase Logic (Dynamic Imports for Compatibility)
let auth, db, signInWithPopup, GoogleAuthProvider, signOut, doc, getDoc, setDoc, updateDoc;

async function initFirebase() {
    try {
        if (!firebaseConfig.apiKey) {
            console.warn("Firebase Config가 설정되지 않았습니다. 로컬 모드로 동작합니다.");
            window.AppState.isFirebaseReady = true;
            return;
        }

        // Dynamic Import: type="module" 없이 모듈 로드
        const appModule = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js");
        const authModule = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js");
        const firestoreModule = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");

        const app = appModule.initializeApp(firebaseConfig);
        auth = authModule.getAuth(app);
        db = firestoreModule.getFirestore(app);
        
        // 함수 할당
        signInWithPopup = authModule.signInWithPopup;
        GoogleAuthProvider = authModule.GoogleAuthProvider;
        signOut = authModule.signOut;
        doc = firestoreModule.doc;
        getDoc = firestoreModule.getDoc;
        setDoc = firestoreModule.setDoc;
        updateDoc = firestoreModule.updateDoc;

        // Auth Listener setup
        authModule.onAuthStateChanged(auth, async (user) => {
            window.AppState.user = user;
            updateAuthUI(user); // UI 즉시 반영

            if (user) {
                await syncData(user);
            }
            
            window.AppState.isFirebaseReady = true;
            
            // 대기 중인 렌더링 작업 실행 (이벤트 발생)
            window.dispatchEvent(new Event('firebase-ready'));
        });

    } catch (e) {
        console.error("Firebase Init Failed:", e);
        // 실패해도 로컬 모드로 동작하도록 플래그 설정
        window.AppState.isFirebaseReady = true;
        window.dispatchEvent(new Event('firebase-ready'));
    }
}

// 데이터 동기화 (Merge Logic)
async function syncData(user) {
    const userRef = doc(db, "users", user.uid);
    let remoteData = { bookmarks: [], progress: {} };

    try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            remoteData = docSnap.data();
        }

        // Local Data 읽기
        const localBookmarks = JSON.parse(localStorage.getItem('JLPT_BOOKMARKS') || '[]');
        const localProgress = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('_day') && key.endsWith('_complete')) {
                localProgress[key] = true;
            }
        }

        // MERGE: Remote + Local (Union)
        // 1. Progress: 둘 중 하나라도 true면 true
        const mergedProgress = { ...remoteData.progress, ...localProgress };
        
        // 2. Bookmarks: 단어+레벨+Day 기준으로 중복 제거 병합
        const bookmarkMap = new Map();
        [...remoteData.bookmarks, ...localBookmarks].forEach(b => {
            const id = `${b.level}-${b.day}-${b.word}`;
            if (!bookmarkMap.has(id)) bookmarkMap.set(id, b);
        });
        const mergedBookmarks = Array.from(bookmarkMap.values());

        // 메모리 업데이트
        window.AppState.firestoreData = {
            bookmarks: mergedBookmarks,
            progress: mergedProgress
        };

        // Firestore에 병합된 데이터 저장 (초기 1회)
        await setDoc(userRef, {
            bookmarks: mergedBookmarks,
            progress: mergedProgress
        }, { merge: true });

        console.log("Data Synced Successfully");
        
        // 동기화 후 UI 갱신 (진행률 등 반영을 위해)
        if(window.switchLevel) window.switchLevel(localStorage.getItem('last_level') || 'n4');

    } catch (e) {
        console.error("Sync Error:", e);
    }
}

// Firestore 쓰기 최적화 (Debounce)
function scheduleFirestoreWrite() {
    if (!window.AppState.user) return;
    
    if (window.AppState.pendingWrites) clearTimeout(window.AppState.pendingWrites);
    
    window.AppState.pendingWrites = setTimeout(async () => {
        try {
            const userRef = doc(db, "users", window.AppState.user.uid);
            await setDoc(userRef, window.AppState.firestoreData, { merge: true });
            console.log("Saved to Firestore");
        } catch (e) { console.error("Save failed", e); }
    }, 1000); // 1초 딜레이
}

// 4. UI Helper Functions (Updated for Top-Right Auth)
function updateAuthUI(user) {
    // 1. 사이드바용 요소 (Mobile fallback or if exists)
    const btnLogin = document.getElementById('btn-login'); 
    
    // 2. 상단 플로팅 요소 (New)
    const btnTopLogin = document.getElementById('btn-top-login');
    const topProfileWrapper = document.getElementById('top-profile-wrapper');
    const topUserPhoto = document.getElementById('top-user-photo');
    const btnTopLogout = document.getElementById('btn-top-logout');
    
    // 메뉴 내부 정보
    const menuUserPhoto = document.getElementById('menu-user-photo');
    const menuUserName = document.getElementById('menu-user-name');
    const menuUserEmail = document.getElementById('menu-user-email');

    // 공통 로그인 핸들러
    const handleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try { await signInWithPopup(auth, provider); } 
        catch (e) { alert("로그인 실패: " + e.message); }
    };

    // 공통 로그아웃 핸들러
    const handleLogout = () => {
        signOut(auth).then(() => window.location.reload());
    };

    if (user) {
        // [로그인 상태]
        if(btnLogin) btnLogin.style.display = 'none';
        
        if(btnTopLogin) btnTopLogin.style.display = 'none';
        if(topProfileWrapper) topProfileWrapper.style.display = 'block';

        const photoUrl = user.photoURL || 'https://via.placeholder.com/40';
        
        // 상단 프로필 이미지 설정
        if(topUserPhoto) topUserPhoto.src = photoUrl;
        
        // 드롭다운 메뉴 내부 정보 설정
        if(menuUserPhoto) menuUserPhoto.src = photoUrl;
        if(menuUserName) menuUserName.textContent = user.displayName;
        if(menuUserEmail) menuUserEmail.textContent = user.email;
        
        // 로그아웃 버튼 연결
        if(btnTopLogout) btnTopLogout.onclick = handleLogout;

    } else {
        // [비로그인 상태]
        if(btnLogin) {
            btnLogin.style.display = 'block';
            btnLogin.onclick = handleLogin;
        }

        if(btnTopLogin) {
            btnTopLogin.style.display = 'flex';
            btnTopLogin.onclick = handleLogin;
        }
        if(topProfileWrapper) topProfileWrapper.style.display = 'none';
    }
}

// 외부에서 Firebase 준비 대기용 함수
window.waitForFirebase = function() {
    return new Promise(resolve => {
        if (window.AppState.isFirebaseReady) resolve();
        else window.addEventListener('firebase-ready', () => resolve(), { once: true });
    });
};

// =========================================================
// Existing Logic (Modified for DataManager & Async Init)
// =========================================================

// URL 파라미터 유틸
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 음성 목록 캐싱 및 TTS (변경 없음)
let availableVoices = [];   
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { availableVoices = window.speechSynthesis.getVoices(); };
}
function speak(text) {
    if (!text) return;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('rt, rp').forEach(el => el.remove());
    const cleanText = tempDiv.textContent || tempDiv.innerText;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP'; utterance.rate = 0.9;
    if (availableVoices.length === 0) availableVoices = window.speechSynthesis.getVoices();
    const jpVoices = availableVoices.filter(voice => voice.lang === 'ja-JP' || voice.lang === 'ja_JP');
    let selectedVoice = jpVoices.find(v => v.name.includes('Google')) || jpVoices[0];
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
        const localStr = localStorage.getItem(DEV_KEY); // 개발 데이터는 로컬 전용 유지
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
// Bookmark Logic (Updated to use DataManager)
// ----------------------------------------------------
function getBookmarks() {
    return DataManager.getBookmarks();
}

function isStarred(level, day, word) {
    const bookmarks = getBookmarks();
    return bookmarks.some(b => b.level === level && b.day == day && b.word === word);
}

function toggleStar(level, day, wordData, btnElement) {
    let bookmarks = getBookmarks();
    const existingIndex = bookmarks.findIndex(b => b.level === level && b.day == day && b.word === wordData.word);
    
    if (existingIndex > -1) {
        bookmarks.splice(existingIndex, 1);
        if(btnElement) {
            btnElement.classList.remove('active');
            btnElement.innerHTML = '☆';
        }
    } else {
        bookmarks.push({
            level: level, day: day, word: wordData.word,
            read: wordData.read || wordData.reading || '',
            mean: wordData.mean || wordData.meaning || '',
            addedAt: new Date().toISOString()
        });
        if(btnElement) {
            btnElement.classList.add('active');
            btnElement.innerHTML = '★';
        }
    }
    
    DataManager.saveBookmarks(bookmarks);
    if(window.refreshStarredList) window.refreshStarredList();
}


// ----------------------------------------------------
// Viewer Controller (Updated for Async Init & DataManager)
// ----------------------------------------------------

// viewer.html에서 호출되는 메인 함수
async function initViewer() {
    // 1. Firebase 로드 대기
    await window.waitForFirebase();

    // 2. 기존 로직 실행
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

    // Story Section (Fixed: Analysis rendering restoration)
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
                // [복구 완료] 태그와 문법 포인트 표시 로직 복원
                div.innerHTML = `
                    <div class="jp-sent">🔊 ${item.sent}</div>
                    <div class="kr-trans">${item.trans}</div>
                    <div class="tags">${(item.tags || []).map(t => `<span class="vocab-tag">${t}</span>`).join('')}</div>
                    ${item.grammar ? `<div class="grammar-point">💡 ${item.grammar}</div>` : ''}
                `;
                analysisList.appendChild(div);
            });
        }
    } else if (storySection) storySection.style.display = 'none';

    // Vocab Section (Updated for DataManager)
    const vocabTbody = document.getElementById('vocab-tbody');
    const vocabSection = document.getElementById('section-vocab') || (vocabTbody ? vocabTbody.closest('section') : null);

    if (vocabTbody && data.vocab.length > 0) {
        if(vocabSection) vocabSection.style.display = 'block';
        vocabTbody.innerHTML = '';
        data.vocab.forEach((v, idx) => {
            const tr = document.createElement('tr');
            
            // [변경] DataManager 사용
            const checkId = `${level}_day${day}_v_${idx}`;
            const isChecked = DataManager.get(checkId) === 'true';
            
            const isStar = isStarred(level, day, v.word);
            tr.className = isChecked ? 'checked-row' : '';
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
            
            // [변경] 이벤트 리스너에서 DataManager 사용
            tr.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                if(e.target.checked) { 
                    DataManager.set(checkId, 'true'); 
                    tr.classList.add('checked-row'); 
                } else { 
                    DataManager.remove(checkId); 
                    tr.classList.remove('checked-row'); 
                }
            });
            vocabTbody.appendChild(tr);
        });
        if(typeof renderFlashcards === 'function') renderFlashcards(data.vocab);
    } else if (vocabSection) vocabSection.style.display = 'none';

    // Quiz Section (변경 없음)
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
            if (typeof q.ans === 'number') ansIdx = q.ans;
            else if (typeof q.ans === 'string') { const match = q.ans.match(/^(\d+)\./); if (match) ansIdx = parseInt(match[1]) - 1; }
            const comment = q.comment || "정답입니다!";
            const safeComment = comment.replace(/"/g, '&quot;'); 

            let html = `<div class="quiz-q">Q${i+1}. ${qText}</div>`;
            if (Array.isArray(opts) && opts.length > 0) {
                html += `<div class="quiz-options-grid">`;
                opts.forEach((opt, oIdx) => {
                    html += `<button class="quiz-opt-btn" data-is-correct="${oIdx === ansIdx}" data-correct-idx="${ansIdx}" data-comment="${safeComment}" onclick="checkAnswer(this)">${oIdx + 1}. ${opt}</button>`;
                });
                html += `</div><div class="quiz-feedback" id="quiz-feedback-${i}"></div>`;
            }
            div.innerHTML = html;
            quizContainer.appendChild(div);
        });
    } else if (quizSection) quizSection.style.display = 'none';

    updateNavButtons(level, parseInt(day));
}

// 퀴즈 및 UI 헬퍼 함수들 (기존 유지)
function checkAnswer(btn) {
    const isCorrect = btn.dataset.isCorrect === 'true';
    const correctIdx = btn.dataset.correctIdx; 
    const comment = btn.dataset.comment;
    const parent = btn.parentElement; 
    const feedbackEl = parent.nextElementSibling;
    const allBtns = parent.querySelectorAll('.quiz-opt-btn');

    if (parent.classList.contains('solved')) return;
    parent.classList.add('solved');

    allBtns.forEach((b, idx) => {
        b.classList.add('disabled');
        if (idx == correctIdx) b.classList.add('correct');
    });

    if (isCorrect) {
        btn.classList.add('correct');
        feedbackEl.innerHTML = `<strong>⭕ 정답입니다!</strong>${comment}`;
        feedbackEl.classList.add('visible');
    } else {
        btn.classList.add('wrong');
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

// Initialize Firebase immediately
initFirebase();
