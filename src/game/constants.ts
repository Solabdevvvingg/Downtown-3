import { DifficultyTier, RackConfig } from './types';

export const CONTEST_DURATION_SECONDS = 60.0;
export const RACKS_COUNT = 5;
export const BALLS_PER_RACK = 5;
export const TOTAL_BALLS = RACKS_COUNT * BALLS_PER_RACK;

export const GRAVITY_FT_S2 = -34.0;

// Hoop & Backboard dimensions (feet, hoop center at x=0, y=0, z=10)
export const HOOP_POS = { x: 0, y: 0, z: 10.0 };
export const RIM_RADIUS = 0.86;
export const BALL_RADIUS = 0.38;
export const BACKBOARD_Y = -1.25;
export const BACKBOARD_WIDTH = 6.0;
export const BACKBOARD_BOTTOM_Z = 9.5;
export const BACKBOARD_TOP_Z = 13.0;
export const BASELINE_Y = -4.2;

export const METER_PERFECT_CENTER = 0.74;

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  {
    level: 1,
    label: 'Rhythm',
    minStreak: 0,
    meterSpeed: 1.32,
    makeHalfWindow: 0.145,
    perfectHalfWindow: 0.048,
    gatherCooldown: 0.26,
  },
  {
    level: 2,
    label: 'Heating Up',
    minStreak: 3,
    meterSpeed: 1.52,
    makeHalfWindow: 0.115,
    perfectHalfWindow: 0.038,
    gatherCooldown: 0.22,
  },
  {
    level: 3,
    label: 'Locked In',
    minStreak: 6,
    meterSpeed: 1.74,
    makeHalfWindow: 0.092,
    perfectHalfWindow: 0.03,
    gatherCooldown: 0.18,
  },
  {
    level: 4,
    label: 'On Fire',
    minStreak: 9,
    meterSpeed: 1.96,
    makeHalfWindow: 0.072,
    perfectHalfWindow: 0.024,
    gatherCooldown: 0.15,
  },
];

export function getDifficultyForStreak(streak: number): DifficultyTier {
  let chosen = DIFFICULTY_TIERS[0];
  for (const tier of DIFFICULTY_TIERS) {
    if (streak >= tier.minStreak) {
      chosen = tier;
    }
  }
  return chosen;
}

export const STAMINA_LOW_THRESHOLD = 45;

export function getEffectiveDifficulty(
  base: DifficultyTier,
  stamina: number
): DifficultyTier {
  if (stamina >= STAMINA_LOW_THRESHOLD) return base;
  const fatigue = Math.max(
    0,
    Math.min(1, (STAMINA_LOW_THRESHOLD - stamina) / STAMINA_LOW_THRESHOLD)
  );
  return {
    ...base,
    meterSpeed: base.meterSpeed * (1 + fatigue * 0.36),
    makeHalfWindow: base.makeHalfWindow * (1 - fatigue * 0.32),
    perfectHalfWindow: base.perfectHalfWindow * (1 - fatigue * 0.36),
  };
}

/**
 * Compute Shooter's Over-the-Shoulder POV camera position & target for each rack.
 * Camera sits 8.8 ft behind the shooter and 1.15 ft over their right shoulder (z = 7.6),
 * aiming straight toward the hoop so the shooter stands cleanly in the left foreground,
 * the ball rack sits clearly on the right, and sneakers stay comfortably above the bottom edge.
 */
function buildShooterPovRack(
  id: number,
  label: string,
  shortLabel: string,
  x: number,
  y: number
): RackConfig {
  const dist = Math.hypot(x, y) || 1;
  // Unit vector from shooter toward hoop (0, 0)
  const ux = -x / dist;
  const uy = -y / dist;
  // Shooter's right vector (ux, uy, 0) x (0, 0, 1) = (uy, -ux)
  const rx = uy;
  const ry = -ux;

  // Ball rack sits cleanly to the shooter's right-front side
  const rackOffsetX = rx * 2.1 + ux * 0.7;
  const rackOffsetY = ry * 2.1 + uy * 0.7;

  // Camera sits 8.8 ft behind shooter & 1.15 ft over right shoulder
  const camPos = {
    x: x - ux * 8.8 + rx * 1.15,
    y: y - uy * 8.8 + ry * 1.15,
    z: 7.6,
  };

  // Sightline looks cleanly toward hoop & arc
  const camTarget = {
    x: 0,
    y: 0,
    z: 8.1,
  };

  return {
    id,
    label,
    shortLabel,
    x,
    y,
    rackOffsetX,
    rackOffsetY,
    camPos,
    camTarget,
  };
}

export const RACK_CONFIGS: RackConfig[] = [
  buildShooterPovRack(0, 'Left Corner', 'L Corner', -22.2, 0.8),
  buildShooterPovRack(1, 'Left Wing', 'L Wing', -16.8, 16.8),
  buildShooterPovRack(2, 'Top of Key', 'Top Key', 0, 23.85),
  buildShooterPovRack(3, 'Right Wing', 'R Wing', 16.8, 16.8),
  buildShooterPovRack(4, 'Right Corner', 'R Corner', 22.2, 0.8),
];

export const HIGH_SCORE_STORAGE_KEY = 'downtown3_best_score_v1';
