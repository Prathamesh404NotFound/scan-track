import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, AlertTriangle, Settings as SettingsIcon, Trash2, RefreshCw, CheckCircle } from "lucide-react";
import { getCurrentlyInside, clearCache } from "@/services/scanHandler";
import { database, ref, get, update } from "@/lib/firebase";
import { toast } from "sonner";

export default function Settings() {
  const [stats, setStats] = useState({ studentsInside: 0, facultyInside: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastOperation, setLastOperation] = useState<{
    success: boolean;
    message: string;
    users: Array<{ name: string; barcode: string; type: string; entryTime: string }>;
  } | null>(null);

  useEffect(() => {
    updateStats();
  }, []);

  const updateStats = async () => {
    try {
      const currentlyInside = getCurrentlyInside();
      const studentsCount = Array.from(currentlyInside.values()).filter(
        user => user.name && !user.name.toLowerCase().includes('faculty') && !user.name.toLowerCase().includes('staff')
      ).length;

      const facultyCount = Array.from(currentlyInside.values()).filter(
        user => user.name && (user.name.toLowerCase().includes('faculty') || user.name.toLowerCase().includes('staff'))
      ).length;

      setStats({ studentsInside: studentsCount, facultyInside: facultyCount });
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  };

  const handleRemoveAllInside = async () => {
    if (!confirm('Are you sure you want to remove all students and faculty currently inside? This will check them out immediately.')) {
      return;
    }

    setIsProcessing(true);
    const now = new Date().toISOString();
    const currentlyInside = getCurrentlyInside();
    const processedUsers: Array<{ name: string; barcode: string; type: string; entryTime: string }> = [];

    try {
      // Process each user in cache
      for (const [key, entry] of currentlyInside.entries()) {
        try {
          // Update database record with exit time
          const recordRef = ref(database, `attendance/${entry.attendanceId}`);
          await update(recordRef, { exitTime: now });

          const userType = entry.name.toLowerCase().includes('faculty') || entry.name.toLowerCase().includes('staff')
            ? 'Faculty'
            : 'Student';

          processedUsers.push({
            name: entry.name,
            barcode: entry.barcode,
            type: userType,
            entryTime: entry.entryTime
          });

          console.log(`✅ Force checkout: ${entry.name} (${entry.barcode})`);
        } catch (error) {
          console.error(`❌ Failed to checkout ${entry.name}:`, error);
        }
      }

      // Also check database for any remaining open records
      await checkAndCheckoutDatabaseRecords(now, processedUsers);

      // Clear cache after successful checkout
      clearCache();

      setLastOperation({
        success: true,
        message: `Successfully checked out ${processedUsers.length} users`,
        users: processedUsers
      });

      toast.success(`Checked out ${processedUsers.length} users successfully`);
      updateStats();

    } catch (error) {
      console.error("❌ Force checkout failed:", error);
      setLastOperation({
        success: false,
        message: error instanceof Error ? error.message : "Force checkout failed",
        users: processedUsers
      });
      toast.error("Failed to checkout users");
    } finally {
      setIsProcessing(false);
    }
  };

  const checkAndCheckoutDatabaseRecords = async (
    exitTime: string,
    processedUsers: Array<{ name: string; barcode: string; type: string; entryTime: string }>
  ) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const attendanceRef = ref(database, "attendance");
      const snapshot = await get(attendanceRef);
      const attendanceData = snapshot.val() || {};

      for (const [key, value] of Object.entries(attendanceData)) {
        const record = value as any;
        const isSameDay = record.EntryTime && record.EntryTime.startsWith(today);
        const notExited = record.ExitTime === null || record.ExitTime === "-" || record.ExitTime === "";

        if (isSameDay && notExited) {
          // Check if this user is already processed
          const alreadyProcessed = processedUsers.some(user => user.barcode === record.Barcode);

          if (!alreadyProcessed) {
            try {
              const recordRef = ref(database, `attendance/${key}`);
              await update(recordRef, { exitTime });

              const userType = record.Name.toLowerCase().includes('faculty') || record.Name.toLowerCase().includes('staff')
                ? 'Faculty'
                : 'Student';

              processedUsers.push({
                name: record.Name,
                barcode: record.Barcode,
                type: userType,
                entryTime: record.EntryTime
              });

              console.log(`✅ DB force checkout: ${record.Name} (${record.Barcode})`);
            } catch (error) {
              console.error(`❌ Failed to DB checkout ${record.Name}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("❌ Database check failed:", error);
    }
  };

  const formatTime = (time: string) => {
    try {
      const date = new Date(time);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return time;
    }
  };

  return (
    <div className="container space-y-6 py-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <Badge variant="outline" className="text-xs">
                Active
              </Badge>
              <div className="text-xs text-muted-foreground mt-1">System Status</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Force Checkout Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Force Checkout Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will immediately check out all students and faculty currently inside. Use this for emergency situations or when the system needs to be reset.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handleRemoveAllInside}
              disabled={isProcessing || (stats.studentsInside + stats.facultyInside) === 0}
              className="flex items-center gap-2"
              variant="destructive"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Check Out All Users
                </>
              )}
            </Button>

            <Button
              onClick={updateStats}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last Operation Result */}
      {lastOperation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastOperation.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              Last Operation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-4 rounded-lg border ${lastOperation.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`font-medium ${lastOperation.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                  {lastOperation.message}
                </span>
              </div>

              {lastOperation.users.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">
                    Processed Users ({lastOperation.users.length}):
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {lastOperation.users.map((user, index) => (
                      <div key={index} className="text-xs bg-white p-2 rounded border">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{user.name}</span>
                          <div className="flex gap-2 items-center">
                            <Badge variant={user.type === 'Student' ? 'default' : 'secondary'} className="text-xs">
                              {user.type}
                            </Badge>
                            <span className="text-muted-foreground">{user.barcode}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-muted-foreground mt-1">
                          <span>In: {formatTime(user.entryTime)}</span>
                          <span>Out: Just Now</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
