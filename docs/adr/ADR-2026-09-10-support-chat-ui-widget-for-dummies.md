# ADR-2026-09-10: In-App Support Chat with Rich Text & File Attachments (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-10, waiting for maintainer approval.

## The Problem

Right now, when a user clicks the floating Support button with the cute mascot in the bottom corner of the app, it redirects them away from the platform to an external Google Form. When users run into a transaction issue, need help depositing funds, or want to report a glitch, leaving the trading screen to fill out a form creates friction and slows down resolutions. Users also cannot easily paste formatted transaction logs or drop screenshots directly.

## What We Are Building

We are introducing an interactive, modern in-app Support Chat widget:

1. **Stays On Page**: Clicking the support avatar smoothly opens an elegant dark-mode chat window directly on the screen without navigating away or losing trading state.
2. **Rich Text Support**: Messages can format text with **bold**, _italics_, `code blocks` for transaction hashes, bullet points, and clickable links. A handy toolbar helps users style text with one tap.
3. **Screenshots & File Attachments**: Users can drag-and-drop or select images and logs. They see a thumbnail preview before sending, and can click any sent screenshot to zoom in.
4. **Mobile Friendly**: On smartphones, the widget slides up like a clean native app sheet that fits comfortably above the bottom navigation bar and respects safe areas.
5. **Instant Help & FAQ Chips**: Users get instant suggestions (like "Deposit help", "Trade status", "Bug report") to get quick assistance right away.
6. **5 Languages Supported**: All chat controls, tooltips, and default greetings are translated into English, German, Spanish, French, and Portuguese.

## What Changes For Users

- Clicking the Support button opens an instant chat window instead of a new browser tab.
- Faster, clearer communication with image sharing and rich formatting.
- Users never lose context on their active trades or dashboard screens.

## What Does Not Change

- The friendly floating mascot button stays in the same familiar bottom-right corner.
- The app remains ultra-fast with no heavy external chat scripts loaded.
