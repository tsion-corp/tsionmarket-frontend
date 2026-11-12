import { WELL } from "./ui";

/** The recovery phrase as numbered words, in order. Never logged, never stored in the page. */
export function PhraseGrid({ words, testId }: { words: ReadonlyArray<string>; testId?: string }) {
  return (
    <ol
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      {...(testId ? { "data-testid": testId } : {})}
    >
      {words.map((word, index) => (
        <li key={index} className={`${WELL} flex items-center gap-2.5 px-3 py-2.5 text-[14px]`}>
          <span className="w-5 text-right text-[11px] text-white/35 tabular-nums">{index + 1}</span>
          <span className="font-mono text-white">{word}</span>
        </li>
      ))}
    </ol>
  );
}
