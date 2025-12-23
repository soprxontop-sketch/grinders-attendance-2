// /public/js/firebase.js  (ES Module) — مصدر واحد للـ Auth و Firestore
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ✅ نفس الكونفيغ الصحيح (لا تغيّره)
const firebaseConfig = {
  apiKey: "AIzaSyB5KTalVfFUTybTMngD3swPrxF-k47jgIE",
  authDomain: "the-grinders-attendance.firebaseapp.com",
  projectId: "the-grinders-attendance",
  storageBucket: "the-grinders-attendance.appspot.com",
  messagingSenderId: "647878267338",
  appId: "1:647878267338:web:c3553c4815852e848b3f33",
  measurementId: "G-YNM7PRSKSF",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-exports
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  // firestore helpers
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
};
