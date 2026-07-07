// Heartbeat hook: sends periodic heartbeats to track active users per company.
// Starts when a company is active, stops on logout or company change.

import { useEffect, useRef } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/auth";

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export function useHeartbeat() {
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const token = useAuthStore((s) => s.token);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Don't send heartbeats if not logged in or no company selected
    if (!token || !activeCompanyId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        await api.post("/activity/heartbeat", {
          current_page: window.location.pathname,
        });
      } catch {
        // Silently ignore heartbeat errors
      }
    };

    // Send immediately on company change
    sendHeartbeat();

    // Then every 30 seconds
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeCompanyId, token]);
}
