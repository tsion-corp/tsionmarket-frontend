"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { NetworkTabs } from "@/components/dashboard/funds/network-tabs";
import { TokenList } from "@/components/dashboard/funds/token-list";
import { AddressPanel } from "@/components/dashboard/funds/address-panel";
import {
  isRetryableDextopusError,
  useDepositChains,
  useDepositTokens,
  useEligibleOriginChainIds,
  useStaticDepositAddress,
} from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import { originFamily, refundChainType } from "@/lib/deposit-catalog";
import {
  depositMinimumUsd,
  SETTLE_CHAINS,
  type DepositChain,
  type DepositToken,
  type StaticAddressRequest,
} from "@/lib/deposit";

interface CryptoDepositScreenProps {
  onBack: () => void;
}

// Deposits always settle to USDC on Base, so every user gets one deposit
// address per origin token regardless of which chain they send from.
const settle = SETTLE_CHAINS.base;

export function CryptoDepositScreen({ onBack }: CryptoDepositScreenProps) {
  const { user } = usePrivy();
  const { refetch } = usePortfolio();

  const [originChain, setOriginChain] = useState<DepositChain | null>(null);
  const [originToken, setOriginToken] = useState<DepositToken | null>(null);

  const chains = useDepositChains();
  const eligibleChains = useEligibleOriginChainIds();
  const tokens = useDepositTokens(originChain?.chainId ?? null);

  const settlementAddress = getWalletAddress(user, settle.chainType);

  // A static address needs a refund address on the origin's own VM family. The
  // network picker already hides families we cannot refund, so this resolves for
  // every offerable origin.
  const family = originChain ? originFamily(originChain.chainId) : null;
  const refundType = family ? refundChainType(family) : null;
  const refundTo = refundType ? getWalletAddress(user, refundType) : null;

  const req: StaticAddressRequest | null =
    user?.id && originChain && originToken && settlementAddress && refundTo
      ? {
          userId: user.id,
          originChainId: originChain.chainId,
          originAsset: originToken.address,
          settlementChainId: settle.chainId,
          settlementAsset: settle.usdc,
          settlementAddress,
          refundTo,
        }
      : null;

  const staticAddr = useStaticDepositAddress(req);

  const resetToken = () => setOriginToken(null);

  // Address view: a token is picked and its permanent address has been minted.
  if (originToken && originChain && staticAddr.data) {
    const minimum = depositMinimumUsd(originChain);
    return (
      <div>
        <SheetNav
          title="Your deposit address"
          subtitle={`Send ${originToken.symbol} on ${originChain.name}. It arrives as USDC on ${settle.chainName}.`}
          onBack={onBack}
        />
        <AddressPanel
          address={staticAddr.data.depositAddress}
          tokenSymbol={originToken.symbol}
          chainName={originChain.name}
        />
        <div className="border-down/25 bg-down/10 mt-3 rounded-[14px] border px-4 py-3">
          <p className="text-[12.5px] leading-[1.5] font-normal text-white/80">
            Only send <span className="font-semibold text-white">{originToken.symbol}</span> on{" "}
            {originChain.name} to this address. Any other asset, including{" "}
            {originChain.nativeSymbol || "the network's gas token"}, will not convert to USDC and may
            not be recoverable.
          </p>
        </div>
        <div className="ws-inset mt-3 flex items-center justify-between px-4 py-3 text-[12.5px] font-normal">
          <span className="text-white/55">Minimum deposit</span>
          <span className="tnum text-white/85">About ${minimum}</span>
        </div>
        <div className="border-accent/20 bg-accent/8 mt-3 rounded-[14px] border px-4 py-3">
          <p className="text-[12.5px] leading-[1.5] font-normal text-white/80">
            This address is permanent. Send to it any time and the funds land as USDC in your wallet
            automatically, usually within a minute.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="mt-3 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          Refresh balance
        </button>
        <button
          onClick={resetToken}
          className="mt-2 w-full cursor-pointer rounded-[14px] p-2.5 font-sans text-[13px] font-medium text-white/60 hover:text-white"
        >
          Deposit a different token
        </button>
      </div>
    );
  }

  // Picker view: choose where to settle, then origin network + token.
  return (
    <div>
      <SheetNav
        title="Deposit crypto"
        subtitle="Send from almost any chain. It arrives as USDC in your wallet."
        onBack={onBack}
      />

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-xs font-normal text-white/55">From network</div>
          <NetworkTabs
            chains={chains.data ?? []}
            eligibleChainIds={eligibleChains.data ?? new Set()}
            selectedId={originChain?.chainId ?? null}
            onSelect={(c) => {
              setOriginChain(c);
              setOriginToken(null);
            }}
            loading={chains.isPending || eligibleChains.isPending}
            error={chains.isError || eligibleChains.isError}
            onRetry={() => {
              chains.refetch();
              eligibleChains.refetch();
            }}
          />
        </div>

        {originChain ? (
          <div>
            <div className="mb-2 text-xs font-normal text-white/55">Token to send</div>
            <TokenList
              tokens={tokens.data ?? []}
              selectedAddress={originToken?.address ?? null}
              onSelect={setOriginToken}
              loading={tokens.isPending}
              error={tokens.isError}
              onRetry={() => tokens.refetch()}
            />
          </div>
        ) : null}

        {req && staticAddr.isPending ? (
          <div className="py-4 text-center text-[13px] font-normal text-white/55">
            Creating your deposit address…
          </div>
        ) : null}

        {req && staticAddr.isError ? (
          <div className="text-down text-[13px] font-normal">
            {staticAddr.error.message}{" "}
            {isRetryableDextopusError(staticAddr.error) ? (
              <button
                onClick={() => staticAddr.refetch()}
                className="text-accent cursor-pointer underline"
              >
                Try again
              </button>
            ) : (
              <button onClick={resetToken} className="text-accent cursor-pointer underline">
                Choose a different token
              </button>
            )}
          </div>
        ) : null}

        {originToken && !settlementAddress ? (
          <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
            You need a {settle.chainName} wallet to receive there. Pick another settlement network.
          </div>
        ) : null}

        {originToken && settlementAddress && !refundTo ? (
          <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
            Deposits from {originChain?.name} need a {refundType === "solana" ? "Solana" : "wallet"}{" "}
            address on your account for refunds. Pick another network to continue.
          </div>
        ) : null}
      </div>
    </div>
  );
}
