# /square is the real Square now: the simple version

**Before:** the Square page on www.tsionark.com was a small copy of the Square's home feed. For chat, rooms, houses or profiles you had to go to square.tsionark.com.

**Now:** www.tsionark.com/square shows the real Square app, the same one as square.tsionark.com, without leaving www.

**How:** when someone opens `/square`, this app quietly fetches that page from the Square's own deployment and serves it on www. The address bar stays www.tsionark.com/square.

**What doesn't change:** square.tsionark.com stays exactly as it was. The rest of Ark (Portfolio, Market, Meme, Arkade…) is untouched.

**One thing to know:** going from an Ark page to Square, or back, loads a fresh page instead of switching instantly, because they are two apps. The shared Ark navigation bar being built now makes that feel like one site. Until then, Square shows a "Back to Ark" button.

**Setting it up:** the wsws Vercel project needs `SQUARE_ZONE_URL` set to the Square's Ark deployment (https://square-ark.vercel.app).
