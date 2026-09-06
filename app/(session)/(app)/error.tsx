"use client";

// The same boundary as the root one, placed inside the group so a crash in a
// product route is caught below the shell: the sidebar, the topbar and the
// tab bar stay up and usable, and "Try again" re-renders only the route. At
// the root the boundary sits above the layout, so a crashing page took the
// whole shell down with it and the user had no navigation left to escape by.
export { default } from "@/app/error";
