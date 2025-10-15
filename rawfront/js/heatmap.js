import { state } from "./core.js";


function maybeRenderHeatmap() {
  if (!location.hash.includes("#/heatmap")) return;


  const label = document.getElementById("heatmapSessionLabel");
  label.textContent = `세션 ID : ${state.sid || "(미선택)"}`;

  if (state.sid) {
    loadHeatmapImage(state.sid);
  } else {
    clearHeatmapImage();
  }
}

async function loadHeatmapImage(sessionId) {
  const imgEl = document.getElementById("heatmapImage");
  imgEl.src = "";
  imgEl.alt = "히트맵 로딩 중...";

  try {
    const res = await fetch(`http://localhost:5000/heatmap/${sessionId}`);
    if (!res.ok) {
      throw new Error(`이미지를 불러올 수 없습니다. (status: ${res.status})`);
    }

    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);
    imgEl.src = imageUrl;
    imgEl.alt = `세션 ${sessionId} 히트맵`;


    const dlBtn = document.getElementById("downloadHeatmapBtn");
    dlBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `heatmap_session_${sessionId}.png`;
      a.click();
    };
  } catch (err) {
    console.error("히트맵 로드 실패:", err);
    imgEl.alt = "히트맵을 불러올 수 없습니다.";
  }
}


function clearHeatmapImage() {
  const imgEl = document.getElementById("heatmapImage");
  imgEl.src = "";
  imgEl.alt = "세션을 선택하면 히트맵이 표시됩니다.";
}

window.addEventListener("hashchange", maybeRenderHeatmap);
window.addEventListener("DOMContentLoaded", maybeRenderHeatmap);
