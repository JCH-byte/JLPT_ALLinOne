import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * ==========================================
 * [JLPT Sync] Firebase Module (Enhanced)
 * - 로그인 시: 높은 진도율 기준으로 데이터 병합 (Merge)
 * - 학습 중: localStorage 변경을 자동 감지하여 업로드 (Auto-Sync)
 * - 실시간: 다른 기기에서의 변경사항 수신 (Real-time)
 * ==========================================
 */

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
let unsubscribeSnapshot = null; // 실시간 리스너 해제용

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("[Firebase] Initialized Successfully");
} catch (e) {
    console.error("[Firebase] Init Failed", e);
}

// Helper: JSON 파싱 및 숫자 변환
const safeParse = (val) => {
    try {
        // 이미 숫자라면 그대로 반환
        if (typeof val === 'number') return val;
        // JSON 파싱 시도
        const parsed = JSON.parse(val);
        return parsed;
    } catch (e) {
        return val; // 파싱 실패 시 원본 반환 (일반 문자열 등)
    }
};

/**
 * [핵심 기능 1] localStorage 변경 감지 (Monkey Patching)
 * 기존 코드가 localStorage.setItem을 호출할 때마다 이 함수가 실행됩니다.
 */
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    // 1. 원래 동작 수행 (로컬 저장)
    originalSetItem.apply(this, arguments);

    // 2. 로그인 상태라면 클라우드로 자동 업로드
    if (auth && auth.currentUser && userRef) {
        // 동기화 대상 키인지 확인 (진도율, 북마크 등)
        if (key.startsWith('progress_') || key === 'jlpt_bookmarks' || key.startsWith('settings_')) {
            window.FirebaseBridge.syncToCloud(key, value);
        }
    }
};

/**
 * [핵심 기능 2] 로그인 시 데이터 병합 전략 (High-Score Wins)
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

        // A. 진도율 데이터 (숫자 비교)
        if (key.startsWith('progress_')) {
            const cloudNum = Number(cloudVal) || 0;
            const localNum = Number(localVal) || 0;

            if (cloudNum > localNum) {
                // 서버가 더 높음 -> 로컬 업데이트
                originalSetItem.call(localStorage, key, cloudNum); // 무한루프 방지 위해 original 호출
                localUpdated = true;
                console.log(`[Sync] Local updated: ${key} (${localNum} -> ${cloudNum})`);
            } else if (localNum > cloudNum) {
                // 로컬이 더 높음 -> 서버 업데이트 예정
                updatesToCloud[key] = localNum;
                hasUpdates = true;
            }
        } 
        // B. 북마크 및 기타 데이터 (단순 덮어쓰기 or 병합)
        else if (key === 'jlpt_bookmarks') {
             // 북마크는 로컬/서버 합집합을 만들 수도 있지만, 복잡하므로 서버 데이터 우선으로 처리
             // (필요 시 로직 수정 가능)
             const cloudStr = JSON.stringify(cloudVal);
             if (localRaw !== cloudStr) {
                 originalSetItem.call(localStorage, key, cloudStr);
                 localUpdated = true;
             }
        }
    });

    // C. 로컬에만 있는 데이터 서버로 업로드
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if ((key.startsWith('progress_') || key === 'jlpt_bookmarks') && cloudData[key] === undefined) {
            updatesToCloud[key] = safeParse(localStorage.getItem(key));
            hasUpdates = true;
        }
    }

    // 서버 업데이트 실행
    if (hasUpdates) {
        try {
            await setDoc(userRef, updatesToCloud, { merge: true });
            console.log(`[Sync] Uploaded newer local data to Cloud.`);
        } catch (e) {
            console.error("[Sync] Upload failed", e);
        }
    }

    // 로컬 데이터가 변경되었으면 UI 갱신을 위해 새로고침 제안
    if (localUpdated) {
        console.log("[Sync] Data merged. Reloading UI...");
        // 부드러운 UI 갱신을 위해 reload 대신 이벤트 발송을 할 수도 있지만, 
        // 확실한 반영을 위해 페이지 리로드를 수행합니다.
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
            console.error("Login failed", error);
            if (error.code === 'auth/unauthorized-domain') {
                const currentDomain = window.location.hostname;
                alert(`[Firebase 설정 필요]\n현재 도메인이 승인되지 않았습니다.\n\nFirebase Console > Authentication > Settings > Authorized Domains에 아래 도메인을 추가해주세요:\n\n${currentDomain}`);
                prompt("복사해서 설정에 추가하세요:", currentDomain);
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

    // 개별 데이터 업로드 (자동 감지로 인해 직접 호출할 일은 줄어듦)
    syncToCloud: async (key, rawValue) => {
        if (!userRef) return;
        
        try {
            // rawValue가 JSON 문자열일 수 있으므로 파싱 시도
            const val = safeParse(rawValue);
            
            // 진도율인 경우, 서버 값과 비교하여 작으면 업로드하지 않음 (Safety Check)
            if (key.startsWith('progress_')) {
                const docSnap = await getDoc(userRef); // *빈번한 호출 시 최적화 필요
                if (docSnap.exists()) {
                    const serverVal = docSnap.data()[key] || 0;
                    if (Number(val) < Number(serverVal)) {
                        // console.log(`[Sync] Skip upload: Local(${val}) < Server(${serverVal})`);
                        return; 
                    }
                }
            }

            await setDoc(userRef, { [key]: val }, { merge: true });
            console.log(`[Sync] Auto-saved: ${key} = ${val}`);
        } catch (e) {
            console.warn("[Sync] Save failed (Offline?)", e);
        }
    }
};

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('google-login-btn');
    const userDisplay = document.getElementById('user-info-display');
    
    if (user) {
        // 1. 로그인 성공 처리
        window.FirebaseBridge.user = user;
        userRef = doc(db, "users", user.uid);
        
        if (loginBtn) {
            loginBtn.innerHTML = "<span>로그아웃</span>";
            loginBtn.classList.add('logout');
            loginBtn.onclick = window.FirebaseBridge.logout;
        }
        if (userDisplay) userDisplay.innerText = `${user.displayName}님`;
        
        // 2. 데이터 병합 (초기 진입)
        try {
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                await syncHighProgressStrategy(docSnap.data());
            } else {
                // 신규 유저: 현재 로컬 데이터 전체 업로드
                const initialData = {};
                for (let i=0; i<localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith('progress_') || key === 'jlpt_bookmarks') {
                        initialData[key] = safeParse(localStorage.getItem(key));
                    }
                }
                if (Object.keys(initialData).length > 0) {
                    await setDoc(userRef, initialData);
                }
            }
        } catch (e) {
            console.error("Error fetching initial data:", e);
        }

        // 3. 실시간 리스너 등록 (다른 기기에서 변경 시 즉시 반영)
        unsubscribeSnapshot = onSnapshot(userRef, (doc) => {
            // 로컬에서 발생한 변경이 다시 돌아오는 경우는 무시해야 함 (구현 복잡도 증가)
            // 여기서는 '서버 데이터가 로컬보다 확실히 높을 때'만 반영
            if (doc.exists()) {
                const data = doc.data();
                let needRefresh = false;

                Object.keys(data).forEach(k => {
                    if (k.startsWith('progress_')) {
                        const serverVal = Number(data[k]);
                        const localVal = Number(safeParse(localStorage.getItem(k))) || 0;
                        if (serverVal > localVal) {
                            console.log(`[Realtime] New progress from other device: ${k} (${localVal}->${serverVal})`);
                            originalSetItem.call(localStorage, k, serverVal); // 무한루프 방지
                            needRefresh = true;
                        }
                    }
                });

                if (needRefresh) {
                    // 사용자에게 알림을 주거나 조용히 새로고침
                    // alert("다른 기기에서 학습 기록이 업데이트되었습니다.");
                    window.location.reload();
                }
            }
        });

    } else {
        // 로그아웃 처리
        window.FirebaseBridge.user = null;
        userRef = null;
        if (unsubscribeSnapshot) unsubscribeSnapshot(); // 리스너 해제
        
        if (loginBtn) {
            loginBtn.innerHTML = "<span>Google 로그인</span>";
            loginBtn.classList.remove('logout');
            loginBtn.onclick = window.FirebaseBridge.login;
        }
        if (userDisplay) userDisplay.innerText = "";
    }
});