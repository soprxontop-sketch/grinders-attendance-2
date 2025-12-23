// /public/js/auth.js
import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "./firebase.js";

/** بريد الادمن الافتراضي */
const ADMIN_EMAILS = new Set(["admin@thegrinders.com"]);

/** يجيب بروفايل المستخدم من Firestore */
export async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** ينشئ users/{uid} إذا ما موجود (علشان ما يعلق Loading) */
export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const role = ADMIN_EMAILS.has((user.email || "").toLowerCase()) ? "admin" : "employee";
    await setDoc(
      ref,
      {
        email: user.email || "",
        name: user.displayName || "",
        role,
        active: true,  // placeholder; will fix below
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    // لا تغيّر الدور إذا موجود
    await setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true });
  }

  const profile = await getUserProfile(user.uid);
  return profile;
}

/** تسجيل دخول ثم يرجّع {user, profile} */
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  const profile = await ensureUserProfile(user);
  return { user, profile };
}

export async function logout() {
  await signOut(auth);
}

/** تحويل حسب الدور */
export function redirectByRole(profile) {
  const role = (profile?.role || "employee").toLowerCase();
  if (role === "admin") window.location.replace("./admin.html");
  else window.location.replace("./employee.html");
}

/** تحويل أخطاء Firebase لرسالة عربية */
export function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "البريد أو كلمة المرور غير صحيحة";
  if (code === "auth/user-not-found") return "هذا الحساب غير موجود";
  if (code === "auth/too-many-requests") return "محاولات كثيرة. جرّب بعد قليل";
  return err?.message || "حدث خطأ غير متوقع";
}
