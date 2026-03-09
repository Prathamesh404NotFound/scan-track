import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, UserCheck } from "lucide-react";
import { getCurrentlyInside, getCacheStats, type CacheEntry } from "@/services/scanHandler";

export default function LiveStatusPanel() {
  const [currentlyInside, setCurrentlyInside] = useState<Map<string, Omit<CacheEntry, 'timer'>>>(new Map());
  const [stats, setStats] = useState({ size: 0, entries: [] });

  useEffect(() => {
    const updateStatus = () => {
      try {
        const inside = getCurrentlyInside();
        const cacheStats = getCacheStats();
        setCurrentlyInside(inside);
        setStats(cacheStats);
      } catch (error) {
        console.error('Error updating live status:', error);
      }
    };

    // Initial update
    updateStatus();

    // Update every 30 seconds
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const formatEntryTime = (entryTime: string) => {
    try {
      const date = new Date(entryTime);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return entryTime;
    }
  };

  const calculateDuration = (entryTime: string) => {
    try {
      const entry = new Date(entryTime);
      const now = new Date();
      const diffMs = now.getTime() - entry.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (diffHours > 0) {
        return `${diffHours}h ${diffMins}m`;
      }
      return `${diffMins}m`;
    } catch {
      return "Unknown";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Currently Inside ({stats.size})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.size === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No one is currently inside</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(currentlyInside.entries()).map(([key, entry]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-sm text-muted-foreground">{entry.barcode}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatEntryTime(entry.entryTime)}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {calculateDuration(entry.entryTime)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
