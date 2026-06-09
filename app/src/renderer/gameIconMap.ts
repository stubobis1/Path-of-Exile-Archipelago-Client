/**
 * Maps AP world/game names to their icon folder name under other-games-icons/Assets/.
 * Only needed when the AP game name differs from the icon folder name.
 */
const GAME_ICON_MAP: Record<string, string> = {
  'Ship of Harkinian': 'Ocarina Of Time',
  'DOOM II':           'Doom 2',
  'DOOM 1993':         'Doom 1993',
}

export function resolveGameIconFolder(game: string): string {
  return GAME_ICON_MAP[game] ?? game
}
