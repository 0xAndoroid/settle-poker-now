import type { LiveGameSnapshot, LivePlayer } from './types';

export function activeLivePlayers(snapshot: LiveGameSnapshot): LivePlayer[] {
  return snapshot.players
    .filter((player) => player.status !== 'removed')
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.playerId.localeCompare(b.playerId)
    );
}
