import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import type { AttendanceRecord } from "@/types/models";
import { getAttendance, postScan, checkHealth, subscribeToAttendance } from "@/services/api";
import { addToQueue, getQueueSize, processQueue } from "@/services/offlineQueue";
import { handleScan, getCurrentlyInside } from "@/services/scanHandler";
import autoCheckoutService from "@/services/autoCheckout";

interface AttendanceState {
  records: AttendanceRecord[];
  isOnline: boolean;
  queueSize: number;
  lastScannedBarcode: string | null;
  isLoading: boolean;
  scanBarcode: (barcode: string) => Promise<{ success: boolean; message: string }>;
  refreshAttendance: () => Promise<void>;
  retryQueue: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceState | null>(null);

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(getQueueSize());
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const refreshAttendance = useCallback(async () => {
    try {
      const data = await getAttendance();
      setRecords(data);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  const scanBarcode = useCallback(async (barcode: string) => {
    if (!isOnline) {
      await addToQueue(barcode);
      setQueueSize(prev => prev + 1);
      setLastScannedBarcode(barcode);
      return { success: true, message: "Scan queued (offline)" };
    }

    try {
      const result = await handleScan(barcode);
      setLastScannedBarcode(barcode);
      await refreshAttendance(); // Refresh attendance records
      return { success: result.success, message: result.message };
    } catch (error) {
      console.error("Scan error:", error);
      return { success: false, message: error instanceof Error ? error.message : "Scan failed" };
    }
  }, [isOnline, refreshAttendance]);

  const retryQueue = useCallback(async () => {
    const processed = await processQueue();
    setQueueSize(getQueueSize());
    if (processed > 0) {
      await refreshAttendance();
    }
  }, [refreshAttendance]);

  useEffect(() => {
    refreshAttendance();

    unsubscribeRef.current = subscribeToAttendance((data) => {
      setRecords(data);
      setIsOnline(true);
    });

    intervalRef.current = setInterval(async () => {
      const online = await checkHealth();
      setIsOnline(online);
      if (online && getQueueSize() > 0) {
        await processQueue();
        setQueueSize(getQueueSize());
        await refreshAttendance();
      }
    }, 15000);

    // Start auto-checkout service
    autoCheckoutService.startScheduledCheckout();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (unsubscribeRef.current) unsubscribeRef.current();
      autoCheckoutService.stopScheduledCheckout();
    };
  }, [refreshAttendance]);

  return (
    <AttendanceContext.Provider value={{ records, isOnline, queueSize, lastScannedBarcode, isLoading, scanBarcode, refreshAttendance, retryQueue }}>
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error("useAttendance must be used within AttendanceProvider");
  return ctx;
}
