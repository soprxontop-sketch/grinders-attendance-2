// /public/js/auth-guard.js
import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
} from "./firebase.js";

/**
 * حماية صفحة حسب الدور
 * @param {"admin"|"employee"} requiredRole
 * @param {{redirectTo?: string}} opts
 */
export function requireRole(requiredRole, opts = {}) {
  const redirectTo = opts.redirectTo ?? "./login.html";

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace(redirectTo);
        return;
      }

      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);

        const profile = snap.exists() ? snap.data() : null;
        const role = (profile?.role || "employee").toLowerCase();

        if (requiredRole && role !== requiredRole) {
          // لو دخل غلط، نوديه لصفحته الصحيحة
          if (role === "admin") window.location.replace("./admin.html");
          else window.location.replace("./employee.html");
          return;
        }

        resolve({ user, profile, role });
      } catch (e) {
        // إذا في مشكلة Firestore / Rules
        console.error(e);
        window.location.replace(redirectTo);
      }
    });
  });
}
