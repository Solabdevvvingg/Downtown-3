import { HapticIntensity } from './types';

const RIM_HAPTIC_COOLDOWN_MS = 65;
const FOOTSTEP_HAPTIC_COOLDOWN_MS = 110;
const ZONE_CUE_HAPTIC_COOLDOWN_MS = 180;

let lastRimHapticAt = 0;
let lastFootstepHapticAt = 0;
let lastZoneCueHapticAt = 0;
let hapticsMuted = false;
let hapticIntensity: HapticIntensity = 'MEDIUM';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getPulseScale(intensity: HapticIntensity): number {
  if (intensity === 'LOW') return 0.48;
  if (intensity === 'HIGH') return 1.75;
  return 1.0;
}

function scalePattern(
  pattern: number | number[],
  intensity: HapticIntensity
): number | number[] {
  if (intensity === 'MEDIUM') return pattern;
  const pulseScale = getPulseScale(intensity);
  const pauseScale = intensity === 'LOW' ? 0.85 : 0.92;
  if (typeof pattern === 'number') {
    return Math.max(4, Math.min(130, Math.round(pattern * pulseScale)));
  }
  return pattern.map((ms, idx) =>
    idx % 2 === 0
      ? Math.max(4, Math.min(130, Math.round(ms * pulseScale)))
      : Math.max(8, Math.round(ms * pauseScale))
  );
}

function vibrateRaw(pattern: number | number[]): void {
  if (hapticsMuted) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore on browsers/WebViews that disallow vibration outside direct gestures
  }
}

function vibrateSafe(pattern: number | number[]): void {
  vibrateRaw(scalePattern(pattern, hapticIntensity));
}

export function setHapticsMuted(muted: boolean): void {
  hapticsMuted = muted;
  if (muted && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore cancel failures
    }
  }
}

export function getHapticIntensity(): HapticIntensity {
  return hapticIntensity;
}

export function setHapticIntensity(intensity: HapticIntensity): void {
  hapticIntensity = intensity;
}

export function triggerHapticPreview(intensity: HapticIntensity = hapticIntensity): void {
  if (intensity === 'LOW') {
    vibrateRaw(9);
  } else if (intensity === 'HIGH') {
    vibrateRaw([26, 18, 36]);
  } else {
    vibrateRaw([15, 16, 20]);
  }
}

export function triggerShotGatherHaptic(): void {
  // Subtle athletic thumb lock-in pulse when beginning a shot gather
  vibrateSafe(10);
}

export function triggerPerfectZoneCueHaptic(): void {
  const now = nowMs();
  if (now - lastZoneCueHapticAt < ZONE_CUE_HAPTIC_COOLDOWN_MS) {
    return;
  }
  lastZoneCueHapticAt = now;
  // Micro tick the instant the meter enters the Gold Perfect bracket
  vibrateSafe(9);
}

export function triggerShotReleaseHaptic(
  timingQuality: 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE'
): void {
  if (hapticIntensity === 'LOW') {
    if (timingQuality === 'PERFECT') {
      vibrateRaw([7, 14, 10]);
    } else if (timingQuality === 'GOOD') {
      vibrateRaw(8);
    } else {
      vibrateRaw(5);
    }
    return;
  }
  if (hapticIntensity === 'HIGH') {
    if (timingQuality === 'PERFECT') {
      vibrateRaw([24, 16, 36]);
    } else if (timingQuality === 'GOOD') {
      vibrateRaw(28);
    } else {
      vibrateRaw(18);
    }
    return;
  }
  if (timingQuality === 'PERFECT') {
    // Crisp high-confidence double snap on Gold release
    vibrateRaw([14, 16, 20]);
  } else if (timingQuality === 'GOOD') {
    vibrateRaw(16);
  } else {
    vibrateRaw(10);
  }
}

export function triggerFootstepHaptic(): void {
  const now = nowMs();
  if (now - lastFootstepHapticAt < FOOTSTEP_HAPTIC_COOLDOWN_MS) {
    return;
  }
  lastFootstepHapticAt = now;
  // Light hardwood stride tap synced to sprint foot-strikes
  vibrateSafe(7);
}

export function triggerRackArrivalHaptic(): void {
  // Distinct two-step feet plant thud when settling at the next rack
  vibrateSafe([13, 18, 22]);
}

export function triggerSecondWindHaptic(): void {
  // Energetic rising pulse when 3x Perfect releases restore stamina
  vibrateSafe([15, 22, 22, 22, 34]);
}

export function triggerMatchStartHaptic(): void {
  vibrateSafe([18, 24, 28]);
}

export function triggerRimHitHaptic(impactSpeed: number): void {
  const now = nowMs();
  if (now - lastRimHapticAt < RIM_HAPTIC_COOLDOWN_MS) {
    return;
  }
  lastRimHapticAt = now;

  if (hapticIntensity === 'LOW') {
    vibrateRaw(impactSpeed >= 14.5 ? 14 : impactSpeed >= 9 ? 9 : 6);
    return;
  }
  if (hapticIntensity === 'HIGH') {
    if (impactSpeed >= 14.5) {
      vibrateRaw([42, 18, 22]);
    } else {
      vibrateRaw(impactSpeed >= 9 ? 34 : 22);
    }
    return;
  }

  // Medium: scale tactile pulse length to collision intensity
  const duration = impactSpeed >= 14.5 ? 28 : impactSpeed >= 9 ? 18 : 12;
  vibrateRaw(duration);
}

export function triggerRimHangHaptic(): void {
  lastRimHapticAt = nowMs();
  vibrateSafe([22, 28, 16]);
}

export function triggerSwishHaptic(
  isPerfectTiming: boolean,
  isMoney = false,
  isBuzzerBeater = false
): void {
  if (isBuzzerBeater) {
    vibrateSafe([26, 20, 38, 22, 52]);
    return;
  }
  if (isMoney) {
    vibrateSafe(isPerfectTiming ? [20, 18, 30, 18, 40] : [16, 20, 32]);
    return;
  }
  // Crisp celebration double-tap: sharper snap + fuller follow-through on a Perfect release
  vibrateSafe(isPerfectTiming ? [18, 20, 34] : [14, 20, 24]);
}

export function triggerMissHaptic(streakBroken: boolean): void {
  vibrateSafe(streakBroken ? [26, 28, 18] : 13);
}

export function triggerBuzzerHaptic(): void {
  vibrateSafe([55, 35, 75]);
}
