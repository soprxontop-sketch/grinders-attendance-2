/**
 * Admin reports:
 * - Loads attendance within date range (client filtering)
 * - Exports CSV Summary + CSV Details
 */

function $(id){ return document.getElementById(id); }

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function loadEmployees() {
  const tbody = $("empTbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
  const snap = await window.db.collection("users").get();
  const rows = [];
  snap.forEach(d => {
    const u = d.data() || {};
    rows.push({ uid: d.id, name: u.name || "", role: u.role || "employee", active: u.active !== false, deviceId: u.deviceId || "" });
  });
  rows.sort((a,b) => (a.role+b.name).localeCompare(b.role+a.name));
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.role}</td>
      <td>${r.active ? "✅" : "⛔"}</td>
      <td style="font-family:monospace;font-size:12px">${r.uid}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No users</td></tr>`;
}

async function addUserManual() {
  const uid = ($("newUid")?.value || "").trim();
  const name = ($("newName")?.value || "").trim();
  const role = ($("newRole")?.value || "employee").trim();
  const active = ($("newActive")?.checked ?? true);
  const lockDevice = ($("newLockDevice")?.checked ?? false);
  const deviceId = lockDevice ? (localStorage.getItem("deviceId") || "") : "";

  if (!uid) return alert("UID required");
  if (!name) return alert("Name required");

  await window.db.collection("users").doc(uid).set({
    name, role, active,
    ...(deviceId ? { deviceId } : {})
  }, { merge: true });

  alert("Saved");
  await loadEmployees();
}

async function loadAttendanceRange(fromDate, toDate) {
  // We query by dateKey (string YYYY-MM-DD). This is simple and cheap enough for small datasets.
  // For big datasets, add indexes and/or store daily subcollections.
  const snap = await window.db.collection("attendance")
    .where("dateKey", ">=", fromDate)
    .where("dateKey", "<=", toDate)
    .get();

  const events = [];
  snap.forEach(d => {
    const x = d.data() || {};
    events.push({ id: d.id, ...x });
  });
  // Sort by clientTs
  events.sort((a,b) => (a.clientTs||"").localeCompare(b.clientTs||""));
  return events;
}

async function exportCsvDetails() {
  const fromDate = ($("fromDate")?.value || "").trim();
  const toDate = ($("toDate")?.value || "").trim();
  if (!fromDate || !toDate) return alert("Select from/to dates");

  const events = await loadAttendanceRange(fromDate, toDate);

  const header = ["dateKey","clientTs","uid","type","deviceId","lat","lng","accuracy","distanceM"];
  const lines = [header.join(",")];

  for (const e of events) {
    const g = e.gps || {};
    lines.push([
      e.dateKey, e.clientTs, e.uid, e.type, e.deviceId,
      g.latitude ?? "", g.longitude ?? "", g.accuracy ?? "", g.distanceM ?? ""
    ].map(csvEscape).join(","));
  }

  downloadText(`attendance_details_${fromDate}_to_${toDate}.csv`, lines.join("\n"));
}

async function exportCsvSummary() {
  const fromDate = ($("fromDate")?.value || "").trim();
  const toDate = ($("toDate")?.value || "").trim();
  if (!fromDate || !toDate) return alert("Select from/to dates");

  const events = await loadAttendanceRange(fromDate, toDate);

  // Summary: per user per day -> count checkins / checkouts, first/last time
  const map = new Map();
  for (const e of events) {
    const key = `${e.uid}__${e.dateKey}`;
    if (!map.has(key)) map.set(key, { uid: e.uid, dateKey: e.dateKey, checkins: 0, checkouts: 0, firstTs: null, lastTs: null });
    const row = map.get(key);
    if (e.type === "checkin") row.checkins++;
    if (e.type === "checkout") row.checkouts++;
    const t = e.clientTs || "";
    if (!row.firstTs || t < row.firstTs) row.firstTs = t;
    if (!row.lastTs || t > row.lastTs) row.lastTs = t;
  }

  const header = ["dateKey","uid","checkins","checkouts","firstTs","lastTs"];
  const lines = [header.join(",")];
  for (const row of Array.from(map.values()).sort((a,b) => (a.dateKey+a.uid).localeCompare(b.dateKey+b.uid))) {
    lines.push([row.dateKey,row.uid,row.checkins,row.checkouts,row.firstTs||"",row.lastTs||""].map(csvEscape).join(","));
  }

  downloadText(`attendance_summary_${fromDate}_to_${toDate}.csv`, lines.join("\n"));
}

document.addEventListener("auth-ready", async () => {
  // default date range: current month
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const to = now.toISOString().slice(0,10);
  if ($("fromDate")) $("fromDate").value = from;
  if ($("toDate")) $("toDate").value = to;

  await loadEmployees();
});
