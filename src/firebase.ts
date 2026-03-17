
import firebase from "firebase/compat/app";
import { initializeFirestore } from "firebase/firestore";

// Configuración por defecto
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

// Use compat initialization to resolve import issues in some environments
// Ensure we don't double-initialize if HMR happens, though usually this file runs once.
const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(currentConfig);

// Forzamos Long Polling pero eliminamos el caché persistente para asegurar que 
// los datos que ve el usuario sean SIEMPRE los de la nube y no una versión vieja local.
// We cast app to any because initializeFirestore expects a modular FirebaseApp, but compat app works at runtime.
export const db = initializeFirestore(app as any, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
} as any);

console.log("🔥 Firebase Cloud Initialized with Long Polling");
