"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { FundsModal as FundsSheet } from "@/features/funds/components/funds-modal";
import { closeFundsModal } from "@/hooks/use-funds-modal";

export function FundsModal() {
  return (
    <ModalShell open onClose={closeFundsModal} size="lg">
      <FundsSheet onClose={closeFundsModal} />
    </ModalShell>
  );
}
