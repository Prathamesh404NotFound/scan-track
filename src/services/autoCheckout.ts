import { database, ref, get, update } from "@/lib/firebase";
import { getCurrentlyInside, clearCache } from "./scanHandler";
import type { CacheEntry } from "./scanHandler";

interface AutoCheckoutResult {
  success: boolean;
  message: string;
  checkedOutUsers: Array<{
    name: string;
    barcode: string;
    entryTime: string;
    exitTime: string;
  }>;
}

// Service to handle automatic checkout at 5 PM
class AutoCheckoutService {
  private attendanceRef = ref(database, "attendance");
  private readonly CHECKOUT_TIME = "17:00"; // 5 PM in 24-hour format
  private isRunning = false;
  private scheduledJob: NodeJS.Timeout | null = null;

  // Check if it's time to run auto-checkout (5 PM)
  private isCheckoutTime(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Run at exactly 5:00 PM
    return currentHour === 17 && currentMinute === 0;
  }

  // Get all users currently inside from cache
  private getUsersToCheckout(): Map<string, Omit<CacheEntry, 'timer'>> {
    return getCurrentlyInside();
  }

  // Perform automatic checkout for all active users
  async performAutoCheckout(): Promise<AutoCheckoutResult> {
    if (this.isRunning) {
      return {
        success: false,
        message: "Auto checkout already in progress",
        checkedOutUsers: []
      };
    }

    this.isRunning = true;
    const now = new Date().toISOString();
    const usersToCheckout = this.getUsersToCheckout();
    const checkedOutUsers: Array<{
      name: string;
      barcode: string;
      entryTime: string;
      exitTime: string;
    }> = [];

    console.log(`🕐 Starting auto-checkout at ${now} for ${usersToCheckout.size} users`);

    try {
      // Process each user in cache
      for (const [key, entry] of usersToCheckout.entries()) {
        try {
          // Update database record with exit time
          const recordRef = ref(database, `attendance/${entry.attendanceId}`);
          await update(recordRef, { ExitTime: now });

          checkedOutUsers.push({
            name: entry.name,
            barcode: entry.barcode,
            entryTime: entry.entryTime,
            exitTime: now
          });

          console.log(`✅ Auto-checkout: ${entry.name} (${entry.barcode})`);
        } catch (error) {
          console.error(`❌ Failed to checkout ${entry.name}:`, error);
        }
      }

      // Also check for any database records that might not be in cache
      await this.checkAndCheckoutDatabaseRecords(now, checkedOutUsers);

      // Clear cache after successful checkout
      clearCache();

      const message = checkedOutUsers.length > 0
        ? `Auto-checkout completed for ${checkedOutUsers.length} users at 5 PM`
        : "No users were inside at 5 PM";

      console.log(`🎯 ${message}`);

      return {
        success: true,
        message,
        checkedOutUsers
      };

    } catch (error) {
      console.error("❌ Auto checkout failed:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Auto checkout failed",
        checkedOutUsers
      };
    } finally {
      this.isRunning = false;
    }
  }

  // Check database for any open records that might not be in cache
  private async checkAndCheckoutDatabaseRecords(
    exitTime: string,
    checkedOutUsers: Array<{
      name: string;
      barcode: string;
      entryTime: string;
      exitTime: string;
    }>
  ): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const snapshot = await get(this.attendanceRef);
      const attendanceData = snapshot.val() || {};

      for (const [key, value] of Object.entries(attendanceData)) {
        const record = value as any;
        const isSameDay = record.EntryTime && record.EntryTime.startsWith(today);
        const notExited = record.ExitTime === null || record.ExitTime === "-" || record.ExitTime === "";

        if (isSameDay && notExited) {
          // Check if this user is already processed from cache
          const alreadyProcessed = checkedOutUsers.some(user => user.barcode === record.Barcode);
          
          if (!alreadyProcessed) {
            try {
              const recordRef = ref(database, `attendance/${key}`);
              await update(recordRef, { ExitTime: exitTime });

              checkedOutUsers.push({
                name: record.Name,
                barcode: record.Barcode,
                entryTime: record.EntryTime,
                exitTime
              });

              console.log(`✅ DB auto-checkout: ${record.Name} (${record.Barcode})`);
            } catch (error) {
              console.error(`❌ Failed to DB checkout ${record.Name}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("❌ Database check failed:", error);
    }
  }

  // Start the scheduled auto-checkout service
  startScheduledCheckout(): void {
    if (this.scheduledJob) {
      clearInterval(this.scheduledJob);
    }

    console.log("🚀 Starting scheduled auto-checkout service");

    // Check every minute
    this.scheduledJob = setInterval(async () => {
      if (this.isCheckoutTime()) {
        console.log("⏰ It's 5 PM - triggering auto-checkout");
        await this.performAutoCheckout();
      }
    }, 60000); // Check every minute

    // Also check immediately in case it's already 5 PM
    if (this.isCheckoutTime()) {
      console.log("⏰ It's currently 5 PM - triggering immediate auto-checkout");
      this.performAutoCheckout();
    }
  }

  // Stop the scheduled service
  stopScheduledCheckout(): void {
    if (this.scheduledJob) {
      clearInterval(this.scheduledJob);
      this.scheduledJob = null;
      console.log("⏹️ Auto-checkout service stopped");
    }
  }

  // Manual trigger for testing
  async triggerManualCheckout(): Promise<AutoCheckoutResult> {
    console.log("🔧 Manual auto-checkout triggered");
    return await this.performAutoCheckout();
  }

  // Get status of the service
  getStatus(): {
    isRunning: boolean;
    isScheduled: boolean;
    checkoutTime: string;
    usersCurrentlyInside: number;
  } {
    return {
      isRunning: this.isRunning,
      isScheduled: this.scheduledJob !== null,
      checkoutTime: this.CHECKOUT_TIME,
      usersCurrentlyInside: getCurrentlyInside().size
    };
  }
}

// Export singleton instance
const autoCheckoutService = new AutoCheckoutService();

export default autoCheckoutService;

// Export types and functions
export type { AutoCheckoutResult };
export { AutoCheckoutService };
