import { opposite } from '@lichess-org/chessground/util';
import { charToRole, ROLES, type Board } from 'chessops';

import type { CheckCount, CheckState, MaterialDiff } from './interfaces';

const STARTING_MATERIAL: Record<Role, number> = {
  king: 1,
  queen: 1,
  rook: 2,
  bishop: 2,
  knight: 2,
  pawn: 8,
};

function emptyMaterial(): MaterialDiff {
  return {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };
}

function materialCounts(chess: FEN | Board): MaterialDiff {
  const counts = emptyMaterial();
  if (isFen(chess)) {
    const fenLike = chess.split(' ')[0];
    for (const ch of fenLike) {
      const role = charToRole(ch);
      if (!role) {
        if (ch === '[' || ch === ' ') break;
        continue;
      }
      counts[ch === ch.toLowerCase() ? 'black' : 'white'][role]++;
    }
  } else {
    for (const role of ROLES) {
      counts.white[role] = chess.pieces('white', role).size();
      counts.black[role] = chess.pieces('black', role).size();
    }
  }
  return counts;
}

export function getMaterialDiff(chess: FEN | Board): MaterialDiff {
  const diff = emptyMaterial();
  if (isFen(chess)) {
    const fenLike = chess.split(' ')[0];
    for (let i = 0, part = 0; i < fenLike.length && part < 8; i++) {
      const ch = fenLike[i];
      const lower = ch.toLowerCase();
      const role = charToRole(ch);
      if (role) {
        const color = ch === lower ? 'black' : 'white';
        const them = diff[opposite(color)];
        if (them[role] > 0) them[role]--;
        else diff[color][role]++;
      } else if (ch === '[' || ch === ' ') break;
      else if (ch === '/') part++;
    }
  } else {
    for (const role of ROLES) {
      const c = [chess.pieces('white', role).size(), chess.pieces('black', role).size()];
      diff.white[role] = c[0] > c[1] ? c[0] - c[1] : 0;
      diff.black[role] = c[1] > c[0] ? c[1] - c[0] : 0;
    }
  }
  return diff;
}

// Each side owns the pieces it captured. This differs from getMaterialDiff,
// which deliberately cancels equal trades and is only suitable for the score.
export function getCapturedMaterial(chess: FEN | Board): MaterialDiff {
  const captured = emptyMaterial();
  if (isFen(chess) && chess.length === 0) return captured;
  const counts = materialCounts(chess);
  for (const role of ROLES) {
    captured.white[role] = Math.max(0, STARTING_MATERIAL[role] - counts.black[role]);
    captured.black[role] = Math.max(0, STARTING_MATERIAL[role] - counts.white[role]);
  }
  return captured;
}

export function getScore(diff: MaterialDiff): number {
  return (
    (diff.white.queen - diff.black.queen) * 9 +
    (diff.white.rook - diff.black.rook) * 5 +
    (diff.white.bishop - diff.black.bishop) * 3 +
    (diff.white.knight - diff.black.knight) * 3 +
    (diff.white.pawn - diff.black.pawn)
  );
}

export const NO_CHECKS: CheckCount = {
  white: 0,
  black: 0,
};

export function countChecks(steps: CheckState[], ply: Ply): CheckCount {
  const checks: CheckCount = { ...NO_CHECKS };
  for (const step of steps) {
    if (ply < step.ply) break;
    if (step.check === true || (typeof step.check === 'function' && step.check())) {
      if (step.ply % 2 === 1) checks.white++;
      else checks.black++;
    }
  }
  return checks;
}

function isFen(chess: FEN | Board): chess is FEN {
  return typeof chess === 'string';
}
