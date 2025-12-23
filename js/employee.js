// js/employee.js
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
const MAX_DISTANCE_M = 100;     // allowed range
const MAX_ACCURACY_M = 80;      // if accuracy worse than this, block (change if you want)

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

// show cafe coords (FIXED)
if (cafeVal) cafeVal.textContent = `${CAFE_LAT}, ${CAFE_LNG}`;

// ====== STATE ======
let currentUser = null;
let lastGPS = null; // { lat, lng, accuracy, distance }
let lastType = null; // "checkin" | "checkout" | null

// ====== Helpers ======
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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}

function setButtonsEnabled({ canCheckIn, canCheckOut }) {
  if (checkInBtn) checkInBtn.disabled = !canCheckIn;
  if (checkOutBtn) checkOutBtn.disabled = !canCheckOut;
}

async function getGPSOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        const distance = haversineMeters(lat, lng, CAFE_LAT, CAFE_LNG);

        resolve({ lat, lng, accuracy, distance });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  });
}

function renderGPS(gps) {
  if (!gps) return;

  if (youVal) youVal.textContent = `${fmt(gps.lat, 6)}, ${fmt(gps.lng, 6)}`;
  if (distVal) distVal.textContent = `${fmt(gps.distance, 1)}`;
  if (accVal) accVal.textContent = `${fmt(gps.accuracy, 0)}`;

  // hint/status about range
  if (gps.accuracy > MAX_ACCURACY_M) {
    setStatus(`GPS accuracy ضعيف (${fmt(gps.accuracy, 0)}m). قرّب من الشباك/شغّل GPS.`);
  } else if (gps.distance > MAX_DISTANCE_M) {
    setStatus(`Out of range: لازم تكون داخل ${MAX_DISTANCE_M}m (انت ${fmt(gps.distance, 1)}m).`);
  }
}

async function refreshStatusFromFirestore(uid) {
  // نقرأ آخر حالة محفوظة داخل users/{uid} (بدون الحاجة لـ indexes)
  try {
    const uref = doc(db, "users", uid);
    const snap = await getDoc(uref);
    if (snap.exists()) {
      const data = snap.data();
      lastType = data.lastType || null;

      if (attVal) attVal.textContent = lastType ? lastType.toUpperCase() : "—";
      if (shiftVal) shiftVal.textContent = data.currentShift || "—";
    } else {
      if (attVal) attVal.textContent = "—";
      if (shiftVal) shiftVal.textContent = "—";
      lastType = null;
    }
  } catch (e) {
    console.error("refreshStatusFromFirestore error:", e);
    setStatus("خطأ بجلب الحالة من Firestore");
  }
}

function decideButtons(gps) {
  const gpsOk = gps && gps.accuracy <= MAX_ACCURACY_M;
  const inRange = gpsOk && gps.distance <= MAX_DISTANCE_M;

  // إذا آخر شيء checkin → فعل checkout
  // إذا آخر شيء checkout/لا شيء → فعل checkin
  const canCheckIn = Boolean(inRange && (lastType !== "checkin"));
  const canCheckOut = Boolean(inRange && (lastType === "checkin"));

  setButtonsEnabled({ canCheckIn, canCheckOut });

  // لو خارج النطاق خلي الأزرار disabled بس نوضح السبب
  if (gps && gpsOk && gps.distance > MAX_DISTANCE_M) {
    setButtonsEnabled({ canCheckIn: false, canCheckOut: false });
  }
  if (gps && gps.accuracy > MAX_ACCURACY_M) {
    setButtonsEnabled({ canCheckIn: false, canCheckOut: false });
  }
}

async function tickGPS() {
  try {
    setStatus("Checking GPS...");
    const gps = await getGPSOnce();
    lastGPS = gps;
    renderGPS(gps);
    decideButtons(gps);

    // إذا كل شيء تمام وحالة الـ attendance موجودة
    if (gps.accuracy <= MAX_ACCURACY_M && gps.distance <= MAX_DISTANCE_M) {
      if (lastType === "checkin") setStatus("In range ✅ يمكنك Check Out");
      else setStatus("In range ✅ يمكنك Check In");
    }
  } catch (err) {
    console.error("GPS error:", err);
    setStatus("ما قدرت اجيب موقعك. اسمح للمتصفح بالموقع (Allow).");
    setButtonsEnabled({ canCheckIn: false, canCheckOut: false });
  }
}

async function writeAttendance(type) {
  if (!currentUser) return;

  // لازم يكون عندنا GPS
  if (!lastGPS) {
    await tickGPS();
    if (!lastGPS) return;
  }

  // تحقق نطاق/دقة
  if (lastGPS.accuracy > MAX_ACCURACY_M) {
    alert(`GPS accuracy ضعيف (${fmt(lastGPS.accuracy, 0)}m). حاول مرة ثانية.`);
    setStatus("GPS accuracy ضعيف — ما نكدر نسجل.");
    return;
  }

  if (lastGPS.distance > MAX_DISTANCE_M) {
    alert(`Out of range — لازم تكون داخل ${MAX_DISTANCE_M}m`);
    setStatus(`Out of range: انت ${fmt(lastGPS.distance, 1)}m`);
    return;
  }

  // كتابة
  try {
    setStatus("Saving...");
    setButtonsEnabled({ canCheckIn: false, canCheckOut: false });

    // 1) سجل event داخل attendance collection
    await addDoc(collection(db, "attendance"), {
      uid: currentUser.uid,
      email: currentUser.email || null,
      type,
      lat: lastGPS.lat,
      lng: lastGPS.lng,
      accuracy: lastGPS.accuracy,
      distance: lastGPS.distance,
      timestamp: serverTimestamp()
    });

    // 2) تحديث حالة المستخدم داخل users/{uid}
    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        lastType: type,
        lastUpdated: serverTimestamp()
      },
      { merge: true }
    );

    lastType = type;
    if (attVal) attVal.textContent = type.toUpperCase();

    // إعادة تفعيل الأزرار حسب الحالة
    decideButtons(lastGPS);

    setStatus(type === "checkin" ? "Checked in ✅" : "Checked out ✅");
  } catch (e) {
    console.error("writeAttendance error:", e);
    setStatus("صار خطأ بالتسجيل (Firestore).");
  }
}

// ====== Events ======
if (checkInBtn) {
  checkInBtn.addEventListener("click", async () => {
    await writeAttendance("checkin");
  });
}

if (checkOutBtn) {
  checkOutBtn.addEventListener("click", async () => {
    await writeAttendance("checkout");
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./login.html";
  });
}

// ====== Boot ======
setButtonsEnabled({ canCheckIn: false, canCheckOut: false });
setStatus("Loading status...");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  currentUser = user;

  await refreshStatusFromFirestore(user.uid);
  await tickGPS();

  // تحديث GPS كل 10 ثواني
  setInterval(tickGPS, 10000);
});
