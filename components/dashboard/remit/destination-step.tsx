"use client";

import { useTranslations } from "next-intl";
import { CountryPicker } from "@/components/dashboard/remit/country-picker";
import { useCorridors } from "@/hooks/use-offramp";
import { liveCountryCodes } from "@/lib/payment/offramp";
import { WalletIcon, BankIcon } from "@/components/ui/icons";
import {
  defaultMethod,
  type PayoutCountry,
  type PayoutMethodId,
  type MobileNetwork,
} from "@/lib/cross-border";

interface DestinationStepProps {
  country: PayoutCountry | null;
  method: PayoutMethodId | null;
  network: MobileNetwork | null;
  onCountry: (country: PayoutCountry) => void;
  onMethod: (method: PayoutMethodId) => void;
  onNetwork: (network: MobileNetwork) => void;
  onNext: () => void;
}

const METHOD_ICON: Record<PayoutMethodId, React.ReactNode> = {
  mobile_money: <WalletIcon size={18} />,
  bank: <BankIcon size={18} />,
};

// Step 1: pick the destination country, then the payout rail, then (for mobile
// money) the network. Selecting a country auto-selects its default method so the
// common path is one tap fewer.
export function DestinationStep({
  country,
  method,
  network,
  onCountry,
  onMethod,
  onNetwork,
  onNext,
}: DestinationStepProps) {
  const t = useTranslations("remit");
  // Only corridors the payout rail is live for are offered; the static list is
  // the catalogue, the rail's own corridor list is the truth.
  const corridors = useCorridors();
  const allowed = corridors.data ? liveCountryCodes(corridors.data) : null;
  const handleCountry = (c: PayoutCountry) => {
    onCountry(c);
    onMethod(defaultMethod(c));
  };

  const showNetworks = method === "mobile_money" && (country?.networks.length ?? 0) > 0;
  const ready = country != null && method != null && (!showNetworks || network != null);

  return (
    <div>
      <div className="ws-display text-[24px] tracking-[-0.01em]">{t("sendMoney")}</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
        {t("sendMoneySubtitle")}
      </p>

      <div className="mt-[18px] space-y-4">
        <div>
          <div className="mb-2 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
            {t("destination")}
          </div>
          <CountryPicker selected={country} onSelect={handleCountry} allowed={allowed} />
        </div>

        {country ? (
          <div>
            <div className="mb-2 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
              {t("payoutMethod")}
            </div>
            <div className="flex flex-col gap-2">
              {country.methods.map((m) => {
                const active = method === m;
                return (
                  <button
                    key={m}
                    onClick={() => onMethod(m)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors ${
                      active
                        ? "border-accent/45 bg-accent/12"
                        : "border-white/10 bg-white/4 hover:bg-white/8"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ${
                        active ? "bg-accent/20 text-accent" : "bg-white/8 text-white/60"
                      }`}
                    >
                      {METHOD_ICON[m]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-sans text-[14px] font-medium text-white">
                        {t(`method_${m}`)}
                      </span>
                      <span className="block text-[12px] font-normal text-white/50">
                        {t(`methodSub_${m}`)}
                      </span>
                    </span>
                    <span
                      className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                        active ? "border-accent bg-accent" : "border-white/25"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showNetworks ? (
          <div>
            <div className="mb-2 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
              {t("network")}
            </div>
            <div className="flex flex-wrap gap-2">
              {country!.networks.map((n) => {
                const active = network?.id === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => onNetwork(n)}
                    className={`cursor-pointer rounded-full border px-3.5 py-2 font-sans text-[13px] font-medium transition-colors ${
                      active
                        ? "border-accent/50 bg-accent/16 text-white"
                        : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {n.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <button
        onClick={onNext}
        disabled={!ready}
        className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("continue")}
      </button>
    </div>
  );
}
