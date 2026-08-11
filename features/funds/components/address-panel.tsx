"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import { truncateAddress } from "@/lib/format";

interface AddressPanelProps {
  address: string;
  tokenSymbol: string;
  chainName: string;
}

// Deposit address with a QR, a copyable address, and a warning about what is
// safe to send.
export function AddressPanel({ address, tokenSymbol, chainName }: AddressPanelProps) {
  const t = useTranslations("fundsFlow");
  return (
    <div>
      <div className="flex justify-center pt-1">
        <QrCode value={address} />
      </div>
      <div className="ws-inset mt-4 flex items-center gap-3 p-3.5">
        <span className="tnum min-w-0 flex-1 text-[13px] font-normal break-all text-white/85">
          {truncateAddress(address)}
        </span>
        <CopyButton value={address} />
      </div>
      <div className="border-accent/25 bg-accent/10 mt-3 rounded-[14px] border px-4 py-3">
        <p className="text-[12.5px] leading-normal font-normal text-white/80">
          {t.rich("sendOnlyWarning", {
            symbol: tokenSymbol,
            chain: chainName,
            strong: (chunks) => <span className="font-semibold text-white">{chunks}</span>,
          })}
        </p>
      </div>
    </div>
  );
}
