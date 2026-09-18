# The wallet balance stops phoning home every minute: the simple version

**Before:** the app re-checked your wallet balance from the blockchain every ~60 seconds, over and over, from every screen that shows a balance — even when nothing had changed. That's a lot of calls for a number that only moves when you do something.

**Now:** the app shows the balance saved on your device **instantly**, and only re-checks the blockchain when the balance can actually have changed:

- you make a transaction (buy, sell, withdraw, fund a game) — already handled,
- a **deposit lands** in your wallet — the app notices and refreshes,
- you tap the **refresh button** on the balance card yourself.

No more checking every minute in the background.

**Why it's safe:** the balance was already being saved on your device and shown first; the only thing that changed is we stopped the constant re-checking behind it. Anything that changes your balance already tells the app to refresh, so the number stays right.

**One thing to know:** if your balance changes in a way the app can't see (for example, you move funds using a completely different app), it won't update on its own — tap the refresh button and it will.

**The Kash+ balance works the same way now too:** it's also saved on your device and shown instantly, and it stopped checking every few minutes in the background. It refreshes when you use Kash (buy, convert, claim), when you open the Kash card, and when you come back to the tab — that last one matters because Kash points turn into KSH once a week on our side, and reopening the app picks that up.

**What doesn't change:** the perps balance behaves exactly as before.
