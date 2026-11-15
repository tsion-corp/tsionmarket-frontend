"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { SECONDARY, WELL } from "./ui";

/**
 * The recovery secret, as the groups to write down, in order. Shown once, when the
 * wallet is made, and never again: it is not stored anywhere that could show it.
 */
export function SecretDisplay({ secret, testId }: { secret: string; testId?: string }) {
  const groups = secret.split("-");
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(secret)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ol
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
        {...(testId ? { "data-testid": testId } : {})}
      >
        {groups.map((group, index) => (
          <li key={index} className={`${WELL} flex items-center gap-2.5 px-3 py-2.5 text-[14px]`}>
            <span className="w-4 text-right text-[11px] text-white/35 tabular-nums">
              {index + 1}
            </span>
            <span className="font-mono tracking-wider text-white">{group}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={`${SECONDARY} sm:w-auto sm:self-start sm:px-6`}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy the secret"}
      </button>
    </div>
  );
}
