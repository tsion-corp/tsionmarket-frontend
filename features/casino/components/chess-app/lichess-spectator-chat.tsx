"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionWallet } from "@/components/providers/server-session";
import { CHESS_KEYS } from "@/features/casino/hooks/use-casino-chess";
import {
  fetchMatchChat,
  postMatchChatMessage,
} from "@/features/casino/lib/api/chess";
import type {
  ChessChatMessage,
  ChessMatch,
  ChessPlayer,
} from "@/features/casino/lib/api/types";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { toast } from "@/lib/toast";

// Chat lines arrive through the match socket. REST is only a repair path for a
// missed frame or an unavailable gateway, not a second real-time transport.
const CHAT_POLL_MS = 30_000;
const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

function sameActor(author: string, value: string | null | undefined): boolean {
  return !!value && author.toLowerCase() === value.toLowerCase();
}

function isPlayer(author: string, player: ChessPlayer | null): boolean {
  return !!player && (sameActor(author, player.id) || sameActor(author, player.walletAddress));
}

function authorLabel(author: string, match: ChessMatch, viewer: string | null): string {
  if (sameActor(author, viewer)) return "You";
  if (isPlayer(author, match.white)) return match.white?.username || "White";
  if (isPlayer(author, match.black)) return match.black?.username || "Black";
  return EVM_WALLET.test(author) ? truncateAddress(author) : author;
}

export function LichessSpectatorChat({
  match,
}: {
  match: ChessMatch;
}) {
  const viewer = useSessionWallet("ethereum");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement | null>(null);
  const pinnedRef = useRef(true);

  const chat = useQuery({
    queryKey: CHESS_KEYS.chat(match.id, "spectator"),
    queryFn: () => fetchMatchChat(match.id, { room: "spectator", limit: 100 }),
    retry: false,
    staleTime: CHAT_POLL_MS,
    refetchInterval: CHAT_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const post = useMutation({
    mutationFn: (text: string) => postMatchChatMessage(match.id, "spectator", text),
    onSuccess: (line) => {
      queryClient.setQueryData<ChessChatMessage[]>(
        CHESS_KEYS.chat(match.id, "spectator"),
        (current) => {
          if (current?.some((item) => item.id === line.id)) return current;
          return [...(current ?? []), line].sort((left, right) => left.id - right.id);
        }
      );
    },
  });

  const messages = chat.data ?? [];

  useEffect(() => {
    const list = listRef.current;
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || post.isPending) return;
    if (!viewer) {
      toast.error("Sign in to chat.");
      return;
    }
    try {
      await post.mutateAsync(text);
      pinnedRef.current = true;
      setDraft("");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't send that message."));
    }
  };

  return (
    <>
      <style>{SPECTATOR_CHAT_CSS}</style>
      <ol
        ref={listRef}
        className={`mchat__messages chat-v-${messages.length}`}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        onScroll={(event) => {
          const list = event.currentTarget;
          pinnedRef.current = list.scrollTop + list.clientHeight >= list.scrollHeight - 10;
        }}
      >
        {chat.isLoading ? <li className="system">Loading spectator room...</li> : null}
        {chat.error ? <li className="system">Couldn't load spectator room.</li> : null}
        {!chat.isLoading && !chat.error && messages.length === 0 ? (
          <li className="system">No messages yet.</li>
        ) : null}
        {messages.map((line) => (
          <li key={line.id} className={sameActor(line.author, viewer) ? "me" : undefined}>
            <span className="user-link">{authorLabel(line.author, match, viewer)}</span>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
      <input
        className="mchat__say"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder={viewer ? "Talk in spectator room" : "Sign in to chat"}
        aria-label="Spectator chat input"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={140}
        disabled={!viewer || post.isPending}
      />
    </>
  );
}

const SPECTATOR_CHAT_CSS = `
.mchat[data-ark-spectator-chat="true"]{display:flex;min-height:15em;overflow:hidden;flex-direction:column}
.mchat[data-ark-spectator-chat="true"] .mchat__content{display:flex;min-height:0;flex:1 1 auto;overflow:hidden;flex-direction:column}
.mchat[data-ark-spectator-chat="true"] .mchat__messages{min-height:0;flex:1 1 auto;overflow-y:auto}
.mchat[data-ark-spectator-chat="true"] .mchat__say{display:block;box-sizing:border-box;width:100%;min-height:38px;flex:0 0 38px;border:0;border-top:1px solid var(--c-border);background:var(--c-bg-box);color:var(--c-font);padding:.5rem .65rem;outline:0}
.mchat[data-ark-spectator-chat="true"] .mchat__say::placeholder{color:var(--c-font-dimmer)}
.mchat[data-ark-spectator-chat="true"] .mchat__say:focus{border-top-color:var(--c-primary);box-shadow:inset 0 1px var(--c-primary)}
@media(min-width:1259.3px){
  .round__side:has(>.mchat[data-ark-spectator-chat="true"]){box-sizing:border-box;height:var(---col3-uniboard-width);min-height:0;align-self:start;overflow:hidden}
  .round__side>.mchat[data-ark-spectator-chat="true"]{min-height:0;flex:1 1 auto}
}
`;
