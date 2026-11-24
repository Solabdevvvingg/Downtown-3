const RIM_HAPTIC_COOLDOWN_MS = 65;
const FOOTSTEP_HAPTIC_COOLDOWN_MS = 110;
const ZONE_CUE_HAPTIC_COOLDOWN_MS = 180;

let lastRimHapticAt = 0;
let lastFootstepHapticAt = 0;
let lastZoneCueHapticAt = 0;
let hapticsMuted = false;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function vibrateSafe(pattern: number | number[]): void {
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
  if (timingQuality === 'PERFECT') {
    // Crisp high-confidence double snap on Gold release
    vibrateSafe([14, 16, 20]);
  } else if (timingQuality === 'GOOD') {
    vibrateSafe(16);
  } else {
    vibrateSafe(10);
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

  // Scale tactile pulse length to collision intensity
  const duration = impactSpeed >= 14.5 ? 28 : impactSpeed >= 9 ? 18 : 12;
  vibrateSafe(duration);
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
