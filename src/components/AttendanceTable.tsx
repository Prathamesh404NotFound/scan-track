import { useState, useMemo, useEffect } from "react";
import { useAttendance } from "@/store/attendanceContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, RefreshCw, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { getStudents } from "@/services/api";
import type { Student } from "@/types/models";

export default function AttendanceTable() {
  const { records, lastScannedBarcode, refreshAttendance } = useAttendance();
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [userType, setUserType] = useState("all");
  const [department, setDepartment] = useState("all");
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all");
  const [day, setDay] = useState("all");
  const [displayLimit, setDisplayLimit] = useState("20");
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const studentData = await getStudents();
        setStudents(studentData);
      } catch (error) {
        console.error('Failed to load students:', error);
      }
    };
    loadStudents();
  }, []);

  const getStudentInfo = (barcode: string) => {
    const student = students.find(s => s.Barcode === barcode);
    return {
      name: student?.Name || "Unknown",
      department: student?.Department || "-",
      userType: student?.User_Type || "-"
    };
  };

  const filtered = useMemo(() => {
    let list = records.filter(
      (r) => {
        const studentInfo = getStudentInfo(r.Barcode);
        return (
          studentInfo.name.toLowerCase().includes(search.toLowerCase()) ||
          r.Barcode.toLowerCase().includes(search.toLowerCase())
        );
      }
    );

    // Apply filters
    if (userType !== "all") {
      list = list.filter(r => {
        const studentInfo = getStudentInfo(r.Barcode);
        return studentInfo.userType === userType;
      });
    }

    if (department !== "all") {
      list = list.filter(r => {
        const studentInfo = getStudentInfo(r.Barcode);
        return studentInfo.department === department;
      });
    }

    // Apply date filters
    const today = new Date();
    if (year !== "all") {
      list = list.filter(r => {
        if (!r.EntryTime) return false;
        const entryYear = new Date(r.EntryTime).getFullYear().toString();
        return entryYear === year;
      });
    }

    if (month !== "all") {
      list = list.filter(r => {
        if (!r.EntryTime) return false;
        const entryMonth = (new Date(r.EntryTime).getMonth() + 1).toString();
        return entryMonth === month;
      });
    }

    if (day !== "all") {
      list = list.filter(r => {
        if (!r.EntryTime) return false;
        const entryDay = new Date(r.EntryTime).getDate().toString();
        return entryDay === day;
      });
    }

    list.sort((a, b) => {
      const ta = a.EntryTime || "";
      const tb = b.EntryTime || "";
      return sortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta);
    });

    // Apply display limit
    const limit = parseInt(displayLimit);
    return list.slice(0, limit);
  }, [records, search, sortAsc, userType, department, year, month, day, displayLimit, students]);

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(
      records.map((r) => {
        const studentInfo = getStudentInfo(r.Barcode);
        return {
          Barcode: r.Barcode,
          Name: studentInfo.name,
          Department: studentInfo.department,
          Type: studentInfo.userType,
          "Entry Time": r.EntryTime || "",
          "Exit Time": r.ExitTime || "",
          Date: r.EntryTime ? new Date(r.EntryTime).toISOString().split('T')[0] : "",
        };
      })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toISOString().split('T')[0];
    } catch {
      return iso;
    }
  }

  // Get unique departments and user types for filters
  const departments = useMemo(() => {
    const depts = new Set(students.map(s => s.Department).filter(d => d));
    return Array.from(depts).sort();
  }, [students]);

  const userTypes = useMemo(() => {
    const types = new Set(students.map(s => s.User_Type).filter(t => t));
    return Array.from(types).sort();
  }, [students]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-xl border bg-card shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold">Today's Attendance</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or barcode…"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => refreshAttendance()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={exportXLSX}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <Select value={userType} onValueChange={setUserType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All User Types</SelectItem>
                {userTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                <SelectItem value="1">January</SelectItem>
                <SelectItem value="2">February</SelectItem>
                <SelectItem value="3">March</SelectItem>
                <SelectItem value="4">April</SelectItem>
                <SelectItem value="5">May</SelectItem>
                <SelectItem value="6">June</SelectItem>
                <SelectItem value="7">July</SelectItem>
                <SelectItem value="8">August</SelectItem>
                <SelectItem value="9">September</SelectItem>
                <SelectItem value="10">October</SelectItem>
                <SelectItem value="11">November</SelectItem>
                <SelectItem value="12">December</SelectItem>
              </SelectContent>
            </Select>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                {Array.from({ length: 31 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Display:</span>
            <Select value={displayLimit} onValueChange={setDisplayLimit}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-green-600">
              <TableHead className="w-32 text-white font-semibold">Barcode</TableHead>
              <TableHead className="text-white font-semibold">Name</TableHead>
              <TableHead className="text-white font-semibold">Department</TableHead>
              <TableHead className="text-white font-semibold">Type</TableHead>
              <TableHead className="text-white font-semibold">Entry Time</TableHead>
              <TableHead className="text-white font-semibold">Exit Time</TableHead>
              <TableHead className="text-white font-semibold">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {records.length === 0 ? "No attendance records yet" : "No results found"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => {
                  const studentInfo = getStudentInfo(r.Barcode);
                  return (
                    <motion.tr
                      key={`${r.Barcode}-${r.EntryTime}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`border-b transition-colors hover:bg-muted/50 ${lastScannedBarcode === r.Barcode ? "scan-glow" : ""
                        }`}
                    >
                      <TableCell className="font-mono text-sm">{r.Barcode}</TableCell>
                      <TableCell className="font-medium">{studentInfo.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{studentInfo.department}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{studentInfo.userType}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTime(r.EntryTime)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.ExitTime ? formatTime(r.ExitTime) : "Still Inside"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.EntryTime)}
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {records.length} total records · {records.filter((r) => !r.ExitTime).length} currently inside
      </div>
    </motion.div>
  );
}
