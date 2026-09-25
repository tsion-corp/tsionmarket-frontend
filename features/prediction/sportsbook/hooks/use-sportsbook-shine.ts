"use client";

import { useEffect, useRef } from "react";
import { reportShine } from "@/lib/shine";
import type { SportsbookOrder } from "../api";
import { observeSportsbookOrder } from "../shine";

type Observed = SportsbookOrder | readonly SportsbookOrder[] | null | undefined;

function asList(orders: Observed): readonly SportsbookOrder[] {
  if (!orders) return [];
  return Array.isArray(orders) ? orders : [orders as SportsbookOrder];
}

/**
 * What the ticket poll and the ticket history hand to Shine.
 *
 * The attachment point is deliberately not "every render where the status is
 * X". React Query serves a new object on every refetch — `useSportsbookOrder`
 * polls, and `useSportsbookOrderHistory` refetches on window focus — so a
 * render-time report would fire on each of them. The effect is keyed to a
 * signature of what could possibly change the answer, so it runs when a ticket
 * actually moves and not when the same row arrives again.
 *
 * The rest of the defence is elsewhere: ../shine reports nothing from a state
 * it did not watch a ticket enter and nothing about an old settlement, its
 * session memory holds across a remount, and the durable dedup store behind
 * reportShine holds across a reload.
 */
export function useSportsbookShine(orders: Observed): void {
  const list = asList(orders);
  const signature = list
    .map((order) => `${order.ticketId}:${order.status}:${order.payoutAtomic ?? ""}`)
    .join("|");

  // Held in a ref rather than depended on: the array identity changes on every
  // render, and the signature above is what decides. The ref is written in its
  // own effect, which commits before the one below it, so the rows read there
  // are always this render's.
  const latest = useRef<readonly SportsbookOrder[]>([]);
  useEffect(() => {
    latest.current = list;
  });

  useEffect(() => {
    for (const order of latest.current) {
      for (const event of observeSportsbookOrder(order)) reportShine(event);
    }
  }, [signature]);
}
