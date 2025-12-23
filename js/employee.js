import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection, addDoc, serverTimestamp,
  query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ====== SETTINGS (Cafe coords + radius) ======
const CAFE_LAT = 33.4430208;
const CAFE_LNG = 44.3973632;
const MAX_DISTANCE_M = 100;        // radius
const MAX_ACCURACY_M = 80;         // if accuracy worse than this, block (change if you want)

// ====== UI ======
const statusText = document.getElementById("statusText");
const hintText = document.getElementById("hintText");

const shiftVal = document.getElementById("shiftVal");
const attVal = document.getElementById("attVal");
const distVal = document.getElementById("distVal");
const accVal = document.getElementById("accVal");
const youVal = document.getElementById("youVal");
const cafeVal = document.getElementById("cafeVal");

const checkInBtn = document.getElementById("checkInBtn");
const checkOutBtn = document.getElementById("checkOutBtn");
const logoutBtn = document.getElementById("logoutBtn");

cafeVal.textContent = ${CAFE_LAT}, ${CAFE_LNG};

// ====== STATE ======
let currentUser = null;
let lastGPS = null; // {lat,lng,accuracy,distance}
let lastType = null; // "checkin" | "checkout" | null

// ====== Helpers ======
function setStatus(msg, type = "info") {
  // type: info | good | bad | warn
  const dotClass = type === "good" ? "good" : type === "bad" ? "bad" : type === "warn" ? "warn" : "warn";
  statusText.innerHTML = <span class="pill"><span class="dot ${dotClass}"></span>${msg}</span>;
}

function fmt(n, digits = 1) {
  if (n === nullNumber.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function enableButtons(enable) {
  checkInBtn.disabled = !enable;
  checkOutBtn.disabled = !enable;
}

async function getLastAttendance(uid) {
  const q = query(
    collection(db, "attendance"),
    where("uid", "==", uid),
    orderBy("timestamp", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const doc = snap.docs[0].data();
  return doc?.type || null; // "checkin" or "checkout"
}

function calcShiftLabel(now = new Date()) {
  // simple example shift: you can replace with your real logic later
  const h = now.getHours();
  if (h >= 6 && h < 14) return "Morning";
  if (h >= 14 && h < 22) return "Evening";
  return "Night";
}

function updateTilesFromGPS(gps) {
  if (!gps) {
    distVal.textContent = "—";
    accVal.textContent = "—";
    youVal.textContent = "—";
    return;
  }
  distVal.textContent = fmt(gps.distance, 1);
  accVal.textContent = fmt(gps.accuracy, 0);
  youVal.textContent = ${fmt(gps.lat, 6)}, ${fmt(gps.lng, 6)};
}

// ====== GPS ======
function getGPSOnce(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  });
}

async function refreshGPS() {
  setStatus("Checking GPS…", "warn");
  enableButtons(false);

  try {
    const pos = await getGPSOnce(12000);
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    const distance = haversineMeters(lat, lng, CAFE_LAT, CAFE_LNG);

    lastGPS = { lat, lng, accuracy, distance };
    updateTilesFromGPS(lastGPS);

    // Decide GPS readiness

if (accuracy > MAX_ACCURACY_M) {
      setStatus(`GPS accuracy too low (${Math.round(accuracy)}m). Move outside or enable High Accuracy.`, "warn");
      enableButtons(false);
      return;
    }

    if (distance > MAX_DISTANCE_M) {
      setStatus(`Out of range (${Math.round(distance)}m). Allowed: ${MAX_DISTANCE_M}m.`, "bad");
      enableButtons(true); // allow click so we can show message on click too
      return;
    }

    setStatus(`In range ✅ (${Math.round(distance)}m)`, "good");
    enableButtons(true);
  } catch (e) {
    // Permission / Timeout / Position unavailable
    const msg =
      e?.code === 1 ? "Location permission denied. Allow location for this site." :
      e?.code === 2 ? "Location unavailable. Try again and enable GPS." :
      e?.code === 3 ? "GPS timeout. Try again near a window or enable High Accuracy." :
      (e?.message || "GPS error");

    setStatus(msg, "bad");
    enableButtons(false);
  }
}

// ====== Attendance actions ======
async function doAttendance(type) {
  if (!currentUser) return;

  // force fresh GPS every action
  await refreshGPS();

  if (!lastGPS) {
    setStatus("GPS not ready. Can't submit.", "bad");
    return;
  }

  if (lastGPS.accuracy > MAX_ACCURACY_M) {
    setStatus(`GPS accuracy too low (${Math.round(lastGPS.accuracy)}m). Can't submit.`, "warn");
    return;
  }

  if (lastGPS.distance > MAX_DISTANCE_M) {
    // THIS is what you wanted: show out of range when click
    setStatus(`Out of range (${Math.round(lastGPS.distance)}m). Can't ${type}.`, "bad");
    return;
  }

  try {
    setStatus(`Submitting ${type}…`, "warn");
    enableButtons(false);

    await addDoc(collection(db, "attendance"), {
      uid: currentUser.uid,
      email: currentUser.email || "",
      type, // "checkin" or "checkout"
      lat: lastGPS.lat,
      lng: lastGPS.lng,
      accuracy: lastGPS.accuracy,
      distance: lastGPS.distance,
      timestamp: serverTimestamp()
    });

    lastType = type;
    attVal.textContent = type === "checkin" ? "Checked In" : "Checked Out";
    setStatus(`${type === "checkin" ? "Check In" : "Check Out"} saved ✅`, "good");
    enableButtons(true);
  } catch (e) {
    setStatus(`Save failed: ${e?.message || e}`, "bad");
    enableButtons(true);
  }
}

// ====== Events ======
checkInBtn.addEventListener("click", () => doAttendance("checkin"));
checkOutBtn.addEventListener("click", () => doAttendance("checkout"));

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "./login.html";
});

// ====== Init ======
shiftVal.textContent = calcShiftLabel();
attVal.textContent = "—";
enableButtons(false);
setStatus("Loading status…", "warn");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./login.html";
    return;
  }
  currentUser = user;

  // Load last attendance status
  try {
    const last = await getLastAttendance(user.uid);
    lastType = last;
    if (!last) attVal.textContent = "No records";
    else attVal.textContent = last === "checkin" ? "Checked In" : "Checked Out";

    setStatus("Status loaded. Checking GPS…", "warn");
  } catch (e) {
    setStatus(`Status load failed: ${e?.message || e}`, "bad");
  }

  // Load GPS immediately
  await refreshGPS();

  // optional: refresh GPS every 20 seconds
  setInterval(refreshGPS, 20000);
});

