/************************************************
 * ATTENDANCE.JS — The Grinders
 * Check-in / Check-out with:
 * - GPS distance
 * - GPS accuracy
 * - Device ID
 * - Anti-tampering (basic, client-side)
 ************************************************/

/* ====== إعدادات المقهى ====== */
const CAFE_LAT = 33.3103442309685;
const CAFE_LNG = 44.32422900516875;

const MAX_DISTANCE_METERS = 100; // أقصى مسافة مسموحة
const MAX_ACCURACY_METERS = 50;  // أقصى دقة GPS مسموحة

/* ====== أدوات مساعدة ====== */
function setEmpStatus(msg) {
  const el = document.getElementById("empStatus");
  if (el) el.textContent = msg || "";
}

// حساب المسافة بين نقطتين (Haversine)
function distanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Device ID ثابت
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

// جلب الموقع مرة واحدة
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم GPS"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos),
      err => reject(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

/* ====== المنطق الأساسي ====== */
async function markAttendance(type) {
  setEmpStatus("📡 جاري تحديد الموقع...");

  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  let position;
  try {
    position = await getCurrentLocation();
  } catch (err) {
    setEmpStatus("");
    alert("فشل تحديد الموقع: " + err.message);
    return;
  }

  const { latitude, longitude, accuracy } = position.coords;

  // التحقق من دقة الموقع
  if (accuracy > MAX_ACCURACY_METERS) {
    setEmpStatus("");
    alert(`❌ دقة الموقع ضعيفة (${Math.round(accuracy)}m). تحرك لمكان مفتوح وجرب مرة ثانية.`);
    return;
  }

  // التحقق من المسافة
  const distance = distanceInMeters(
    CAFE_LAT,
    CAFE_LNG,
    latitude,
    longitude
  );

  if (distance > MAX_DISTANCE_METERS) {
    setEmpStatus("");
    alert(`❌ خارج نطاق المقهى (${Math.round(distance)}m). يجب أن تكون داخل ${MAX_DISTANCE_METERS}m.`);
    return;
  }

  setEmpStatus("💾 جاري حفظ البيانات...");

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  const record = {
    uid: user.uid,
    type: type, // checkin | checkout
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    clientTime: now.toISOString(),
    dateKey: dateKey,
    deviceId: getDeviceId(),
    gps: {
      lat: latitude,
      lng: longitude,
      accuracy: Math.round(accuracy),
      distance: Math.round(distance)
    },
    userAgent: navigator.userAgent
  };

  try {
    await db.collection("attendance").add(record);
    setEmpStatus(type === "checkin"
      ? "✅ تم تسجيل الدخول بنجاح"
      : "✅ تم تسجيل الخروج بنجاح"
    );
  } catch (err) {
    setEmpStatus("");
    alert("خطأ أثناء الحفظ: " + err.message);
  }
}

/* ====== واجهة الأزرار ====== */
async function checkIn() {
  await markAttendance("checkin");
}

async function checkOut() {
  await markAttendance("checkout");
}
