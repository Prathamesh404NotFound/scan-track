import { motion } from "framer-motion";
import { useAttendance } from "@/store/attendanceContext";
import LiveScanCard from "@/components/LiveScanCard";
import AttendanceTable from "@/components/AttendanceTable";
import { Users, LogIn, LogOut, Clock, UserCheck } from "lucide-react";

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold font-display">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { records } = useAttendance();

  const today = new Date().toDateString();
  const todayRecords = records.filter((r) => {
    return r.EntryTime && new Date(r.EntryTime).toDateString() === today;
  });

  const todayEntries = todayRecords.filter((r) => r.EntryTime).length;
  const todayExits = todayRecords.filter((r) => r.ExitTime).length;
  const currentlyInside = records.filter((r) => !r.ExitTime).length;
  const uniqueUsersToday = new Set(todayRecords.map((r) => r.Barcode)).size;

  const calculateAverageDuration = () => {
    const completedRecords = todayRecords.filter((r) => r.EntryTime && r.ExitTime);
    if (completedRecords.length === 0) return "--:--";

    const totalMinutes = completedRecords.reduce((acc, record) => {
      const entry = new Date(record.EntryTime!);
      const exit = new Date(record.ExitTime!);
      return acc + (exit.getTime() - entry.getTime()) / (1000 * 60);
    }, 0);

    const avgMinutes = Math.round(totalMinutes / completedRecords.length);
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container space-y-6 py-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={LogIn} label="Today's Entries" value={todayEntries} color="bg-green-100 text-green-600" />
        <StatCard icon={LogOut} label="Today's Exits" value={todayExits} color="bg-green-100 text-green-600" />
        <StatCard icon={Users} label="Currently Inside" value={currentlyInside} color="bg-green-100 text-green-600" />
        <StatCard icon={UserCheck} label="Unique Users Today" value={uniqueUsersToday} color="bg-green-100 text-green-600" />
        <StatCard icon={Clock} label="Avg Duration (hh:mm)" value={calculateAverageDuration()} color="bg-green-100 text-green-600" />
      </div>

      <LiveScanCard />

      <AttendanceTable />
    </div>
  );
}
