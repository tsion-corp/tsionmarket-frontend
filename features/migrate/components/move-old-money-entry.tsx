"use client";

import { useTranslations } from "next-intl";
import { WalletIcon } from "@/components/ui/icons";
import { openMigration } from "@/features/migrate/lib/migration-card-store";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { useLegacyWalletFunds } from "@/features/migrate/hooks/use-legacy-wallet-funds";
import { useLegacyAccount } from "@/features/migrate/hooks/use-legacy-account";
import { useLocalPrivyHistory } from "@/features/migrate/lib/visibility";

// The row on its own, with what the tap does left to the caller.
export function MoveOldMoneyButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className: string;
}) {
  const t = useTranslations("migrate");
  const status = useMigrationStatus();
  const linked = status.data?.linked === true;
  // The device's own Privy keys. Synchronous, so a returning legacy user sees
  // the door immediately rather than after a round trip.
  const localHistory = useLocalPrivyHistory();
  // The directory. Skipped for an account already known linked — it exists to
  // spot a legacy account we have NOT linked yet.
  const legacy = useLegacyAccount(!linked);
  // The frontend's own read of the old wallet when it has one (every token,
  // not the service's ETH-and-USDC probe), else the service's figure.
  const wallet = useLegacyWalletFunds(status.data?.legacy ?? null, linked);
  const left = wallet.data?.usd ?? (status.data?.hasLegacyFunds ? status.data.legacyFundsUsd : 0);

  /*
    Who this door is for.

    It is the always-open way back to an old account — challenge windows,
    keeper fills and late bank deposits can leave something there long after
    the balance-card offer is gone. But that is a sentence about people who
    HAD an old account. Somebody who signed up on Market 2.0 has nothing
    behind this row, and offering it tells them they have unfinished business
    they have never had.

    So it needs a positive reason to appear, rather than appearing by default.
    In order of authority, which is the same order offerMigration uses:

      1. Linked — they demonstrably had one. Nothing outranks this.
      2. The directory answered DEFINITELY NO — hide, whatever else says.
         Those `privy:` keys belong to the BROWSER, not the person: somebody
         else used this machine with the old app, and the new owner of the
         session must not be told they have an account to finish moving.
      3. The directory found them, or this device carries the old app's keys
         and the directory has not ruled it out.

    Nothing showing while the directory is still answering is deliberate — a
    row that appears a moment late for a legacy user on a new device is better
    than one that appears for everybody and then vanishes.
  */
  const knownAbsent = legacy.certain && !legacy.has;
  if (!linked && (knownAbsent || (!localHistory && !legacy.has))) return null;

  return (
    <button onClick={onClick} className={`${className} text-white`}>
      <WalletIcon size={20} />
      <span className="min-w-0 flex-1 truncate">{t("entry")}</span>
      {left > 0 ? (
        <span className="tnum bg-accent/20 text-accent shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
          {t("entryBadge")}
        </span>
      ) : null}
    </button>
  );
}

// The always-available door into the migration, for the Account modal. It
// never retires: challenge windows, keeper fills and late bank deposits can
// leave money in the old wallet long after the balance-card button is gone.
// The row plus the door: it opens the one card, which lives on the session,
// so the caller's own tree may come down behind it.
export function MoveOldMoneyEntry({ className }: { className: string }) {
  return (
    <MoveOldMoneyButton onClick={() => openMigration("account_modal")} className={className} />
  );
}
