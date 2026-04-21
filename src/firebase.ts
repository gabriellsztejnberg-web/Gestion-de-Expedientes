
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Configuración original de tu base de datos para no perder los expedientes ni los usuarios
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyDAVp0wzhkKwWzEKrl4VQgSYuzl7t4fKFk",
  authDomain: "gestion-de-expedientes-7ce57.firebaseapp.com",
  projectId: "gestion-de-expedientes-7ce57",
  storageBucket: "gestion-de-expedientes-7ce57.firebasestorage.app",
  messagingSenderId: "567789982821",
  appId: "1:567789982821:web:bbc0efe88b83ee8f15e28c"
};

const getFirebaseConfig = () => {
  try {
    const local = localStorage.getItem('app_firebase_config');
    if (local) return JSON.parse(local);
  } catch (e) {
    console.error("Error parsing local config:", e);
  }
  return DEFAULT_CONFIG;
};

export const currentConfig = getFirebaseConfig();

const app = initializeApp(currentConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

console.log("🔥 Firebase Cloud Initialized with Original Database");
