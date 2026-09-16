const PUZZLE_APP_PATH = '/casino/chess/puzzles';

interface PuzzleRouteOptions {
  color?: Color;
  difficulty?: string;
  id?: string;
  theme?: string;
}

export function puzzleAppPath(options: PuzzleRouteOptions = {}): string {
  const params = new URLSearchParams();
  if (options.id) params.set('id', options.id);
  if (options.theme && options.theme !== 'mix') params.set('theme', options.theme);
  if (options.difficulty && options.difficulty !== 'normal') params.set('difficulty', options.difficulty);
  if (options.color && options.color !== 'random') params.set('color', options.color);
  const query = params.toString();
  return query ? `${PUZZLE_APP_PATH}?${query}` : PUZZLE_APP_PATH;
}

export function currentPuzzleAppPath(
  ctrl: {
    data: { angle: { key: string } };
    opts: { settings: { color?: Color; difficulty: string } };
  },
  id?: string,
): string {
  return puzzleAppPath({
    color: ctrl.opts.settings.color,
    difficulty: ctrl.opts.settings.difficulty,
    id,
    theme: ctrl.data.angle.key,
  });
}
