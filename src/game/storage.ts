import { HIGH_SCORE_STORAGE_KEY } from './constants';
import { CareerStats } from './types';

export const CAREER_STATS_STORAGE_KEY = 'downtown3_career_stats_v1';

const DEFAULT_CAREER_STATS: CareerStats = {
  bestScore: 0,
  totalShotsMade: 0,
  totalShotsAttempted: 0,
  totalCareerScore: 0,
  allTimeBestStreak: 0,
  contestsPlayed: 0,
  pvpWins: 0,
  pvpLosses: 0,
  pvpDraws: 0,
};

export function loadCareerStats(): CareerStats {
  try {
    const raw = localStorage.getItem(CAREER_STATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CareerStats>;
      return {
        bestScore: Math.max(0, Number(parsed.bestScore) || 0),
        totalShotsMade: Math.max(0, Number(parsed.totalShotsMade) || 0),
        totalShotsAttempted: Math.max(0, Number(parsed.totalShotsAttempted) || 0),
        totalCareerScore: Math.max(0, Number(parsed.totalCareerScore) || 0),
        allTimeBestStreak: Math.max(0, Number(parsed.allTimeBestStreak) || 0),
        contestsPlayed: Math.max(0, Number(parsed.contestsPlayed) || 0),
        pvpWins: Math.max(0, Number(parsed.pvpWins) || 0),
        pvpLosses: Math.max(0, Number(parsed.pvpLosses) || 0),
        pvpDraws: Math.max(0, Number(parsed.pvpDraws) || 0),
      };
    }

    // Migrate legacy bestScore if present
    const legacyRaw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const legacyBest = legacyRaw ? Math.max(0, parseInt(legacyRaw, 10) || 0) : 0;
    return {
      ...DEFAULT_CAREER_STATS,
      bestScore: legacyBest,
    };
  } catch {
    return { ...DEFAULT_CAREER_STATS };
  }
}

export function saveCareerStats(stats: CareerStats): void {
  try {
    localStorage.setItem(CAREER_STATS_STORAGE_KEY, JSON.stringify(stats));
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(stats.bestScore));
  } catch {
    // Ignore storage failures
  }
}
