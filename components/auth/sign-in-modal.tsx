"use client";

import { useCallback } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { closeSignIn } from "@/hooks/use-sign-in";

export function SignInModal() {
  const onSignedIn = useCallback(() => closeSignIn(), []);
  return (
    <ModalShell open onClose={closeSignIn}>
      <SignInPanel variant="modal" onSignedIn={onSignedIn} />
    </ModalShell>
  );
}
