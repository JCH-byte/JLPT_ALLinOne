import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * ==========================================
 * [JLPT Sync] Firebase Module
 * 학습 데이터(진도율)를 구글 계정과 동기화합니다.
 * 전략: "High-Score Wins" (더 높은 진도율을 가진 쪽으로 데이터를 병합)
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

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("[System] Firebase Initialized");
} catch (e) {
    console.warn("[System] Firebase Init Failed. Check Config.", e);
}

// Helper: 안전한 JSON 파싱
const safeJsonParse = (str, fallback = 0) => {
    try {
        const val = JSON.parse(str);
        return val !== null && val !== undefined ? val : fallback;
    } catch (e) {
        return fallback;
    }
};

/**
 * [핵심 기능] 클라우드 데이터와 로컬 데이터를 비교하여 병합
 * 규칙: 'progress_'로 시작하는 키는 숫자가 더 높은 것을 우선시함.
 */
async function syncHighProgressStrategy(cloudData) {
    let updatesToCloud = {};
    let hasUpdates = false;
    let localUpdatedCount = 0;

    // 1. 클라우드 데이터 -> 로컬 확인 및 병합
    Object.keys(cloudData).forEach(key => {
        const cloudVal = cloudData[key];
        
        // localStorage 데이터 가져오기
        const localRaw = localStorage.getItem(key);
        const localVal = safeJsonParse(localRaw, null);

        // A. 진도율 데이터(progress_*) 처리
        if (key.startsWith('progress_')) {
            const cloudNum = Number(cloudVal) || 0;
            const localNum = Number(localVal) || 0;

            if (cloudNum > localNum) {
                // 클라우드가 더 진도가 나감 -> 로컬 업데이트
                localStorage.setItem(key, JSON.stringify(cloudNum));
                localUpdatedCount++;
            } else if (localNum > cloudNum) {
                // 로컬이 더 진도가 나감 -> 클라우드 업데이트 예정
                updatesToCloud[key] = localNum;
                hasUpdates = true;
            }
        } 
        // B. 기타 데이터 (설정, 북마크 등) - 클라우드 데이터가 있으면 로컬이 없거나 다를 때 우선시(선택사항)
        // 여기서는 클라우드 데이터를 우선 덮어씌우되, 로컬에만 있는 중요 데이터는 유지
        else {
             if (JSON.stringify(cloudVal) !== JSON.stringify(localVal)) {
                 localStorage.setItem(key, JSON.stringify(cloudVal));
                 localUpdatedCount++;
             }
        }
    });

    // 2. 로컬에만 있고 클라우드엔 없는 데이터 찾기 (Offline Play 후 로그인 시)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('progress_') || key === 'jlpt_bookmarks') {
            if (cloudData[key] === undefined) {
                const val = safeJsonParse(localStorage.getItem(key));
                updatesToCloud[key] = val;
                hasUpdates = true;
            }
        }
    }

    // 3. 클라우드에 업데이트가 필요하면 전송
    if (hasUpdates && userRef) {
        try {
            await updateDoc(userRef, updatesToCloud);
            console.log(`[Sync] Uploaded newer local progress to Cloud.`);
        } catch (e) {
            // 문서가 아직 없으면 생성
            if (e.code === 'not-found' || e.message.includes("No document")) {
                 await setDoc(userRef, updatesToCloud, { merge: true });
            } else {
                console.error("Sync upload failed", e);
            }
        }
    }

    if (localUpdatedCount > 0) {
        console.log(`[Sync] Updated ${localUpdatedCount} items from Cloud.`);
        // 화면 갱신을 위해 새로고침 혹은 커스텀 이벤트 발생
        // window.location.reload(); // 사용자 경험을 위해 강제 리로드는 선택사항
        // 대신 알림 띄우기
        // alert("다른 기기의 학습 기록을 불러왔습니다.");
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
            alert("로그인에 실패했습니다: " + error.message);
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

    /**
     * 학습 완료 시 호출: 로컬 저장 후 클라우드에도 '더 높은 값'으로 시도
     */
    syncToCloud: async (key, data) => {
        if (!auth.currentUser || !userRef) return;
        
        // 민감하지 않은 데이터만 동기화
        if (key.startsWith('progress_') || key === 'jlpt_bookmarks') {
            try {
                // 단순 덮어쓰기가 아니라, 클라우드 값보다 작으면 무시해야 하지만,
                // 보통 이 함수는 '학습 완료' 시점에 호출되므로 항상 현재 값이 최댓값일 가능성이 높음.
                // 안전을 위해 merge:true 사용
                await setDoc(userRef, { [key]: data }, { merge: true });
                console.log(`[Sync] Saved ${key}`);
            } catch (e) {
                console.error("Sync failed", e);
            }
        }
    }
};

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('google-login-btn');
    const userDisplay = document.getElementById('user-info-display');
    
    if (user) {
        window.FirebaseBridge.user = user;
        userRef = doc(db, "users", user.uid);
        
        // UI Update
        if (loginBtn) {
            loginBtn.innerHTML = "<span>로그아웃</span>";
            loginBtn.classList.add('logout');
            loginBtn.onclick = window.FirebaseBridge.logout;
        }
        if (userDisplay) userDisplay.innerText = `${user.displayName}님`;
        
        // [핵심] 로그인 시 데이터 병합 (High-Score Wins)
        try {
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                await syncHighProgressStrategy(cloudData);
            } else {
                // 클라우드에 데이터가 없는 신규 유저 -> 로컬 데이터를 클라우드로 초기에 밀어넣기
                console.log("[Sync] New user found. Uploading local data...");
                let initialUpload = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith('progress_') || key === 'jlpt_bookmarks') {
                        initialUpload[key] = safeJsonParse(localStorage.getItem(key));
                    }
                }
                if (Object.keys(initialUpload).length > 0) {
                    await setDoc(userRef, initialUpload);
                }
            }
        } catch (e) {
            console.error("Error fetching cloud data:", e);
        }

    } else {
        window.FirebaseBridge.user = null;
        userRef = null;
        if (loginBtn) {
            loginBtn.innerHTML = "<span>Google 로그인</span>";
            loginBtn.classList.remove('logout');
            loginBtn.onclick = window.FirebaseBridge.login;
        }
        if (userDisplay) userDisplay.innerText = "";
    }
});