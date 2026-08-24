"use client";

// First-visit flag for the dashboard walkthrough, plus the replay handoff the
// account menu uses when it has to route to the dashboard first. Mirrors
// lib/preferences.ts: storage can be unavailable, and losing the flag only
// means seeing the tour once more.

const SEEN_KEY = "ws.tour.dashboard.v1";
const REPLAY_KEY = "ws.tour.replay.v1";

// Defaults to "seen" when storage is unreadable, so a broken private-mode
// session is never greeted by a tour on every single visit.
export function hasSeenDashboardTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markDashboardTourSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to do: without storage the tour simply reappears next visit.
  }
}

export function requestTourReplay(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(REPLAY_KEY, "1");
  } catch {
    // The replay was asked for from another page; without storage the user
    // lands on the dashboard without the tour and can ask again there.
  }
}

export function consumeTourReplay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const requested = window.sessionStorage.getItem(REPLAY_KEY) === "1";
    if (requested) window.sessionStorage.removeItem(REPLAY_KEY);
    return requested;
  } catch {
    return false;
  }
}
