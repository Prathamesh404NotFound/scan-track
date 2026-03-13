import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, CheckCircle, AlertCircle, Play, Square } from "lucide-react";
import autoCheckoutService, { type AutoCheckoutResult } from "@/services/autoCheckout";
import { toast } from "sonner";

export default function AutoCheckoutManager() {
  const [status, setStatus] = useState(autoCheckoutService.getStatus());
  const [lastResult, setLastResult] = useState<AutoCheckoutResult | null>(null);
  const [isManualCheckout, setIsManualCheckout] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(autoCheckoutService.getStatus());
    };

    // Update status every 30 seconds
    const interval = setInterval(updateStatus, 30000);
    
    // Initial update
    updateStatus();

    return () => clearInterval(interval);
  }, []);

  const handleManualCheckout = async () => {
    setIsManualCheckout(true);
    try {
      const result = await autoCheckoutService.triggerManualCheckout();
      setLastResult(result);
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      
      // Update status after manual checkout
      setTimeout(() => setStatus(autoCheckoutService.getStatus()), 1000);
    } catch (error) {
      toast.error("Manual checkout failed");
      console.error("Manual checkout error:", error);
    } finally {
      setIsManualCheckout(false);
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
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" />
          Auto Checkout Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{status.checkoutTime}</div>
            <div className="text-xs text-muted-foreground">Checkout Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{status.usersCurrentlyInside}</div>
            <div className="text-xs text-muted-foreground">Currently Inside</div>
          </div>
          <div className="text-center">
            <Badge variant={status.isScheduled ? "default" : "secondary"}>
              {status.isScheduled ? "Active" : "Inactive"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">Service Status</div>
          </div>
          <div className="text-center">
            <Badge variant={status.isRunning ? "destructive" : "default"}>
              {status.isRunning ? "Running" : "Idle"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">Operation</div>
          </div>
        </div>

        {/* Manual Controls */}
        <div className="flex gap-2">
          <Button
            onClick={handleManualCheckout}
            disabled={isManualCheckout || status.isRunning}
            className="flex items-center gap-2"
          >
            {isManualCheckout ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Manual Checkout
              </>
            )}
          </Button>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className={`p-4 rounded-lg border ${
            lastResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {lastResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span className={`font-medium ${
                lastResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {lastResult.message}
              </span>
            </div>
            
            {lastResult.checkedOutUsers.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">
                  Checked Out Users ({lastResult.checkedOutUsers.length}):
                </div>
                <div className="space-y-1">
                  {lastResult.checkedOutUsers.map((user, index) => (
                    <div key={index} className="text-xs bg-white p-2 rounded border">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-muted-foreground">{user.barcode}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground mt-1">
                        <span>In: {formatTime(user.entryTime)}</span>
                        <span>Out: {formatTime(user.exitTime)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Auto Checkout Information</span>
          </div>
          <ul className="space-y-1 text-xs">
            <li>• Automatically checks out all users at exactly 5:00 PM daily</li>
            <li>• Checks both cache and database for active users</li>
            <li>• Clears cache after successful checkout</li>
            <li>• Manual checkout available for testing or emergency use</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
