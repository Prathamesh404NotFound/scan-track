import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, push, get, set, remove, update, onValue, Database } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB2sAvVSi8-bhk5pvnX4zI4izVo75pQUy0",
  authDomain: "dypsn-library.firebaseapp.com",
  databaseURL: "https://dypsn-library-default-rtdb.firebaseio.com/",
  projectId: "dypsn-library",
  storageBucket: "dypsn-library.firebasestorage.app",
  messagingSenderId: "899232960269",
  appId: "1:899232960269:web:86e039dc04ea5785946a44",
  measurementId: "G-S7F6T4PS6P"
};

// Check if app is already initialized
const existingApp = getApps().find(app => app.name === '[DEFAULT]');
const app = existingApp || initializeApp(firebaseConfig);
export const database: Database = getDatabase(app);

export { ref, push, get, set, remove, update, onValue };
