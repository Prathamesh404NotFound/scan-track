import { useState, useEffect } from "react";
import { useSettings, DEFAULT_SETTINGS, AppSettings } from "@/store/settingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, AlertTriangle, Settings as SettingsIcon, Trash2, RefreshCw, CheckCircle,
  Save, RotateCcw, Bell, Shield, Database, Clock, BookOpen, Wifi
} from "lucide-react";
import { getCurrentlyInside, clearCache } from "@/services/scanHandler";
import { clearQueue, getQueueItems } from "@/services/offlineQueue";
import { database, ref, get, set } from "@/lib/firebase";
import { toast } from "sonner";
import { motion } from "framer-motion";

// ---------------------------------------------------------------------------
// Section Save / Reset helpers
// ---------------------------------------------------------------------------
type SectionKeys = (keyof AppSettings)[];

interface SectionCardProps {
  title: string;
  icon: React.ReactNode;
  sectionKeys: SectionKeys;
  children: React.ReactNode;
  onSave: () => void;
  onReset: () => void;
}

function SectionCard({ title, icon, children, onSave, onReset }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={onSave} size="sm" className="flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
          <Button onClick={onReset} size="sm" variant="ghost" className="flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Settings component
// ---------------------------------------------------------------------------
export default function Settings() {
  const { settings, saveSettings, resetSection } = useSettings();

  // Local draft state — edits don't persist until Save
  const [draft, setDraft] = useState<AppSettings>(settings);

  // Update draft when context settings change (e.g. on load)
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  // Current status
  const [stats, setStats] = useState({ studentsInside: 0, facultyInside: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastOperation, setLastOperation] = useState<{
    success: boolean;
    message: string;
    users: Array<{ name: string; barcode: string; type: string; entryTime: string }>;
  } | null>(null);

  const [queueItems, setQueueItems] = useState(getQueueItems());
  const [facultyKeywordInput, setFacultyKeywordInput] = useState(settings.facultyKeywords.join(", "));

  useEffect(() => {
    updateStats();
  }, []);

  const d = (key: keyof AppSettings) => (value: unknown) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const updateStats = () => {
    const inside = getCurrentlyInside();
    const kw = settings.facultyKeywords;
    const isFaculty = (name: string) => kw.some(k => name.toLowerCase().includes(k.toLowerCase()));
    const studentsCount = Array.from(inside.values()).filter(u => u.name && !isFaculty(u.name)).length;
    const facultyCount = Array.from(inside.values()).filter(u => u.name && isFaculty(u.name)).length;
    setStats({ studentsInside: studentsCount, facultyInside: facultyCount });
  };

  const formatTime = (time: string) => {
    try {
      return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return time;
    }
  };

  const handleSave = async (keys: SectionKeys, extra?: Partial<AppSettings>) => {
    const partial: Partial<AppSettings> = extra ?? {};
    for (const k of keys) (partial as Record<string, unknown>)[k] = (draft as Record<string, unknown>)[k];
    await saveSettings(partial);
    toast.success("Settings saved");
  };

  const handleReset = async (keys: SectionKeys) => {
    await resetSection(keys);
    toast.success("Section reset to defaults");
  };

  // -------------------------------------------------------------------------
  // Force checkout
  // -------------------------------------------------------------------------
  const handleRemoveAllInside = async () => {
    if (!confirm("Are you sure you want to check out all users currently inside?")) return;
    setIsProcessing(true);
    const now = new Date().toISOString();
    const inside = getCurrentlyInside();
    const processed: Array<{ name: string; barcode: string; type: string; entryTime: string }> = [];
    try {
      for (const [, entry] of inside.entries()) {
        try {
          const recRef = ref(database, `attendance/${entry.attendanceId}`);
          await set(recRef, { ExitTime: now });
          const kw = settings.facultyKeywords;
          const t = kw.some(k => entry.name.toLowerCase().includes(k.toLowerCase())) ? "Faculty" : "Student";
          processed.push({ name: entry.name, barcode: entry.barcode, type: t, entryTime: entry.entryTime });
        } catch (err) {
          console.error("Failed to checkout", entry.name, err);
        }
      }
      await checkAndCheckoutDatabaseRecords(now, processed);
      clearCache();
      setLastOperation({ success: true, message: `Checked out ${processed.length} users`, users: processed });
      toast.success(`Checked out ${processed.length} users`);
      updateStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Force checkout failed";
      setLastOperation({ success: false, message: msg, users: processed });
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const checkAndCheckoutDatabaseRecords = async (
    exitTime: string,
    processed: Array<{ name: string; barcode: string; type: string; entryTime: string }>
  ) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const attRef = ref(database, "attendance");
      const snap = await get(attRef);
      const data = snap.val() || {};
      for (const [key, value] of Object.entries(data)) {
        const rec = value as Record<string, unknown>;
        const isSameDay = rec.EntryTime && (rec.EntryTime as string).startsWith(today);
        const notExited = rec.ExitTime === null || rec.ExitTime === "-" || rec.ExitTime === "";
        if (isSameDay && notExited) {
          const already = processed.some(u => u.barcode === rec.Barcode);
          if (!already) {
            try {
              const recRef = ref(database, `attendance/${key}`);
              await set(recRef, { ...(value as object), ExitTime: exitTime });
              const kw = settings.facultyKeywords;
              const name = rec.Name as string;
              const t = kw.some(k => name.toLowerCase().includes(k.toLowerCase())) ? "Faculty" : "Student";
              processed.push({ name, barcode: rec.Barcode as string, type: t, entryTime: rec.EntryTime as string });
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch (err) {
      console.error("DB check failed:", err);
    }
  };

  // -------------------------------------------------------------------------
  // Backup export / import
  // -------------------------------------------------------------------------
  const handleExportBackup = async () => {
    try {
      const [attSnap, stuSnap] = await Promise.all([
        get(ref(database, "attendance")),
        get(ref(database, "students")),
      ]);
      const backup = { attendance: attSnap.val(), students: stuSnap.val(), exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scan-track-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exported");
    } catch {
      toast.error("Export failed");
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!confirm("This will overwrite all attendance and student data. Continue?")) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.attendance) await set(ref(database, "attendance"), data.attendance);
        if (data.students) await set(ref(database, "students"), data.students);
        toast.success("Backup restored");
      } catch {
        toast.error("Import failed — invalid file");
      }
    };
    input.click();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="container space-y-6 py-6"
    >
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure system behaviour and data management</p>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
          <TabsTrigger value="general" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">General</span></TabsTrigger>
          <TabsTrigger value="scan" className="gap-1.5"><Wifi className="h-3.5 w-3.5" /><span className="hidden sm:inline">Scan</span></TabsTrigger>
          <TabsTrigger value="autocheckout" className="gap-1.5"><Clock className="h-3.5 w-3.5" /><span className="hidden sm:inline">Auto-Checkout</span></TabsTrigger>
          <TabsTrigger value="classification" className="gap-1.5"><Shield className="h-3.5 w-3.5" /><span className="hidden sm:inline">Classification</span></TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /><span className="hidden sm:inline">Notifications</span></TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Database className="h-3.5 w-3.5" /><span className="hidden sm:inline">Data</span></TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* A. General                                                        */}
        {/* ================================================================ */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <SectionCard
            title="General Settings"
            icon={<BookOpen className="h-4 w-4" />}
            sectionKeys={["institutionName", "theme", "dateFormat"]}
            onSave={() => handleSave(["institutionName", "theme", "dateFormat"])}
            onReset={() => handleReset(["institutionName", "theme", "dateFormat"])}
          >
            <div className="space-y-2">
              <Label htmlFor="institutionName">Institution / Library Name</Label>
              <Input
                id="institutionName"
                value={draft.institutionName}
                onChange={e => d("institutionName")(e.target.value)}
                placeholder="Library Attendance System"
              />
              <p className="text-xs text-muted-foreground">Displayed in the app header</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select value={draft.theme} onValueChange={val => d("theme")(val)}>
                <SelectTrigger id="theme" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System default</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date / Time Display Format</Label>
              <Select value={draft.dateFormat} onValueChange={val => d("dateFormat")(val)}>
                <SelectTrigger id="dateFormat" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY HH:mm">MM/DD/YYYY HH:mm (US)</SelectItem>
                  <SelectItem value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm (EU)</SelectItem>
                  <SelectItem value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:mm (ISO)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ================================================================ */}
        {/* B. Scan Behavior                                                  */}
        {/* ================================================================ */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <SectionCard
            title="Scan Behavior"
            icon={<Wifi className="h-4 w-4" />}
            sectionKeys={["debounceTime", "cacheTtl", "autoSubmitDelay", "autoSubmitOnPause"]}
            onSave={() => handleSave(["debounceTime", "cacheTtl", "autoSubmitDelay", "autoSubmitOnPause"])}
            onReset={() => handleReset(["debounceTime", "cacheTtl", "autoSubmitDelay", "autoSubmitOnPause"])}
          >
            <div className="space-y-2">
              <Label htmlFor="debounceTime">Debounce between repeat scans (ms)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="debounceTime"
                  type="number"
                  min={100}
                  max={30000}
                  step={100}
                  value={draft.debounceTime}
                  onChange={e => d("debounceTime")(Number(e.target.value))}
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">Default: 2000 ms</span>
              </div>
              <p className="text-xs text-muted-foreground">Prevents the same barcode from being scanned twice in quick succession</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cacheTtl">"Currently inside" cache TTL (hours)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="cacheTtl"
                  type="number"
                  min={1}
                  max={168}
                  value={Math.round(draft.cacheTtl / 3600000)}
                  onChange={e => d("cacheTtl")(Number(e.target.value) * 3600000)}
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">Default: 24 h</span>
              </div>
              <p className="text-xs text-muted-foreground">How long a checked-in barcode stays in the in-memory cache before auto-expiry</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoSubmitDelay">Auto-submit delay on scanner input (ms)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="autoSubmitDelay"
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={draft.autoSubmitDelay}
                  onChange={e => d("autoSubmitDelay")(Number(e.target.value))}
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">Default: 1000 ms</span>
              </div>
              <p className="text-xs text-muted-foreground">Delay after the last keystroke before the scan is auto-submitted</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Auto-submit on typing pause</Label>
                <p className="text-xs text-muted-foreground mt-0.5">When disabled, user must press Enter to submit a scan</p>
              </div>
              <Switch
                checked={draft.autoSubmitOnPause}
                onCheckedChange={val => d("autoSubmitOnPause")(val)}
              />
            </div>
          </SectionCard>
        </TabsContent>

        {/* ================================================================ */}
        {/* C. Auto-Checkout                                                  */}
        {/* ================================================================ */}
        <TabsContent value="autocheckout" className="space-y-4 mt-4">
          <SectionCard
            title="Auto-Checkout"
            icon={<Clock className="h-4 w-4" />}
            sectionKeys={["autoCheckoutEnabled", "autoCheckoutTime", "autoCheckoutUserTypes"]}
            onSave={() => handleSave(["autoCheckoutEnabled", "autoCheckoutTime", "autoCheckoutUserTypes"])}
            onReset={() => handleReset(["autoCheckoutEnabled", "autoCheckoutTime", "autoCheckoutUserTypes"])}
          >
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Enable auto-checkout</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Automatically check out all inside users at the scheduled time</p>
              </div>
              <Switch
                checked={draft.autoCheckoutEnabled}
                onCheckedChange={val => d("autoCheckoutEnabled")(val)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoCheckoutTime">Checkout time (24-hour)</Label>
              <Input
                id="autoCheckoutTime"
                type="time"
                value={draft.autoCheckoutTime}
                onChange={e => d("autoCheckoutTime")(e.target.value)}
                className="w-36"
                disabled={!draft.autoCheckoutEnabled}
              />
              <p className="text-xs text-muted-foreground">Default: 17:00 (5 PM)</p>
            </div>

            <div className="space-y-2">
              <Label>Apply to user types</Label>
              <div className="flex flex-wrap gap-2">
                {(["student", "faculty", "staff", "admin"] as const).map(type => {
                  const selected = draft.autoCheckoutUserTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? draft.autoCheckoutUserTypes.filter(t => t !== type)
                          : [...draft.autoCheckoutUserTypes, type];
                        d("autoCheckoutUserTypes")(next);
                      }}
                      className={`px-3 py-1 rounded-full border text-sm font-medium transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ================================================================ */}
        {/* D. Classification                                                 */}
        {/* ================================================================ */}
        <TabsContent value="classification" className="space-y-4 mt-4">
          <SectionCard
            title="Classification Rules"
            icon={<Shield className="h-4 w-4" />}
            sectionKeys={["facultyKeywords"]}
            onSave={() => {
              const kws = facultyKeywordInput.split(",").map(k => k.trim()).filter(Boolean);
              d("facultyKeywords")(kws);
              handleSave(["facultyKeywords"], { facultyKeywords: kws });
            }}
            onReset={() => {
              setFacultyKeywordInput(DEFAULT_SETTINGS.facultyKeywords.join(", "));
              handleReset(["facultyKeywords"]);
            }}
          >
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                When a student record exists in the database, the <code>User_Type</code> field is used for classification.
                Keywords below are used as a fallback for legacy records that don't have a <code>User_Type</code>.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="facultyKeywords">Faculty / Staff detection keywords</Label>
              <Input
                id="facultyKeywords"
                value={facultyKeywordInput}
                onChange={e => setFacultyKeywordInput(e.target.value)}
                placeholder="faculty, staff, professor"
              />
              <p className="text-xs text-muted-foreground">Comma-separated. A name containing any of these words is classified as Faculty/Staff.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Current keywords: <strong>{settings.facultyKeywords.join(", ")}</strong>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ================================================================ */}
        {/* E. Notifications                                                  */}
        {/* ================================================================ */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <SectionCard
            title="Notifications"
            icon={<Bell className="h-4 w-4" />}
            sectionKeys={["toastsEnabled", "toastDuration", "soundEnabled", "soundVolume"]}
            onSave={() => handleSave(["toastsEnabled", "toastDuration", "soundEnabled", "soundVolume"])}
            onReset={() => handleReset(["toastsEnabled", "toastDuration", "soundEnabled", "soundVolume"])}
          >
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Enable scan feedback toasts</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Show visual feedback card after each scan</p>
              </div>
              <Switch
                checked={draft.toastsEnabled}
                onCheckedChange={val => d("toastsEnabled")(val)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="toastDuration">Feedback auto-dismiss duration (ms)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="toastDuration"
                  type="number"
                  min={1000}
                  max={30000}
                  step={500}
                  value={draft.toastDuration}
                  onChange={e => d("toastDuration")(Number(e.target.value))}
                  className="w-36"
                  disabled={!draft.toastsEnabled}
                />
                <span className="text-sm text-muted-foreground">{(draft.toastDuration / 1000).toFixed(1)} s — Default: 4 s</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Sound cues on scan</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Play a brief audio tone on check-in, check-out, or error</p>
              </div>
              <Switch
                checked={draft.soundEnabled}
                onCheckedChange={val => d("soundEnabled")(val)}
              />
            </div>

            {draft.soundEnabled && (
              <div className="space-y-2 px-1">
                <Label>Volume: {Math.round(draft.soundVolume * 100)}%</Label>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[draft.soundVolume]}
                  onValueChange={([v]) => d("soundVolume")(v)}
                  className="w-64"
                />
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ================================================================ */}
        {/* F. Data Management                                                */}
        {/* ================================================================ */}
        <TabsContent value="data" className="space-y-4 mt-4">

          {/* Current Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Current Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.studentsInside}</div>
                  <div className="text-xs text-muted-foreground">Students Inside</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.facultyInside}</div>
                  <div className="text-xs text-muted-foreground">Faculty Inside</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{stats.studentsInside + stats.facultyInside}</div>
                  <div className="text-xs text-muted-foreground">Total Inside</div>
                </div>
                <div className="text-center">
                  <Badge variant="outline" className="text-xs">Active</Badge>
                  <div className="text-xs text-muted-foreground mt-1">System Status</div>
                </div>
              </div>
              <Button onClick={updateStats} variant="outline" size="sm" className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Status
              </Button>
            </CardContent>
          </Card>

          {/* Force Checkout */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trash2 className="h-4 w-4" />
                Force Checkout Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This will immediately check out all students and faculty currently inside. Use for emergency situations or system reset.
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleRemoveAllInside}
                disabled={isProcessing || (stats.studentsInside + stats.facultyInside) === 0}
                variant="destructive"
                className="flex items-center gap-2"
              >
                {isProcessing ? (
                  <><div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />Processing...</>
                ) : (
                  <><Trash2 className="h-4 w-4" />Check Out All Users</>
                )}
              </Button>

              {lastOperation && (
                <div className={`p-4 rounded-lg border ${lastOperation.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {lastOperation.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                    <span className={`font-medium ${lastOperation.success ? "text-green-800" : "text-red-800"}`}>{lastOperation.message}</span>
                  </div>
                  {lastOperation.users.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {lastOperation.users.map((user, i) => (
                        <div key={i} className="text-xs bg-white p-2 rounded border">
                          <div className="flex justify-between">
                            <span className="font-medium">{user.name}</span>
                            <div className="flex gap-2">
                              <Badge variant={user.type === "Student" ? "default" : "secondary"} className="text-xs">{user.type}</Badge>
                              <span className="text-muted-foreground">{user.barcode}</span>
                            </div>
                          </div>
                          <div className="text-muted-foreground mt-0.5">In: {formatTime(user.entryTime)} · Out: Just now</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Offline Queue */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="h-4 w-4" />
                Offline Queue ({queueItems.length} pending)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {queueItems.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {queueItems.map(item => (
                    <div key={item.id} className="text-xs bg-muted p-2 rounded flex justify-between">
                      <span className="font-mono">{item.barcode}</span>
                      <span className="text-muted-foreground">{new Date(item.timestamp).toLocaleTimeString()} · {item.retries} retries</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No pending offline scans</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => { clearQueue(); setQueueItems([]); toast.success("Offline queue cleared"); }}
                disabled={queueItems.length === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Offline Queue
              </Button>
            </CardContent>
          </Card>

          {/* Backup & Restore */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Backup & Restore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Export all data to a JSON file, or restore from a previous backup.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleExportBackup} variant="outline" size="sm" className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5" />
                  Export JSON Backup
                </Button>
                <Button onClick={handleImportBackup} variant="outline" size="sm" className="flex items-center gap-2 text-orange-600 border-orange-300 hover:bg-orange-50">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Import / Restore
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <SectionCard
            title="Data Retention"
            icon={<Clock className="h-4 w-4" />}
            sectionKeys={["retentionDays"]}
            onSave={() => handleSave(["retentionDays"])}
            onReset={() => handleReset(["retentionDays"])}
          >
            <div className="space-y-2">
              <Label htmlFor="retentionDays">Auto-purge attendance records older than (days)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="retentionDays"
                  type="number"
                  min={0}
                  max={3650}
                  value={draft.retentionDays}
                  onChange={e => d("retentionDays")(Number(e.target.value))}
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">{draft.retentionDays === 0 ? "Never auto-purge" : `Purge after ${draft.retentionDays} days`}</span>
              </div>
              <p className="text-xs text-muted-foreground">Set to 0 to keep all records indefinitely. Purging is not applied retroactively — only affects new sessions after the next reload.</p>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
