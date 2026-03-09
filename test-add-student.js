import { getDatabase, ref, set, push } from "firebase/database";
import { initializeApp, getApps } from "firebase/app";

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
const database = getDatabase(app);

async function addTestStudent() {
  try {
    const studentsRef = ref(database, "students");
    const testStudent = {
      Barcode: "123456",
      Name: "Test User",
      Department: "Computer Science",
      User_Type: "student"
    };
    
    await push(studentsRef, testStudent);
    console.log('Test student added successfully');
  } catch (error) {
    console.error('Error adding test student:', error);
  }
}

// Add a test student
addTestStudent();
