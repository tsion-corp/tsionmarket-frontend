# ADR for Dummies: Connecting the Support Chat to our AI Assistant

- **Date**: 2026-09-12
- **Topic**: Support Chat Backend Integration

---

### In Plain English: What Are We Doing?

We previously built a beautiful support chat window in the World Street app with formatting tools, file attachments, and quick questions. Right now, it gives simulated canned answers.

We are now connecting it to our real AI support assistant hosted at `https://support.tsionark.com`.

---

### Why Are We Doing This?

Our AI support assistant has been loaded with a complete handbook of World Street knowledge — it knows:

- That World Street is non-custodial (we never hold user funds; users connect their own wallets).
- How trading works with USDC on Base and Solana.
- How to use RWAs, Prediction markets, Earn pools, and Games.

Connecting the chat window to this AI means users get accurate, helpful answers in seconds 24/7.

---

### How Does It Work?

1. The user asks a question in the chat bubble.
2. The app securely sends the message through our backend server (`/api/support-chat`).
3. Our server asks the AI support assistant (`https://support.tsionark.com/api/demo-chat`).
4. The AI returns an instant, knowledgeable answer.
5. The answer appears smoothly in the chat bubble.

---

### What Changes for Users?

- Real AI answers instead of static mock text.
- Clear answers to platform questions (trading, deposits, security, fees).
- Smooth typing animation while the AI thinks.
