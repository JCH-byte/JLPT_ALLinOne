/**
 * data-service.js
 * 기능: 외부 JS 데이터 파일 로드, 로컬 데이터 오버라이드 병합
 */

function loadLevelData(level, callback) {
    const upperLevel = level.toUpperCase();
    const varName = `${upperLevel}_DATA`;

    // 이미 로드된 전역 변수가 있다면 즉시 반환
    if (window[varName]) { 
        callback(window[varName]); 
        return; 
    }

    // 동적으로 스크립트 태그 생성하여 데이터 로드
    const script = document.createElement('script');
    script.src = `data/dist/${level}_data.js`; 
    script.onload = () => {
        if (window[varName]) callback(window[varName]);
        else callback({});
    };
    script.onerror = () => { 
        console.error(`Failed to load data for ${level}`);
        callback({}); 
    };
    document.head.appendChild(script);
}

function getMergedData(level, fileData) {
    if (!fileData) fileData = {};
    
    // 개발용 데이터 오버라이드 (localStorage 'JLPT_DEV_DATA_OVERRIDE')
    const DEV_KEY = 'JLPT_DEV_DATA_OVERRIDE';
    try {
        const localStr = localStorage.getItem(DEV_KEY);
        if (localStr) {
            const parsed = JSON.parse(localStr);
            Object.keys(parsed).forEach(key => {
                // 키 형식 예: "n4-1" -> level: n4, day: 1
                if (key.startsWith(`${level}-`)) {
                    const day = key.split('-')[1]; 
                    fileData[day] = parsed[key];
                }
            });
        }
    } catch (e) { console.error("Error merging dev data:", e); }

    // 데이터 정규화 (배열 형태를 객체로 변환 등)
    const normalized = {};
    Object.keys(fileData).forEach(day => {
        let dayData = fileData[day];
        if (Array.isArray(dayData)) dayData = { vocab: dayData }; // 구형 데이터 호환
        
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