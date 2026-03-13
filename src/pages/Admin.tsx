import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Student } from "@/types/models";
import { getStudents, createStudent, updateStudent, deleteStudent } from "@/services/api";
import { toast } from "sonner";
import ExcelImport from "@/components/ExcelImport";
import AutoCheckoutManager from "@/components/AutoCheckoutManager";

const LOCAL_KEY = "lib-attendance-students";

function getLocalStudents(): Student[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function saveLocalStudents(s: Student[]) { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); }

export default function Admin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({ Barcode: "", Name: "", Department: "", User_Type: "student" as const });
  const [useLocal, setUseLocal] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function loadStudents() {
    try {
      const data = await getStudents();
      setStudents(data);
      setUseLocal(false);
    } catch {
      setStudents(getLocalStudents());
      setUseLocal(true);
    }
  }

  useEffect(() => { loadStudents(); }, []);

  const filtered = students.filter(
    (s) => s.Name.toLowerCase().includes(search.toLowerCase()) || s.Barcode.includes(search)
  );

  function openCreate() {
    setEditing(null);
    setForm({ Barcode: "", Name: "", Department: "", User_Type: "student" });
    setDialogOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      Barcode: s.Barcode,
      Name: s.Name,
      Department: s.Department || "",
      User_Type: s.User_Type || "student"
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.Barcode.trim() || !form.Name.trim()) {
      toast.error("Barcode and Name are required");
      return;
    }
    try {
      if (editing) {
        if (useLocal) {
          const list = getLocalStudents().map((s) =>
            s.Barcode === editing.Barcode
              ? { ...s, Name: form.Name, Department: form.Department, User_Type: form.User_Type }
              : s
          );
          saveLocalStudents(list);
        } else {
          await updateStudent(editing.Barcode, form.Name, form.Department, form.User_Type);
        }
        toast.success("Student updated");
      } else {
        if (useLocal) {
          const list = getLocalStudents();
          list.push({
            Barcode: form.Barcode,
            Name: form.Name,
            Department: form.Department,
            User_Type: form.User_Type
          });
          saveLocalStudents(list);
        } else {
          await createStudent({
            Barcode: form.Barcode,
            Name: form.Name,
            Department: form.Department,
            User_Type: form.User_Type
          });
        }
        toast.success("Student created");
      }
      setDialogOpen(false);
      loadStudents();
    } catch (err: any) {
      toast.error(err?.message || "Operation failed");
    }
  }

  async function handleDelete(barcode: string) {
    try {
      if (useLocal) {
        saveLocalStudents(getLocalStudents().filter((s) => s.Barcode !== barcode));
      } else {
        await deleteStudent(barcode);
      }
      toast.success("Student deleted");
      loadStudents();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="container space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Student Management</h1>
          <p className="text-muted-foreground">
            {useLocal ? "Using local storage (backend unavailable)" : "Synced with backend"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowImport(true)} variant="outline" className="gap-2">
            <Upload className="h-4 w-4" /> Import Excel
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add Student
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" className="pl-9" />
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barcode</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No students found</TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.Barcode}>
                  <TableCell className="font-mono text-sm">{s.Barcode}</TableCell>
                  <TableCell className="font-medium">{s.Name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.Department || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.User_Type || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.Barcode)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      <AutoCheckoutManager />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Student" : "Add Student"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={form.Barcode}
                onChange={(e) => setForm({ ...form, Barcode: e.target.value })}
                disabled={!!editing}
                placeholder="Scan or type barcode"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.Name}
                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                placeholder="Student full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.Department}
                onChange={(e) => setForm({ ...form, Department: e.target.value })}
                placeholder="Department name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userType">User Type</Label>
              <Select value={form.User_Type} onValueChange={(value: any) => setForm({ ...form, User_Type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Students from Excel</DialogTitle>
            <DialogDescription>
              Upload an Excel file with columns: Barcode, Name, Department, User_Type
            </DialogDescription>
          </DialogHeader>
          <ExcelImport onImportComplete={() => {
            loadStudents();
            setShowImport(false);
          }} />
          <DialogFooter>
            <Button onClick={() => setShowImport(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
