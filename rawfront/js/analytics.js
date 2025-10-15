import { state, pastel, safe, fmtSec, keyOf } from "./core.js";

let barChart, pieChart;

window.addEventListener("DOMContentLoaded", ()=>{
  window.addEventListener("hashchange", maybeRender);
  maybeRender();
});

function maybeRender(){
  if(!location.hash.includes("#/analytics")) return;

  document.getElementById("datasetName").textContent = `세션 ID : ${state.sid}`;

  renderHeatmap();     // <-- 히트맵 렌더링 추가
  renderTable();
  renderTimeline();
  renderCharts();

  const llmEl = document.getElementById("llmSummary");
  llmEl.textContent = state.llmSummary || "LLM 요약문이 없습니다.";
}

/* ========== 히트맵 ========== */
async function renderHeatmap() {

  const imgEl = document.getElementById("heatmapImage");
  imgEl.src = "";
  imgEl.alt = "세션을 선택하면 히트맵이 표시됩니다.";

  if (!state.sid) return;

  try {
    const res = await fetch(`http://localhost:5000/heatmap/${state.sid}`);
    if (!res.ok) throw new Error(`이미지를 불러올 수 없습니다. (status: ${res.status})`);

    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);
    imgEl.src = imageUrl;
    imgEl.alt = `세션 ${state.sid} 히트맵`;

    const dlBtn = document.getElementById("downloadHeatmapBtn");
    dlBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `heatmap_session_${state.sid}.png`;
      a.click();
    };
  } catch (err) {
    console.error("히트맵 로드 실패:", err);
    imgEl.alt = "히트맵을 불러올 수 없습니다.";
  }
}

/* ========== 테이블 ========== */
function renderTable(){
  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";

  if (!state.currentElements || !state.currentElements.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" style="text-align:center;">데이터가 없습니다</td>`;
    tbody.appendChild(tr);
    return;
  }

  for(const item of state.currentElements){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${safe(item.timestamp)}</td>
      <td class="mono">
        <div style="max-width:250px; overflow-x:auto; white-space:nowrap;">${safe(item.url)}</div>
      </td>
      <td class="mono">${safe(item.duration)}</td>
      <td>${safe(item.visitCount)}</td>
      <td>${safe(item.tag)}</td>
      <td>${safe(item.text)}</td>
      <td>${safe(item.domID)}</td>
      <td>${safe(item.className)}</td>
      <td>${safe(item.blip_caption)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ========== 타임라인(SVG) ========== */
function renderTimeline(){
  const wrap = document.getElementById("timeline");
  const legend = document.getElementById("legend");
  wrap.innerHTML = ""; 
  legend.innerHTML = "";

  const elements = state.currentElements;
  if(!elements || !elements.length){
    const empty = document.createElement("div");
    empty.style.padding = "16px";
    empty.style.color = "#666";
    empty.textContent = "표시할 타임라인 데이터가 없습니다.";
    wrap.appendChild(empty);
    return;
  }

  const domIDs = [...new Set(elements.map(e=>e.domID || "unknown"))];
  const idxOf = Object.fromEntries(domIDs.map((id,i)=>[id,i]));

  const totalSec = elements.reduce((a,e)=> a + (Number(e.duration||0)/1000),0);
  document.getElementById("timelineTotal").textContent = `총 경과: ${fmtSec(totalSec)}`;

  const rowH = 30, pad = 60;
  const w = Math.max(900, totalSec*60 + pad*2);
  const h = pad + domIDs.length*rowH + 30;

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", w); 
  svg.setAttribute("height", h);

  const step = niceTick(totalSec);
  for(let t=0; t<=totalSec+1e-6; t+=step){
    const x = pad + (t/totalSec)*(w-pad*2);
    const line = document.createElementNS(NS,"line");
    line.setAttribute("x1", x); line.setAttribute("y1", pad-10);
    line.setAttribute("x2", x); line.setAttribute("y2", h-20);
    line.setAttribute("stroke","#eee");
    svg.appendChild(line);

    const txt = document.createElementNS(NS,"text");
    txt.setAttribute("x", x); 
    txt.setAttribute("y", pad-16);
    txt.setAttribute("text-anchor","middle");
    txt.setAttribute("style","font-size:12px; fill:#666");
    txt.textContent = `${t.toFixed(0)}s`;
    svg.appendChild(txt);
  }

  domIDs.forEach((id,i)=>{
    const ty = pad + i*rowH + rowH/2 + 4;
    const txt = document.createElementNS(NS,"text");
    txt.setAttribute("x", 8); 
    txt.setAttribute("y", ty);
    txt.setAttribute("style","font-size:12px; fill:#666");
    txt.textContent = id;
    svg.appendChild(txt);
  });

  let globalTime = 0;
  elements.forEach(e=>{
    const domID = e.domID || "unknown";
    const yIdx = idxOf[domID];
    const durationSec = Number(e.duration || 0)/1000;

    const x1 = pad + (globalTime / totalSec)*(w-pad*2);
    const x2 = pad + ((globalTime + durationSec)/totalSec)*(w-pad*2);
    globalTime += durationSec;

    const rect = document.createElementNS(NS,"rect");
    rect.setAttribute("x", x1);
    rect.setAttribute("y", pad + yIdx*rowH + 6);
    rect.setAttribute("width", Math.max(0, x2-x1));
    rect.setAttribute("height", rowH-12);
    rect.setAttribute("rx",6);
    rect.setAttribute("fill", pastel[yIdx%pastel.length]);
    rect.setAttribute("opacity","0.7");

    const titleEl = document.createElementNS(NS,"title");
    titleEl.textContent = e.text || e.tag || domID;
    rect.appendChild(titleEl);

    svg.appendChild(rect);
  });

  wrap.appendChild(svg);

  domIDs.forEach((id,i)=>{
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `<span class="dot" style="background:${pastel[i%pastel.length]}"></span><span>${safe(id)}</span>`;
    legend.appendChild(div);
  });
}

/* ========== 막대+파이 차트 ========== */
function renderCharts(){
  if (!state.currentElements || !state.currentElements.length) return;

  const domDurationMap = {};
  state.currentElements.forEach(e => {
    const id = e.domID || "unknown";
    const dur = Number(e.duration || 0)/1000;
    domDurationMap[id] = (domDurationMap[id] || 0) + dur;
  });

  const labels = Object.keys(domDurationMap);
  const secs = Object.values(domDurationMap);

  const bctx = document.getElementById("barTotal").getContext("2d");
  if(barChart) barChart.destroy();
  barChart = new Chart(bctx, {
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Total Duration (s)",
        data: secs,
        backgroundColor: labels.map((_,i)=> pastel[i % pastel.length]),
        borderWidth:0
      }]
    },
    options:{
      indexAxis:"y",
      responsive:true,
      scales:{
        x:{ beginAtZero:true, grid:{color:"#eee"} },
        y:{ grid:{display:false} }
      },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label: (c) => `${c.raw.toFixed(2)}s` } }
      }
    }
  });

  const selectionWrap = document.getElementById("adDomSelection");
  selectionWrap.innerHTML = "";
  labels.forEach((id, i) => {
    const labelEl = document.createElement("label");
    labelEl.style.display = "flex";
    labelEl.style.alignItems = "center";
    labelEl.style.gap = "4px";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = id;
    input.checked = false;
    input.addEventListener("change", updatePieChart);

    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(id));
    selectionWrap.appendChild(labelEl);
  });

  updatePieChart();

  function updatePieChart(){
    const checkedDOMs = Array.from(document.querySelectorAll("#adDomSelection input:checked"))
                            .map(el => el.value);

    const totalDuration = Object.values(domDurationMap).reduce((a,b)=>a+b,0);
    const ratios = Object.keys(domDurationMap).map(id => (domDurationMap[id]/totalDuration)*100);

    const bgColors = Object.keys(domDurationMap).map(id =>
      checkedDOMs.includes(id) ? pastel[Object.keys(domDurationMap).indexOf(id) % pastel.length] : "#eee"
    );

    const pctx = document.getElementById("pieRatio").getContext("2d");
    if(pieChart) pieChart.destroy();
    pieChart = new Chart(pctx, {
      type:"pie",
      data:{
        labels: Object.keys(domDurationMap),
        datasets:[{
          data: ratios,
          backgroundColor: bgColors
        }]
      },
      options:{
        plugins:{
          tooltip:{
            callbacks:{
              label: (c) => `${c.label}: ${c.raw.toFixed(1)}%`
            }
          },
          legend: { display: true }
        }
      }
    });
  }
}

// 보기 좋은 눈금(step) 계산
function niceTick(total) {
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600];
  const target = 8;
  for (const s of steps) {
    if (total / s <= target) return s;
  }
  return Math.max(1, Math.round(total / target));
}
