export interface Student {
  Barcode: string;
  Name: string;
  Department: string;
  User_Type: 'student' | 'staff' | 'admin' | 'faculty';
}

export interface AttendanceRecord {
  Barcode: string;
  Name: string;
  EntryTime: string | null;
  ExitTime: string | null;
  id?: string;
}

export interface OfflineQueueItem {
  id: string;
  barcode: string;
  timestamp: string;
  retries: number;
}
