// datasets.js
import { state, go, safe } from "./core.js";

function render() {
  const list = document.getElementById("datasetList");
  if (!list) {
    console.warn("[datasets] #datasetList 요소를 찾지 못해 렌더를 건너뜁니다.");
    return;
  }

  list.innerHTML = "";

  const label = state?.datasetLabel ?? "데이터셋 미지정";
  const eventsCount = Array.isArray(state?.sequence) ? state.sequence.length : 0;

  const card = document.createElement("div");
  card.className = "card";
  card.style.cursor = "pointer";
  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
      <div>
        <div style="font-weight:700; margin-bottom:6px">${safe(label)}</div>
        <div style="font-size:12px; color:#666">이벤트 수: ${eventsCount}</div>
      </div>
      <button class="btn" data-action="open">열기</button>
    </div>
  `;

  // 카드 전체 클릭 또는 버튼 클릭 모두 analytics로 이동
  card.addEventListener("click", (e) => {
    const isButton = e.target.closest('[data-action="open"]');
    if (isButton || e.currentTarget === card) {
      go("analytics");
    }
  });

  list.appendChild(card);
}

window.addEventListener("DOMContentLoaded", render);
