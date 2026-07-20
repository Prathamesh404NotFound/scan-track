import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Firebase mock — must be declared before importing scanHandler
// ---------------------------------------------------------------------------
vi.mock("@/lib/firebase", () => {
  const mockDb = {};
  return {
    database: mockDb,
    ref: vi.fn(() => ({ key: "mock-ref" })),
    get: vi.fn(),
    set: vi.fn(),
    push: vi.fn(() => ({ key: "mock-push-key" })),
    update: vi.fn(),
    remove: vi.fn(),
    onValue: vi.fn(),
  };
});

import { handleScan } from "@/services/scanHandler";
import { get, set, push, update } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Helpers to build mock Firebase snapshot responses
// ---------------------------------------------------------------------------
function mockStudentsSnapshot(students: Record<string, unknown>) {
  return {
    val: () => students,
  };
}

function mockAttendanceSnapshot(records: Record<string, unknown> = {}) {
  return {
    val: () => records,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handleScan — unknown barcode guard (Task 3)", () => {
  const getMock = vi.mocked(get);
  const setMock = vi.mocked(set);
  const pushMock = vi.mocked(push);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no students, no attendance records
    getMock.mockResolvedValue(mockStudentsSnapshot({}) as any);
  });

  it("returns success:false and does NOT write to Firebase when barcode is not registered", async () => {
    // students node is empty → barcode not found
    getMock.mockImplementation((ref) => {
      // First call: attendance (findOpenAttendance checks attendance first),
      // Second call: students (findStudent)
      // We'll return empty for both
      return Promise.resolve({ val: () => ({}) } as any);
    });

    const result = await handleScan("UNKNOWN_BARCODE_999");

    expect(result.success).toBe(false);
    expect(result.message).toContain("not registered");
    // push (createAttendance) must NOT have been called
    expect(pushMock).not.toHaveBeenCalled();
    // set must NOT have been called (no new attendance record)
    expect(setMock).not.toHaveBeenCalled();
  });

  it("returns success:false for a debounced (rapid duplicate) scan", async () => {
    // Set up a registered student
    const mockStudent = { Barcode: "REGISTERED_001", Name: "Test Student", Department: "CS", User_Type: "student" };
    getMock.mockImplementation(() =>
      Promise.resolve({ val: () => ({ key1: mockStudent }) } as any)
    );
    // Also mock push+set so first scan goes through
    pushMock.mockReturnValue({ key: "att-1" } as any);
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);

    // First scan — should succeed (check-in)
    const first = await handleScan("REGISTERED_001");
    expect(first.success).toBe(true);

    // Reset mocks call counts but keep debounce map active
    vi.clearAllMocks();
    getMock.mockResolvedValue({ val: () => ({}) } as any);

    // Second immediate scan — should be debounced
    const second = await handleScan("REGISTERED_001");
    expect(second.success).toBe(false);
    expect(second.message).toContain("Please wait");
  });

  it("returns success:true and writes to Firebase when barcode IS registered", async () => {
    const mockStudent = {
      Barcode: "STUDENT_ABC",
      Name: "Alice Smith",
      Department: "Library Science",
      User_Type: "student" as const,
    };

    // attendance snapshot: empty (no open record)
    // students snapshot: contains the student
    let callCount = 0;
    getMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // findOpenAttendance call — empty attendance
        return Promise.resolve({ val: () => ({}) } as any);
      }
      // findStudent call — contains our student
      return Promise.resolve({ val: () => ({ key1: mockStudent }) } as any);
    });

    pushMock.mockReturnValue({ key: "new-att-id" } as any);
    setMock.mockResolvedValue(undefined);

    const result = await handleScan("STUDENT_ABC");

    expect(result.success).toBe(true);
    expect(result.message).toContain("Alice Smith");
    expect(result.message).toContain("checked in");
    // push (createAttendance) MUST have been called
    expect(pushMock).toHaveBeenCalled();
  });
});

// Need to declare updateMock reference used in debounce test
const updateMock = vi.mocked(update);
