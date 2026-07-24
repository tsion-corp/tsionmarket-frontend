"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";

export type NetworkStatus = "online" | "slow" | "offline";

interface NetworkStatusValue {
  status: NetworkStatus;
  online: boolean;
  slow: boolean;
}

const NetworkStatusContext = createContext<NetworkStatusValue>({
  status: "online",
  online: true,
  slow: false,
});

// Consume anywhere: `const { online, slow } = useNetworkStatus()`.
export function useNetworkStatus(): NetworkStatusValue {
  return useContext(NetworkStatusContext);
}

// The Network Information API is Chromium/Android only; where it's absent we
// still get reliable offline/online detection from the window events.
interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function computeStatus(): NetworkStatus {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  const conn = getConnection();
  if (conn) {
    const type = conn.effectiveType;
    if (type === "slow-2g" || type === "2g") return "slow";
    if (conn.saveData) return "slow";
    if (typeof conn.downlink === "number" && conn.downlink > 0 && conn.downlink < 0.6) {
      return "slow";
    }
  }
  return "online";
}

// Toast IDs let us keep the offline notice up until connectivity returns, and
// replace the slow-connection warning rather than stacking duplicates.
const OFFLINE_ID = "network-offline";
const SLOW_ID = "network-slow";

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>("online");
  const prev = useRef<NetworkStatus | null>(null);

  // Track the live status from window + connection events.
  useEffect(() => {
    const update = () => setStatus(computeStatus());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const conn = getConnection();
    conn?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      conn?.removeEventListener?.("change", update);
    };
  }, []);

  // Fire a toast only on a real transition (never on the initial online mount).
  useEffect(() => {
    const before = prev.current;
    if (before === status) return;
    prev.current = status;

    if (status === "offline") {
      toast.error("You're offline. Check your internet connection.", {
        id: OFFLINE_ID,
        duration: Infinity,
      });
    } else if (status === "slow") {
      toast.dismiss(OFFLINE_ID);
      toast.warning("Your connection looks slow. Things may load slowly.", {
        id: SLOW_ID,
        duration: 6000,
      });
    } else {
      toast.dismiss(OFFLINE_ID);
      toast.dismiss(SLOW_ID);
      if (before === "offline") toast.success("Back online.");
      else if (before === "slow") toast.success("Connection restored.");
    }
  }, [status]);

  const value = useMemo<NetworkStatusValue>(
    () => ({ status, online: status !== "offline", slow: status === "slow" }),
    [status]
  );

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}
