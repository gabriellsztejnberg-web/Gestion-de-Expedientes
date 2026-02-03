
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAVp0wzhkKwWzEKrl4VQgSYuzl7t4fKFk",
  authDomain: "gestion-de-expedientes-7ce57.firebaseapp.com",
  projectId: "gestion-de-expedientes-7ce57",
  storageBucket: "gestion-de-expedientes-7ce57.firebasestorage.app",
  messagingSenderId: "567789982821",
  appId: "1:567789982821:web:bbc0efe88b83ee8f15e28c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
