// A trade service body that no longer matches the contract. Its own module,
// free of zod, so the browser client (lib/meme/api.ts) can recognise it
// without pulling the schemas into the first-load payload; the zod-backed
// mappers in lib/meme/parse.ts throw it and are loaded on demand.
export class TradeShapeError extends Error {
  constructor(what: string, problem: string) {
    super(`trade ${what} no longer matches the contract: ${problem}`);
    this.name = "TradeShapeError";
  }
}
