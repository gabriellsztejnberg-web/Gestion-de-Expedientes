import firebase from "firebase/compat/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAVp0wzhkKwWzEKrl4VQgSYuzl7t4fKFk",
  authDomain: "gestion-de-expedientes-7ce57.firebaseapp.com",
  projectId: "gestion-de-expedientes-7ce57",
  storageBucket: "gestion-de-expedientes-7ce57.firebasestorage.app",
  messagingSenderId: "567789982821",
  appId: "1:567789982821:web:bbc0efe88b83ee8f15e28c"
};

// Use compat initialization to resolve import issues in some environments
const app = firebase.initializeApp(firebaseConfig);

// Forzamos Long Polling pero eliminamos el caché persistente para asegurar que 
// los datos que ve el usuario sean SIEMPRE los de la nube y no una versión vieja local.
// We cast app to any because initializeFirestore expects a modular FirebaseApp, but compat app works at runtime.
export const db = initializeFirestore(app as any, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
} as any);

console.log("🔥 Firebase Cloud Initialized with Long Polling");
