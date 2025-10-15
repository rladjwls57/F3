import { initCore, go, loadFromFile, loadSessionsByUser, loadSessionData, state } from "./core.js";

window.addEventListener("DOMContentLoaded", () => {
  initCore();

  // --------------------------
  // 1) 파일 업로드
  // --------------------------
  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await loadFromFile(file);
      alert(`파일 로드 완료!\nElements 수: ${state.currentElements.length}`);
      go("datasets"); // 필요 시 datasets 뷰로 이동
    } catch (err) {
      alert("파일 로드 실패: " + err.message);
      console.error(err);
    }
  });

  // --------------------------
  // 2) user_id 검색 → session 목록 표시
  // --------------------------
  const searchBtn = document.getElementById("searchUserBtn");
  searchBtn.addEventListener("click", async () => {
    const userId = document.getElementById("userIdInput").value.trim();
    if (!userId) return alert("user_id를 입력하세요");

    try {
      const sessions = await loadSessionsByUser(userId);
      const listEl = document.getElementById("sessionList");
      listEl.innerHTML = ""; // 초기화

      if (sessions.length === 0) {
        listEl.innerHTML = "<li>세션이 없습니다.</li>";
        return;
      }

      sessions.forEach((s) => {
        const sid = s.session_id;  // 배열 안 객체에서 session_id 추출
        const li = document.createElement("li");
        li.textContent = `session ID : ${sid}`;
        li.style.cursor = "pointer";
        li.style.padding = "4px 0";
        li.addEventListener("click", async () => {
          try { 
            await loadSessionData(sid);
            // alert(`선택된 session_id: ${sid}\nElements 수: ${state.currentElements.length}`);
            state.sid = sid; 
            go("analytics"); 
          } catch (err) {
            alert("세션 데이터 로드 실패: " + err.message);
            console.error(err);
          }
        });
        listEl.appendChild(li);
  });

    } catch (err) {
      alert("세션 조회 실패: " + err.message);
      console.error(err);
    }
  });
});
