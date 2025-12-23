/*************************************************
 * charts.js — The Grinders (Cafe Colors)
 * يعتمد على:
 * - window.db (Firestore compat)
 * - inputs: #fromDate, #toDate
 * - canvases: chartDaily, chartType, chartTop, chartAccuracy
 *************************************************/

let _chartDaily, _chartType, _chartTop, _chartAccuracy;

// ألوان الكافيه
const CAFE = {
  caramel: "#C7A17A",
  latte: "#EFE6D8",
  dark: "#2B1F17",
  olive: "#6B8E23",
  danger: "#B6452C",
  brown: "#3A2A20"
};

function $(id){ return document.getElementById(id); }

function destroyChart(ch){
  if (ch) ch.destroy();
  return null;
}

function getRange(){
  const fromDate = ($("fromDate")?.value || "").trim();
  const toDate = ($("toDate")?.value || "").trim();
  return { fromDate, toDate };
}

async function fetchAttendance(fromDate, toDate){
  // نعتمد dateKey = YYYY-MM-DD مثل نظامك الحالي
  const snap = await db.collection("attendance")
    .where("dateKey", ">=", fromDate)
    .where("dateKey", "<=", toDate)
    .get();

  const arr = [];
  snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

function bucketAccuracy(acc){
  // تحويل الدقة إلى مجموعات
  if (acc == null || isNaN(acc)) return "Unknown";
  if (acc <= 10) return "0–10m";
  if (acc <= 20) return "11–20m";
  if (acc <= 50) return "21–50m";
  if (acc <= 100) return "51–100m";
  return "100m+";
}

function drawDaily(events){
  const map = {};
  for (const e of events){
    const k = e.dateKey || "Unknown";
    map[k] = (map[k] || 0) + 1;
  }
  const labels = Object.keys(map).sort();
  const values = labels.map(k => map[k]);

  _chartDaily = destroyChart(_chartDaily);
  _chartDaily = new Chart($("chartDaily"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "عدد التسجيلات",
        data: values,
        backgroundColor: CAFE.caramel
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: CAFE.latte } },
        tooltip: { enabled: true }
      },
      scales: {
        x: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

function drawType(events){
  let checkin = 0, checkout = 0;
  for (const e of events){
    if (e.type === "checkin") checkin++;
    else if (e.type === "checkout") checkout++;
  }

  _chartType = destroyChart(_chartType);
  _chartType = new Chart($("chartType"), {
    type: "doughnut",
    data: {
      labels: ["Check-in", "Check-out"],
      datasets: [{
        data: [checkin, checkout],
        backgroundColor: [CAFE.caramel, CAFE.olive],
        borderColor: "rgba(255,255,255,.10)",
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: CAFE.latte } }
      }
    }
  });
}

function drawTop(events){
  const map = {};
  for (const e of events){
    const uid = e.uid || "Unknown";
    map[uid] = (map[uid] || 0) + 1;
  }
  const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0, 8);
  const labels = entries.map(x=>x[0].slice(0, 8) + "…"); // عرض مختصر للـ uid
  const values = entries.map(x=>x[1]);

  _chartTop = destroyChart(_chartTop);
  _chartTop = new Chart($("chartTop"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "عدد التسجيلات",
        data: values,
        backgroundColor: CAFE.latte
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: CAFE.latte } }
      },
      scales: {
        x: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

function drawAccuracy(events){
  const map = {};
  for (const e of events){
    const acc = e.gps?.accuracy ?? e.gps?.acc ?? e.gps?.Accuracy;
    const bucket = bucketAccuracy(acc);
    map[bucket] = (map[bucket] || 0) + 1;
  }

  const order = ["0–10m","11–20m","21–50m","51–100m","100m+","Unknown"];
  const labels = order.filter(k => map[k]);
  const values = labels.map(k => map[k]);

  _chartAccuracy = destroyChart(_chartAccuracy);
  _chartAccuracy = new Chart($("chartAccuracy"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "عدد التسجيلات",
        data: values,
        borderColor: CAFE.caramel,
        backgroundColor: "rgba(199,161,122,.18)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: CAFE.latte
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: CAFE.latte } }
      },
      scales: {
        x: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: CAFE.latte }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

async function refreshCharts(){
  const { fromDate, toDate } = getRange();
  if (!fromDate || !toDate) return;

  const events = await fetchAttendance(fromDate, toDate);

  drawDaily(events);
  drawType(events);
  drawTop(events);
  drawAccuracy(events);
}

// زر التحديث في admin.html ينادي هذا
async function refreshChartsAndExports(){
  await refreshCharts();
  // (التصدير CSV يبقى أزراره منفصلة — ما نصدّر تلقائياً)
}
window.refreshChartsAndExports = refreshChartsAndExports;

// أول تحميل
document.addEventListener("auth-ready", async () => {
  // تاريخ افتراضي: بداية الشهر إلى اليوم
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const to = now.toISOString().slice(0,10);

  if ($("fromDate")) $("fromDate").value = from;
  if ($("toDate")) $("toDate").value = to;

  await refreshCharts();
});
