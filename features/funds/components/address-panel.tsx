"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import { truncateAddress } from "@/lib/format";

interface AddressPanelProps {
  address: string;
}

// Deposit address with a QR and a copyable address.
export function AddressPanel({ address }: AddressPanelProps) {
  return (
    <div data-sensitive="address">
      <div className="flex justify-center pt-1">
        <QrCode value={address} />
      </div>
      <div className="ws-inset mt-4 flex items-center gap-3 p-3.5">
        <span className="tnum min-w-0 flex-1 text-[13px] font-normal break-all text-white/85">
          {truncateAddress(address)}
        </span>
        <CopyButton value={address} />
      </div>
    </div>
  );
}
