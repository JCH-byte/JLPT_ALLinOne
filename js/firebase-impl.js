import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, deleteField } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


/**
 * ==========================================
 * [JLPT Sync] Firebase Module (Complete Version)
 * - 로그인 시: 높은 진도율 & 완료된 항목 기준으로 병합
 * - 학습 중: localStorage 변경(저장/삭제) 자동 감지 및 업로드
 * - 실시간: 다른 기기에서의 변경사항 수신
 * ==========================================
 */

// bookmark-service.js와 동일한 키 사용 (대소문자 중요)
const BOOKMARK_KEY = 'JLPT_BOOKMARKS';

const firebaseConfig = {
  apiKey: "AIzaSyDPKCmfvA_uepqu4MA8tzendnGRy-H6ZgI",
  authDomain: "jlpt-project-01.firebaseapp.com",
  projectId: "jlpt-project-01",
  storageBucket: "jlpt-project-01.firebasestorage.app",
  messagingSenderId: "828971360762",
  appId: "1:828971360762:web:5a9e9fa6948be5cdd20443",
  measurementId: "G-LE41KRV8TX"
};

// Initialize Firebase
let app, auth, db, userRef = null;
let unsubscribeSnapshot = null;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("[Firebase] Initialized Successfully");
} catch (e) {
    console.error("[Firebase] Init Failed", e);
}

const safeParse = (val) => {
    try {
        if (typeof val === 'number') return val;
        const parsed = JSON.parse(val);
        return parsed;
    } catch (e) {
        return val;
    }
};


const toBookmarkArray = (value) => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []);

const normalizeBookmarkItem = (item) => ({
    level: item.level || '',
    day: item.day != null ? String(item.day) : '',
    word: item.word || '',
    read: item.read || '',
    mean: item.mean || '',
    addedAt: item.addedAt || ''
});

const makeBookmarkKey = (item) => `${item.level}-${item.day}-${item.word}`;

const mergeBookmarks = (firstList, secondList) => {
    const mergedMap = new Map();
    const mergedOrder = [...toBookmarkArray(firstList), ...toBookmarkArray(secondList)];

    mergedOrder.forEach((raw) => {
        const item = normalizeBookmarkItem(raw);
        if (!item.level || !item.word) return;

        const key = makeBookmarkKey(item);
        const existing = mergedMap.get(key);

        if (!existing) {
            mergedMap.set(key, item);
            return;
        }

        const existingTs = Date.parse(existing.addedAt || '') || 0;
        const itemTs = Date.parse(item.addedAt || '') || 0;

        if (itemTs >= existingTs) {
            mergedMap.set(key, { ...existing, ...item, addedAt: item.addedAt || existing.addedAt });
        }
    });

    return Array.from(mergedMap.values());
};

// 권한 오류 발생 시 사용자에게 알림 (최초 1회만)
let permissionAlertShown = false;
const checkPermissionError = (e) => {
    if (e.code === 'permission-denied' && !permissionAlertShown) {
        permissionAlertShown = true;
        alert(
            "⚠️ 데이터 저장 실패: 권한이 없습니다.\n\n" +
            "Firebase Console > Firestore Database > 규칙(Rules) 탭에서\n" +
            "쓰기 권한(allow read, write)을 허용했는지 확인해주세요."
        );
    }
};

/**
 * [핵심 기능 1] localStorage 변경 감지 (Monkey Patching)
 * - setItem: 데이터 저장/수정 감지
 * - removeItem: 데이터 삭제(체크 해제) 감지
 */
const originalSetItem = localStorage.setItem;
const originalRemoveItem = localStorage.removeItem;

// 1-1. 저장 감지
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);

    if (auth && auth.currentUser && userRef) {
        // _complete: 대시보드 체크박스, bookmarks: 단어장, settings: 설정, _v_: 단어별 체크
        if (key.includes('_complete') || key === BOOKMARK_KEY || key.startsWith('settings_') || key.startsWith('progress_') || key.includes('_v_')) {
            window.FirebaseBridge.syncToCloud(key, value);
        }
    }
};

// 1-2. 삭제 감지 (체크박스 해제 시 필요)
localStorage.removeItem = function(key) {
    originalRemoveItem.apply(this, arguments);

    if (auth && auth.currentUser && userRef) {
        if (key.includes('_complete') || key === BOOKMARK_KEY || key.includes('_v_')) {
            window.FirebaseBridge.removeFromCloud(key);
        }
    }
};


/**
 * [핵심 기능 2] 로그인 시 데이터 병합 전략
 * - 진도율: 더 높은 숫자 우선
 * - 완료체크(_complete): 하나라도 'true'면 완료 처리 (True Wins)
 * - [FIX] 단어장: 로컬과 서버 데이터를 합집합(Union)으로 병합
 */
async function syncHighProgressStrategy(cloudData) {
    let updatesToCloud = {};
    let hasUpdates = false;
    let localUpdated = false;

    console.log("[Sync] Checking for data consistency...");

    Object.keys(cloudData).forEach(key => {
        const cloudVal = cloudData[key];
        const localRaw = localStorage.getItem(key);
        const localVal = safeParse(localRaw);

        // A. 대시보드 완료 체크박스 (_complete) - 하나라도 완료면 완료로 처리
        if (key.endsWith('_complete')) {
            if (String(cloudVal) === 'true' && localRaw !== 'true') {
                originalSetItem.call(localStorage, key, 'true');
                localUpdated = true;
            } else if (String(cloudVal) !== 'true' && localRaw === 'true') {
                updatesToCloud[key] = 'true';
                hasUpdates = true;
            }
        }
        // B. 진도율 데이터 (숫자 비교)
        else if (key.startsWith('progress_')) {
            const cloudNum = Number(cloudVal) || 0;
            const localNum = Number(localVal) || 0;

            if (cloudNum > localNum) {
                originalSetItem.call(localStorage, key, cloudNum);
                localUpdated = true;
            } else if (localNum > cloudNum) {
                updatesToCloud[key] = localNum;
                hasUpdates = true;
            }
        } 
        // C. 단어별 체크 (_v_) - True Wins (_complete 와 동일 전략)
        else if (key.includes('_v_')) {
            if (String(cloudVal) === 'true' && localRaw !== 'true') {
                originalSetItem.call(localStorage, key, 'true');
                localUpdated = true;
            } else if (String(cloudVal) !== 'true' && localRaw === 'true') {
                updatesToCloud[key] = 'true';
                hasUpdates = true;
            }
        }
        // D. [FIX] 북마크 (병합 로직 적용)
        else if (key === BOOKMARK_KEY) {
             const localList = toBookmarkArray(localVal);
             const cloudList = toBookmarkArray(cloudVal);
             const mergedList = mergeBookmarks(localList, cloudList);

             if (JSON.stringify(localList) !== JSON.stringify(mergedList)) {
                 originalSetItem.call(localStorage, key, JSON.stringify(mergedList));
                 localUpdated = true;
             }

             if (JSON.stringify(cloudList) !== JSON.stringify(mergedList)) {
                 updatesToCloud[key] = mergedList;
                 hasUpdates = true;
             }
        }
    });

    // D. 로컬에만 있는 데이터 서버로 업로드
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // 동기화 대상 키인지 확인
        if ((key.endsWith('_complete') || key.startsWith('progress_') || key === BOOKMARK_KEY || key.includes('_v_')) && cloudData[key] === undefined) {
            updatesToCloud[key] = safeParse(localStorage.getItem(key));
            hasUpdates = true;
        }
    }

    if (hasUpdates) {
        try {
            await setDoc(userRef, updatesToCloud, { merge: true });
            console.log(`[Sync] Uploaded newer local data to Cloud.`);
        } catch (e) {
            checkPermissionError(e);
        }
    }

    if (localUpdated) {
        console.log("[Sync] Data merged. Reloading UI...");
        window.location.reload(); 
    }
}

// Global Bridge Object
window.FirebaseBridge = {
    user: null,
    
    login: async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            if (error.code === 'auth/unauthorized-domain') {
                const currentDomain = window.location.hostname;
                alert(`[도메인 승인 필요]\nFirebase Console에 다음 도메인을 추가하세요:\n${currentDomain}`);
            } else {
                alert("로그인 실패: " + error.message);
            }
        }
    },

    logout: async () => {
        if (!confirm("로그아웃 하시겠습니까?")) return;
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            console.error("Logout failed", error);
        }
    },

    // 데이터 업로드 (setItem 훅에서 호출)
    syncToCloud: async (key, rawValue) => {
        if (!userRef) return;
        try {
            const val = safeParse(rawValue);

            if (key === BOOKMARK_KEY) {
                const localList = toBookmarkArray(val);
                const docSnap = await getDoc(userRef);
                const cloudList = toBookmarkArray(docSnap.exists() ? docSnap.data()?.[BOOKMARK_KEY] : []);
                const mergedList = mergeBookmarks(cloudList, localList);
                await setDoc(userRef, { [key]: mergedList }, { merge: true });
                return;
            }

            await setDoc(userRef, { [key]: val }, { merge: true });
        } catch (e) {
            checkPermissionError(e);
        }
    },

    // 데이터 삭제 (removeItem 훅에서 호출)
    removeFromCloud: async (key) => {
        if (!userRef) return;
        try {
            // 필드 삭제 명령
            await updateDoc(userRef, { [key]: deleteField() });
            // console.log(`[Sync] Removed: ${key}`);
        } catch (e) {
            console.warn("[Sync] Remove failed", e);
        }
    },

};

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('google-login-btn');
    const userDisplay = document.getElementById('user-info-display');
    
    if (user) {
        window.FirebaseBridge.user = user;
        userRef = doc(db, "users", user.uid);
        
        if (loginBtn) {
            loginBtn.innerHTML = "<span>로그아웃</span>";
            loginBtn.classList.add('logout');
            loginBtn.onclick = window.FirebaseBridge.logout;
        }
        if (userDisplay) userDisplay.innerText = `${user.displayName}님`;
        
        // 로그인 시 데이터 병합 수행
        try {
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                await syncHighProgressStrategy(docSnap.data());
            } else {
                // 신규 유저 초기 데이터 업로드
                const initialData = {};
                for (let i=0; i<localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.endsWith('_complete') || key === BOOKMARK_KEY || key.includes('_v_')) {
                        initialData[key] = safeParse(localStorage.getItem(key));
                    }
                }
                if (Object.keys(initialData).length === 0) initialData['created_at'] = new Date().toISOString();
                await setDoc(userRef, initialData);
            }
        } catch (e) {
            checkPermissionError(e);
        }

        // 실시간 리스너 (다른 기기 변경사항 반영)
        unsubscribeSnapshot = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                let needRefresh = false;

                Object.keys(data).forEach(k => {
                    // 서버에 '_complete' 키가 있고 'true'인데 로컬에 없으면 -> 완료 처리
                    if (k.endsWith('_complete')) {
                         if (String(data[k]) === 'true' && localStorage.getItem(k) !== 'true') {
                             originalSetItem.call(localStorage, k, 'true');
                             needRefresh = true;
                         }
                    }

                    // 단어별 체크 (_v_) 실시간 동기화 - True Wins
                    if (k.includes('_v_')) {
                        if (String(data[k]) === 'true' && localStorage.getItem(k) !== 'true') {
                            originalSetItem.call(localStorage, k, 'true');
                            needRefresh = true;
                        }
                    }

                    // [FIX] 북마크 실시간 동기화 처리 추가
                    if (k === BOOKMARK_KEY) {
                        const cloudList = toBookmarkArray(data[k]);
                        const localList = toBookmarkArray(safeParse(localStorage.getItem(k)));
                        const mergedList = mergeBookmarks(cloudList, localList);

                        const mergedStr = JSON.stringify(mergedList);
                        const localStr = JSON.stringify(localList);
                        const cloudStr = JSON.stringify(cloudList);

                        if (mergedStr !== localStr) {
                            originalSetItem.call(localStorage, k, mergedStr);
                            if (window.refreshStarredList && typeof window.refreshStarredList === 'function') {
                                window.refreshStarredList();
                            }
                        }

                        if (mergedStr !== cloudStr && userRef) {
                            setDoc(userRef, { [k]: mergedList }, { merge: true }).catch(checkPermissionError);
                        }
                    }
                });

                if (needRefresh) window.location.reload();
            }
        });

    } else {
        window.FirebaseBridge.user = null;
        userRef = null;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        
        if (loginBtn) {
            loginBtn.innerHTML = "<span>Google 로그인</span>";
            loginBtn.classList.remove('logout');
            loginBtn.onclick = window.FirebaseBridge.login;
        }
        if (userDisplay) userDisplay.innerText = "";
    }
});