"use client";

// The Arkade routes sit outside the (app) group, so until now a render crash
// in a game fell through to the root boundary, which replaces the whole
// page, shell included, with nothing left to navigate by. Placed here the
// boundary catches it below the shell: the sidebar and tab bar stay up, and
// "Try again" re-renders only the game.
export { default } from "@/app/error";
