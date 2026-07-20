import { useRef, useEffect, useState, useCallback } from "react";
import { useAttendance } from "@/store/attendanceContext";
import { useSettings } from "@/store/settingsContext";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, LogIn, LogOut } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ScanType = "checkin" | "checkout" | "error";

interface FeedbackState {
  type: ScanType;
  message: string;
  name: string;
  timestamp: string;
  department?: string;
  personType?: string;
}

// ---------------------------------------------------------------------------
// Audio helper — generates a brief tone via Web Audio API (no extra dep)
// ---------------------------------------------------------------------------
function playTone(frequency: number, duration: number, volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Audio not supported or blocked — fail silently
  }
}

// ---------------------------------------------------------------------------
// Colour / style tokens per scan type
// ---------------------------------------------------------------------------
const SCAN_STYLE: Record<ScanType, { bg: string; border: string; text: string; icon: string }> = {
  checkin: {
    bg: "from-green-50 to-emerald-50",
    border: "border-green-300",
    text: "text-green-800",
    icon: "text-green-600",
  },
  checkout: {
    bg: "from-blue-50 to-indigo-50",
    border: "border-blue-300",
    text: "text-blue-800",
    icon: "text-blue-600",
  },
  error: {
    bg: "from-red-50 to-rose-50",
    border: "border-red-300",
    text: "text-red-800",
    icon: "text-red-600",
  },
};

const SCAN_LABEL: Record<ScanType, string> = {
  checkin: "Checked In",
  checkout: "Checked Out",
  error: "Scan Error",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LiveScanCard() {
  const { scanBarcode } = useAttendance();
  const { settings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitRef = useRef<NodeJS.Timeout | null>(null);
  const dismissRef = useRef<NodeJS.Timeout | null>(null);

  // Keep input focused
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const interval = setInterval(focus, 1000);
    document.addEventListener("click", focus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("click", focus);
    };
  }, []);

  // Clear dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, []);

  const showFeedback = useCallback((fb: FeedbackState) => {
    if (dismissRef.current) clearTimeout(dismissRef.current);
    setFeedback(fb);
    dismissRef.current = setTimeout(
      () => setFeedback(null),
      settings.toastDuration
    );
    // Sound cue
    if (settings.soundEnabled) {
      if (fb.type === "checkin") playTone(880, 0.25, settings.soundVolume);
      else if (fb.type === "checkout") playTone(660, 0.25, settings.soundVolume);
      else playTone(220, 0.4, settings.soundVolume);
    }
  }, [settings.toastDuration, settings.soundEnabled, settings.soundVolume]);

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || isScanning) return;
    setIsScanning(true);

    try {
      const result = await scanBarcode(barcode.trim());
      const msg = result.message || "";
      const lower = msg.toLowerCase();

      let scanType: ScanType = "error";
      if (result.success && lower.includes("checked in")) scanType = "checkin";
      else if (result.success && lower.includes("checked out")) scanType = "checkout";
      else if (!result.success) scanType = "error";

      // Extract name from message: "Alice checked in" → "Alice"
      const namePart = msg.replace(/ checked (in|out)$/i, "").replace(/^✅\s*/, "").replace(/^❌\s*/, "");
      const displayName = scanType === "error"
        ? (msg.includes("Unknown barcode") ? "Unknown barcode" : "Scan failed")
        : namePart;

      showFeedback({
        type: scanType,
        message: msg,
        name: displayName,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      });

      setBuffer("");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Scan failed";
      showFeedback({ type: "error", message: errMsg, name: "Scan error", timestamp: new Date().toLocaleTimeString() });
      setBuffer("");
    } finally {
      setIsScanning(false);
    }
  }, [scanBarcode, isScanning, showFeedback]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (autoSubmitRef.current) {
        clearTimeout(autoSubmitRef.current);
        autoSubmitRef.current = null;
      }
      if (buffer.trim()) handleScan(buffer);
    }
  };

  // Auto-submit when input gets filled (barcode scanner rapid-types then stops)
  useEffect(() => {
    if (buffer.trim() && !isScanning && !autoSubmitRef.current) {
      autoSubmitRef.current = setTimeout(() => {
        handleScan(buffer);
        setBuffer("");
        autoSubmitRef.current = null;
      }, settings.autoSubmitDelay);
    }
    return () => {
      if (autoSubmitRef.current) {
        clearTimeout(autoSubmitRef.current);
        autoSubmitRef.current = null;
      }
    };
  }, [buffer, isScanning, settings.autoSubmitDelay]);

  const scanStyle = feedback ? SCAN_STYLE[feedback.type] : SCAN_STYLE.error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="relative space-y-4">
        {/* ---------------------------------------------------------------- */}
        {/* Barcode input — untouched from original                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="relative">
          <input
            ref={inputRef}
            value={buffer}
            onChange={(e) => {
              setBuffer(e.target.value);
              if (autoSubmitRef.current) {
                clearTimeout(autoSubmitRef.current);
                autoSubmitRef.current = null;
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Scan or enter barcode here..."
            className="w-full rounded-lg border-2 border-dashed border-green-300 bg-green-50 px-6 py-8 text-2xl font-mono text-center tracking-wider placeholder:text-green-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 transition-all"
            aria-label="Barcode scanner input"
            autoComplete="off"
          />
          {isScanning && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Feedback card — 3 distinct visual states                         */}
        {/* ---------------------------------------------------------------- */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback.timestamp}
              initial={{ opacity: 0, scale: 0.92, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`rounded-xl border-2 bg-gradient-to-br ${scanStyle.bg} ${scanStyle.border} p-5 shadow-md`}
            >
              <div className="flex items-start gap-4">
                {/* Icon with pop animation */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
                  className="flex-shrink-0 mt-0.5"
                >
                  {feedback.type === "checkin" ? (
                    <LogIn className={`h-8 w-8 ${scanStyle.icon}`} />
                  ) : feedback.type === "checkout" ? (
                    <LogOut className={`h-8 w-8 ${scanStyle.icon}`} />
                  ) : (
                    <XCircle className={`h-8 w-8 ${scanStyle.icon}`} />
                  )}
                </motion.div>

                <div className="flex-1 min-w-0">
                  {/* Label badge */}
                  <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${scanStyle.icon}`}>
                    {SCAN_LABEL[feedback.type]}
                  </div>

                  {/* Person name — large, kiosk-readable */}
                  <div className={`text-2xl font-bold leading-tight ${scanStyle.text} truncate`}>
                    {feedback.name}
                  </div>

                  {/* Department / type row */}
                  {(feedback.department || feedback.personType) && (
                    <div className={`text-sm mt-0.5 ${scanStyle.text} opacity-75`}>
                      {[feedback.personType, feedback.department].filter(Boolean).join(" · ")}
                    </div>
                  )}

                  {/* Error detail */}
                  {feedback.type === "error" && (
                    <div className={`text-sm mt-1 ${scanStyle.text} opacity-75 leading-snug`}>
                      {feedback.message}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className={`text-sm font-mono flex-shrink-0 ${scanStyle.text} opacity-60 mt-0.5`}>
                  {feedback.timestamp}
                </div>
              </div>

              {/* Animated progress bar showing auto-dismiss countdown */}
              <motion.div
                className={`mt-3 h-1 rounded-full ${
                  feedback.type === "checkin" ? "bg-green-200" :
                  feedback.type === "checkout" ? "bg-blue-200" : "bg-red-200"
                } overflow-hidden`}
              >
                <motion.div
                  className={`h-full rounded-full ${
                    feedback.type === "checkin" ? "bg-green-500" :
                    feedback.type === "checkout" ? "bg-blue-500" : "bg-red-500"
                  }`}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: settings.toastDuration / 1000, ease: "linear" }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
