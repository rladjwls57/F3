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

    urlListEl.innerHTML = "";
    urls.forEach(url => {
      const li = document.createElement("li");
      li.textContent = url;
      li.style.cursor = "pointer";
      li.style.padding = "4px 0";
      li.style.borderBottom = "1px solid #eee";
      li.addEventListener("click", () => loadElementsByUrl(url));
      urlListEl.appendChild(li);
    });

  } catch (err) {
    console.error(err);
    urlListEl.innerHTML = "<li>URL 목록을 불러오는 데 실패했습니다.</li>";
  }
}

/* ===== 선택한 URL의 elements 불러오기 ===== */
async function loadElementsByUrl(url) {
  const tbody = document.querySelector("#stats-elements-table tbody");
  tbody.innerHTML = "<tr><td colspan='10'>Loading...</td></tr>";

  try {
    const res = await fetch(`${state.API_URL}/stats/elements?target_url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error("Elements 조회 실패");

    const data = await res.json();
    const elements = data.elements || [];

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

    // ✅ 평균값 기반 차트 생성
    const domStats = calcDomStats(elements);
    renderDomBarChart(domStats);
    renderTimelineChart(elements);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = "<tr><td colspan='10'>데이터를 불러오는 데 실패했습니다.</td></tr>";
  }
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

  // 기존 차트 제거
  if (domBarChart) {
    domBarChart.destroy();
    domBarChart = null;
  }

  const labels = domStats.map(item => item.domID);
  const avgDurationData = domStats.map(item => item.avgDuration.toFixed(2));
  const avgVisitData = domStats.map(item => Number(item.avgVisit.toFixed(2)));

  domBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "평균 Duration",
          data: avgDurationData
        },
        {
          label: "평균 VisitCount",
          data: avgVisitData
        }
      ]
    },
    options: {
      responsive: true,
      scales: { 
        y: { 
          beginAtZero: true 
        }
      }
    }
  });
}

/* ===== 2) Timestamp 기반 시계열 차트 ===== */
function renderTimelineChart(elements) {
  const ctx = document.getElementById("domTimelineChart")?.getContext("2d");
  if (!ctx) return;

  if (domTimelineChart) {
    domTimelineChart.destroy();
    domTimelineChart = null;
  }

  // 시간대별 DOM ID 카운트
  const timeMap = {};
  elements.forEach(el => {
    if (!el.timestamp) return;
    const hour = new Date(Number(el.timestamp)).getHours();
    const domID = el.domID || "unknown";
    if (!timeMap[domID]) timeMap[domID] = {};
    if (!timeMap[domID][hour]) timeMap[domID][hour] = 0;
    timeMap[domID][hour]++;
  });

  // 라벨(시간) 생성
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const labels = allHours.map(h => `${h}시`);

  const datasets = Object.entries(timeMap).map(([domID, hourData]) => {
    const data = allHours.map(h => hourData[h] || 0);
    return {
      label: domID,
      data
    };
  });

  domTimelineChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: { 
        y: { 
          beginAtZero: true 
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
