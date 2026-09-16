"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Avatar } from "@/components/ui/avatar";
import { useArkjetChat } from "@/features/casino/hooks/use-arkjet-chat";
import type { ArkjetChatMessage } from "@/features/casino/lib/api/arkjet";
import { toast } from "@/lib/toast";
import styles from "./arkjet.module.css";

const MAX_LENGTH = 160;
const EMOJIS = [
  ["😁", "grin"],
  ["😍", "love"],
  ["😜", "playful"],
  ["😌", "relieved"],
  ["😢", "sad"],
  ["😰", "nervous"],
  ["😮", "surprised"],
  ["😤", "determined"],
  ["😴", "sleep"],
  ["😀", "smile"],
  ["😘", "kiss"],
  ["😝", "tongue"],
  ["😂", "laugh"],
  ["😱", "shock"],
  ["😵", "dizzy"],
  ["🤩", "star"],
  ["😎", "cool"],
  ["🤔", "thinking"],
  ["🔥", "fire"],
  ["✈️", "flight"],
  ["🚀", "rocket"],
  ["💸", "money"],
  ["🍀", "lucky"],
  ["💯", "hundred"],
  ["👏", "clap"],
  ["🙌", "celebrate"],
  ["👍", "thumbs up"],
  ["❤️", "heart"],
] as const;

const NAME_COLORS = [
  "#4785ff",
  "#47ff47",
  "#ff4747",
  "#c247ff",
  "#85ff47",
  "#ff47c2",
  "#47c2ff",
  "#c2ff47",
  "#ff8547",
];

function nameColor(name: string): string {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function maskedName(name: string, own: boolean): string {
  if (own) return "You";
  const compact = name.trim().replace(/\s+/gu, "");
  if (compact.length < 2) return `${compact || "P"}***`;
  return `${compact[0]}***${compact.at(-1)}`;
}

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.323 6.5397c0-.8633.6763-1.5397 1.5307-1.5397.8722 0 1.5308.6764 1.5397 1.5397 0 .8543-.6675 1.5396-1.5397 1.5396-.8544 0-1.5307-.6853-1.5307-1.5396ZM8.0001 18.1983c-.0089-.6764.4628-1.1124 1.1926-1.1124h1.8155v-4.9661H9.4419c-.7298 0-1.1926-.4272-1.2015-1.0947 0-.6853.4628-1.1213 1.2015-1.1213h2.7767c.6853 0 1.1392.436 1.1392 1.1391v6.043h1.3794c.7387 0 1.2015.436 1.1926 1.1124-.0089.6764-.4717 1.1036-1.1926 1.1036H9.1927c-.7209 0-1.1837-.4272-1.1926-1.1036Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M14.4108 4.4108a.8333.8333 0 0 1 1.1784 1.1784L11.1784 10l4.4108 4.4108.057.0634a.833.833 0 0 1-1.1719 1.1719l-.0635-.0569L10 11.1783l-4.4108 4.4109a.8332.8332 0 1 1-1.1784-1.1784L8.8216 10 4.4108 5.5892l-.057-.0635a.833.833 0 0 1 1.172-1.1719l.0634.057L10 8.8216l4.4108-4.4108Z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="24" height="25" viewBox="0 0 24 25" aria-hidden="true">
      <path d="M16.44 3.5c-1.81 0-3.43.88-4.44 2.23C10.99 4.38 9.37 3.5 7.56 3.5 4.49 3.5 2 6 2 9.09c0 1.19.19 2.29.52 3.31 1.58 5 6.45 7.99 8.86 8.81.34.12.9.12 1.24 0 2.41-.82 7.28-3.81 8.86-8.81.33-1.02.52-2.12.52-3.31C22 6 19.51 3.5 16.44 3.5Z" />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c5.5228 0 10 4.4771 10 10 0 5.5228-4.4772 10-10 10-5.5229 0-10-4.4772-10-10C2 6.4771 6.4771 2 12 2Zm4.0986 11.125c-.3829-.2552-.901-.1514-1.1562.2314-1.442 2.1622-4.2172 2.2298-5.7422.2022l-.1436-.2022-.0507-.0683a.8331.8331 0 0 0-1.1045-.1631.834.834 0 0 0-.2754 1.082l.044.0733.208.2929c2.2107 2.9261 6.3702 2.8281 8.4511-.2929.2551-.3829.1522-.9-.2305-1.1553ZM9.2725 8.3633c-.5019.0001-.909.4073-.9092.9092a.9092.9092 0 1 0 .9092-.9092Zm5.455 0a.9092.9092 0 1 0 .9092.9092c-.0001-.502-.4073-.909-.9092-.9092Z" />
    </svg>
  );
}

function LettersIcon() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true">
      <path d="M1.4134 10.5H.2486l2.6172-7.2727h1.2677L6.7507 10.5H5.586L3.53 4.5483H3.473L1.4134 10.5Zm.1953-2.848H5.387v.9233H1.6087V7.652Zm7.372 2.848H7.35L11.014.3182h1.7749L16.4529 10.5h-1.6306l-2.8786-8.3324h-.0795L8.9807 10.5Zm.2734-3.9872h5.2898v1.2926H9.2541V6.5128Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.386 2.42 6.82 5.598c-6.43 2.15-6.43 5.657 0 7.797l2.839.943.942 2.84c2.14 6.43 5.658 6.43 7.797 0l3.19-9.556c1.419-4.29-.912-6.632-5.202-5.202Zm.339 5.7-4.026 4.046a.786.786 0 0 1-.561.233.786.786 0 0 1-.562-.233.8.8 0 0 1 0-1.123l4.026-4.046a.8.8 0 0 1 1.123 0 .8.8 0 0 1 0 1.123Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m5.25 7.75 4.75 4.5 4.75-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatMessage({
  message,
  onLike,
}: {
  message: ArkjetChatMessage;
  onLike: (message: ArkjetChatMessage) => void;
}) {
  return (
    <article className={styles.userMessageWrapper}>
      <div className={styles.userMessageAvatar} aria-hidden="true">
        <Avatar seed={message.avatarSeed} size={36} />
      </div>
      <div className={styles.userMessageBody}>
        <div className={`${styles.userMessageCard} ${styles.textMessage}`}>
          <div className={styles.chatMessageHeader}>
            <strong style={{ color: nameColor(message.authorName) }}>
              {maskedName(message.authorName, message.isOwn)}
            </strong>
            <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
          </div>
          <div className={styles.chatMessageText}>{message.text}</div>
        </div>
      </div>
      <div className={`${styles.chatMessageLike} ${message.viewerLiked ? styles.liked : ""}`}>
        <button
          type="button"
          onClick={() => onLike(message)}
          aria-label={message.viewerLiked ? "Unlike message" : "Like message"}
          aria-pressed={message.viewerLiked}
        >
          <HeartIcon />
        </button>
        {message.likeCount > 0 ? <span>{message.likeCount}</span> : null}
      </div>
    </article>
  );
}

export function ArkjetChatRail({ onClose }: { onClose: () => void }) {
  const { ready, authenticated, login } = usePrivy();
  const chat = useArkjetChat(ready && authenticated);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowScrollButton(false);
  };

  useEffect(() => {
    if (!stickToBottomRef.current) {
      setShowScrollButton(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => scrollToBottom("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [chat.items.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "21px";
    const nextHeight = Math.min(textarea.scrollHeight, 105);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 105 ? "auto" : "hidden";
  }, [text]);

  const onMessagesScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const isAtBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    stickToBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message || chat.sending) return;
    try {
      stickToBottomRef.current = true;
      await chat.send(message);
      setText("");
      setEmojiOpen(false);
      window.requestAnimationFrame(() => scrollToBottom());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that message.");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const shownEmojis = EMOJIS.filter(([, label]) =>
    label.toLowerCase().includes(emojiSearch.trim().toLowerCase())
  );
  const remaining = MAX_LENGTH - text.length;

  return (
    <aside className={`${styles.activityRail} ${styles.chatBar}`} aria-label="Arkjet live chat">
      <div className={styles.chatWrapper}>
        <header className={styles.chatHeader}>
          <div className={styles.chatHeaderRow}>
            <button type="button" className={styles.chatHeaderButton} aria-label="Chat rules">
              <InfoIcon />
            </button>
            <div className={styles.chatHeaderOnline}>
              Online: <strong>{chat.onlineCount}</strong>
            </div>
            <button
              type="button"
              className={styles.chatHeaderButton}
              onClick={onClose}
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className={styles.chatMessagesList}>
          <div
            ref={messagesRef}
            className={styles.chatMessagesScroller}
            onScroll={onMessagesScroll}
            aria-live="polite"
          >
            <div className={styles.messagesContainer}>
              {!authenticated ? (
                <div className={styles.chatEmpty}>
                  Sign in to see and join the live conversation.
                </div>
              ) : chat.loading ? (
                <div className={styles.chatEmpty}>Loading live chat...</div>
              ) : chat.items.length === 0 ? (
                <div className={styles.chatEmpty}>No messages yet. Start the conversation.</div>
              ) : (
                chat.items.map((message) => (
                  <ChatMessage key={message.id} message={message} onLike={chat.toggleLike} />
                ))
              )}
            </div>
          </div>
          {showScrollButton ? (
            <div className={styles.scrollToBottomWrapper}>
              <button
                type="button"
                className={styles.scrollToBottom}
                onClick={() => scrollToBottom()}
              >
                New messages <ChevronDownIcon />
              </button>
            </div>
          ) : null}
        </div>

        {emojiOpen && authenticated ? (
          <div className={styles.emojiPicker}>
            <label className={styles.emojiSearch}>
              <span aria-hidden="true">⌕</span>
              <input
                value={emojiSearch}
                onChange={(event) => setEmojiSearch(event.target.value)}
                placeholder="Search emoji..."
                aria-label="Search emoji"
              />
            </label>
            <div className={styles.emojiGrid}>
              {shownEmojis.map(([emoji, label]) => (
                <button
                  type="button"
                  key={label}
                  title={label}
                  onClick={() => setText((current) => `${current}${emoji}`.slice(0, MAX_LENGTH))}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {authenticated ? (
          <div className={styles.chatInputHost}>
            <form className={styles.chatInput} onSubmit={(event) => void submit(event)}>
              <textarea
                ref={textareaRef}
                value={text}
                maxLength={MAX_LENGTH}
                rows={1}
                placeholder="Your message..."
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Chat message"
              />
              <div className={styles.inputToolsPanel}>
                <div className={styles.inputToolsOptions}>
                  <button
                    type="button"
                    className={`${styles.inputToolButton} ${emojiOpen ? styles.activeInputTool : ""}`}
                    onClick={() => setEmojiOpen((open) => !open)}
                    aria-label="Choose emoji"
                    aria-expanded={emojiOpen}
                  >
                    <EmojiIcon />
                  </button>
                </div>
                <div className={`${styles.lettersCounter} ${remaining < 20 ? styles.low : ""}`}>
                  <LettersIcon />
                  {remaining}
                </div>
                <button
                  type="submit"
                  className={`${styles.inputToolButton} ${styles.sendButton}`}
                  disabled={!text.trim() || chat.sending}
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button type="button" className={styles.chatLogin} onClick={login} disabled={!ready}>
            Sign in to chat
          </button>
        )}
      </div>
    </aside>
  );
}
