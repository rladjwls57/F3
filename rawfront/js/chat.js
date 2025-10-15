// js/chat.js
import { go, safe, state } from "../../../../rawfront/js/core.js";

/* ===== 설정 ===== */
const API_BASE = "http://127.0.0.1:8000"; // 서버 루트. 엔드포인트는 /api/chat, /api/upload, /api/chat_mix

/* ===== DOM ===== */
const chatBox = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const btnSend = document.getElementById("btnSend");
const btnClear = document.getElementById("btnClearChat");
const btnReloadHistory = document.getElementById("btnReloadHistory");

const sessionIdInput = document.getElementById("sessionIdInput");
const btnNewSession = document.getElementById("btnNewSession");

const useDataset = document.getElementById("useDataset");
const currentDatasetLabel = document.getElementById("currentDatasetLabel");
const btnSyncDataset = document.getElementById("btnSyncDataset");

const chatFiles = document.getElementById("chatFiles");
const historyList = document.getElementById("historyList");

/* ===== 상태(프론트) ===== */
let messages = []; // 현재 세션의 메시지 배열 {role, content}
let lastSyncedDatasetHash = ""; // 동일 데이터 중복 업로드 방지

/* ===== 초기화 ===== */
window.addEventListener("DOMContentLoaded", () => {
  // 챗뷰 진입 시 포커스
  window.addEventListener("hashchange", ensureFocus);
  ensureFocus();

  // 기본 세션/라벨 반영
  currentDatasetLabel.textContent = state.datasetLabel || "(없음)";

  // 이벤트 바인딩
  btnSend.addEventListener("click", onSend);
  chatInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); onSend(); }});
  btnClear.addEventListener("click", onClear);
  btnReloadHistory.addEventListener("click", renderHistory);

  btnNewSession.addEventListener("click", () => {
    const id = `sess_${Date.now().toString(36)}`;
    sessionIdInput.value = id;
    messages = [];
    chatBox.innerHTML = "";
    saveHistory(); // 빈 세션이라도 생성
    renderHistory();
    chatInput.focus();
  });

  btnSyncDataset.addEventListener("click", syncDatasetToServer);

  // 첫 렌더(히스토리)
  loadHistory(); renderHistory();
});

/* ===== 공통 유틸 ===== */
function ensureFocus(){
  if(location.hash.includes("#/chat")) chatInput?.focus();
}
function storageKey(){ return `chat:history:${sessionIdInput.value || "default"}`; }
function saveHistory(){
  try { localStorage.setItem(storageKey(), JSON.stringify(messages)); } catch {}
}
function loadHistory(){
  try { messages = JSON.parse(localStorage.getItem(storageKey()) || "[]"); } catch { messages = []; }
  renderMessagesFromHistory();
}
function renderMessagesFromHistory(){
  chatBox.innerHTML = "";
  for(const m of messages){
    appendMessage(m.role, m.content);
  }
}
function renderHistory(){
  historyList.innerHTML = "";
  const keys = Object.keys(localStorage).filter(k=>k.startsWith("chat:history:")).sort();
  for(const k of keys){
    const id = k.replace("chat:history:","");
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.textContent = id;
    btn.addEventListener("click", ()=>{
      sessionIdInput.value = id;
      loadHistory();
      chatInput.focus();
    });
    historyList.appendChild(btn);
  }
}

// 화면 버블
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
  bubble.innerHTML = safe(content);

  wrap.appendChild(bubble);
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (!streaming) messages.push({ role, content });
  return bubble;
}
function updateBubbleText(b, t){
  b.innerHTML = safe(t);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// 문자열 해시(데이터셋 변경 감지용)
async function sha1(str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ===== 데이터셋 → 서버 세션에 업로드(교체) ===== */
async function syncDatasetToServer(){
  if(!useDataset.checked){
    alert("‘현재 데이터셋 사용’에 체크해 주세요.");
    return;
  }
  if(!state.sequence?.length){
    alert("현재 앱에 로드된 데이터셋이 없습니다. (Home에서 불러오세요)");
    return;
  }
  const sessionId = (sessionIdInput.value || "").trim() || "default";

  // JSON 텍스트로 직렬화
  const payload = JSON.stringify({ sequence: state.sequence }, null, 2);
  const hash = await sha1(payload);
  if(hash === lastSyncedDatasetHash){
    if(!confirm("같은 데이터셋이 이미 동기화되어 있습니다. 다시 업로드할까요?")) return;
  }

  const fd = new FormData();
  fd.append("sessionId", sessionId);
  fd.append("replace", "true"); // 교체
  // 서버는 파일 리스트를 요구하므로 JSON을 파일처럼 보냄
  const file = new File([payload], (state.datasetLabel || "dataset") + ".json", { type:"application/json" });
  fd.append("files", file);

  const res = await fetch(`${API_BASE}/api/upload`, { method:"POST", body: fd });
  if(!res.ok){
    const txt = await res.text().catch(()=>"(no body)");
    alert(`업로드 실패: ${res.status} ${res.statusText}\n${txt}`);
    return;
  }
  lastSyncedDatasetHash = hash;
  alert("서버 세션에 데이터셋을 동기화했습니다. 이제 ‘데이터 사용’으로 질의하면 RAG가 적용됩니다.");
}

/* ===== 전송 ===== */
async function onSend(){
  const text = (chatInput.value || "").trim();
  if(!text){ chatInput.focus(); return; }

  appendMessage("user", text);
  chatInput.value = "";
  const ph = appendMessage("assistant", "생성 중...", true);

  const sessionId = (sessionIdInput.value || "").trim() || "default";
  const wantDataset = useDataset.checked;
  const hasFiles = (chatFiles?.files?.length || 0) > 0;

  try{
    let resp;
    if (hasFiles) {
      // 파일+메시지: /api/chat_mix (ingest=temp, session or none)
      const fd = new FormData();
      fd.append("content", text);
      fd.append("mode", wantDataset ? "session" : "none");
      fd.append("sessionId", sessionId);
      fd.append("ingest", "temp"); // 업로드 파일만 임시로 사용 (세션 저장X)
      fd.append("top_k", "4");
      fd.append("temperature", "0.2");
      for(const f of chatFiles.files) fd.append("files", f, f.name || "upload");
      resp = await fetch(`${API_BASE}/api/chat_mix`, { method:"POST", body: fd });
    } else if (wantDataset) {
      // 세션 인덱스 사용: /api/chat (mode=session)
      const body = {
        sessionId, sender: "user", content: text,
        mode: "session", top_k: 4, temperature: 0.2
      };
      resp = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
    } else {
      // 순수 LLM: /api/chat (mode=none)
      const body = {
        sessionId: "", sender: "user", content: text,
        mode: "none", top_k: 4, temperature: 0.2
      };
      resp = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
    }

    if(!resp.ok){
      const body = await resp.text().catch(()=>"(no body)");
      updateBubbleText(ph, `HTTP ${resp.status} ${resp.statusText}\n${body}`);
      saveHistory();
      return;
    }

    const data = await resp.json();
    const full = (data.response || data.message || "").toString();
    await fakeStreamToBubble(ph, full, 25, 2);
    messages.push({ role:"assistant", content: full });

    // 출처/노트 캡션
    const caps = [];
    if (Array.isArray(data.sources) && data.sources.length) caps.push("Sources: " + data.sources.join(", "));
    if (data.note) caps.push("Note: " + data.note);
    if (caps.length){
      const cap = document.createElement("div");
      cap.className = "hint"; cap.style.marginTop = "6px";
      cap.textContent = caps.join("  ·  ");
      chatBox.appendChild(cap);
    }

    saveHistory();
  } catch (err){
    updateBubbleText(ph, `요청 실패: ${err?.message || err}`);
    saveHistory();
  }
}

function onClear(){
  if(!confirm("현재 세션의 화면만 지웁니다. (히스토리는 유지됩니다)")) return;
  chatBox.innerHTML = "";
}

/* ===== 의사 스트리밍 ===== */
function fakeStreamToBubble(bubble, text, delayMs=25, step=2){
  return new Promise(resolve=>{
    const words = text.split(/\s+/);
    let i = 0, acc = "";
    const timer = setInterval(()=>{
      if(i >= words.length){
        clearInterval(timer);
        updateBubbleText(bubble, acc.trim());
        resolve();
        return;
      }
      acc += (i ? " " : "") + words.slice(i, i+step).join(" ");
      i += step;
      updateBubbleText(bubble, acc);
    }, delayMs);
  });
}
