import { state } from "./core.js";

// DOMContentLoaded 시 이벤트 바인딩
window.addEventListener("DOMContentLoaded", () => {
  const statsTab = document.querySelector(".nav-item[data-nav='stats']");
  if (statsTab) {
    statsTab.addEventListener("click", () => {
      initStats();
    });
  }
});

window.initStats = initStats;

// 전역 차트 객체
let domBarChart = null;
let domTimelineChart = null;

// ==================== 전역 변수 ====================
let highlightDiv = document.getElementById("highlightOverlay");
let hideTimeout = null;

// DOM별 색상 맵
const domColorMap = {};

// 색상 생성 함수
function getColorForDom(domID) {
  if (!domColorMap[domID]) {
    const r = Math.floor(Math.random() * 200) + 30;
    const g = Math.floor(Math.random() * 200) + 30;
    const b = Math.floor(Math.random() * 200) + 30;
    domColorMap[domID] = `rgba(${r}, ${g}, ${b}, 0.7)`;
  }
  return domColorMap[domID];
}

/* ===== 통계 초기화 ===== */
async function initStats() {
  const urlListEl = document.getElementById("stats-url-list");
  const tableBody = document.querySelector("#stats-elements-table tbody");

  tableBody.innerHTML = "<tr><td colspan='10'>URL을 선택하세요.</td></tr>";
  urlListEl.innerHTML = "Loading...";

  try {
    const res = await fetch(`${state.API_URL}/stats/urls`);
    if (!res.ok) throw new Error("URL 목록 조회 실패");

    const data = await res.json();
    const urls = data.urls || [];

    if (urls.length === 0) {
      urlListEl.innerHTML = "<li>URL 목록이 없습니다.</li>";
      return;
    }

    urls.forEach(url => {
      const li = document.createElement("li");
      li.textContent = url;
      li.style.cursor = "pointer";
      li.style.padding = "4px 0";
      li.style.borderBottom = "1px solid #eee";

      // 기존:
      // li.addEventListener("click", () => loadElementsByUrl(url));

      // 수정:
      li.addEventListener("click", () => {
          loadElementsByUrl(url);
          if (heatmapImg) {
              heatmapImg.src = "../../img.png";
          }
      });

      urlListEl.appendChild(li);
    });

  } catch (err) {
    console.error(err);
    urlListEl.innerHTML = "<li>URL 목록을 불러오는 데 실패했습니다.</li>";
  }
}

const heatmapImg = document.getElementById("statsHeatmapImage");

/* ===== 선택한 URL의 elements 불러오기 ===== */
async function loadElementsByUrl(url) {
  const tbody = document.querySelector("#stats-elements-table tbody");
  tbody.innerHTML = "<tr><td colspan='10'>Loading...</td></tr>";

  try {
    const res = await fetch(`${state.API_URL}/stats/elements?target_url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error("Elements 조회 실패");

    const data = await res.json();
    const elements = data.elements || [];
    state.currentElements = elements; 

    if (elements.length === 0) {
      tbody.innerHTML = "<tr><td colspan='10'>해당 URL의 elements가 없습니다.</td></tr>";
      clearCharts();
      return;
    }

    // 테이블 렌더링
    tbody.innerHTML = "";
    elements.forEach(el => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${el.timestamp ?? ""}</td>
        <td>${el.duration ?? ""}</td>
        <td>${el.totalDuration ?? ""}</td>
        <td>${el.visitCount ?? ""}</td>
        <td>${el.tag ?? ""}</td>
        <td>${el.text ?? ""}</td>
        <td>${el.domID ?? ""}</td>
        <td>${el.className ?? ""}</td>
        <td>${el.blip_caption ?? ""}</td>
      `;
      tbody.appendChild(tr);
    });

    // 평균값 기반 차트 생성
    const domStats = calcDomStats(elements);
    renderDomBarChart(domStats);
    renderTimelineChart(elements);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = "<tr><td colspan='10'>데이터를 불러오는 데 실패했습니다.</td></tr>";
  }
}

function highlightDomRect(domId) {
  const el = state.currentElements.find(e => (e.domID || "unknown") === domId);
  if (!el || !el.rect) {
    highlightDiv.style.display = "none";
    return;
  }

  if (hideTimeout) clearTimeout(hideTimeout);

  const imgEl = document.getElementById("statsHeatmapImage");
  const container = document.getElementById("statsHeatmapContainer");
  if (!imgEl || !container) return;

  const containerRect = container.getBoundingClientRect();
  const imgNaturalWidth = imgEl.naturalWidth;
  const imgNaturalHeight = imgEl.naturalHeight;

  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  // object-fit: contain 비율 계산
  const scale = Math.min(containerWidth / imgNaturalWidth, containerHeight / imgNaturalHeight);

  // 이미지 중앙 여백
  const offsetX = (containerWidth - imgNaturalWidth * scale) / 2;
  const offsetY = (containerHeight - imgNaturalHeight * scale) / 2;

  // 하이라이트 박스 위치 및 크기 (container 기준)
  highlightDiv.style.left   = `${offsetX + el.rect.x * scale - 15}px`;
  highlightDiv.style.top    = `${offsetY + el.rect.y * scale + 9}px`;
  highlightDiv.style.width  = `${el.rect.width * scale}px`;
  highlightDiv.style.height = `${el.rect.height * scale}px`;
  highlightDiv.style.display = "block";

  hideTimeout = setTimeout(() => {
    highlightDiv.style.display = "none";
  }, 3000);
}

/* ===== DOM ID별 평균 산출 ===== */
function calcDomStats(elements) {
  const domMap = {};

  elements.forEach(el => {
    const domID = el.domID || "unknown";
    if (!domMap[domID]) domMap[domID] = { durationSum: 0, visitSum: 0, count: 0 };

    domMap[domID].durationSum += Number(el.duration || 0);
    domMap[domID].visitSum += Number(el.visitCount || 0);
    domMap[domID].count += 1;
  });

  return Object.entries(domMap).map(([domID, data]) => ({
    domID,
    avgDuration: data.durationSum / data.count,
    avgVisit: data.visitSum / data.count
  }));
}

/* ===== 1) DOM ID별 평균 Duration/VisitCount 차트 ===== */
function renderDomBarChart(domStats) {
  const ctx = document.getElementById("domBarChart")?.getContext("2d");
  if (!ctx) return;

  if (domBarChart) {
    domBarChart.destroy();
    domBarChart = null;
  }

  const labels = domStats.map(item => item.domID);
  const avgDurationData = domStats.map(item => item.avgDuration.toFixed(2));
  const avgVisitData = domStats.map(item => Number(item.avgVisit.toFixed(2)));

  const durationColors = domStats.map(item => getColorForDom(item.domID));
  const visitColors = domStats.map(item => getColorForDom(item.domID));

  domBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "평균 Duration",
          data: avgDurationData,
          backgroundColor: durationColors,
          yAxisID: 'y'
        },
        {
          label: "평균 VisitCount",
          data: avgVisitData,
          backgroundColor: visitColors,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          position: 'left',
          title: { display: true, text: 'Duration (ms)' }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          title: { display: true, text: 'VisitCount' },
          grid: { drawOnChartArea: false } 
        }
      },
      onClick: (evt) => {
        const elements = domBarChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!elements.length) return;
        const idx = elements[0].index;       
        const domId = domBarChart.data.labels[idx]; 
        highlightDomRect(domId);              
      }
    }
  });
}

/* ===== Timestamp 기반 시계열 차트 (Duration 기준) ===== */
function renderTimelineChart(elements) {
  const ctx = document.getElementById("domTimelineChart")?.getContext("2d");
  if (!ctx) return;

  if (domTimelineChart) {
    domTimelineChart.destroy();
    domTimelineChart = null;
  }

  // 시간대별 DOM ID별 Duration 합계 계산
  const timeMap = {};
  elements.forEach(el => {
    if (!el.timestamp) return;
    const hour = new Date(Number(el.timestamp)).getHours();
    const domID = el.domID || "unknown";
    const duration = Number(el.duration || 0);

    if (!timeMap[domID]) timeMap[domID] = {};
    if (!timeMap[domID][hour]) timeMap[domID][hour] = 0;
    timeMap[domID][hour] += duration;
  });

  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const labels = allHours.map(h => `${h}시`);

  // DOM별 데이터셋 생성 (막대그래프와 동일 색상)
  const datasets = Object.entries(timeMap).map(([domID, hourData]) => {
    const data = allHours.map(h => hourData[h] || 0);
    return {
      label: domID,
      data,
      borderColor: getColorForDom(domID),
      backgroundColor: getColorForDom(domID),
      fill: false,
      tension: 0.3
    };
  });

  domTimelineChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: { 
        y: { 
          beginAtZero: true,
          title: { display: true, text: 'Duration (ms)' }
        }
      }
    }
  });
}

/* ===== 차트 제거(초기화) ===== */
function clearCharts() {
  if (domBarChart) {
    domBarChart.destroy();
    domBarChart = null;
  }
  if (domTimelineChart) {
    domTimelineChart.destroy();
    domTimelineChart = null;
  }
}
