export interface PuzzlePathReward {
  difficulty: "Hard" | "Extra hard";
  base: number;
  speed: number;
  streak: number;
  daily: number;
  retry: number;
}

export interface PuzzlePathAward {
  difficulty: PuzzlePathReward["difficulty"];
  base: number;
  speed: number;
  streak: number;
  daily: number;
  retry: number;
  total: number;
}

export interface PuzzlePathPosition {
  prestige: number;
  tier: number;
  tierName: string;
  level: number;
  levelXp: number;
  levelRequiredXp: number;
  levelProgress: number;
  cycleXp: number;
}

export interface PuzzlePathLevelNode {
  level: number;
  requiredXp: number;
  startXp: number;
  endXp: number;
  state: "complete" | "current" | "locked";
}

export const CAPTURED_PUZZLE_PATH_START_XP = 102;

export const PUZZLE_PATH_TIERS = [
  { id: 1, name: "Wood", color: "#b98a5a" },
  { id: 2, name: "Stone", color: "#8f969c" },
  { id: 3, name: "Bronze", color: "#c77a43" },
  { id: 4, name: "Silver", color: "#b9c6cf" },
  { id: 5, name: "Crystal", color: "#77cbd3" },
  { id: 6, name: "Elite", color: "#7ea6e6" },
  { id: 7, name: "Champion", color: "#d8ad4a" },
  { id: 8, name: "Legend", color: "#d46a4f" },
] as const;

// Exact prestige-one requirements from the captured Puzzle Path configuration.
const TIER_LEVEL_REQUIREMENTS = [
  [
    35, 60, 110, 125, 150, 160, 170, 180, 190, 210, 215, 225, 230, 240, 250, 265, 275, 280, 290,
    300,
  ],
  [
    400, 430, 460, 490, 520, 550, 580, 610, 640, 670, 700, 730, 760, 790, 820, 850, 880, 920, 960,
    1000,
  ],
  [
    700, 720, 740, 770, 800, 830, 860, 890, 920, 950, 980, 1010, 1040, 1070, 1100, 1130, 1160, 1190,
    1220, 1250,
  ],
  [
    900, 920, 940, 960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1130, 1160, 1190, 1220, 1250, 1280,
    1310, 1350, 1400,
  ],
  [
    1200, 1220, 1240, 1260, 1280, 1300, 1320, 1340, 1360, 1380, 1400, 1420, 1440, 1460, 1480, 1500,
    1510, 1540, 1570, 1600,
  ],
  [
    1400, 1420, 1440, 1460, 1480, 1500, 1530, 1560, 1590, 1620, 1650, 1680, 1710, 1740, 1770, 1800,
    1850, 1900, 1950, 2000,
  ],
  [
    1600, 1630, 1660, 1690, 1720, 1750, 1780, 1810, 1840, 1870, 1900, 1940, 1980, 2020, 2060, 2100,
    2150, 2200, 2250, 2300,
  ],
  [
    1900, 1930, 1960, 1990, 2020, 2050, 2080, 2120, 2160, 2200, 2240, 2280, 2320, 2360, 2400, 2450,
    2500, 2550, 2600, 2700,
  ],
] as const;

export const PUZZLE_PATH_PRESTIGE_XP = TIER_LEVEL_REQUIREMENTS.flat().reduce(
  (total, required) => total + required,
  0
);

export function calculatePuzzlePathAward(
  reward: PuzzlePathReward,
  attempts: number
): PuzzlePathAward {
  if (attempts > 0) {
    return {
      difficulty: reward.difficulty,
      base: 0,
      speed: 0,
      streak: 0,
      daily: 0,
      retry: reward.retry,
      total: reward.retry,
    };
  }

  return {
    difficulty: reward.difficulty,
    base: reward.base,
    speed: reward.speed,
    streak: reward.streak,
    daily: reward.daily,
    retry: 0,
    total: reward.base + reward.speed + reward.streak + reward.daily,
  };
}

export function getPuzzlePathPosition(totalXp: number): PuzzlePathPosition {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const prestige = Math.floor(safeXp / PUZZLE_PATH_PRESTIGE_XP) + 1;
  const cycleXp = safeXp % PUZZLE_PATH_PRESTIGE_XP;
  let cursor = 0;

  for (let tierIndex = 0; tierIndex < TIER_LEVEL_REQUIREMENTS.length; tierIndex += 1) {
    const requirements = TIER_LEVEL_REQUIREMENTS[tierIndex];
    for (let levelIndex = 0; levelIndex < requirements.length; levelIndex += 1) {
      const required = requirements[levelIndex];
      const end = cursor + required;
      if (cycleXp < end) {
        const tier = PUZZLE_PATH_TIERS[tierIndex];
        const levelXp = cycleXp - cursor;
        return {
          prestige,
          tier: tier.id,
          tierName: tier.name,
          level: levelIndex + 1,
          levelXp,
          levelRequiredXp: required,
          levelProgress: levelXp / required,
          cycleXp,
        };
      }
      cursor = end;
    }
  }

  throw new Error("Puzzle Path configuration is incomplete.");
}

export function getPuzzlePathTierNodes(totalXp: number): PuzzlePathLevelNode[] {
  const position = getPuzzlePathPosition(totalXp);
  const cycleXp = position.cycleXp;
  let cursor = 0;

  for (let tierIndex = 0; tierIndex < position.tier - 1; tierIndex += 1) {
    cursor += TIER_LEVEL_REQUIREMENTS[tierIndex].reduce((total, value) => total + value, 0);
  }

  return TIER_LEVEL_REQUIREMENTS[position.tier - 1].map((requiredXp, index) => {
    const startXp = cursor;
    const endXp = startXp + requiredXp;
    cursor = endXp;
    return {
      level: index + 1,
      requiredXp,
      startXp,
      endXp,
      state: cycleXp >= endXp ? "complete" : cycleXp >= startXp ? "current" : "locked",
    };
  });
}
