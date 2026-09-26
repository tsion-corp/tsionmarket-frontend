// What this session has learned a game is called.
//
// A name reaches the client only on paths that carry metadata: the service's
// indexed row and its single-game read. Plenty of other paths produce a row
// WITHOUT one — our lobby route reading the chain when the service times out,
// a row seeded from a receipt, the keeper's socket snapshot (toGameDto with
// two arguments) — and every one of them replaces the cache wholesale. The
// name then disappears until the next good read puts it back, which is why a
// title flickered in and out on a live game.
//
// Absent has never meant "cleared" for metadata: a game's name does not
// change, and no path can unname one. So a name is remembered per id and
// filled back in wherever a row arrives without it.

interface KnownMetadata {
  title: string;
  description?: string;
}

const known = new Map<number, KnownMetadata>();

export interface NamedRow {
  gameId: number;
  title?: string;
  description?: string;
}

/** Records the name on any row that carries one. */
export function rememberMetadata(rows: readonly NamedRow[]): void {
  for (const row of rows) {
    const title = row.title?.trim() ?? "";
    if (title === "") continue;
    const description = row.description?.trim();
    known.set(row.gameId, {
      title,
      ...(description === undefined || description === "" ? {} : { description }),
    });
  }
}

/** The row, with a remembered name filled in when it arrived without one. */
export function withKnownMetadata<T extends NamedRow>(row: T): T {
  if ((row.title?.trim() ?? "") !== "") return row;
  const remembered = known.get(row.gameId);
  return remembered === undefined ? row : { ...row, ...remembered };
}

/**
 * Remembers what the rows carry, then fills in what they do not. One call per
 * response, so a batch that names some games can name the rest from memory.
 */
export function reconcileMetadata<T extends NamedRow>(rows: readonly T[]): T[] {
  rememberMetadata(rows);
  return rows.map(withKnownMetadata);
}

/** Test seam: the memory is module state. */
export function clearMetadataMemory(): void {
  known.clear();
}
