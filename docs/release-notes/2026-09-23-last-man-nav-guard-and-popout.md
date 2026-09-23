---
date: 2026-09-23
feature: The leaving prompt reaches the desktop sidebar, and the pop-out can no longer fail silently
scope: fix
scenario-impact: none
---

# Leaving a live round asks everywhere, and answering yes always gives you something

Two defects from the previous round of fixes, both found in production.

The desktop sidebar never asked. Its entries are buttons, not links, so the
click listener that catches links had nothing to catch, and the guard had only
been wired into the phone's tab bar. Both go through the same hook, so that is
where the question now lives: the sidebar, the tab bar and the voice commands
all ask through it.

Answering "yes, keep it with me" could then leave the player with nothing at
all. The floating video needs offscreen surfaces the host mounts, and it was
mounting them only when it had last read the viewport as a touch one, so a
window that became narrow after loading had none. The open then returned as
though it had succeeded, which meant even the fallback never ran. The document
pop-out had the same shape, and on failure cleared itself without offering
anything in its place.

- The offscreen surfaces are always mounted. They cost nothing at zero size,
  and nothing about them now depends on when the viewport was last read.
- Both pop-out tiers report a failure instead of returning quietly, and both
  fall back to the in-app overlay card, which is the one surface a browser
  cannot refuse.
- The game page drops the paragraph explaining the rules under its title. The
  page has a How it works tab, and anybody in a live round already knows.
