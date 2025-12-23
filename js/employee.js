import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ====== SETTINGS (Cafe coords + radius) ======
const CAFE_LAT = 33.4430208;
const CAFE_LNG = 44.3973632;
const MAX_DISTANCE_M = 100;
const MAX_ACCURACY_M = 80;

// ====== DEVICE ID (UUID) ======
const DEVICE_KEY = "device_uuid";

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "dvc_" + crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const DEVICE_ID = getDeviceId();

// ====== UI refs ======
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

if (cafeVal) cafeVal.textContent = `${CAFE_LAT}, ${CAFE_LNG}`;

// ====== STATE ======
let currentUser = null;
let lastGPS = null;
let lastType = null;

// ====== HELPERS ======
function fmt(n, digits = 1) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return num.toFixed(digits);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}

function setButtonsEnabled({ canCheckIn, canCheckOut }) {
  if (checkInBtn) checkInBtn.disabled = !canCheckIn;
  if (checkOutBtn) checkOutBtn.disabled = !canCheckOut;
}

// ====== AUDIT LOG ======
async function logAudit({ action, reason }) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      action,
      reason,
      uid: currentUser?.uid || null,
      email: currentUser?.email || null,
      deviceId: DEVICE_ID,
      lat: lastGPS?.lat ?? null,
      lng: lastGPS?.lng ?? null,
      accuracy: lastGPS?.accuracy ?? null,
      distanceM: lastGPS?.distance ?? null,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("Audit log failed:", e);
  }
}

// ====== GPS ======
async function getGPSOnce() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const distance = haversineMeters(lat, lng, CAFE_LAT, CAFE_LNG);
        resolve({ lat, lng, accuracy, distance });
      },
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function renderGPS(gps) {
  if (!gps) return;
  if (youVal) youVal.textContent = `${fmt(gps.lat, 6)}, ${fmt(gps.lng, 6)}`;
  if (distVal) distVal.textContent = fmt(gps.distance, 1);
  if (accVal) accVal.textContent = fmt(gps.accuracy, 0);
}

// ====== STATUS ======
async function refreshStatusFromFirestore(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    lastType = snap.data().lastType || null;
    if (attVal) attVal.textContent = lastType ? lastType.toUpperCase() : "—";
    if (shiftVal) shiftVal.textContent = snap.data().currentShift || "—";
  }
}

function decideButtons(gps) {
  const gpsOk = gps && gps.accuracy <= MAX_ACCURACY_M && gps.distance <= MAX_DISTANCE_M;
  setButtonsEnabled({
    canCheckIn: gpsOk && lastType !== "checkin",
    canCheckOut: gpsOk && lastType === "checkin"
  });
}

// ====== ATTENDANCE ======
async function writeAttendance(type) {
  if (!currentUser) return;

  if (!lastGPS) {
    lastGPS = await getGPSOnce();
    renderGPS(lastGPS);
  }

  if (lastGPS.accuracy > MAX_ACCURACY_M) {
    await logAudit({ action: "DENIED", reason: "gps_weak" });
    alert("GPS accuracy ضعيف");
    return;
  }

  if (lastGPS.distance > MAX_DISTANCE_M) {
    await logAudit({ action: "DENIED", reason: "out_of_range" });
    alert("Out of range");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const savedDevice = userSnap.data().deviceId;
    if (savedDevice && savedDevice !== DEVICE_ID) {
      await logAudit({ action: "DENIED", reason: "device_mismatch" });
      alert("هذا الحساب مربوط بجهاز آخر");
      return;
    }
  }

  await setDoc(userRef, { deviceId: DEVICE_ID }, { merge: true });

  await addDoc(collection(db, "attendance"), {
    uid: currentUser.uid,
    email: currentUser.email || null,
    type,
    lat: lastGPS.lat,
    lng: lastGPS.lng,
    accuracy: lastGPS.accuracy,
    distance: lastGPS.distance,
    deviceId: DEVICE_ID,
    timestamp: serverTimestamp()
  });

  await setDoc(userRef, { lastType: type }, { merge: true });
  await logAudit({ action: type.toUpperCase(), reason: "success" });

  lastType = type;
  setStatus(type === "checkin" ? "Checked in ✅" : "Checked out ✅");
  decideButtons(lastGPS);
}

// ====== EVENTS ======
checkInBtn?.addEventListener("click", () => writeAttendance("checkin"));
checkOutBtn?.addEventListener("click", () => writeAttendance("checkout"));
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "./login.html";
});

// ====== BOOT ======
setButtonsEnabled({ canCheckIn: false, canCheckOut: false });
setStatus("Loading...");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./login.html";
    return;
  }
  currentUser = user;
  await refreshStatusFromFirestore(user.uid);
  lastGPS = await getGPSOnce();
  renderGPS(lastGPS);
  decideButtons(lastGPS);
  setInterval(async () => {
    lastGPS = await getGPSOnce();
    renderGPS(lastGPS);
    decideButtons(lastGPS);
  }, 10000);
});
