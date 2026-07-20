import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { database, ref, get, set } from "@/lib/firebase";
import { updateScanSettings } from "@/services/scanHandler";

// ---------------------------------------------------------------------------
// Settings shape — defaults match current hardcoded behavior
// ---------------------------------------------------------------------------
export interface AppSettings {
  // General
  institutionName: string;
  theme: "light" | "dark" | "system";
  dateFormat: string;
  // Scan behavior
  debounceTime: number;       // ms — default 2000
  cacheTtl: number;           // ms — default 86400000 (24h)
  autoSubmitDelay: number;    // ms — default 1000
  autoSubmitOnPause: boolean; // default true
  // Auto-checkout
  autoCheckoutEnabled: boolean;
  autoCheckoutTime: string;           // "HH:MM" 24h
  autoCheckoutUserTypes: string[];    // which user types are auto-checked out
  // Classification
  facultyKeywords: string[];  // names containing these → faculty/staff
  // Notifications
  toastsEnabled: boolean;
  toastDuration: number;  // ms — default 4000
  soundEnabled: boolean;
  soundVolume: number;    // 0–1
  // Data
  retentionDays: number;  // 0 = never auto-purge
}

export const DEFAULT_SETTINGS: AppSettings = {
  institutionName: "Library Attendance System",
  theme: "system",
  dateFormat: "MM/DD/YYYY HH:mm",
  debounceTime: 2000,
  cacheTtl: 24 * 60 * 60 * 1000,
  autoSubmitDelay: 1000,
  autoSubmitOnPause: true,
  autoCheckoutEnabled: true,
  autoCheckoutTime: "17:00",
  autoCheckoutUserTypes: ["student", "staff", "faculty", "admin"],
  facultyKeywords: ["faculty", "staff"],
  toastsEnabled: true,
  toastDuration: 4000,
  soundEnabled: false,
  soundVolume: 0.5,
  retentionDays: 0,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface SettingsContextValue {
  settings: AppSettings;
  isLoading: boolean;
  saveSettings: (partial: Partial<AppSettings>) => Promise<void>;
  resetSection: (keys: (keyof AppSettings)[]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SETTINGS_REF = "settings/config";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load from Firebase on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const snapshot = await get(ref(database, SETTINGS_REF));
        const data = snapshot.val();
        if (data) {
          const merged = { ...DEFAULT_SETTINGS, ...data };
          setSettings(merged);
          // Push scan settings to scanHandler module
          updateScanSettings({ debounceTime: merged.debounceTime, cacheTtl: merged.cacheTtl });
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    // Persist to Firebase
    await set(ref(database, SETTINGS_REF), updated);
    // Push runtime-affecting settings immediately
    updateScanSettings({
      debounceTime: updated.debounceTime,
      cacheTtl: updated.cacheTtl,
    });
    console.log("Settings saved:", partial);
  }, [settings]);

  const resetSection = useCallback(async (keys: (keyof AppSettings)[]) => {
    const partial: Partial<AppSettings> = {};
    for (const key of keys) {
      (partial as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
    }
    await saveSettings(partial);
  }, [saveSettings]);

  return (
    <SettingsContext.Provider value={{ settings, isLoading, saveSettings, resetSection }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
