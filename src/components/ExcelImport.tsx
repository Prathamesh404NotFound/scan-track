import { useState, useRef } from "react";
import { createMultipleStudents, getStudents } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import type { Student } from "@/types/models";

interface ImportError {
  row: number;
  barcode: string;
  error: string;
}

interface ExcelImportProps {
  onImportComplete?: () => void;
}

export default function ExcelImport({ onImportComplete }: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    success: number;
    errors: ImportError[];
    duplicates: number;
  } | null>(null);
  const [preview, setPreview] = useState<Student[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults(null);
      parseExcelFile(selectedFile);
    }
  };

  const parseExcelFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const students: Student[] = [];
      const errors: ImportError[] = [];

      jsonData.forEach((row, index) => {
        try {
          const student: Student = {
            Barcode: String(row.Barcode || row['Barcode'] || '').trim(),
            Name: String(row.Name || row['Name'] || '').trim(),
            Department: String(row.Department || row['Department'] || '').trim(),
            User_Type: normalizeUserType(String(row.User_Type || row['User_Type'] || 'student'))
          };

          // Validate required fields
          if (!student.Barcode || !student.Name) {
            errors.push({
              row: index + 2,
              barcode: student.Barcode,
              error: 'Barcode and Name are required'
            });
            return;
          }

          students.push(student);
        } catch (error) {
          errors.push({
            row: index + 2,
            barcode: String(row.Barcode || row['Barcode'] || ''),
            error: error instanceof Error ? error.message : 'Failed to parse row'
          });
        }
      });

      if (errors.length > 0) {
        setResults({
          success: 0,
          errors,
          duplicates: 0
        });
        return;
      }

      setPreview(students.slice(0, 5)); // Show first 5 for preview
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      setResults({
        success: 0,
        errors: [{ row: 0, barcode: '', error: error instanceof Error ? error.message : 'Failed to parse file' }],
        duplicates: 0
      });
    }
  };

  const normalizeUserType = (userType: string): 'student' | 'staff' | 'admin' | 'faculty' => {
    const normalized = userType.toLowerCase().trim();
    switch (normalized) {
      case 'student':
        return 'student';
      case 'staff':
        return 'staff';
      case 'admin':
        return 'admin';
      case 'faculty':
        return 'faculty';
      default:
        return 'student'; // Default to student
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResults(null);

    try {
      // Parse full file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const students: Student[] = [];
      const errors: ImportError[] = [];
      let duplicates = 0;

      jsonData.forEach((row, index) => {
        try {
          const student: Student = {
            Barcode: String(row.Barcode || row['Barcode'] || '').trim(),
            Name: String(row.Name || row['Name'] || '').trim(),
            Department: String(row.Department || row['Department'] || '').trim(),
            User_Type: normalizeUserType(String(row.User_Type || row['User_Type'] || 'student'))
          };

          if (!student.Barcode || !student.Name) {
            errors.push({
              row: index + 2,
              barcode: student.Barcode,
              error: 'Barcode and Name are required'
            });
            return;
          }

          students.push(student);
        } catch (error) {
          errors.push({
            row: index + 2,
            barcode: String(row.Barcode || row['Barcode'] || ''),
            error: error instanceof Error ? error.message : 'Failed to parse row'
          });
        }
      });

      // Get existing students to check for duplicates
      const existingStudents = await getStudents();
      const existingBarcodes = new Set(existingStudents.map(s => s.Barcode));

      const validStudents: Student[] = [];
      students.forEach(student => {
        if (existingBarcodes.has(student.Barcode)) {
          duplicates++;
        } else {
          validStudents.push(student);
        }
      });

      // Import valid students
      let successCount = 0;
      if (validStudents.length > 0) {
        await createMultipleStudents(validStudents);
        successCount = validStudents.length;
      }

      setResults({
        success: successCount,
        errors,
        duplicates
      });

      if (onImportComplete) {
        onImportComplete();
      }

    } catch (error) {
      console.error('Import error:', error);
      setResults({
        success: 0,
        errors: [{ row: 0, barcode: '', error: error instanceof Error ? error.message : 'Import failed' }],
        duplicates: 0
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        Barcode: '2022089269',
        Name: 'KAMBLE SHREYA PRAKASH',
        Department: 'Computer Science',
        User_Type: 'student'
      },
      {
        Barcode: '2022089328',
        Name: 'PATIL SHRIYA VIJAY',
        Department: 'Information Technology',
        User_Type: 'student'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_import_template.xlsx");
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import Students/Staff from Excel
        </CardTitle>
        <CardDescription>
          Upload an Excel file with columns: Barcode, Name, Department, User_Type
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Download Template
          </Button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Choose Excel File
          </Button>
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name}
            </p>
          )}
        </div>

        {preview.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Preview (first 5 records):</h4>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Barcode</th>
                    <th className="px-2 py-1 text-left">Name</th>
                    <th className="px-2 py-1 text-left">Department</th>
                    <th className="px-2 py-1 text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((student, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-2 py-1">{student.Barcode}</td>
                      <td className="px-2 py-1">{student.Name}</td>
                      <td className="px-2 py-1">{student.Department}</td>
                      <td className="px-2 py-1">{student.User_Type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {file && (
          <Button
            onClick={handleImport}
            disabled={importing}
            className="w-full"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              'Import Students'
            )}
          </Button>
        )}

        <AnimatePresence>
          {results && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              {results.success > 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Successfully imported {results.success} students
                  </AlertDescription>
                </Alert>
              )}

              {results.duplicates > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {results.duplicates} duplicate records were skipped
                  </AlertDescription>
                </Alert>
              )}

              {results.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div>
                      <p className="font-medium">Errors found:</p>
                      <ul className="mt-1 text-sm">
                        {results.errors.map((error, index) => (
                          <li key={index}>
                            Row {error.row}: {error.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
