# ADR for Dummies: Paying Base fees through Pimlico

- **Status:** Accepted 2026-11-24
- **Full version:** [ADR-2026-11-24-base-sponsorship-via-pimlico](./ADR-2026-11-24-base-sponsorship-via-pimlico.md)

## The Idea

When users buy, sell or send on Base, we pay the network fee for them. Until
now we paid through Alchemy, which costs too much. Now we pay through
Pimlico, which charges the actual fee plus 10% with no monthly minimum.

## What Users Notice

Nothing. Base actions stay free for them.

## What We Must Do

- Keep the Pimlico account funded.
- Set the Pimlico key on the server (`PIMLICO_API_KEY`).

If the account runs dry, Base actions fail until it's topped up. In an
emergency we can switch Base to "users pay their own fee", which the app
already handles.
