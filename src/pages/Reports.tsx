import { useAttendance } from "@/store/attendanceContext";
import { useSettings } from "@/store/settingsContext";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, Download, Printer, X, BarChart3, PieChart as PieIcon,
  Users, Clock, ArrowUpDown, Calendar as CalendarIcon, ChevronLeft, ChevronRight
} from "lucide-react";
import type { AttendanceRecord } from "@/types/models";
import { getStudents } from "@/services/api";
import type { Student } from "@/types/models";

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const COLORS = [
  "hsl(152,60%,36%)", "hsl(211,80%,50%)", "hsl(38,92%,50%)",
  "hsl(280,65%,55%)", "hsl(0,75%,55%)", "hsl(180,55%,40%)", "hsl(60,80%,45%)"
];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function fmtDuration(entryIso: string | null, exitIso: string | null) {
  if (!entryIso || !exitIso) return "—";
  try {
    const mins = Math.round((new Date(exitIso).getTime() - new Date(entryIso).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  } catch { return "—"; }
}

function avgDuration(records: AttendanceRecord[]) {
  const completed = records.filter(r => r.EntryTime && r.ExitTime);
  if (!completed.length) return "—";
  const totalMs = completed.reduce((s, r) => s + (new Date(r.ExitTime!).getTime() - new Date(r.EntryTime!).getTime()), 0);
  const avgMins = Math.round(totalMs / completed.length / 60000);
  return avgMins < 60 ? `${avgMins}m` : `${Math.floor(avgMins / 60)}h ${avgMins % 60}m`;
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------
type Preset = "today" | "week" | "month" | "all" | "custom";

function presetRange(preset: Preset): { from: Date | undefined; to: Date | undefined } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "week") {
    const from = startOfDay(new Date(now));
    from.setDate(from.getDate() - from.getDay());
    return { from, to: endOfDay(now) };
  }
  if (preset === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  return { from: undefined, to: undefined };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function exportCsv(records: AttendanceRecord[], students: Student[]) {
  const headers = ["Barcode", "Name", "Department", "Type", "Entry Time", "Exit Time", "Duration", "Status"];
  const rows = records.map(r => {
    const st = students.find(s => s.Barcode === r.Barcode);
    return [
      r.Barcode,
      st?.Name || r.Name || "",
      st?.Department || "",
      st?.User_Type || "",
      r.EntryTime || "",
      r.ExitTime || "",
      fmtDuration(r.EntryTime, r.ExitTime),
      r.ExitTime ? "Exited" : "Inside",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border bg-card text-muted-foreground text-sm">
      {filtered ? "No records match the selected filters" : "No data yet — scan a barcode first"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Reports() {
  const { records } = useAttendance();
  const { settings } = useSettings();
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    getStudents().then(setStudents).catch(console.error);
  }, []);

  // ── Filter state ──
  const [preset, setPreset] = useState<Preset>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [personTypeFilter, setPersonTypeFilter] = useState<"all" | "student" | "faculty">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  // ── Per-person tab state ──
  const [selectedBarcode, setSelectedBarcode] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");

  // ── Top visitors tab state ──
  const [topCount, setTopCount] = useState<string>("5");

  // ── Daily log sort/page ──
  const [logSort, setLogSort] = useState<{ col: string; asc: boolean }>({ col: "entryTime", asc: false });
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 15;

  // Apply date preset
  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const range = presetRange(p);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  }, []);

  // Determine whether a record is "faculty/staff"
  const isFaculty = useCallback((barcode: string, name: string) => {
    const st = students.find(s => s.Barcode === barcode);
    if (st) return st.User_Type === "faculty" || st.User_Type === "staff" || st.User_Type === "admin";
    return settings.facultyKeywords.some(k => name.toLowerCase().includes(k.toLowerCase()));
  }, [students, settings.facultyKeywords]);

  // ── Filtered records (all tabs share this) ──
  const filtered = useMemo<AttendanceRecord[]>(() => {
    let list = records;

    if (dateFrom) list = list.filter(r => r.EntryTime && new Date(r.EntryTime) >= dateFrom);
    if (dateTo) list = list.filter(r => r.EntryTime && new Date(r.EntryTime) <= dateTo);

    if (personTypeFilter !== "all") {
      list = list.filter(r => {
        const faculty = isFaculty(r.Barcode, r.Name || "");
        return personTypeFilter === "faculty" ? faculty : !faculty;
      });
    }

    if (deptFilter !== "all") {
      list = list.filter(r => {
        const st = students.find(s => s.Barcode === r.Barcode);
        return st?.Department === deptFilter;
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(r => {
        const st = students.find(s => s.Barcode === r.Barcode);
        return (
          r.Barcode.toLowerCase().includes(q) ||
          (r.Name || "").toLowerCase().includes(q) ||
          (st?.Name || "").toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [records, dateFrom, dateTo, personTypeFilter, deptFilter, searchText, students, isFaculty]);

  const isFiltered = !!(dateFrom || dateTo || personTypeFilter !== "all" || deptFilter !== "all" || searchText);

  const clearFilters = () => {
    setPreset("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPersonTypeFilter("all");
    setDeptFilter("all");
    setSearchText("");
  };

  // ── Departments for filter ──
  const departments = useMemo(() => {
    const s = new Set(students.map(s => s.Department).filter(Boolean));
    return Array.from(s).sort();
  }, [students]);

  // ── Overview: hourly ──
  const hourlyData = useMemo(() => {
    const counts: Record<number, number> = {};
    filtered.forEach(r => { if (r.EntryTime) counts[new Date(r.EntryTime).getHours()] = (counts[new Date(r.EntryTime).getHours()] || 0) + 1; });
    return Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, entries: counts[i] || 0 })).filter(d => d.entries > 0);
  }, [filtered]);

  // ── Overview: day of week ──
  const dowData = useMemo(() => {
    const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
    filtered.forEach(r => { if (r.EntryTime) counts[new Date(r.EntryTime).getDay()]++; });
    return DOW.map((d, i) => ({ day: d, entries: counts[i] }));
  }, [filtered]);

  // ── Overview: status pie ──
  const statusData = useMemo(() => {
    const inside = filtered.filter(r => !r.ExitTime).length;
    const exited = filtered.filter(r => r.ExitTime).length;
    return [{ name: "Inside", value: inside }, { name: "Exited", value: exited }].filter(d => d.value > 0);
  }, [filtered]);

  // ── Overview: stat cards ──
  const totalScans = filtered.length;
  const uniqueVisitors = useMemo(() => new Set(filtered.map(r => r.Barcode)).size, [filtered]);
  const insideNow = filtered.filter(r => !r.ExitTime).length;

  // ── Daily log (sorted + paginated) ──
  const sortedLog = useMemo(() => {
    const s = [...filtered];
    s.sort((a, b) => {
      let va: string | null = null, vb: string | null = null;
      if (logSort.col === "entryTime") { va = a.EntryTime; vb = b.EntryTime; }
      else if (logSort.col === "exitTime") { va = a.ExitTime; vb = b.ExitTime; }
      else if (logSort.col === "name") { va = a.Name; vb = b.Name; }
      else if (logSort.col === "barcode") { va = a.Barcode; vb = b.Barcode; }
      return (logSort.asc ? 1 : -1) * ((va || "").localeCompare(vb || ""));
    });
    return s;
  }, [filtered, logSort]);

  const totalLogPages = Math.max(1, Math.ceil(sortedLog.length / LOG_PAGE_SIZE));
  const logPage_ = Math.min(logPage, totalLogPages);
  const pagedLog = sortedLog.slice((logPage_ - 1) * LOG_PAGE_SIZE, logPage_ * LOG_PAGE_SIZE);

  const toggleSort = (col: string) =>
    setLogSort(prev => ({ col, asc: prev.col === col ? !prev.asc : true }));

  // ── Per-person ──
  const personOptions = useMemo(() => {
    const barcodes = Array.from(new Set(records.map(r => r.Barcode)));
    return barcodes
      .map(bc => {
        const st = students.find(s => s.Barcode === bc);
        const firstName = records.find(r => r.Barcode === bc)?.Name || bc;
        return { barcode: bc, name: st?.Name || firstName };
      })
      .filter(p => !personSearch || p.name.toLowerCase().includes(personSearch.toLowerCase()) || p.barcode.includes(personSearch))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records, students, personSearch]);

  const selectedPersonRecords = useMemo(() =>
    selectedBarcode ? records.filter(r => r.Barcode === selectedBarcode).sort((a, b) => (b.EntryTime || "").localeCompare(a.EntryTime || "")) : [],
    [records, selectedBarcode]
  );

  const selectedSt = selectedBarcode ? students.find(s => s.Barcode === selectedBarcode) : null;

  // ── Department breakdown ──
  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(r => {
      const st = students.find(s => s.Barcode === r.Barcode);
      const dept = st?.Department || "Unknown";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered, students]);

  const studentVsFacultyData = useMemo(() => [
    { name: "Students", inside: filtered.filter(r => !r.ExitTime && !isFaculty(r.Barcode, r.Name || "")).length, exited: filtered.filter(r => r.ExitTime && !isFaculty(r.Barcode, r.Name || "")).length },
    { name: "Faculty/Staff", inside: filtered.filter(r => !r.ExitTime && isFaculty(r.Barcode, r.Name || "")).length, exited: filtered.filter(r => r.ExitTime && isFaculty(r.Barcode, r.Name || "")).length },
  ], [filtered, isFaculty]);

  // ── Top visitors ──
  const topVisitors = useMemo(() => {
    const counts: Record<string, { name: string; visits: number }> = {};
    filtered.forEach(r => {
      if (!counts[r.Barcode]) {
        const st = students.find(s => s.Barcode === r.Barcode);
        counts[r.Barcode] = { name: st?.Name || r.Name || r.Barcode, visits: 0 };
      }
      counts[r.Barcode].visits++;
    });
    return Object.values(counts).sort((a, b) => b.visits - a.visits).slice(0, Number(topCount));
  }, [filtered, students, topCount]);

  // ── Print style ──
  const printStyle = `
    @media print {
      nav, header, .no-print { display: none !important; }
      body { font-size: 12px; }
      .print-page { padding: 20px; }
    }
  `;

  return (
    <>
      <style>{printStyle}</style>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="container space-y-6 py-6 print-page"
      >
        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">Attendance analytics and visualizations</p>
        </div>

        {/* ================================================================ */}
        {/* A. Filter bar                                                      */}
        {/* ================================================================ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border bg-card p-4 shadow-sm space-y-3 no-print"
        >
          {/* Preset buttons + date picker */}
          <div className="flex flex-wrap items-center gap-2">
            {(["today", "week", "month", "all"] as Preset[]).map(p => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "default" : "outline"}
                onClick={() => applyPreset(p)}
                className="capitalize"
              >
                {p === "all" ? "All Time" : p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
              </Button>
            ))}

            {/* Custom date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={preset === "custom" ? "default" : "outline"} className="gap-2">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom && dateTo && preset === "custom"
                    ? `${dateFrom.toLocaleDateString()} – ${dateTo.toLocaleDateString()}`
                    : "Custom range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex gap-1 p-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 px-1">From</p>
                    <Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); setPreset("custom"); }} initialFocus />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 px-1">To</p>
                    <Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d ? endOfDay(d) : undefined); setPreset("custom"); }} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Other filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search name or barcode…"
                className="pl-8 h-8 w-52 text-sm"
              />
            </div>

            <Select value={personTypeFilter} onValueChange={val => setPersonTypeFilter(val as "all" | "student" | "faculty")}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="student">Students</SelectItem>
                <SelectItem value="faculty">Faculty / Staff</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            {isFiltered && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1.5 text-muted-foreground h-8">
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}

            <Badge variant="secondary" className="ml-auto text-xs">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""} match
            </Badge>
          </div>
        </motion.div>

        {/* ================================================================ */}
        {/* Tabs                                                               */}
        {/* ================================================================ */}
        <Tabs defaultValue="overview">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 no-print">
            <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span></TabsTrigger>
            <TabsTrigger value="log" className="gap-1.5"><Clock className="h-3.5 w-3.5" /><span className="hidden sm:inline">Daily Log</span></TabsTrigger>
            <TabsTrigger value="person" className="gap-1.5"><Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">Per-Person</span></TabsTrigger>
            <TabsTrigger value="dept" className="gap-1.5"><PieIcon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Departments</span></TabsTrigger>
            <TabsTrigger value="top" className="gap-1.5"><ArrowUpDown className="h-3.5 w-3.5" /><span className="hidden sm:inline">Top Visitors</span></TabsTrigger>
            <TabsTrigger value="export" className="gap-1.5 no-print"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export</span></TabsTrigger>
          </TabsList>

          {/* ============================================================== */}
          {/* B. Overview                                                      */}
          {/* ============================================================== */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {filtered.length === 0 ? <EmptyState filtered={isFiltered} /> : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Scans" value={totalScans} />
                  <StatCard label="Unique Visitors" value={uniqueVisitors} />
                  <StatCard label="Avg Visit Duration" value={avgDuration(filtered)} />
                  <StatCard label="Currently Inside" value={insideNow} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 font-display font-semibold">Entries by Hour</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                        <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="entries" fill="hsl(152,60%,36%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="rounded-xl border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 font-display font-semibold">Entries by Day of Week</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dowData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="entries" fill="hsl(211,80%,50%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="rounded-xl border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 font-display font-semibold">Current Status</h3>
                    {statusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                            {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <EmptyState filtered={false} />}
                  </motion.div>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="rounded-xl border bg-card p-6 shadow-sm">
                    <h3 className="mb-4 font-display font-semibold">Students vs Faculty/Staff</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={studentVsFacultyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="inside" name="Inside" fill="hsl(152,60%,36%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="exited" name="Exited" fill="hsl(152,40%,65%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* C. Daily Log                                                     */}
          {/* ============================================================== */}
          <TabsContent value="log" className="mt-4">
            {filtered.length === 0 ? <EmptyState filtered={isFiltered} /> : (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-green-600 hover:bg-green-600">
                        {[
                          { col: "barcode", label: "Barcode" },
                          { col: "name", label: "Name" },
                          { col: "dept", label: "Department" },
                          { col: "type", label: "Type" },
                          { col: "entryTime", label: "Entry" },
                          { col: "exitTime", label: "Exit" },
                          { col: "duration", label: "Duration" },
                          { col: "status", label: "Status" },
                        ].map(({ col, label }) => (
                          <TableHead key={col} className="text-white font-semibold">
                            <button className="flex items-center gap-1 hover:opacity-80" onClick={() => toggleSort(col)}>
                              {label}
                              <ArrowUpDown className="h-3 w-3 opacity-60" />
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedLog.map((r, i) => {
                        const st = students.find(s => s.Barcode === r.Barcode);
                        return (
                          <motion.tr
                            key={`${r.Barcode}-${r.EntryTime}-${i}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="border-b transition-colors hover:bg-muted/50"
                          >
                            <TableCell className="font-mono text-xs">{r.Barcode}</TableCell>
                            <TableCell className="font-medium">{st?.Name || r.Name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{st?.Department || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground capitalize">{st?.User_Type || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtTime(r.EntryTime)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.ExitTime ? fmtTime(r.ExitTime) : "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtDuration(r.EntryTime, r.ExitTime)}</TableCell>
                            <TableCell>
                              {!r.ExitTime
                                ? <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">Still Inside</Badge>
                                : <Badge variant="secondary" className="text-xs">Exited</Badge>}
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                  <span>{filtered.length} records · page {logPage_} of {totalLogPages}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={logPage_ <= 1} onClick={() => setLogPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={logPage_ >= totalLogPages} onClick={() => setLogPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* D. Per-Person                                                    */}
          {/* ============================================================== */}
          <TabsContent value="person" className="mt-4 space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                  placeholder="Search person by name or barcode…"
                  className="pl-8"
                />
              </div>
              {personSearch && (
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {personOptions.slice(0, 20).map(p => (
                    <button
                      key={p.barcode}
                      type="button"
                      onClick={() => { setSelectedBarcode(p.barcode); setPersonSearch(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">{p.barcode}</span>
                    </button>
                  ))}
                  {personOptions.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>}
                </div>
              )}
            </div>

            {selectedBarcode ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h3 className="font-display font-semibold text-lg">{selectedSt?.Name || selectedBarcode}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{selectedBarcode} · {selectedSt?.Department || "Unknown dept"} · {selectedSt?.User_Type || "unknown type"}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedBarcode(null)} className="ml-auto">
                    <X className="h-3.5 w-3.5 mr-1" />Clear
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Visits" value={selectedPersonRecords.length} />
                  <StatCard label="Total Time" value={(() => {
                    const ms = selectedPersonRecords.filter(r => r.EntryTime && r.ExitTime).reduce((s, r) => s + (new Date(r.ExitTime!).getTime() - new Date(r.EntryTime!).getTime()), 0);
                    const mins = Math.round(ms / 60000);
                    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
                  })()} />
                  <StatCard label="Avg Duration" value={avgDuration(selectedPersonRecords)} />
                  <StatCard label="First Seen" value={selectedPersonRecords.length ? new Date(selectedPersonRecords[selectedPersonRecords.length - 1].EntryTime || "").toLocaleDateString() : "—"} />
                </div>

                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-green-600 hover:bg-green-600">
                        <TableHead className="text-white font-semibold">Entry</TableHead>
                        <TableHead className="text-white font-semibold">Exit</TableHead>
                        <TableHead className="text-white font-semibold">Duration</TableHead>
                        <TableHead className="text-white font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPersonRecords.map((r, i) => (
                        <TableRow key={i} className="hover:bg-muted/50">
                          <TableCell className="text-sm">{fmtTime(r.EntryTime)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.ExitTime ? fmtTime(r.ExitTime) : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fmtDuration(r.EntryTime, r.ExitTime)}</TableCell>
                          <TableCell>
                            {!r.ExitTime
                              ? <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">Inside</Badge>
                              : <Badge variant="secondary" className="text-xs">Exited</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <EmptyState filtered={false} />
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* E. Department breakdown                                          */}
          {/* ============================================================== */}
          <TabsContent value="dept" className="mt-4 space-y-4">
            {filtered.length === 0 ? <EmptyState filtered={isFiltered} /> : (
              <div className="grid gap-4 lg:grid-cols-2">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card p-6 shadow-sm">
                  <h3 className="mb-4 font-display font-semibold">Visits by Department</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={deptData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip />
                      <Bar dataKey="value" name="Visits" radius={[0, 4, 4, 0]}>
                        {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="rounded-xl border bg-card p-6 shadow-sm">
                  <h3 className="mb-4 font-display font-semibold">Students vs Faculty/Staff</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={studentVsFacultyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="inside" name="Inside" fill="hsl(152,60%,36%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="exited" name="Exited" fill="hsl(211,80%,50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Dept table */}
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden lg:col-span-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-green-600 hover:bg-green-600">
                        <TableHead className="text-white font-semibold">Department</TableHead>
                        <TableHead className="text-white font-semibold">Total Visits</TableHead>
                        <TableHead className="text-white font-semibold">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deptData.map((d, i) => (
                        <TableRow key={d.name} className="hover:bg-muted/50">
                          <TableCell className="font-medium flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            {d.name}
                          </TableCell>
                          <TableCell>{d.value}</TableCell>
                          <TableCell className="text-muted-foreground">{((d.value / filtered.length) * 100).toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* F. Top Visitors                                                  */}
          {/* ============================================================== */}
          <TabsContent value="top" className="mt-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">Show top:</span>
              <Select value={topCount} onValueChange={setTopCount}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "10", "20", "50"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">visitors in the current date range</span>
            </div>

            {topVisitors.length === 0 ? <EmptyState filtered={isFiltered} /> : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="space-y-3">
                  {topVisitors.map((v, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{v.name}</p>
                        <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(v.visits / topVisitors[0].visits) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground flex-shrink-0">{v.visits} visit{v.visits !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* G. Export & Print                                                */}
          {/* ============================================================== */}
          <TabsContent value="export" className="mt-4 space-y-4 no-print">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
              <h3 className="font-display font-semibold">Export Options</h3>
              <p className="text-sm text-muted-foreground">
                All exports are scoped to the currently active filters ({filtered.length} records).
              </p>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => exportCsv(sortedLog, students)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV (Daily Log)
                </Button>

                <Button
                  onClick={() => window.print()}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print / Save as PDF
                </Button>
              </div>

              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-1">
                <p><strong>CSV:</strong> Exports the sorted Daily Log with all columns (barcode, name, dept, type, entry/exit time, duration).</p>
                <p><strong>Print:</strong> Opens the browser print dialog. Use "Save as PDF" for a shareable document. The filter bar and tabs are hidden in the printed version.</p>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
