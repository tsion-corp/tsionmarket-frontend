"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { useEvmSendBatch, type EvmBatchCall } from "@/hooks/use-evm-send";
import { publicClientForChain } from "@/lib/trade/receipt";
import { getWalletAddress } from "@/lib/user";
import {
  prepareOrder,
  sportsbookKeys,
  submitOrder,
  type Eip712TypedData,
  type SlipSelection,
} from "../api";
import { atomicToDecimal, decimalToAtomic } from "../money";
import {
  BASE_USDC_ADDRESS,
  BASE_WETH_ADDRESS,
  encodeUsdcToWethSwap,
  encodeWethToUsdcSwap,
  quoteUsdcToWeth,
  quoteWethToUsdc,
  SPORTSBOOK_CHAIN_ID,
  UNISWAP_V3_ROUTER_ADDRESS,
} from "../usdc-settlement";

export type PlaceOrderPhase =
  "idle" | "quoting" | "preparing" | "funding" | "signing" | "submitting";

export type RedemptionPhase = "idle" | "preparing" | "quoting" | "redeeming" | "submitting";

function withDomainType(typedData: Eip712TypedData): Eip712TypedData {
  if (typedData.types.EIP712Domain) return typedData;
  return {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...typedData.types,
    },
  };
}

export function usePlaceSportsbookOrder() {
  const [phase, setPhase] = useState<PlaceOrderPhase>("idle");
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const sendEvmBatch = useEvmSendBatch();
  const queryClient = useQueryClient();

  const sign = useCallback(
    async (owner: string, typedData: Eip712TypedData): Promise<string> => {
      const wallet = wallets.find(({ address }) => address.toLowerCase() === owner.toLowerCase());
      if (!wallet) throw new Error("Your embedded wallet is not connected.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      return (await provider.request({
        method: "eth_signTypedData_v4",
        params: [owner as Address, JSON.stringify(withDomainType(typedData))],
      })) as string;
    },
    [wallets]
  );

  const mutation = useMutation({
    mutationFn: async ({
      selections,
      stakeUsdc,
      expectedWeth,
    }: {
      selections: SlipSelection[];
      stakeUsdc: string;
      expectedWeth: string;
    }) => {
      const ownerWallet = getWalletAddress(user, "ethereum");
      const usdcAmount = decimalToAtomic(stakeUsdc, 6);
      if (!ownerWallet) throw new Error("Your Base wallet is not connected.");
      if (!usdcAmount || usdcAmount <= 0n) throw new Error("Enter a valid USDC stake.");
      const owner = ownerWallet as Address;
      const client = publicClientForChain(SPORTSBOOK_CHAIN_ID);

      setPhase("quoting");
      const conversion = await quoteUsdcToWeth(usdcAmount);
      const expectedWethAtomic = decimalToAtomic(expectedWeth, 18);
      if (!expectedWethAtomic || conversion.minimumAmountOut * 100n < expectedWethAtomic * 95n) {
        throw new Error("The USDC conversion rate moved too far. Refresh and try again.");
      }
      const stake = atomicToDecimal(conversion.minimumAmountOut, 18, 18);

      setPhase("preparing");
      const prepared = await prepareOrder({
        selections: selections.map(({ eventId, conditionId, outcomeId }) => ({
          eventId,
          conditionId,
          outcomeId,
        })),
        stake,
        slippageBps: 100,
      });

      if (
        prepared.approval.chainId !== SPORTSBOOK_CHAIN_ID ||
        prepared.approval.token.toLowerCase() !== BASE_WETH_ADDRESS.toLowerCase()
      ) {
        throw new Error("This sportsbook environment cannot accept USDC.");
      }
      if (prepared.ownerWallet.toLowerCase() !== owner.toLowerCase()) {
        throw new Error("The connected wallet does not own this bet.");
      }

      const token = prepared.approval.token as Address;
      const spender = prepared.approval.spender as Address;
      const required = BigInt(prepared.approval.amountAtomic);
      const [wethBalance, sportsbookAllowance] = await Promise.all([
        client.readContract({
          address: BASE_WETH_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        }),
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [owner, spender],
        }),
      ]);

      // A retry after a wallet rejection should use the WETH already converted
      // by the first attempt instead of charging the user's USDC a second time.
      if (wethBalance < required) {
        const [usdcBalance, routerAllowance] = await Promise.all([
          client.readContract({
            address: BASE_USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
          client.readContract({
            address: BASE_USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [owner, UNISWAP_V3_ROUTER_ADDRESS],
          }),
        ]);
        if (usdcBalance < usdcAmount) {
          throw new Error("Your USDC balance is too low for this stake.");
        }
        const calls: EvmBatchCall[] = [];
        if (routerAllowance < usdcAmount) {
          calls.push({
            to: BASE_USDC_ADDRESS,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [UNISWAP_V3_ROUTER_ADDRESS, maxUint256],
            }),
          });
        }
        calls.push({
          to: UNISWAP_V3_ROUTER_ADDRESS,
          data: encodeUsdcToWethSwap(usdcAmount, conversion, owner),
        });
        if (sportsbookAllowance < required) {
          calls.push({
            to: token,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [spender, maxUint256],
            }),
          });
        }

        setPhase("funding");
        await sendEvmBatch(calls, SPORTSBOOK_CHAIN_ID);
        const fundedBalance = await client.readContract({
          address: BASE_WETH_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        if (fundedBalance < required) {
          throw new Error("USDC was converted, but the WETH balance is still below the stake.");
        }
      } else if (sportsbookAllowance < required) {
        setPhase("funding");
        await sendEvmBatch(
          [
            {
              to: token,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [spender, maxUint256],
              }),
            },
          ],
          prepared.approval.chainId
        );
      }

      setPhase("signing");
      const signature = await sign(prepared.ownerWallet, prepared.typedData);
      setPhase("submitting");
      const order = await submitOrder(prepared.ticketId, signature);
      queryClient.setQueryData(sportsbookKeys.order(order.ticketId), order);
      return order;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sportsbookKeys.orders }),
    onSettled: () => setPhase("idle"),
  });

  return { ...mutation, phase };
}

export function useRedeemSportsbookOrder() {
  const [phase, setPhase] = useState<RedemptionPhase>("idle");
  const { user } = usePrivy();
  const sendEvmBatch = useEvmSendBatch();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const ownerWallet = getWalletAddress(user, "ethereum");
      if (!ownerWallet) throw new Error("Your Base wallet is not connected.");
      const owner = ownerWallet as Address;
      const { prepareRedemption, submitRedemption } = await import("../api");

      setPhase("preparing");
      const prepared = await prepareRedemption(ticketId);
      if (
        prepared.transaction.chainId !== SPORTSBOOK_CHAIN_ID ||
        prepared.token.symbol.toUpperCase() !== "WETH" ||
        prepared.token.decimals !== 18
      ) {
        throw new Error("This payout cannot be converted to USDC on Base.");
      }
      const amount = BigInt(prepared.amountAtomic);
      if (amount <= 0n) throw new Error("This ticket has no redeemable payout.");

      setPhase("quoting");
      const conversion = await quoteWethToUsdc(amount);
      const client = publicClientForChain(SPORTSBOOK_CHAIN_ID);
      const routerAllowance = await client.readContract({
        address: BASE_WETH_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, UNISWAP_V3_ROUTER_ADDRESS],
      });
      const calls: EvmBatchCall[] = [];
      if (routerAllowance < amount) {
        calls.push({
          to: BASE_WETH_ADDRESS,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [UNISWAP_V3_ROUTER_ADDRESS, maxUint256],
          }),
        });
      }
      calls.push(
        {
          to: prepared.transaction.to as Address,
          data: prepared.transaction.data as Hex,
          value: BigInt(prepared.transaction.valueAtomic),
        },
        {
          to: UNISWAP_V3_ROUTER_ADDRESS,
          data: encodeWethToUsdcSwap(amount, conversion, owner),
        }
      );

      setPhase("redeeming");
      const hash = await sendEvmBatch(calls, SPORTSBOOK_CHAIN_ID);
      setPhase("submitting");
      await submitRedemption(ticketId, hash);
      return getOrderAfterRedemption(ticketId);
    },
    onSuccess: (order) => {
      queryClient.setQueryData(sportsbookKeys.order(order.ticketId), order);
      void queryClient.invalidateQueries({ queryKey: sportsbookKeys.orders });
    },
    onSettled: () => setPhase("idle"),
  });
  return { ...mutation, phase };
}

async function getOrderAfterRedemption(ticketId: string) {
  const { getOrder } = await import("../api");
  return getOrder(ticketId);
}
