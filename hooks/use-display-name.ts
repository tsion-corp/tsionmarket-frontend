"use client";

import { useAuthSession } from "@/hooks/use-auth-session";
import { useArkName } from "@/hooks/use-ark-name";

// What the shell calls the person. An Ark ID is the identity people hand out,
// so it takes the place of the profile name once the wallet holds one; until
// then, and while the lookup is still answering, the profile name stands.
export function useDisplayName(): string {
  const { profile, evmAddress } = useAuthSession();
  return useArkName(evmAddress) ?? profile.name;
}
