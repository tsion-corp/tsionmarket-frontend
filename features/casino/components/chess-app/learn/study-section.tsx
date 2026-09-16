"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessBoard } from "@/features/casino/components/chess-app/chess-board";
import {
  installLichessRuntime,
  loadLichessStyle,
  type LichessPowertip,
} from "@/features/casino/components/chess-app/lichess-round";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  createChessStudy,
  fetchChessStudies,
  fetchChessStudy,
} from "@/features/casino/lib/api/chess";
import { parseFen } from "@/features/casino/lib/chess/engine";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const ROOT = "/casino/chess/learn/studies";
const STUDY_INDEX_CSS = "/css/analyse.study.index.6e3e16d3.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

function installStudyShell(): () => void {
  document.body.dataset.assetUrl = "";
  document.body.classList.add("is2d");
  installLichessRuntime(undefined, inertPowertip);
  document.body.classList.remove("fixed-scroll", "playing");
  void Promise.all([
    loadLichessStyle(THEME_CSS),
    loadLichessStyle(SITE_CSS),
    loadLichessStyle(STUDY_INDEX_CSS),
  ]);
  return () => document.body.classList.remove("is2d");
}

function studyPosition(fen: string | undefined) {
  if (!fen) return null;
  try {
    return parseFen(fen);
  } catch {
    return null;
  }
}

function shortOwner(owner: string): string {
  return /^0x[0-9a-f]{40}$/i.test(owner)
    ? `${owner.slice(0, 6)}...${owner.slice(-4)}`
    : owner;
}

export function StudyListSection({
  view = "all",
  search = "",
  order = "updated",
}: {
  view?: "all" | "mine";
  search?: string;
  order?: "updated" | "newest" | "popular";
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(installStudyShell, []);
  useEffect(() => setSearchValue(search), [search]);

  const studies = useQuery({
    queryKey: ["casino", "chess", "studies"],
    queryFn: () => fetchChessStudies(),
  });
  const createStudy = useMutation({
    mutationFn: () => createChessStudy(),
    onSuccess: async (study) => {
      await queryClient.invalidateQueries({ queryKey: ["casino", "chess", "studies"] });
      router.push(`${ROOT}/${study.id}`);
    },
    onError: (error) => toast.error(friendlyError(error, "The study could not be created.")),
  });

  const visibleStudies = useMemo(() => {
    const address = wallet.address?.toLowerCase();
    const query = search.trim().toLowerCase();
    const filtered = (studies.data?.items ?? []).filter((study) => {
      if (view === "mine" && (!address || study.owner.toLowerCase() !== address)) return false;
      if (!query) return true;
      return [study.name, study.description, study.owner, ...study.topics]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    return filtered.toSorted((left, right) => {
      if (order === "popular") return right.likes - left.likes;
      const leftDate = Date.parse(order === "newest" ? left.createdAt : left.updatedAt);
      const rightDate = Date.parse(order === "newest" ? right.createdAt : right.updatedAt);
      return rightDate - leftDate;
    });
  }, [order, search, studies.data?.items, view, wallet.address]);

  if (studies.isLoading) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[1100px] px-4 py-10">
        <CasinoLoading label="Loading chess studies" rows={6} />
      </div>
    );
  }
  if (studies.error || !studies.data) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[1100px] px-4 py-10">
        <CasinoError error={studies.error} subject="chess studies" onRetry={() => studies.refetch()} />
      </div>
    );
  }

  const title = view === "mine" ? "My studies" : search ? `Search: ${search}` : "All studies";

  return (
    <div id="main-wrap" style={{ marginTop: 0 }}>
      <main className="page-menu">
        <aside className="subnav page-menu__menu">
          <nav className="subnav__inner">
            <Link className={view === "all" ? "active" : ""} href={ROOT}>
              All studies
            </Link>
            <Link className={view === "mine" ? "active" : ""} href={`${ROOT}?view=mine`}>
              My studies
            </Link>
            <Link href={`${ROOT}?q=opening`}>Topics</Link>
            <Link href={`${ROOT}?order=popular`}>Staff picks</Link>
            <Link href="/casino/chess/learn">What are studies?</Link>
          </nav>
        </aside>

        <main className="page-menu__content study-index box">
          <div className="box__top">
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                const params = new URLSearchParams();
                if (view !== "all") params.set("view", view);
                if (searchValue.trim()) params.set("q", searchValue.trim());
                if (order !== "updated") params.set("order", order);
                router.push(`${ROOT}${params.size ? `?${params}` : ""}`);
              }}
            >
              <input
                aria-label="Search studies"
                enterKeyHint="search"
                placeholder={title}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              <button className="button" type="submit" data-icon="" aria-label="Search" />
            </form>
            <select
              className="mselect__label"
              aria-label="Order studies"
              value={order}
              onChange={(event) => {
                const params = new URLSearchParams();
                if (view !== "all") params.set("view", view);
                if (search) params.set("q", search);
                if (event.target.value !== "updated") params.set("order", event.target.value);
                router.push(`${ROOT}${params.size ? `?${params}` : ""}`);
              }}
            >
              <option value="updated">Recently updated</option>
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
            </select>
            <form
              className="new-study"
              onSubmit={(event) => {
                event.preventDefault();
                if (!createStudy.isPending) createStudy.mutate();
              }}
            >
              <button
                className="button button-green"
                type="submit"
                data-icon=""
                title="Create a study"
                aria-label="Create a study"
                disabled={createStudy.isPending}
              />
            </form>
          </div>

          {visibleStudies.length ? (
            <div className="studies infinite-scroll">
              {visibleStudies.map((study) => (
                <div className="study paginated" key={study.id}>
                  <Link className="overlay" href={`${ROOT}/${study.id}`} title={study.name} />
                  <div className="top">
                    <div className="study__icon" aria-hidden="true">
                      ♞
                    </div>
                    <div>
                      <h2 className="study-name">{study.name}</h2>
                      <span>
                        {study.visibility !== "public" ? "🔒 " : ""}♡ {study.likes} •{" "}
                        {shortOwner(study.owner)} • {new Date(study.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="body">
                    <ol className="chapters">
                      {(study.topics.length ? study.topics : [study.description || "Chapter 1"])
                        .slice(0, 3)
                        .map((label) => (
                          <li className="text" key={label}>
                            {label}
                          </li>
                        ))}
                    </ol>
                    <ol className="members">
                      <li className="text">{shortOwner(study.owner)}</li>
                    </ol>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="nostudies">
              <div aria-hidden="true">♞</div>
              <p>No studies yet</p>
            </div>
          )}
        </main>
      </main>
    </div>
  );
}

export function StudySection({ studyId, chapterId }: { studyId: string; chapterId: string | null }) {
  const study = useQuery({
    queryKey: ["casino", "chess", "study", studyId],
    queryFn: () => fetchChessStudy(studyId),
  });

  if (study.isLoading) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[1100px] px-4 py-10">
        <CasinoLoading label="Loading chess study" rows={6} />
      </div>
    );
  }
  if (study.error || !study.data) {
    return (
      <div className="mx-auto min-h-[calc(100dvh-60px)] max-w-[1100px] px-4 py-10">
        <CasinoError error={study.error} subject="chess study" onRetry={() => study.refetch()} />
      </div>
    );
  }

  const selected =
    study.data.chapters.find((chapter) => chapter.id === chapterId) ??
    study.data.chapters.find((chapter) => chapter.id === study.data.currentChapterId) ??
    study.data.chapters[0];
  const position = studyPosition(selected?.initialFen);

  return (
    <main className="mx-auto min-h-[calc(100dvh-60px)] w-full max-w-[1400px] px-3 py-4 text-white sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <Link href={ROOT} className="text-[12px] text-[#8fc8ed] hover:underline">
            ← All studies
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{study.data.name}</h1>
          <p className="mt-1 text-[12px] text-white/40">{study.data.description}</p>
        </div>
        <span className="text-[11px] text-white/35">{study.data.likes} likes</span>
      </div>
      <div className="grid overflow-hidden rounded-[7px] border border-white/10 bg-[#151513] lg:grid-cols-[230px_minmax(320px,700px)_minmax(240px,1fr)]">
        <aside className="border-b border-white/8 lg:border-r lg:border-b-0">
          <h2 className="border-b border-white/8 px-4 py-3 text-[12px] font-bold tracking-wide uppercase">
            Chapters
          </h2>
          <nav className="max-h-[70dvh] overflow-auto p-2">
            {study.data.chapters.map((chapter) => (
              <Link
                key={chapter.id}
                href={`${ROOT}/${studyId}?chapter=${encodeURIComponent(chapter.id)}`}
                className={`flex gap-3 rounded px-3 py-2.5 text-[12px] ${
                  selected?.id === chapter.id ? "bg-[#3f86b5] text-white" : "text-white/55 hover:bg-white/6"
                }`}
              >
                <strong>{chapter.order}</strong>
                <span>{chapter.name}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <section className="bg-[#0f0f0e] p-2 sm:p-4">
          {position ? (
            <div className="mx-auto aspect-square w-full max-w-[680px] overflow-hidden rounded-sm">
              <ChessBoard
                board={position.board}
                turn={position.turn}
                orientation={selected?.orientation === "black" ? "b" : "w"}
                pieceSet="cburnett"
              />
            </div>
          ) : (
            <div className="grid aspect-square place-items-center text-white/35">No chapters yet.</div>
          )}
        </section>
        <aside className="border-t border-white/8 p-5 lg:border-t-0 lg:border-l">
          <span className="text-[10px] font-bold tracking-[0.15em] text-[#8bb968] uppercase">
            Chapter {selected?.order ?? ""}
          </span>
          <h2 className="mt-2 font-serif text-xl font-bold">{selected?.name ?? "Empty study"}</h2>
          <div className="mt-5 border-t border-white/8 pt-4">
            <h3 className="text-[11px] font-bold text-white/45 uppercase">PGN</h3>
            <pre className="mt-2 max-h-[48dvh] overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-white/55">
              {selected?.pgn || "No moves have been added to this chapter."}
            </pre>
          </div>
          <div className="mt-5 border-t border-white/8 pt-4 text-[11px] text-white/35">
            {study.data.members.length} members · {study.data.topics.join(" · ") || "No topics"}
          </div>
        </aside>
      </div>
    </main>
  );
}
