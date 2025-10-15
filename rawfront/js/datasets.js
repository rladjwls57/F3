import { state, go, safe } from "./core.js";

window.addEventListener("DOMContentLoaded", ()=>{
  const list = document.getElementById("datasetList");
  render();

  function render(){
    list.innerHTML = "";
    // 단일 데이터셋 UX (시안처럼 카드 2~3개 쓰고 싶으면 이 배열을 채워도 됨)
    const card = document.createElement("div");
    card.className = "card";
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
        <div>
          <div style="font-weight:700; margin-bottom:6px">${safe(state.datasetLabel)}</div>
          <div style="font-size:12px; color:#666">이벤트 수: ${state.sequence.length}</div>
        </div>
        <button class="btn">열기</button>
      </div>
    `;
    card.addEventListener("click", ()=> go("analytics"));
    list.appendChild(card);
  }
});
