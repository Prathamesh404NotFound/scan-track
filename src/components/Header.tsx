import { Link, useLocation } from "react-router-dom";
import { useAttendance } from "@/store/attendanceContext";
import { BookOpen, Users, BarChart3, WifiOff, Wifi, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function Header() {
  const { isOnline, queueSize, retryQueue } = useAttendance();
  const location = useLocation();

  const links = [
    { to: "/", label: "Dashboard", icon: BookOpen },
    { to: "/admin", label: "Students", icon: Users },
    { to: "/reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-green-600">Library Attendance System</h1>
            <p className="text-xs text-muted-foreground">Scan your ID card to record entry / exit</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link key={to} to={to}>
                <Button
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <AnimatePresence>
            {queueSize > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Button variant="outline" size="sm" onClick={() => retryQueue()} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{queueSize} queued</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <>
                <span className="h-2 w-2 rounded-full bg-success pulse-dot" />
                <Wifi className="h-4 w-4 text-success" />
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-warning pulse-dot" />
                <WifiOff className="h-4 w-4 text-warning" />
              </>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-2 text-green-600 border-green-600 hover:bg-green-50">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
