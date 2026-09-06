// What the shell shows in its content column while a route's code and data
// are on their way. Before this the shell was rebuilt per page and there was
// no boundary at all: a navigation held the old page until the new one was
// ready, which read as the app not responding to the tap.
//
// Deliberately plain and light. This is the placeholder between two pages of
// different shapes, not a skeleton of any one of them; a route that wants its
// own outline adds a loading.tsx beside its page and this one steps aside.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pt-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="h-7 w-44 animate-pulse rounded-lg bg-white/8" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/6" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="h-[140px] animate-pulse rounded-2xl bg-white/6" />
        <div className="h-[140px] animate-pulse rounded-2xl bg-white/6" />
        <div className="h-[140px] animate-pulse rounded-2xl bg-white/6" />
      </div>
      <div className="mt-6 h-[320px] animate-pulse rounded-2xl bg-white/[0.05]" />
    </div>
  );
}
