"use client";

import { SupportChatWidget } from "@/components/layout/support-chat/support-chat-widget";

// The classic bottom-right floating support entry, now upgraded to an in-app
// interactive rich-text support chat widget. On a phone it sits above
// the floating tab bar; under every overlay (modals, drawers) so it never
// covers a flow.
export function SupportButton() {
  return <SupportChatWidget />;
}
