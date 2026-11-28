import { HIGH_SCORE_STORAGE_KEY } from './constants';
import { getBallSkinConfig } from './ballSkins';
import { getCourtThemeConfig } from './courts';
import { BallSkinId, CameraMode, CareerStats, ContestHighlight, CourtThemeId, HapticIntensity, RivalryRecord } from './types';

export const CAREER_STATS_STORAGE_KEY = 'downtown3_career_stats_v1';
export const SELECTED_COURT_STORAGE_KEY = 'downtown3_selected_court_v1';
export const SELECTED_BALL_SKIN_STORAGE_KEY = 'downtown3_selected_ball_skin_v1';
export const LAST_HIGHLIGHT_STORAGE_KEY = 'downtown3_last_highlight_v1';
export const RIVALRIES_STORAGE_KEY = 'downtown3_rivalries_v1';
export const GUEST_NAME_STORAGE_KEY = 'downtown3_guest_name_v1';
export const LAST_VISIT_STORAGE_KEY = 'downtown3_last_visit_at_v1';
export const INSTANT_REPLAY_STORAGE_KEY = 'downtown3_instant_replay_v1';
export const CAMERA_MODE_STORAGE_KEY = 'downtown3_camera_mode_v1';
export const SHOT_TRAJECTORY_STORAGE_KEY = 'downtown3_shot_trajectory_v1';
export const AUDIO_VOLUME_STORAGE_KEY = 'downtown3_audio_volume_v1';
export const AUDIO_MUTED_STORAGE_KEY = 'downtown3_audio_muted_v1';
export const SHOT_SENSITIVITY_STORAGE_KEY = 'downtown3_shot_sensitivity_v1';
export const HAPTIC_INTENSITY_STORAGE_KEY = 'downtown3_haptic_intensity_v1';
export const LONG_AWAY_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

export function normalizeOpponentKey(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'rival';
}

const DEFAULT_SPLITS = [0, 0, 0, 0, 0];

export function normalizeSplitsArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SPLITS];
  return [0, 1, 2, 3, 4].map((idx) => {
    const n = Number(raw[idx]);
    return Number.isFinite(n) && n > 0 ? Math.min(3600000, Math.round(n)) : 0;
  });
}

const DEFAULT_CAREER_STATS: CareerStats = {
  bestScore: 0,
  totalShotsMade: 0,
  totalShotsAttempted: 0,
  totalCareerScore: 0,
  allTimeBestStreak: 0,
  contestsPlayed: 0,
  totalSwishes: 0,
  totalSwishTrackedAttempts: 0,
  totalBestStreakSum: 0,
  streakTrackedContests: 0,
  pvpWins: 0,
  pvpLosses: 0,
  pvpDraws: 0,
  bestFastBreakMs: 0,
  bestFastBreakSplitsMs: [...DEFAULT_SPLITS],
  fastBreakContests: 0,
};

export function createEmptyCareerStats(): CareerStats {
  return {
    ...DEFAULT_CAREER_STATS,
    bestFastBreakSplitsMs: [...DEFAULT_SPLITS],
  };
}

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
        totalSwishes: Math.max(0, Number(parsed.totalSwishes) || 0),
        totalSwishTrackedAttempts: Math.max(0, Number(parsed.totalSwishTrackedAttempts) || 0),
        totalBestStreakSum: Math.max(0, Number(parsed.totalBestStreakSum) || 0),
        streakTrackedContests: Math.max(0, Number(parsed.streakTrackedContests) || 0),
        pvpWins: Math.max(0, Number(parsed.pvpWins) || 0),
        pvpLosses: Math.max(0, Number(parsed.pvpLosses) || 0),
        pvpDraws: Math.max(0, Number(parsed.pvpDraws) || 0),
        bestFastBreakMs: Math.max(0, Math.min(3600000, Math.round(Number(parsed.bestFastBreakMs) || 0))),
        bestFastBreakSplitsMs: normalizeSplitsArray(parsed.bestFastBreakSplitsMs),
        fastBreakContests: Math.max(0, Math.round(Number(parsed.fastBreakContests) || 0)),
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
    return {
      ...DEFAULT_CAREER_STATS,
      bestFastBreakSplitsMs: [...DEFAULT_SPLITS],
    };
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

export function loadSelectedCourt(): CourtThemeId {
  try {
    const raw = localStorage.getItem(SELECTED_COURT_STORAGE_KEY);
    return getCourtThemeConfig(raw ?? undefined).id;
  } catch {
    return 'wooden_gym';
  }
}

export function saveSelectedCourt(theme: CourtThemeId): void {
  try {
    localStorage.setItem(SELECTED_COURT_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures
  }
}

export function loadSelectedBallSkin(): BallSkinId {
  try {
    const raw = localStorage.getItem(SELECTED_BALL_SKIN_STORAGE_KEY);
    return getBallSkinConfig(raw ?? undefined).id;
  } catch {
    return 'classic_leather';
  }
}

export function saveSelectedBallSkin(skin: BallSkinId): void {
  try {
    localStorage.setItem(SELECTED_BALL_SKIN_STORAGE_KEY, skin);
  } catch {
    // Ignore storage failures
  }
}

export function loadLastHighlight(): ContestHighlight | null {
  try {
    const raw = localStorage.getItem(LAST_HIGHLIGHT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContestHighlight>;
    if (
      !parsed ||
      !Array.isArray(parsed.frames) ||
      parsed.frames.length < 4 ||
      !parsed.shooterPos ||
      !parsed.hoopPos
    ) {
      return null;
    }
    return parsed as ContestHighlight;
  } catch {
    return null;
  }
}

export function saveLastHighlight(highlight: ContestHighlight | null): void {
  try {
    if (!highlight) {
      localStorage.removeItem(LAST_HIGHLIGHT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LAST_HIGHLIGHT_STORAGE_KEY, JSON.stringify(highlight));
  } catch {
    // Ignore storage failures
  }
}

export function loadRivalries(): Record<string, RivalryRecord> {
  try {
    const raw = localStorage.getItem(RIVALRIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<RivalryRecord>>;
    if (!parsed || typeof parsed !== 'object') return {};

    const clean: Record<string, RivalryRecord> = {};
    for (const [rawKey, item] of Object.entries(parsed)) {
      if (!item || typeof item !== 'object') continue;
      const opponentName = String(item.opponentName ?? rawKey).trim().slice(0, 24);
      if (!opponentName) continue;
      const opponentKey = normalizeOpponentKey(String(item.opponentKey ?? opponentName));
      const lastResult =
        item.lastResult === 'WIN' || item.lastResult === 'LOSS' || item.lastResult === 'DRAW'
          ? item.lastResult
          : 'DRAW';
      clean[opponentKey] = {
        opponentKey,
        opponentName,
        wins: Math.max(0, Math.round(Number(item.wins) || 0)),
        losses: Math.max(0, Math.round(Number(item.losses) || 0)),
        draws: Math.max(0, Math.round(Number(item.draws) || 0)),
        pointsFor: Math.max(0, Math.round(Number(item.pointsFor) || 0)),
        pointsAgainst: Math.max(0, Math.round(Number(item.pointsAgainst) || 0)),
        lastScoreFor: Math.max(0, Math.round(Number(item.lastScoreFor) || 0)),
        lastScoreAgainst: Math.max(0, Math.round(Number(item.lastScoreAgainst) || 0)),
        lastResult,
        currentStreak: Math.round(Number(item.currentStreak) || 0),
        lastPlayedAt: Math.max(0, Math.round(Number(item.lastPlayedAt) || 0)),
      };
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveRivalries(rivalries: Record<string, RivalryRecord>): void {
  try {
    localStorage.setItem(RIVALRIES_STORAGE_KEY, JSON.stringify(rivalries));
  } catch {
    // Ignore storage failures
  }
}

export function loadGuestName(): string {
  try {
    const raw = localStorage.getItem(GUEST_NAME_STORAGE_KEY);
    const cleaned = (raw ?? '').trim().slice(0, 16);
    return cleaned || 'Shooter';
  } catch {
    return 'Shooter';
  }
}

export function saveGuestName(name: string): string {
  const cleaned = name.trim().slice(0, 16) || 'Shooter';
  try {
    localStorage.setItem(GUEST_NAME_STORAGE_KEY, cleaned);
  } catch {
    // Ignore storage failures
  }
  return cleaned;
}

export function loadLastVisitAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_VISIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastVisitAt(ts: number = Date.now()): void {
  try {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, String(Math.round(ts)));
  } catch {
    // Ignore storage failures
  }
}

export function loadInstantReplayEnabled(): boolean {
  try {
    const raw = localStorage.getItem(INSTANT_REPLAY_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveInstantReplayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(INSTANT_REPLAY_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

export function loadCameraMode(): CameraMode {
  try {
    const raw = localStorage.getItem(CAMERA_MODE_STORAGE_KEY);
    return raw === 'PRO_STATIC' ? 'PRO_STATIC' : 'FOLLOW';
  } catch {
    return 'FOLLOW';
  }
}

export function saveCameraMode(mode: CameraMode): void {
  try {
    localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures
  }
}

export function loadShotTrajectoryEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SHOT_TRAJECTORY_STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function saveShotTrajectoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SHOT_TRAJECTORY_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

export function loadAudioVolume(): number {
  try {
    const raw = localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY);
    if (raw === null) return 100;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  } catch {
    return 100;
  }
}

export function saveAudioVolume(volume: number): void {
  try {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage failures
  }
}

export function loadAudioMuted(): boolean {
  try {
    const raw = localStorage.getItem(AUDIO_MUTED_STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function saveAudioMuted(muted: boolean): void {
  try {
    localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

export function loadShotSensitivity(): number {
  try {
    const raw = localStorage.getItem(SHOT_SENSITIVITY_STORAGE_KEY);
    if (raw === null) return 1.0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 1.0;
    return Math.max(0.6, Math.min(1.5, Math.round(parsed * 20) / 20));
  } catch {
    return 1.0;
  }
}

export function saveShotSensitivity(sensitivity: number): void {
  try {
    const clamped = Math.max(0.6, Math.min(1.5, Math.round(sensitivity * 20) / 20));
    localStorage.setItem(SHOT_SENSITIVITY_STORAGE_KEY, clamped.toFixed(2));
  } catch {
    // Ignore storage failures
  }
}

export function loadHapticIntensity(): HapticIntensity {
  try {
    const raw = localStorage.getItem(HAPTIC_INTENSITY_STORAGE_KEY);
    if (raw === 'LOW' || raw === 'HIGH' || raw === 'MEDIUM') {
      return raw;
    }
    return 'MEDIUM';
  } catch {
    return 'MEDIUM';
  }
}

export function saveHapticIntensity(intensity: HapticIntensity): void {
  try {
    localStorage.setItem(HAPTIC_INTENSITY_STORAGE_KEY, intensity);
  } catch {
    // Ignore storage failures
  }
}

