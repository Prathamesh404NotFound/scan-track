import { database, ref, get, set, push, update } from "@/lib/firebase";
import type { Student } from "@/types/models";

// Cache entry interface
export interface CacheEntry {
  attendanceId: string;
  name: string;
  entryTime: string;
  barcode: string;
  timer?: NodeJS.Timeout;
}

// Scan result interface
interface ScanResult {
  success: boolean;
  message: string;
  record?: {
    barcode: string;
    name: string;
    entryTime: string;
    exitTime?: string;
    attendanceId?: string;
  };
}

// In-memory cache for single-instance deployment
class AttendanceCache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  set(key: string, value: Omit<CacheEntry, 'timer'>, ttlMs: number = this.DEFAULT_TTL): void {
    // Clear existing timer if any
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      if (existing.timer) clearTimeout(existing.timer);
    }

    // Set new timer for TTL
    const timer = setTimeout(() => {
      this.cache.delete(key);
      console.log(`Cache entry expired for barcode: ${key}`);
    }, ttlMs);

    // Store in cache
    this.cache.set(key, { ...value, timer });
    console.log(`Cache SET: ${key}`, value);
  }

  getAndDelete(key: string): CacheEntry | null {
    const value = this.cache.get(key);
    if (value) {
      // Clear timer and delete entry
      if (value.timer) clearTimeout(value.timer);
      this.cache.delete(key);
      console.log(`Cache GET+DEL: ${key}`, value);
      return value;
    }
    console.log(`Cache MISS: ${key}`);
    return null;
  }

  // For debugging and monitoring
  getAll(): Map<string, Omit<CacheEntry, 'timer'>> {
    const result = new Map<string, Omit<CacheEntry, 'timer'>>();
    for (const [key, value] of this.cache.entries()) {
      result.set(key, {
        attendanceId: value.attendanceId,
        name: value.name,
        entryTime: value.entryTime,
        barcode: value.barcode
      });
    }
    return result;
  }

  clear(): void {
    // Clear all timers
    for (const entry of this.cache.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instance
const attendanceCache = new AttendanceCache();

// Debounce map to prevent rapid duplicate scans
const debounceMap = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_TIME = 2000; // 2 seconds

// Database operations
class AttendanceDB {
  private attendanceRef = ref(database, "attendance");
  private studentsRef = ref(database, "students");

  async findStudent(barcode: string): Promise<Student | null> {
    try {
      const snapshot = await get(this.studentsRef);
      const studentsData = snapshot.val() || {};

      const student = Object.values(studentsData).find((s: any) => s.Barcode === barcode) as Student | undefined;
      return student || null;
    } catch (error) {
      console.error('Error finding student:', error);
      return null;
    }
  }

  async findOpenAttendance(barcode: string): Promise<{ id: string; name: string; entryTime: string } | null> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const snapshot = await get(this.attendanceRef);
      const attendanceData = snapshot.val() || {};

      // Find record with same barcode, same day, and no exit time
      for (const [key, value] of Object.entries(attendanceData)) {
        const record = value as any;
        const isSameBarcode = record.Barcode === barcode;
        const isSameDay = record.EntryTime && record.EntryTime.startsWith(today);
        const notExited = record.ExitTime === null || record.ExitTime === "-" || record.ExitTime === "";

        if (isSameBarcode && isSameDay && notExited) {
          return {
            id: key,
            name: record.Name,
            entryTime: record.EntryTime
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding open attendance:', error);
      return null;
    }
  }

  async createAttendance(data: {
    barcode: string;
    name: string;
    entryTime: string;
    exitTime?: string | null;
  }): Promise<string> {
    try {
      const newRecordRef = push(this.attendanceRef);
      await set(newRecordRef, {
        Barcode: data.barcode,
        Name: data.name,
        EntryTime: data.entryTime,
        ExitTime: data.exitTime || null
      });
      console.log('Created attendance record:', newRecordRef.key);
      return newRecordRef.key || '';
    } catch (error) {
      console.error('Error creating attendance record:', error);
      throw error;
    }
  }

  async updateAttendance(id: string, data: { exitTime: string }): Promise<void> {
    try {
      const recordRef = ref(database, `attendance/${id}`);
      await update(recordRef, { ExitTime: data.exitTime });
      console.log('Updated attendance record:', id);
    } catch (error) {
      console.error('Error updating attendance record:', error);
      throw error;
    }
  }
}

const attendanceDB = new AttendanceDB();

// Main scan handler
export async function handleScan(barcode: string): Promise<ScanResult> {
  const now = new Date().toISOString();
  const cacheKey = `attendance:${barcode}`;

  console.log('🔍 Processing scan for barcode:', barcode);

  // Debounce check
  if (debounceMap.has(barcode)) {
    console.log('⚠️ Scan debounced for barcode:', barcode);
    return {
      success: false,
      message: "Please wait before scanning again"
    };
  }

  // Set debounce timer
  const debounceTimer = setTimeout(() => {
    debounceMap.delete(barcode);
  }, DEBOUNCE_TIME);
  debounceMap.set(barcode, debounceTimer);

  try {
    // Step 1: Check cache for active entry
    const cachedEntry = attendanceCache.getAndDelete(barcode);

    if (cachedEntry) {
      // Case 1: User is currently inside (cache hit) -> Check Out
      console.log('🚪 Cache hit - Processing checkout for:', cachedEntry.name);

      const student = await attendanceDB.findStudent(barcode);
      const name = student?.Name || cachedEntry.name;

      // Update database record with exit time
      await attendanceDB.updateAttendance(cachedEntry.attendanceId, { exitTime: now });

      return {
        success: true,
        message: `${name} checked out`,
        record: {
          barcode,
          name,
          entryTime: cachedEntry.entryTime,
          exitTime: now,
          attendanceId: cachedEntry.attendanceId
        }
      };
    }

    // Step 2: Cache miss - check database for open record
    const openRecord = await attendanceDB.findOpenAttendance(barcode);

    if (openRecord) {
      // Case 2: Open record exists but not in cache -> Check Out
      console.log('🚪 DB hit - Processing checkout for:', openRecord.name);

      // Update database record with exit time
      await attendanceDB.updateAttendance(openRecord.id, { exitTime: now });

      return {
        success: true,
        message: `${openRecord.name} checked out`,
        record: {
          barcode,
          name: openRecord.name,
          entryTime: openRecord.entryTime,
          exitTime: now,
          attendanceId: openRecord.id
        }
      };
    }

    // Step 3: No active record -> Check In
    console.log('📥 No active record - Processing checkin for barcode:', barcode);

    // Find student information
    const student = await attendanceDB.findStudent(barcode);
    const name = student?.Name || "Unknown user";

    // Create new attendance record
    const attendanceId = await attendanceDB.createAttendance({
      barcode,
      name,
      entryTime: now,
      exitTime: null
    });

    // Add to cache
    attendanceCache.set(barcode, {
      attendanceId,
      name,
      entryTime: now,
      barcode
    });

    return {
      success: true,
      message: `${name} checked in`,
      record: {
        barcode,
        name,
        entryTime: now,
        attendanceId
      }
    };

  } catch (error) {
    console.error('❌ Scan processing error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Scan failed"
    };
  }
}

// Utility functions for monitoring and debugging
export function getCurrentlyInside(): Map<string, Omit<CacheEntry, 'timer'>> {
  return attendanceCache.getAll();
}

export function getCacheStats(): { size: number; entries: any[] } {
  const entries = Array.from(attendanceCache.getAll().entries()).map(([key, value]) => ({
    key,
    ...value
  }));
  return {
    size: attendanceCache.size(),
    entries
  };
}

export function clearCache(): void {
  attendanceCache.clear();
  debounceMap.forEach(timer => clearTimeout(timer));
  debounceMap.clear();
  console.log('Cache cleared');
}

// For development/testing
export function addTestStudent(): void {
  // This would be called from a test script or admin interface
  console.log('Test student functionality available');
}

export default {
  handleScan,
  getCurrentlyInside,
  getCacheStats,
  clearCache,
  addTestStudent
};
