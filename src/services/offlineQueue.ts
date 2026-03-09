import type { OfflineQueueItem } from "@/types/models";
import { postScan } from "./api";

const QUEUE_KEY = "lib-attendance-offline-queue";

function getQueue(): OfflineQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineQueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function addToQueue(barcode: string) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    barcode,
    timestamp: new Date().toISOString(),
    retries: 0,
  });
  saveQueue(queue);
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function getQueueItems(): OfflineQueueItem[] {
  return getQueue();
}

export async function processQueue(): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  const remaining: OfflineQueueItem[] = [];
  let processed = 0;

  for (const item of queue) {
    try {
      await postScan(item.barcode);
      processed++;
    } catch (err: any) {
      item.retries++;
      if (item.retries < 5) {
        remaining.push(item);
      }
    }
  }

  saveQueue(remaining);
  return processed;
}

export function clearQueue() {
  saveQueue([]);
}
