---
date: 2026-09-20
feature: Game sockets reach the live gateway
scope: fix
scenario-impact: none
---

# Chess and Chicken talk to the gateway that is running

Production pinned the chess socket to `wss://ws-staging.tsionark.com` and
ignored `NEXT_PUBLIC_CHESS_WS_URL`. That host now answers 502, so the socket
could not connect at all and reconnected in the background for as long as the
page stayed open. The Chicken socket, new in the same release, copied the pin.

All three game sockets, chess, Chicken and Arkjet, now use the gateway the
deployment names, and fall back to the live gateway rather than the retired
staging host when it names none. A variable set to an empty string counts as
unset.
