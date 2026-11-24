import { CameraMode, DifficultyTier, RackConfig, Vec3 } from './types';

export const CONTEST_DURATION_SECONDS = 70.0;
export const BALLS_PER_RACK = 5;
export const PERIMETER_RACKS_COUNT = 5;
export const HALF_COURT_RACK_INDEX = 3;
export const DEFAULT_MONEY_RACK_INDEX = 5;

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
export const STAMINA_EXHAUSTED_THRESHOLD = 20;

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
  y: number,
  ballsCount = BALLS_PER_RACK
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
    ballsCount,
    x,
    y,
    rackOffsetX,
    rackOffsetY,
    camPos,
    camTarget,
  };
}

export const RACK_CONFIGS: RackConfig[] = [
  buildShooterPovRack(0, 'Left Corner', 'L Corner', -22.2, 0.8, 5),
  buildShooterPovRack(1, 'Left Wing', 'L Wing', -16.8, 16.8, 5),
  buildShooterPovRack(2, 'Top of Key', 'Top Key', 0, 23.85, 5),
  buildShooterPovRack(3, 'Half Court', 'Half Ct', 0, 40.5, 1),
  buildShooterPovRack(4, 'Right Wing', 'R Wing', 16.8, 16.8, 5),
  buildShooterPovRack(5, 'Right Corner', 'R Corner', 22.2, 0.8, 5),
];

export const RACKS_COUNT = RACK_CONFIGS.length;

export function computeRackCameraRig(
  rack: RackConfig,
  cameraMode: CameraMode,
  hoopOffset: Vec3 = { x: 0, y: 0, z: 0 }
): { pos: Vec3; target: Vec3; focalLength: number } {
  if (cameraMode === 'PRO_STATIC') {
    const dist = Math.hypot(rack.x, rack.y) || 1;
    const ux = -rack.x / dist;
    const uy = -rack.y / dist;
    const rx = uy;
    const ry = -ux;

    return {
      pos: {
        x: rack.x - ux * 13.0 + rx * 1.1,
        y: rack.y - uy * 13.0 + ry * 1.1,
        z: 8.4,
      },
      target: {
        x: rx * 0.6 + hoopOffset.x * 0.65,
        y: ry * 0.6 + hoopOffset.y * 0.65,
        z: 7.5 + hoopOffset.z * 0.65,
      },
      focalLength: 0.88,
    };
  }

  return {
    pos: { ...rack.camPos },
    target: {
      x: rack.camTarget.x + hoopOffset.x * 0.65,
      y: rack.camTarget.y + hoopOffset.y * 0.65,
      z: rack.camTarget.z + hoopOffset.z * 0.65,
    },
    focalLength: 1.0,
  };
}

export const TOTAL_BALLS = RACK_CONFIGS.reduce((sum, rack) => sum + rack.ballsCount, 0);

export function isSelectableMoneyRack(rackIndex: number): boolean {
  return (
    Number.isInteger(rackIndex) &&
    rackIndex >= 0 &&
    rackIndex < RACKS_COUNT &&
    rackIndex !== HALF_COURT_RACK_INDEX
  );
}

export function normalizeMoneyRackIndex(rackIndex: number): number {
  return isSelectableMoneyRack(rackIndex) ? rackIndex : DEFAULT_MONEY_RACK_INDEX;
}

export function getRackBallCount(rackIndex: number): number {
  return RACK_CONFIGS[rackIndex]?.ballsCount ?? BALLS_PER_RACK;
}

export function getRackSlotStartIndex(rackIndex: number): number {
  let start = 0;
  const limit = Math.min(rackIndex, RACK_CONFIGS.length);
  for (let r = 0; r < limit; r++) {
    start += RACK_CONFIGS[r].ballsCount;
  }
  return start;
}

export function getSlotIndex(rackIndex: number, ballIndex: number): number {
  return getRackSlotStartIndex(rackIndex) + ballIndex;
}

export function isMoneyBallSlot(
  rackIndex: number,
  ballIndex: number,
  moneyRack: number
): boolean {
  if (rackIndex === HALF_COURT_RACK_INDEX) return true;
  const count = getRackBallCount(rackIndex);
  return rackIndex === moneyRack || ballIndex === count - 1;
}

export const HIGH_SCORE_STORAGE_KEY = 'downtown3_best_score_v1';
