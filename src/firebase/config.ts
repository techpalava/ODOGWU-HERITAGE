import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBhJTzVNJR78utBJ71iApSAPGKB5K3YSog",
  authDomain: "gen-lang-client-0614710868.firebaseapp.com",
  projectId: "gen-lang-client-0614710868",
  storageBucket: "gen-lang-client-0614710868.firebasestorage.app",
  messagingSenderId: "639196522915",
  appId: "1:639196522915:web:9f2abc2215271f79d55216",
  measurementId: ""
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-theodogwuheritag-179eff1a-bd76-4f7f-9dba-3006b52d6a9f");
export const storage = getStorage(app);
