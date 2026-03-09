import { database, ref, push, get, set, remove, update, onValue } from "@/lib/firebase";
import type { AttendanceRecord, Student } from "@/types/models";

const attendanceRef = ref(database, "attendance");
const studentsRef = ref(database, "students");

export async function getAttendance(): Promise<AttendanceRecord[]> {
  const snapshot = await get(attendanceRef);
  const data = snapshot.val();
  if (!data) return [];

  return Object.entries(data).map(([key, value]: [string, any]) => ({
    ...value,
    id: key
  }));
}

export async function postScan(barcode: string) {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

  console.log('Processing scan for barcode:', barcode);

  // Get current attendance records
  const attendanceSnapshot = await get(attendanceRef);
  const attendanceData = attendanceSnapshot.val() || {};

  // Get student information
  const studentsSnapshot = await get(studentsRef);
  const studentsData = studentsSnapshot.val() || {};

  const student = Object.values(studentsData).find((s: any) => s.Barcode === barcode) as Student | undefined;

  if (!student) {
    console.error('Student not found for barcode:', barcode);
    throw new Error("Student not found");
  }

  console.log('Found student:', student.Name);

  // Find existing entry record for this barcode that hasn't been exited (ExitTime is null or "-")
  const existingRecord = Object.entries(attendanceData).find(([key, value]: [string, any]) => {
    const isSameBarcode = value.Barcode === barcode;
    const isSameDay = value.EntryTime && value.EntryTime.startsWith(today);
    const notExited = value.ExitTime === null || value.ExitTime === "-" || value.ExitTime === "";

    console.log('Checking record:', {
      key,
      barcode: value.Barcode,
      entryTime: value.EntryTime,
      exitTime: value.ExitTime,
      isSameBarcode,
      isSameDay,
      notExited
    });

    return isSameBarcode && isSameDay && notExited;
  }) as [string, any] | undefined;

  console.log('Existing record found:', existingRecord ? 'YES' : 'NO');

  if (existingRecord) {
    // User is already inside, so exit them
    console.log('Checking out user:', student.Name);
    const recordRef = ref(database, `attendance/${existingRecord[0]}`);
    await update(recordRef, { ExitTime: now });

    return {
      message: `${student.Name} checked out`,
      name: student.Name,
      entry_time: null,
      exit_time: now
    };
  } else {
    // User is not inside, so enter them
    console.log('Checking in user:', student.Name);
    const newRecordRef = push(attendanceRef);
    await set(newRecordRef, {
      Barcode: barcode,
      Name: student.Name,
      EntryTime: now,
      ExitTime: null
    });

    return {
      message: `${student.Name} checked in`,
      name: student.Name,
      entry_time: now,
      exit_time: null
    };
  }
}

export async function getStudents(): Promise<Student[]> {
  const snapshot = await get(studentsRef);
  const data = snapshot.val();
  if (!data) return [];

  return Object.values(data) as Student[];
}

export async function createStudent(student: Student) {
  const newStudentRef = push(studentsRef);
  await set(newStudentRef, student);
  return student;
}

export async function createMultipleStudents(students: Student[]) {
  const promises = students.map(student => {
    const newStudentRef = push(studentsRef);
    return set(newStudentRef, student);
  });
  await Promise.all(promises);
  return students;
}

export async function updateStudent(barcode: string, name: string, department?: string, userType?: string) {
  const snapshot = await get(studentsRef);
  const data = snapshot.val() || {};

  const studentKey = Object.entries(data).find(([key, value]: [string, any]) =>
    value.Barcode === barcode
  )?.[0];

  if (!studentKey) {
    throw new Error("Student not found");
  }

  const studentRef = ref(database, `students/${studentKey}`);
  const updates: any = { Name: name };
  if (department !== undefined) updates.Department = department;
  if (userType !== undefined) updates.User_Type = userType;

  await update(studentRef, updates);
  return { barcode, name, department, userType };
}

export async function deleteStudent(barcode: string) {
  const snapshot = await get(studentsRef);
  const data = snapshot.val() || {};

  const studentKey = Object.entries(data).find(([key, value]: [string, any]) =>
    value.Barcode === barcode
  )?.[0];

  if (!studentKey) {
    throw new Error("Student not found");
  }

  const studentRef = ref(database, `students/${studentKey}`);
  await remove(studentRef);
  return { barcode };
}

export async function checkHealth(): Promise<boolean> {
  try {
    await get(attendanceRef);
    return true;
  } catch {
    return false;
  }
}

export function subscribeToAttendance(callback: (records: AttendanceRecord[]) => void) {
  return onValue(attendanceRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const records = Object.entries(data).map(([key, value]: [string, any]) => ({
      ...value,
      id: key
    }));
    callback(records);
  });
}

export function subscribeToStudents(callback: (students: Student[]) => void) {
  return onValue(studentsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    callback(Object.values(data) as Student[]);
  });
}
