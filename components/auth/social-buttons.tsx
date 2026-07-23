"use client";

import { useLoginWithOAuth, type OAuthProviderType } from "@privy-io/react-auth";
import { toast } from "@/lib/toast";

function GoogleLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24">
      <path
        fill="#fff"
        d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7C21.8 18.7 23 15.8 23 12.3Z"
        opacity=".9"
      />
      <path
        fill="#fff"
        d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 21.4 7.5 24 12 24Z"
        opacity=".7"
      />
      <path
        fill="#fff"
        d="M5.6 14.8c-.2-.7-.4-1.4-.4-2.2s.2-1.5.4-2.2V7.5H1.8C1 9 .6 10.7.6 12.6s.4 3.6 1.2 5.1l3.8-2.9Z"
        opacity=".55"
      />
      <path
        fill="#fff"
        d="M12 5.7c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 2.2 15.1 1.2 12 1.2 7.5 1.2 3.7 3.8 1.8 7.5l3.8 2.9C6.5 7.7 9 5.7 12 5.7Z"
        opacity=".9"
      />
    </svg>
  );
}

function XLogo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff">
      <path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.1 3.9H5.2L17.7 20Z" />
    </svg>
  );
}

const BUTTON =
  "flex w-full cursor-pointer items-center justify-center gap-[11px] rounded-[14px] border border-white/14 bg-white/6 p-3.5 font-sans text-[15px] font-medium text-white transition-colors hover:border-white/28 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60";

export function SocialButtons() {
  const { initOAuth, loading } = useLoginWithOAuth();

  const signIn = async (provider: OAuthProviderType) => {
    try {
      await initOAuth({ provider });
    } catch (err) {
      console.error("OAuth login failed:", err);
      toast.error("Sign-in didn't go through. Give it another try.");
    }
  };

  return (
    <div className="flex flex-col gap-[11px]">
      <button className={BUTTON} disabled={loading} onClick={() => signIn("google")}>
        <GoogleLogo />
        Continue with Google
      </button>
      <button className={BUTTON} disabled={loading} onClick={() => signIn("twitter")}>
        <XLogo />
        Continue with X
      </button>
    </div>
  );
}
