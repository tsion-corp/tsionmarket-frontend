"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import { truncateAddress } from "@/lib/format";

interface AddressPanelProps {
  address: string;
  // A caution the caller wants read before the address is used, shown right
  // under it where the copy button is; the deposit screen uses it to say
  // what must never be sent there.
  notice?: React.ReactNode;
}

// Deposit address with a QR and a copyable address.
export function AddressPanel({ address, notice }: AddressPanelProps) {
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
      {notice ? (
        <p
          role="alert"
          className="text-down/90 mt-2.5 flex items-start gap-2 text-[12.5px] leading-normal font-medium"
        >
          <span aria-hidden className="mt-px shrink-0">
            ⚠️
          </span>
          <span>{notice}</span>
        </p>
      ) : null}
    </div>
  );
}
