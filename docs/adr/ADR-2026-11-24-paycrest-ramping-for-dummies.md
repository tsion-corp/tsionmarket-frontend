# ADR for Dummies: Paycrest for adding money from, and cashing out to, a bank

- **Status:** Accepted 2026-11-24
- **Full version:** [ADR-2026-11-24-paycrest-ramping](./ADR-2026-11-24-paycrest-ramping.md)

## The Idea

Paycrest moves money between a user's bank account and their USDC, in both
directions. It becomes the one service behind both bank buttons in the app.

## Cashing Out (USDC → bank)

1. Pick your bank and type your account number. We check it and show the
   name on the account.
2. Type how much USDC to cash out. You see roughly how much naira will
   arrive.
3. Confirm. The app sends the USDC to Paycrest, and Paycrest pays your bank.
   The screen shows when it's paid.

## Adding Money (bank → USDC)

1. Type how much naira to add.
2. Give the bank account you'll pay from. Refunds go back there.
3. Confirm your identity: date of birth and BVN (or NIN). Paycrest requires
   this by law for every deposit.
4. The app shows a bank account number and the exact amount to transfer.
   Once you pay, USDC lands in your wallet.

You must pay from your own account. A transfer from anyone else's account is
sent back.

## Keeping It Safe

- Refunds and USDC can only ever go to your own wallet. Our server decides
  that, not the app in your browser.
- We pass your ID details straight to Paycrest. We don't save them.
- Money is counted exactly, with no rounding mistakes.
- If something goes wrong, one switch puts the old bank screens back.

## What Comes Next

A small real cash-out to confirm everything end to end. After Paycrest has
carried real traffic, we delete the old bank-rail code.
