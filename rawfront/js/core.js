/* ===== 상태(전역) ===== */
export const state = {
  API_URL: "http://127.0.0.1:5000",  // FastAPI 서버 URL
  CHAT_API: "http://127.0.0.1:8000",  // 챗봇 서버
  currentUserId: null,               // 검색된 user_id
  sessions: [],                      // 조회된 session_id 목록
  currentSession: null,  // 선택된 session_id
  sid: null,            
  currentElements: [],               // 현재 선택된 session의 elements
  llm_summary: ""
};

/* ===== 유틸 ===== */
export const pastel = ["#A3E4D7","#F7DC6F","#F5B7B1","#AED6F1","#D7BDE2","#F9E79F","#85C1E9","#F1948A","#82E0AA","#D2B4DE"];
export const safe = v => (v ?? "").toString().replace(/[<>&]/g, s=>({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[s]));
export const keyOf = (m={}) => JSON.stringify([m.id||null, m.className||null, m.tagName||null, m.text||null]);
export const fmtSec = s => `${s.toFixed(2)}s`;

/* ===== 라우터 ===== */
export function go(view){ 
  document.querySelectorAll("[data-view]").forEach(v=>v.classList.remove("active"));
  document.querySelector(`#view-${view}`)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n=>{
    const key = n.getAttribute("data-nav");
    n.classList.toggle("active", key===view);
  });
  location.hash = `#/${view}`;
}

export function bindNavbar(){
  document.querySelectorAll(".nav-item[data-nav]").forEach(n=>{
    n.addEventListener("click", ()=> go(n.getAttribute("data-nav")));
  });
  const initial = location.hash.replace("#/","") || "home";
  go(initial);
}

/* ===== API 호출 ===== */
// user_id → session_id 배열 조회
export async function loadSessionsByUser(userId){
  const res = await fetch(`${state.API_URL}/sessions/${userId}`);
  if(!res.ok) throw new Error("세션 조회 실패");
  const json = await res.json();
  state.currentUserId = userId;
  state.sessions = json.sessions || [];
  return state.sessions;
}

// session_id → DOM elements 조회
export async function loadSessionData(sessionId) {
  const res = await fetch(`${state.API_URL}/session_data/${sessionId}`);
  const json = await res.json();
  if (!json || !json.data || !Array.isArray(json.data)) 
      throw new Error("API 응답에 elements가 없습니다");

  // elements 배열만 상태에 저장
  state.currentElements = json.data;
  state.currentSession = sessionId;
  state.llmSummary = json.llm_summary || "";

  return state.currentElements;
}


/* ===== 파일 업로드 ===== */
export function loadFromFile(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = e=>{
      try{
        const parsed = JSON.parse(e.target.result);
        if(Array.isArray(parsed.elements)){
          state.currentElements = parsed.elements;
          state.currentSession = file.name;
          resolve();
        } else {
          reject(new Error("지원하지 않는 JSON 형식: elements 배열이 없습니다"));
        }
      }catch(err){ reject(err); }
    };
    r.readAsText(file, "utf-8");
  });
}

// core.js 어딘가(다른 export 함수들과 같이) 추가
export async function syncCurrentElementsToChat(sessionId, opts = {}) {
  // 0) 검증
  if (!Array.isArray(state.currentElements) || state.currentElements.length === 0) {
    throw new Error("업로드할 elements가 없습니다. 먼저 세션 데이터를 불러오거나 파일을 로드하세요.");
  }

  // 1) 기본값/옵션
  const sid = sessionId || state.currentSession || "dataset";
  const replace = (opts.replace ?? true);                 // 기본: 교체 업로드
  const filename = opts.filename || `${sid}.json`;        // 업로드 파일명
  const chatApi = (state.CHAT_API || "http://127.0.0.1:8000").replace(/\/+$/,"");

  // 2) JSON 페이로드 만들기
  const payload = JSON.stringify({ elements: state.currentElements }, null, 2);

  // 3) FormData 구성
  const fd = new FormData();
  fd.append("sessionId", sid);
  fd.append("replace", String(replace));
  // Blob + 파일명으로 업로드 (File 미지원 브라우저 대비)
  const blob = new Blob([payload], { type: "application/json" });
  fd.append("files", blob, filename);

  // 4) 업로드 호출
  const res = await fetch(`${chatApi}/api/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`업로드 실패: ${res.status} ${res.statusText}\n${text}`);
  }

  // 5) 응답 및 상태 업데이트
  const data = await res.json();
  state.sid = sid;                // 이후 /api/chat 호출 시 사용할 세션ID
  return data;                    // {sessionId, status:"replaced"|"appended", files:[...]}
}


/* ===== 공통 초기화 ===== */
export function initCore(){
  bindNavbar();
  // 해시 변경 시 라우팅
  window.addEventListener("hashchange", ()=>{
    const v = location.hash.replace("#/","") || "home";
    go(v);
  });
}
