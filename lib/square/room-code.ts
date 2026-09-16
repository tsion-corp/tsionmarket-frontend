/**
 * The Square's room codes, carried over from market-square-frontend/lib/
 * room-code.ts: nine characters from an alphabet with no look-alikes, typed
 * with or without the dashes the Square prints them with. Pure.
 */
export const ROOM_CODE_ALPHABET = "23456789bcdfghjkmnpqrstvwxz";
export const ROOM_CODE_LENGTH = 9;

export function looksLikeRoomCode(input: string): boolean {
  const bare = input.trim().toLowerCase().replace(/[\s-]/g, "");
  if (bare.length !== ROOM_CODE_LENGTH) return false;
  return [...bare].every((character) => ROOM_CODE_ALPHABET.includes(character));
}

export function groupRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH
    ? `${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`
    : code;
}
