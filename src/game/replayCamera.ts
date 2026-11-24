import { ContestHighlight, HighlightFrame, Vec3 } from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function sampleHighlightFrame(frames: HighlightFrame[], t: number): HighlightFrame {
  if (frames.length === 0) {
    return { t: 0, x: 0, y: 0, z: 10, spinAngle: 0 };
  }
  if (t <= frames[0].t) return frames[0];
  const last = frames[frames.length - 1];
  if (t >= last.t) return last;

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const f0 = frames[lo];
  const f1 = frames[hi];
  const span = Math.max(0.0001, f1.t - f0.t);
  const alpha = clamp((t - f0.t) / span, 0, 1);
  return {
    t,
    x: lerp(f0.x, f1.x, alpha),
    y: lerp(f0.y, f1.y, alpha),
    z: lerp(f0.z, f1.z, alpha),
    spinAngle: lerp(f0.spinAngle, f1.spinAngle, alpha),
  };
}

export function computeCinematicReplayCamera(
  highlight: ContestHighlight,
  playTime: number,
  ballPos: Vec3,
  preRollSec = 0.44
): { pos: Vec3; target: Vec3; focalLength: number } {
  const { shooterPos, hoopPos, scoreAtTime } = highlight;
  const dx = hoopPos.x - shooterPos.x;
  const dy = hoopPos.y - shooterPos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Lateral broadcast sweep stays toward center-court open sightlines
  const sideSign = shooterPos.x >= 0 ? -1 : 1;
  const sideX = uy * sideSign;
  const sideY = -ux * sideSign;

  // Stage 1: Shooter Release behind-shoulder POV
  const camStartPos: Vec3 = {
    x: shooterPos.x - ux * 7.2 + sideX * 1.7,
    y: shooterPos.y - uy * 7.2 + sideY * 1.7,
    z: 6.45,
  };
  const camStartTarget: Vec3 = {
    x: lerp(shooterPos.x, hoopPos.x, 0.72),
    y: lerp(shooterPos.y, hoopPos.y, 0.72),
    z: 8.8,
  };

  // Stage 2: Mid-flight sweeping broadcast angle
  const midX = (shooterPos.x + hoopPos.x) * 0.5;
  const midY = (shooterPos.y + hoopPos.y) * 0.5;
  const camFlightPos: Vec3 = {
    x: midX + sideX * 13.8 - ux * 2.5,
    y: midY + sideY * 13.8 - uy * 2.5,
    z: 9.4,
  };
  const camFlightTarget: Vec3 = {
    x: lerp(ballPos.x, hoopPos.x, 0.52),
    y: lerp(ballPos.y, hoopPos.y, 0.52),
    z: lerp(ballPos.z, hoopPos.z + 0.6, 0.55),
  };

  // Stage 3: Tight rim-level slow-motion hero vantage
  const rimHeroSide = shooterPos.x >= 0 ? -1 : 1;
  const camRimPos: Vec3 = {
    x: hoopPos.x + rimHeroSide * 6.3,
    y: hoopPos.y + 4.9,
    z: hoopPos.z - 0.8,
  };
  const camRimTarget: Vec3 = {
    x: hoopPos.x,
    y: hoopPos.y,
    z: hoopPos.z + 0.15,
  };

  // Stage 4: Gentle celebration pull-out
  const camEndPos: Vec3 = {
    x: hoopPos.x + rimHeroSide * 8.1,
    y: hoopPos.y + 6.8,
    z: hoopPos.z + 0.3,
  };

  const flightEnd = Math.max(0.45, scoreAtTime - 0.16);
  if (playTime <= 0.12) {
    const denom = Math.max(0.12, preRollSec + 0.12);
    const t = smoothstep((playTime + preRollSec) / denom);
    return {
      pos: lerpVec3(camStartPos, { ...camStartPos, z: 6.7 }, t),
      target: camStartTarget,
      focalLength: lerp(1.05, 1.08, t),
    };
  }
  if (playTime <= flightEnd * 0.65) {
    const t = smoothstep((playTime - 0.12) / Math.max(0.25, flightEnd * 0.65 - 0.12));
    return {
      pos: lerpVec3(camStartPos, camFlightPos, t),
      target: lerpVec3(camStartTarget, camFlightTarget, t),
      focalLength: lerp(1.08, 1.03, t),
    };
  }
  if (playTime <= scoreAtTime + 0.12) {
    const t = smoothstep(
      (playTime - flightEnd * 0.65) / Math.max(0.28, scoreAtTime + 0.12 - flightEnd * 0.65)
    );
    return {
      pos: lerpVec3(camFlightPos, camRimPos, t),
      target: lerpVec3(camFlightTarget, camRimTarget, t),
      focalLength: lerp(1.03, 1.18, t),
    };
  }
  const t = smoothstep((playTime - (scoreAtTime + 0.12)) / 0.85);
  return {
    pos: lerpVec3(camRimPos, camEndPos, t),
    target: camRimTarget,
    focalLength: lerp(1.18, 1.07, t),
  };
}
