---
date: 2026-10-01
feature: The phone account sheet no longer freezes; Help & support opens the chat
scope: fix
scenario-impact: none
---

# Phone account sheet: the freeze, and a dead button

**The freeze.** The phone's account sheet runs two checks when it opens:
can this device add a passkey (`useDevicePasskey`) and can it set an unlock
password (`useUnlockPassword`). Both asked the wallet kit from an effect
that depended on the whole `useSocialWallet()` object. The kit returns a
new object on every render, and each of its methods sets the kit's own
loading state while it runs. So the effect called `hasPasskey()`, the kit
re-rendered, the effect saw a new object and called it again, without
end: a render loop of enclave and storage calls from the moment the sheet
mounted, which is what froze every tap. The desktop account menu does not
use these hooks, which is why only the phone froze.

Both hooks now depend on the kit's individual methods, which the kit
memoises, so each check runs once per session state. A test drives the
hooks with a fake wallet that behaves like the kit (a new object per
render, methods that set state); against the old hooks one test counts a
second call and the other spins until the test times out.

**Help & support** on the sheet only closed it, so it read as a button that
did nothing. It now opens the in-app support chat, as the desktop menu does.
