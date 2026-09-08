---
title: KASH Send hidden, deposit address warns against KASH+
date: 2026-09-08
area: portfolio
scenario-impact: none
---

# Release Note: KASH Send hidden, and the deposit address warns against KASH+

## What changed

The Send button is off the KASH card on the dashboard; Buy and Convert stay.
The send modal and its wiring remain in the codebase, only the door is gone,
so restoring it is one button. The card's `onSend` prop is dropped with it.

## Also

The crypto deposit screen shows a warning directly under the Dextopus
deposit address: "Do not send KASH+ to this address." The address panel gained an optional `notice` slot for it, and the
copy exists in all five locales.
