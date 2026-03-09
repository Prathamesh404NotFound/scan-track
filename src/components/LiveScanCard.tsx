import { useRef, useEffect, useState, useCallback } from "react";
import { useAttendance } from "@/store/attendanceContext";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function LiveScanCard() {
  const { scanBarcode } = useAttendance();
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitRef = useRef<NodeJS.Timeout | null>(null);

  // Keep input focused
  useEffect(() => {
    const focus = () => {
      console.log('Focusing input');
      inputRef.current?.focus();
    };
    focus();
    const interval = setInterval(focus, 1000);
    document.addEventListener("click", focus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("click", focus);
    };
  }, []);

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || isScanning) return;

    console.log('🔍 Starting scan for barcode:', barcode);
    setIsScanning(true);

    try {
      const result = await scanBarcode(barcode.trim());
      console.log('✅ Scan result:', result);

      // Enhanced feedback with more details
      const feedbackMessage = result.success
        ? `✅ ${result.message}`
        : `❌ ${result.message}`;

      setFeedback({
        type: result.success ? "success" : "error",
        message: feedbackMessage
      });

      setIsScanning(false);
      setBuffer(""); // Clear input after successful scan

      // Clear feedback after 4 seconds for better user experience
      setTimeout(() => setFeedback(null), 4000);

    } catch (err: any) {
      console.error('❌ Scan error:', err);
      setFeedback({
        type: "error",
        message: `❌ ${err?.message || "Scan failed"}`
      });
      setIsScanning(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }, [scanBarcode, isScanning]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current);

      // Auto-submit after 1 second if input has content
      if (buffer.trim()) {
        autoSubmitRef.current = setTimeout(() => {
          handleScan(buffer);
          setBuffer("");
        }, 1000);
      } else {
        debounceRef.current = setTimeout(() => {
          handleScan(buffer);
          setBuffer("");
        }, 100);
      }
    }
  };

  // Auto-submit when input field gets filled
  useEffect(() => {
    if (buffer.trim() && !isScanning && !autoSubmitRef.current) {
      autoSubmitRef.current = setTimeout(() => {
        handleScan(buffer);
        setBuffer("");
      }, 1000);
    }

    return () => {
      if (autoSubmitRef.current) {
        clearTimeout(autoSubmitRef.current);
        autoSubmitRef.current = null;
      }
    };
  }, [buffer, isScanning]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="relative space-y-4">
        <div className="relative">
          <input
            ref={inputRef}
            value={buffer}
            onChange={(e) => {
              setBuffer(e.target.value);
              // Clear any pending auto-submit when user starts typing
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

        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${feedback.type === "success"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
                }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {feedback.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
