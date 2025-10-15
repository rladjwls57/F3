// js/chat.js
import {
  state,
  loadSessionsByUser,     // (home.js에서 쓰던 것과 동일한 시그니처)
  loadSessionData,        // 세션 elements 로드
  syncCurrentElementsToChat // core.js에 추가한 업로드 유틸 (/api/upload replace)
} from "./core.js";

/* ===== 뷰 존재 가드 ===== */
const chatView = document.getElementById("view-chat");
if (!chatView) { console.warn("view-chat not found — skip chat.js"); }

/* ===== 서버 주소 ===== */
const CHAT_API = "http://127.0.0.1:8000"; // /api/chat, /api/chat_mix, /api/upload
const DATA_API = state.API_URL || "http://127.0.0.1:5000"; // (참고: core.js의 데이터 서버)

/* ===== 좌측 대화 DOM ===== */
const chatBox   = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const btnSend   = document.getElementById("btnSend");

/* ===== 우측 패널 DOM (① 데이터 업로드) ===== */
const chatUserIdInput   = document.getElementById("chatUserIdInput");
const chatSearchUserBtn = document.getElementById("chatSearchUserBtn");
const chatSessionList   = document.getElementById("chatSessionList");

/* ===== 우측 패널 DOM (② 채팅 저장) ===== */
const btnSaveChatToDB   = document.getElementById("btnSaveChatToDB");

/* ===== 우측 패널 DOM (③ 채팅 히스토리 내역) ===== */
const chatHistoryIdInput = document.getElementById("chatHistoryIdInput");
const btnLoadChatHistory = document.getElementById("btnLoadChatHistory");
const chatHistoryList    = document.getElementById("chatHistoryList");

/* ===== 상태 ===== */
let messages = []; // {role:'user'|'assistant', content:string}
let currentSessionIdForChat = null; // 업로드에 성공한 세션ID (질의에 mode=session로 사용)

/* ===== 초기 바인딩 ===== */
window.addEventListener("DOMContentLoaded", () => {
  // 입력/버튼
  btnSend.addEventListener("click", onSend);
  chatInput.addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); onSend(); } });

  chatSearchUserBtn.addEventListener("click", onSearchUserSessions);
  btnSaveChatToDB.addEventListener("click", onSaveChatToServer);
  btnLoadChatHistory.addEventListener("click", onLoadChatHistory);

  // 힌트: 홈에서 이미 세션을 골라 넘어온 경우 상태를 반영
  if (state.sid) currentSessionIdForChat = state.sid;
});

/* ============== ① 데이터 업로드: 아이디 → 세션목록 → 클릭 업로드 ============== */
async function onSearchUserSessions(){
  const userId = (chatUserIdInput.value || "").trim();
  if (!userId) { alert("사용자 ID를 입력하세요."); return; }

  chatSessionList.innerHTML = `<li class="hint">세션 목록을 불러오는 중...</li>`;
  try {
    // home.js와 동일한 함수 사용
    const sessions = await loadSessionsByUser(userId);
    chatSessionList.innerHTML = "";
    if (!sessions?.length) {
      chatSessionList.innerHTML = `<li class="hint">세션이 없습니다.</li>`;
      return;
    }
    sessions.forEach(s => {
      const sid = s.session_id || s.sid || s.id;
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.gap = "8px";
      li.style.padding = "8px 10px";
      li.style.border = "1px solid #e5e7f0";
      li.style.borderRadius = "10px";
      li.style.cursor = "pointer";
      li.innerHTML = `<span style="font-weight:700">session: ${sid}</span><button class="btn ghost">업로드</button>`;

      li.addEventListener("click", async (e) => {
        e.preventDefault();
        try{
          // 1) 세션 elements 로드 → state.currentElements 에 채워짐
          await loadSessionData(sid);
          // 2) 챗봇 서버에 업로드(교체)
          await syncCurrentElementsToChat(sid);
          currentSessionIdForChat = sid;
          toast(`세션 ${sid} 업로드 완료. 이제 이 세션으로 질문할 수 있어요.`);
        }catch(err){
          alert(`업로드 실패: ${err.message || err}`);
        }
      });

      chatSessionList.appendChild(li);
    });
  } catch (err) {
    chatSessionList.innerHTML = `<li class="hint">불러오기 실패: ${err.message || err}</li>`;
  }
}

/* ============== ② 채팅 저장: MongoDB ============== */
/* 백엔드 엔드포인트는 프로젝트에 맞게 바꿔:
   - POST ${DATA_API}/chat_history/save      (body: { id, messages })
   - GET  ${DATA_API}/chat_history/list?id=  (조회는 onLoadChatHistory에서 사용)
*/
// 서버 주소는 기존 상단 상수 사용(예: CHAT_API = "http://127.0.0.1:8000") 

async function onSaveChatToServer() {
  if (!messages.length) { alert("저장할 대화가 없습니다."); return; }

  // messages -> user[], assistant[] 로 분리(턴 순서에 맞게)
  const userArr = [];
  const assistantArr = [];
  for (const m of messages) {
    if (m.role === "user") userArr.push(m.content);
    else if (m.role === "assistant") assistantArr.push(m.content);
  }

  // 길이 맞추기(선택): 마지막 턴이 한쪽만 있는 경우 잘라내기
  const n = Math.min(userArr.length, assistantArr.length);
  const payload = {
    session_id: Number(currentSessionIdForChat) || null,  // 선택값
    user: userArr.slice(0, n),
    assistant: assistantArr.slice(0, n)
    // timestamp는 서버에서 안 써도 되면 생략
  };

  try {
    const res = await fetch(`${CHAT_API}/api/conversations/log`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const t = await res.text().catch(()=>"(no body)");
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${t}`);
    }
    // 성공 토스트
    toast("대화를 서버로 전송했습니다.");
  } catch (err) {
    alert(`전송 실패: ${err.message || err}`);
  }
}


/* ============== ③ 채팅 히스토리 내역 ============== */
async function onLoadChatHistory(){
  const q = (chatHistoryIdInput.value || "").trim();
  if (!q) { alert("조회할 ID를 입력하세요."); return; }
  chatHistoryList.innerHTML = `<div class="hint">불러오는 중...</div>`;
  try{
    const res = await fetch(`${DATA_API}/chat_history/list?id=${encodeURIComponent(q)}`);
    if(!res.ok){
      const txt = await res.text().catch(()=>"(no body)");
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${txt}`);
    }
    const data = await res.json(); // [{_id, id, messages, created_at}, ...]
    if(!Array.isArray(data) || !data.length){
      chatHistoryList.innerHTML = `<div class="hint">내역이 없습니다.</div>`;
      return;
    }
    chatHistoryList.innerHTML = "";
    data.forEach((item, idx)=>{
      const card = document.createElement("div");
      card.style.border = "1px solid #e5e7f0";
      card.style.borderRadius = "10px";
      card.style.padding = "8px 10px";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center">
          <div><b>${item.id || "(무명)"}</b> <span class="hint">#${idx+1}</span></div>
          <button class="btn ghost">불러와 대화창에 표시</button>
        </div>
        <div class="hint" style="margin-top:6px">${(item.created_at || "").toString()}</div>
      `;
      card.querySelector("button").addEventListener("click", ()=>{
        // 현재 대화 창에 히스토리를 복원
        messages = Array.isArray(item.messages) ? item.messages : [];
        renderMessagesFromHistory();
        toast("히스토리를 대화창에 로드했습니다.");
      });
      chatHistoryList.appendChild(card);
    });
  }catch(err){
    chatHistoryList.innerHTML = `<div class="hint">로드 실패: ${err.message || err}</div>`;
  }
}

/* ============== 대화(좌측) ============== */
btnSend?.addEventListener("click", onSend);

async function onSend(){
  const text = (chatInput.value || "").trim();
  if(!text){ chatInput.focus(); return; }

  appendMessage("user", text);
  chatInput.value = "";
  const ph = appendMessage("assistant", "생성 중...", true);

  // 현재 세션을 업로드했다면 mode=session, 아니면 none
  const mode = currentSessionIdForChat ? "session" : "none";
  try{
    const res = await fetch(`${CHAT_API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        sessionId: currentSessionIdForChat || "",
        sender: "user",
        content: text,
        mode,
        top_k: 4,
        temperature: 0.2
      })
    });
    if(!res.ok){
      const body = await res.text().catch(()=>"(no body)");
      updateBubbleText(ph, `HTTP ${res.status} ${res.statusText}\n${body}`);
      return;
    }
    const data = await res.json();
    const full = (data.response || data.message || "").toString();
    await fakeStreamToBubble(ph, full, 25, 2);
    messages.push({ role:"assistant", content: full });

    // 출처/노트 보조
    const caps = [];
    if (Array.isArray(data.sources) && data.sources.length) caps.push("Sources: " + data.sources.join(", "));
    if (data.note) caps.push("Note: " + data.note);
    if (caps.length){
      const cap = document.createElement("div");
      cap.className = "hint"; cap.style.marginTop = "6px";
      cap.textContent = caps.join("  ·  ");
      chatBox.appendChild(cap);
    }
  }catch(err){
    updateBubbleText(ph, `요청 실패: ${err?.message || err}`);
  }


  // 사용자가 원하는 "문자열(딕셔너리 형태)" 요구에 맞춰 dict로 구성
  const user = {
    meta: { mode, sessionId: currentSessionIdForChat || null }
  };
  const assistant = {
    sources: Array.isArray(data.sources) ? data.sources : [],
    note: data.note || null
  };

  logConversationToServer({
    chatId,
    sessionId: currentSessionIdForChat || null,
    user,
    assistant
  });

}

/* ============== UI 유틸 ============== */
function appendMessage(role, content, streaming=false){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.justifyContent = role === "user" ? "flex-end" : "flex-start";

  const bubble = document.createElement("div");
  bubble.style.maxWidth = "80%";
  bubble.style.whiteSpace = "pre-wrap";
  bubble.style.borderRadius = "14px";
  bubble.style.padding = "10px 12px";
  bubble.style.lineHeight = "1.5";
  bubble.style.boxShadow = "0 2px 8px rgba(0,0,0,.06)";
  bubble.style.background = role === "user" ? "#eef1ff" : "#fff";
  bubble.innerHTML = escapeHTML(content);

  wrap.appendChild(bubble);
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (!streaming) messages.push({ role, content });
  return bubble;
}
function updateBubbleText(b, t){
  b.innerHTML = escapeHTML(t);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function renderMessagesFromHistory(){
  chatBox.innerHTML = "";
  for(const m of messages) appendMessage(m.role, m.content);
}
function fakeStreamToBubble(bubble, text, delayMs=25, step=2){
  return new Promise(resolve=>{
    const words = text.split(/\s+/); let i=0, acc="";
    const timer = setInterval(()=>{
      if(i >= words.length){ clearInterval(timer); updateBubbleText(bubble, acc.trim()); resolve(); return; }
      acc += (i ? " " : "") + words.slice(i, i+step).join(" "); i+=step;
      updateBubbleText(bubble, acc);
    }, delayMs);
  });
}
function escapeHTML(v=""){ return v.replace(/[<>&]/g, s=>({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[s])); }
function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed"; t.style.bottom="76px"; t.style.left="50%"; t.style.transform="translateX(-50%)";
  t.style.background="#141414"; t.style.color="#fff"; t.style.padding="10px 14px"; t.style.borderRadius="10px";
  t.style.boxShadow="0 6px 24px rgba(0,0,0,.18)"; t.style.zIndex="9999";
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 1800);
}

async function logConversationToServer({ chatId, sessionId, userDict, assistantDict }) {
  const payload = {
    chat_id: chatId,
    session_id: sessionId || null,
    user: user,        
    assistant: assistant, 
  };
  try {
    const res = await fetch(`${CHAT_API}/api/conversations/log`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const t = await res.text().catch(()=>"(no body)");
      console.warn("log failed:", res.status, res.statusText, t);
    }
  } catch (e) {
    console.warn("log exception:", e);
  }
}
