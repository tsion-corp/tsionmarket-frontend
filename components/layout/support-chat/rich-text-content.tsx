"use client";

import React, { useState } from "react";

interface RichTextContentProps {
  content: string;
  className?: string;
}

// Safely validate links to prevent javascript: or unsafe schemas
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://example.com");
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Parse inline tokens: `code`, **bold**, *italic*, [link](url)
function parseInline(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Tokenizer regex for inline styles
  // 1: code `...`
  // 2: bold **...** or __...__
  // 3: italic *...* or _..._
  // 4: link [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `inline-${match.index}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      elements.push(
        <code
          key={key}
          className="text-accent/90 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      elements.push(
        <strong key={key} className="font-semibold text-white">
          {parseInline(token.slice(2, -2))}
        </strong>
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      elements.push(
        <em key={key} className="text-white/90 italic">
          {parseInline(token.slice(1, -1))}
        </em>
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, linkText, href] = linkMatch;
        const safeHref = isSafeUrl(href) ? href : "#";
        elements.push(
          <a
            key={key}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline decoration-white/40 underline-offset-2 transition-colors hover:text-white hover:decoration-white"
          >
            {linkText}
          </a>
        );
      } else {
        elements.push(token);
      }
    } else {
      elements.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10 bg-black/60">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60">
        <span className="font-mono lowercase">{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-1.5 py-0.5 text-[10px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="ws-no-scrollbar overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function RichTextContent({ content, className = "" }: RichTextContentProps) {
  // Parse blocks: code fences, bullet lists, numbered lists, blockquotes, and normal paragraphs
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume ending ```
      blocks.push(<CodeBlock key={`block-code-${i}`} code={codeLines.join("\n")} lang={lang} />);
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={`block-ul-${i}`}
          className="my-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-white/90"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        listItems.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={`block-ol-${i}`}
          className="my-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-white/90"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{parseInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`block-quote-${i}`}
          className="my-1.5 border-l-2 border-white/30 pl-3 text-[13px] text-white/70 italic"
        >
          {quoteLines.map((qLine, idx) => (
            <p key={idx}>{parseInline(qLine)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={`block-p-${i}`} className="text-[13px] leading-relaxed break-words">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-1.5 ${className}`}>{blocks}</div>;
}
