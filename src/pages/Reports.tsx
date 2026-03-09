import { useAttendance } from "@/store/attendanceContext";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useMemo } from "react";

const COLORS = ["hsl(152,60%,36%)", "hsl(152,40%,55%)", "hsl(148,30%,70%)", "hsl(38,92%,50%)"];

export default function Reports() {
  const { records } = useAttendance();

  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    records.forEach((r) => {
      if (r.EntryTime) {
        const h = new Date(r.EntryTime).getHours();
        hours[h] = (hours[h] || 0) + 1;
      }
    });
    return Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, entries: hours[i] || 0 })).filter((d) => d.entries > 0);
  }, [records]);

  const statusData = useMemo(() => {
    const inside = records.filter((r) => !r.ExitTime).length;
    const exited = records.filter((r) => r.ExitTime).length;
    return [
      { name: "Inside", value: inside },
      { name: "Exited", value: exited },
    ].filter((d) => d.value > 0);
  }, [records]);

  const topStudents = useMemo(() => {
    const counts: Record<string, { name: string; visits: number }> = {};
    records.forEach((r) => {
      if (!counts[r.Barcode]) counts[r.Barcode] = { name: r.Name, visits: 0 };
      counts[r.Barcode].visits++;
    });
    return Object.values(counts).sort((a, b) => b.visits - a.visits).slice(0, 5);
  }, [records]);

  return (
    <div className="container space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Attendance analytics and visualizations</p>
      </div>

      {records.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border bg-card text-muted-foreground">
          No data to display. Scan some barcodes first.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="mb-4 font-display font-semibold">Entries by Hour</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(148,20%,88%)" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="entries" fill="hsl(152,60%,36%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="mb-4 font-display font-semibold">Current Status</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
            <h3 className="mb-4 font-display font-semibold">Top Visitors</h3>
            <div className="space-y-3">
              {topStudents.map((s, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{s.name}</p>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(s.visits / topStudents[0].visits) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">{s.visits} visits</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
