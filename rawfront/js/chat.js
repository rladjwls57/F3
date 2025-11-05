// js/chat.js
import {
  state,
  loadSessionsByUser,
  loadSessionData,
  syncCurrentElementsToChat
} from "./core.js";

/* ===== 뷰 존재 가드 ===== */
const chatView = document.getElementById("view-chat");
if (!chatView) { console.warn("view-chat not found — skip chat.js"); }

/* ===== 서버 주소 ===== */
const CHAT_API = "http://127.0.0.1:8000";                 // 챗봇 서버(질의/응답)
const DATA_API = state.API_URL || "http://127.0.0.1:5000"; // 데이터 서버(저장/히스토리)

/* ===== 좌측 대화 DOM ===== */
const chatBox   = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const btnSend   = document.getElementById("btnSend");

/* ===== 우측 패널 DOM ===== */
const chatUserIdInput    = document.getElementById("chatUserIdInput");
const chatSearchUserBtn  = document.getElementById("chatSearchUserBtn");
const chatSessionList    = document.getElementById("chatSessionList");
const btnSaveChatToDB    = document.getElementById("btnSaveChatToDB");
const btnLoadChatHistory = document.getElementById("btnLoadChatHistory");
const chatHistoryList    = document.getElementById("chatHistoryList");

/* ===== 상태 ===== */
let messages = []; // {role:'user'|'assistant', content:string}
let currentSessionIdForChat = null; // 업로드 성공한 세션 ID

/* ===== 초기 바인딩 ===== */
window.addEventListener("DOMContentLoaded", () => {
  btnSend.addEventListener("click", onSend);
  chatInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); onSend(); } });
  chatSearchUserBtn.addEventListener("click", onSearchUserSessions);
  // 저장 버튼: 폼 기본 제출 방지 + 저장 함수 연결
  btnSaveChatToDB.addEventListener("click", (e)=>{ e.preventDefault(); onSaveChatToServer(); });
  btnLoadChatHistory.addEventListener("click", onLoadChatHistory);
  if (state.sid!=null) currentSessionIdForChat = Number(state.sid) || null;
});

/* ============== ① 데이터 업로드: 아이디 → 세션목록 → 클릭 업로드 ============== */
async function onSearchUserSessions(){
  const userId = (chatUserIdInput.value || "").trim();
  if (!userId) { alert("사용자 ID를 입력하세요."); return; }

  chatSessionList.innerHTML = `<li class="hint">세션 목록을 불러오는 중...</li>`;
  try {
    const sessions = await loadSessionsByUser(userId);
    chatSessionList.innerHTML = "";
    if (!sessions?.length) {
      chatSessionList.innerHTML = `<li class="hint">세션이 없습니다.</li>`;
      return;
    }
    sessions.forEach(s => {
      const sid = s.session_id ?? s.sid ?? s.id;
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
        try {
          await loadSessionData(sid);           // state.currentElements 채움
          await syncCurrentElementsToChat(sid); // 챗봇 서버 업로드/교체
          currentSessionIdForChat = Number(sid);
          chatInput.disabled = false;
          btnSend.disabled = false;
          messages = [];
          renderMessagesFromHistory();
          toast(`세션 ${sid} 업로드 완료. 이제 이 세션으로 질문할 수 있어요.`);
        } catch (err) {
          alert(`업로드 실패: ${err.message || err}`);
        }
      });

      chatSessionList.appendChild(li);
    });
  } catch (err) {
    chatSessionList.innerHTML = `<li class="hint">불러오기 실패: ${err.message || err}</li>`;
  }
}

/* ============== ② 채팅 저장(히스토리용) ============== */
async function onSaveChatToServer() {
  if (!messages.length) { alert("저장할 대화가 없습니다."); return; }

  const userArr = [];
  const assistantArr = [];
  for (const m of messages) {
    if (m.role === "user") userArr.push(m.content);
    else if (m.role === "assistant") assistantArr.push(m.content);
  }
  const n = Math.min(userArr.length, assistantArr.length);
  const payload = {
    session_id: currentSessionIdForChat ?? null,
    user: userArr.slice(0, n),
    assistant: assistantArr.slice(0, n)
  };

  async function trySave(base) {
    if (!base) throw new Error("Invalid base URL for save request");
    const res = await fetch(`${base.replace(/\/+$/,"")}/api/conversations/log`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text().catch(()=>"(no body)");
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${body}`);
    }
    return true;
  }

  try {
    await trySave(DATA_API);
    toast("대화를 저장했습니다.");
  } catch (err) {
    alert(`전송 실패: ${err.message || err}`);
  }
}

/* ============== ③ 채팅 히스토리 내역 ============== */
async function onLoadChatHistory(){
  chatHistoryList.innerHTML = `<div class="hint">불러오는 중...</div>`;
  try{
    const res = await fetch(`${DATA_API}/api/chat_history/list`);
    if(!res.ok){
      const txt = await res.text().catch(()=>"(no body)");
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${txt}`);
    }
    const data = await res.json();
    if(!Array.isArray(data) || !data.length){
      chatHistoryList.innerHTML = `<div class="hint">내역이 없습니다.</div>`;
      return;
    }
    chatHistoryList.innerHTML = "";
    data.forEach(item => {
      const card = document.createElement("div");
      card.style.border = "1px solid #e5e7f0";
      card.style.borderRadius = "10px";
      card.style.padding = "8px 10px";

      const displayTitle = `${item.chat_id + 1} : ${item.title || '(제목 없음)'}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center">
          <div><b>${displayTitle}</b></div>
          <button class="btn ghost">불러와 대화창에 표시</button>
        </div>
        <div class="hint" style="margin-top:6px">${(item.created_at || "").toString()}</div>
      `;

      card.querySelector("button").addEventListener("click", async () => {
        try {
          const res = await fetch(`${DATA_API}/api/chat_history/get`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: item.chat_id })
          });
          if(!res.ok) throw new Error(await res.text());
          const chatData = await res.json();

          messages = [];
          if (Array.isArray(chatData.messages)) {
            chatData.messages.forEach(m => {
              if (m.user) messages.push({ role: "user", content: m.user });
              if (m.assistant) messages.push({ role: "assistant", content: m.assistant });
            });
          } else if (chatData.messages?.user && chatData.messages?.assistant) {
            const n = Math.min(chatData.messages.user.length, chatData.messages.assistant.length);
            for (let i = 0; i < n; i++) {
              messages.push({ role: "user", content: chatData.messages.user[i] });
              messages.push({ role: "assistant", content: chatData.messages.assistant[i] });
            }
          }
          renderMessagesFromHistory();
          chatInput.disabled = true;
          btnSend.disabled = true;
          toast("히스토리를 읽기 전용으로 로드했습니다. 새 분석을 시작하려면 데이터를 업로드하세요.");
        } catch(err) {
          toast(`로드 실패: ${err.message || err}`);
        }
      });

      chatHistoryList.appendChild(card);
    });
  } catch(err) {
    chatHistoryList.innerHTML = `<div class="hint">로드 실패: ${err.message || err}</div>`;
  }
}

/* ============== 대화(좌측) ============== */
async function onSend(){
  const text = (chatInput.value || "").trim();
  if(!text){ chatInput.focus(); return; }

  // 유저 말풍선 + 플레이스홀더
  appendMessage("user", text);
  chatInput.value = "";
  const ph = appendMessage("assistant", "생성 중...", true);

  const mode = currentSessionIdForChat ? "session" : "none";

  // 중복 전송 잠금
  if (onSend._inFlight) return;
  onSend._inFlight = true;
  btnSend.disabled = true; // 전송 중 잠금

  try {
    const res = await fetch(`${CHAT_API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        session_id: mode === "session" ? Number(currentSessionIdForChat) : null, // 구버전 호환
        sessionId : mode === "session" ? Number(currentSessionIdForChat) : null, // 신버전 호환
        sender: "user",
        content: String(text || ""),
        mode,
        top_k: 4,
        temperature: 0.2
      })
    });

    // ---- 강력 파서: JSON 우선 → 텍스트/HTML 폴백 ----
    const { json, text: rawText } = await robustParseResponse(res);
    const { answer, caps } = extractAnswerAndCaps(json, rawText);

    if (!res.ok || !answer) {
      const status = res.status || "ERR";
      const msg = json?.detail
        ? (Array.isArray(json.detail) ? JSON.stringify(json.detail) : JSON.stringify(json.detail))
        : (json?.error || "응답 파싱 실패");
      updateBubbleText(ph, `[오류] 서버 응답 실패 (${status}) ${msg}`);
      messages.push({ role:"assistant", content: `[오류] ${msg}` });
      return;
    }

    // 정상 응답
    await fakeStreamToBubble(ph, String(answer), 15);
    messages.push({ role:"assistant", content: String(answer) });

    // 출처/노트 표시(있다면)
    if (caps.length){
      const cap = document.createElement("div");
      cap.className = "hint"; cap.style.marginTop = "6px";
      cap.textContent = caps.join("  ·  ");
      chatBox.appendChild(cap);
    }

  } catch (e) {
    updateBubbleText(ph, `[오류] 네트워크 문제: ${e.message || e}`);
    messages.push({ role:"assistant", content: `[오류] ${e.message || e}` });
  } finally {
    onSend._inFlight = false;
    btnSend.disabled = false; // 잠금 해제
  }
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
  // marked.parse가 없으면 그냥 이스케이프 없이 넣되, 실제 환경에서는 marked를 로드해둔 상태일 것
  if (window.marked?.parse) {
    bubble.innerHTML = marked.parse(String(content));
  } else {
    bubble.textContent = String(content);
  }

  wrap.appendChild(bubble);
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (!streaming) messages.push({ role, content: String(content) });
  return bubble;
}
function updateBubbleText(b, t){
  if (window.marked?.parse) {
    b.innerHTML = marked.parse(String(t));
  } else {
    b.textContent = String(t);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}
function renderMessagesFromHistory(){
  chatBox.innerHTML = "";
  for(const m of messages) appendMessage(m.role, m.content, true);
}
function fakeStreamToBubble(bubble, text, delayMs = 15) {
  return new Promise(resolve => {
    let i = 0;
    const timer = setInterval(() => {
      if (i >= text.length) {
        clearInterval(timer);
        updateBubbleText(bubble, text);
        resolve();
        return;
      }
      i++;
      updateBubbleText(bubble, text.substring(0, i));
    }, delayMs);
  });
}
function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed"; t.style.bottom="76px"; t.style.left="50%"; t.style.transform="translateX(-50%)";
  t.style.background="#141414"; t.style.color="#fff"; t.style.padding="10px 14px"; t.style.borderRadius="10px";
  t.style.boxShadow="0 6px 24px rgba(0,0,0,.18)"; t.style.zIndex="9999";
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 1800);
}

/* ============== 대화 로그 전송(선택) ============== */
async function logConversationToServer({ sessionId, user, assistant }) {
  const payload = { session_id: sessionId || null, user, assistant };
  try {
    const res = await fetch(`${DATA_API}/api/conversations/log`, {
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

/* ============== 응답 파싱 강화 유틸 ============== */
async function robustParseResponse(res){
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let json = null;
  let txt = "";

  if (ct.includes("application/json")) {
    try { json = await res.json(); }
    catch { /* fallthrough */ }
  }
  if (!json) {
    try { txt = await res.text(); } catch { txt = ""; }
    if (txt) {
      // JSON 문자열로 내려오는 경우 처리
      try { json = JSON.parse(txt); }
      catch {
        // HTML 제거 후 plain text로 사용
        const plain = txt.replace(/<[^>]+>/g, "").trim();
        if (plain) json = { response: plain };
      }
    }
  }
  return { json, text: txt };
}

function extractAnswerAndCaps(json, rawText){
  let answer = "";
  const caps = [];

  if (typeof json === "string") {
    answer = json;
  }
  if (!answer && json && typeof json === "object") {
    // 1) 1차 키 후보 (문자열 직접)
    const topKeys = ["response","result","message","answer","output","content","text"];
    for (const k of topKeys) {
      const v = json[k];
      if (typeof v === "string" && v.trim()) { answer = v.trim(); break; }
    }
    // 2) 1차 키가 객체일 때 내부에서 꺼내기
    if (!answer) {
      for (const k of topKeys) {
        const v = json[k];
        if (v && typeof v === "object") {
          if (typeof v.text === "string" && v.text.trim()) { answer = v.text.trim(); break; }
          if (typeof v.content === "string" && v.content.trim()) { answer = v.content.trim(); break; }
          if (typeof v.message === "string" && v.message.trim()) { answer = v.message.trim(); break; }
          // 일반적인 {choices:[{message:{content}}]} 패턴
          if (Array.isArray(v.choices) && v.choices[0]?.message?.content) {
            answer = String(v.choices[0].message.content).trim(); break;
          }
        }
      }
    }
    // 3) OpenAI 스타일
    if (!answer && Array.isArray(json.choices) && json.choices[0]?.message?.content) {
      answer = String(json.choices[0].message.content).trim();
    }
    // 4) Gemini 스타일
    if (!answer && Array.isArray(json.candidates)) {
      for (const c of json.candidates) {
        const parts = c?.content?.parts;
        if (Array.isArray(parts)) {
          const piece = parts.map(p => p?.text).filter(Boolean).join("\n").trim();
          if (piece) { answer = piece; break; }
        }
      }
    }
    // 5) LangChain 스타일
    if (!answer && typeof json.result === "string") answer = json.result.trim();

    // 캡션(출처/노트) 모으기
    if (Array.isArray(json.sources) && json.sources.length) caps.push("Sources: " + json.sources.join(", "));
    if (json.note) caps.push("Note: " + json.note);
    if (Array.isArray(json.source_documents) && json.source_documents.length) {
      const uniq = Array.from(new Set(json.source_documents.map(d => d?.metadata?.source).filter(Boolean)));
      if (uniq.length) caps.push("Sources: " + uniq.join(", "));
    }
  }

  // 6) 최후 폴백: rawText(HTML 제거) 사용
  if (!answer && typeof rawText === "string" && rawText.trim()) {
    const plain = rawText.replace(/<[^>]+>/g, "").trim();
    if (plain) answer = plain;
  }

  return { answer, caps };
}
