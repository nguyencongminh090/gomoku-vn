'use strict';

/**
 * team.js — Pure board-pairing and standings functions for club-vs-club team
 * tournaments (B236, features/club-platform/planning.md).
 *
 * Rules:
 *   - Two clubs with equal board counts (1..boardCount), frozen at start.
 *   - Board k pairs club 1's board k with club 2's board k every round.
 *   - Colors alternate across boards in round 1 and flip on every subsequent round
 *     (player1 = BLACK, player2 = WHITE in TournamentMatchHandler.startMatch).
 *   - Each completed board (including single-board walkover/forfeit) scores
 *     1 / 0.5 / 0 once. Equal team point totals share rank 1 (no tiebreak).
 */

function generateTeamRounds(team1EntryIds, team2EntryIds, totalRounds = 2) {
  if (!Array.isArray(team1EntryIds) || !Array.isArray(team2EntryIds)
      || team1EntryIds.length === 0 || team1EntryIds.length !== team2EntryIds.length
      || !Number.isInteger(totalRounds) || totalRounds < 1) {
    return [];
  }
  const rounds = [];
  for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
    const pairings = [];
    for (let i = 0; i < team1EntryIds.length; i++) {
      const swap = (i + roundIdx) % 2 === 1;
      pairings.push({
        player1: swap ? team2EntryIds[i] : team1EntryIds[i],
        player2: swap ? team1EntryIds[i] : team2EntryIds[i],
        boardNumber: i + 1,
      });
    }
    rounds.push(pairings);
  }
  return rounds;
}

function computeTeamStandings(teams, completedPairings) {
  const entryStats = new Map();
  for (const team of teams) {
    for (const entryId of team.rosterEntryIds) {
      entryStats.set(entryId, { score: 0, wins: 0, draws: 0, losses: 0 });
    }
  }

  for (const p of completedPairings || []) {
    if (p.player2 == null) continue;
    const s1 = entryStats.get(p.player1);
    const s2 = entryStats.get(p.player2);
    if (p.winner === 'draw') {
      if (s1) { s1.score += 0.5; s1.draws += 1; }
      if (s2) { s2.score += 0.5; s2.draws += 1; }
    } else if (p.winner === p.player1) {
      if (s1) { s1.score += 1; s1.wins += 1; }
      if (s2) { s2.losses += 1; }
    } else if (p.winner === p.player2) {
      if (s2) { s2.score += 1; s2.wins += 1; }
      if (s1) { s1.losses += 1; }
    }
  }

  const rows = teams.map((team) => {
    let score = 0, wins = 0, draws = 0, losses = 0;
    for (const entryId of team.rosterEntryIds) {
      const s = entryStats.get(entryId);
      if (!s) continue;
      score += s.score;
      wins += s.wins;
      draws += s.draws;
      losses += s.losses;
    }
    return { teamId: team.teamId, teamOrder: team.teamOrder, score, wins, draws, losses };
  });

  rows.sort((a, b) => b.score - a.score || a.teamOrder - b.teamOrder);
  let rank = 1;
  const ranked = rows.map((row, idx) => {
    if (idx > 0 && rows[idx - 1].score !== row.score) rank = idx + 1;
    return { ...row, rank };
  });

  return { teams: ranked, entryStats };
}

module.exports = { generateTeamRounds, computeTeamStandings };
