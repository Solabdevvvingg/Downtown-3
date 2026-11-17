import {
  BACKBOARD_BOTTOM_Z,
  BACKBOARD_TOP_Z,
  BACKBOARD_WIDTH,
  BACKBOARD_Y,
  BALL_RADIUS,
  GRAVITY_FT_S2,
  HOOP_POS,
  METER_PERFECT_CENTER,
  RIM_RADIUS,
} from './constants';
import { ActiveBall, DifficultyTier, ShotOutcome, Vec3 } from './types';

export interface ShotLaunchResult {
  vel: Vec3;
  intendedOutcome: ShotOutcome;
  timingQuality: 'PERFECT' | 'MAKE' | 'EARLY' | 'LATE';
  skipRimCollision: boolean;
}

/**
 * Computes initial 3D velocity vector with a true ~48-52 deg rainbow entry arc
 * so well-timed shots drop cleanly through the cylinder without clipping the iron.
 */
export function computeShotLaunch(
  releasePos: Vec3,
  meterValue: number,
  difficulty: DifficultyTier,
  windAccel: { x: number; y: number } = { x: 0, y: 0 },
  hoopPos: Vec3 = HOOP_POS
): ShotLaunchResult {
  const delta = meterValue - METER_PERFECT_CENTER;
  const absDelta = Math.abs(delta);
  const windMag = Math.hypot(windAccel.x, windAccel.y);

  const dirToHoopLen = Math.hypot(hoopPos.x - releasePos.x, hoopPos.y - releasePos.y) || 1;
  const ux = (hoopPos.x - releasePos.x) / dirToHoopLen;
  const uy = (hoopPos.y - releasePos.y) / dirToHoopLen;

  let targetX = hoopPos.x;
  let targetY = hoopPos.y;
  let targetZ = hoopPos.z;
  let flightTime = 1.24; // High rainbow arc (~49 deg entry angle)
  let intendedOutcome: ShotOutcome = 'SWISH';
  let timingQuality: 'PERFECT' | 'MAKE' | 'EARLY' | 'LATE' = 'PERFECT';
  let skipRimCollision = false;

  if (absDelta <= difficulty.perfectHalfWindow) {
    // Guaranteed pure dead-center swish
    intendedOutcome = 'SWISH';
    timingQuality = 'PERFECT';
    flightTime = 1.25;
    skipRimCollision = true;
  } else if (absDelta <= difficulty.makeHalfWindow) {
    // Good Make Zone: clean drop or gentle inside-rim roll that still goes in
    const norm = delta / difficulty.makeHalfWindow; // -1..1
    const offsetAlong = norm * 0.16;
    const lateralJitter = (Math.random() - 0.5) * 0.1;
    const perpX = -uy;
    const perpY = ux;
    targetX += ux * offsetAlong + perpX * lateralJitter;
    targetY += uy * offsetAlong + perpY * lateralJitter;
    flightTime = 1.22 + norm * 0.03;
    intendedOutcome = 'MAKE';
    timingQuality = 'MAKE';
    // When wind is strong on high streaks, borderline Good shots engage rim physics
    skipRimCollision = Math.abs(norm) < (windMag > 0.16 ? 0.38 : 0.72);
  } else if (delta < 0) {
    // Early release -> short
    timingQuality = 'EARLY';
    const missExcess = -difficulty.makeHalfWindow - delta;
    if (missExcess < 0.14) {
      // Front rim clank
      const shortDist = 0.88 + missExcess * 1.9;
      targetX -= ux * shortDist + (Math.random() - 0.5) * 0.2;
      targetY -= uy * shortDist + (Math.random() - 0.5) * 0.2;
      targetZ = hoopPos.z + 0.04;
      flightTime = 1.13;
      intendedOutcome = 'RIM_OUT';
    } else {
      // Short airball
      const shortDist = 1.85 + missExcess * 4.5;
      targetX -= ux * shortDist + (Math.random() - 0.5) * 0.3;
      targetY -= uy * shortDist + (Math.random() - 0.5) * 0.3;
      targetZ = hoopPos.z - 0.8;
      flightTime = 1.02;
      intendedOutcome = 'AIRBALL';
    }
  } else {
    // Late release -> long
    timingQuality = 'LATE';
    const missExcess = delta - difficulty.makeHalfWindow;
    if (missExcess < 0.14) {
      // Back rim / high off glass clank
      const longDist = 0.86 + missExcess * 1.9;
      targetX += ux * longDist + (Math.random() - 0.5) * 0.22;
      targetY += uy * longDist + (Math.random() - 0.5) * 0.22;
      targetZ = hoopPos.z + 0.16;
      flightTime = 1.27;
      intendedOutcome = 'RIM_OUT';
    } else {
      // Way long off backboard
      const longDist = 1.65 + missExcess * 4.2;
      targetX += ux * longDist + (Math.random() - 0.5) * 0.35;
      targetY += uy * longDist + (Math.random() - 0.5) * 0.35;
      targetZ = hoopPos.z + 1.15;
      flightTime = 1.29;
      intendedOutcome = 'RIM_OUT';
    }
  }

  const vx = (targetX - releasePos.x) / flightTime;
  const vy = (targetY - releasePos.y) / flightTime;
  const vz = (targetZ - releasePos.z - 0.5 * GRAVITY_FT_S2 * flightTime * flightTime) / flightTime;

  return {
    vel: { x: vx, y: vy, z: vz },
    intendedOutcome,
    timingQuality,
    skipRimCollision,
  };
}

export interface StepBallCallbacks {
  onScore: (ball: ActiveBall) => void;
  onMiss: (ball: ActiveBall) => void;
  onRimHit: (ball: ActiveBall, impactSpeed: number) => void;
  onBackboardHit: (ball: ActiveBall) => void;
}

export function stepBallPhysics(
  ball: ActiveBall,
  dt: number,
  cb: StepBallCallbacks,
  windAccel?: { x: number; y: number },
  hoopPos: Vec3 = HOOP_POS
): void {
  const substeps = 4;
  const subDt = dt / substeps;
  const backboardY = hoopPos.y + (BACKBOARD_Y - HOOP_POS.y);
  const backboardBottomZ = hoopPos.z + (BACKBOARD_BOTTOM_Z - HOOP_POS.z);
  const backboardTopZ = hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z);

  ball.age += dt;
  ball.spinAngle += ball.spinRate * dt;

  for (let s = 0; s < substeps; s++) {
    const prevZ = ball.pos.z;

    if (windAccel && !ball.isRemote && !ball.hasScored) {
      ball.vel.x += windAccel.x * subDt;
      ball.vel.y += windAccel.y * subDt;
    }
    ball.vel.z += GRAVITY_FT_S2 * subDt;
    ball.pos.x += ball.vel.x * subDt;
    ball.pos.y += ball.vel.y * subDt;
    ball.pos.z += ball.vel.z * subDt;

    // Backboard collision (skip for guaranteed swish/make drops)
    if (
      !ball.skipRimCollision &&
      ball.vel.y < 0 &&
      ball.pos.y <= backboardY + BALL_RADIUS &&
      ball.pos.y >= backboardY - 0.45 &&
      Math.abs(ball.pos.x - hoopPos.x) <= BACKBOARD_WIDTH * 0.5 &&
      ball.pos.z >= backboardBottomZ &&
      ball.pos.z <= backboardTopZ
    ) {
      ball.pos.y = backboardY + BALL_RADIUS;
      ball.vel.y = -ball.vel.y * 0.62;
      ball.vel.x *= 0.88;
      ball.vel.z *= 0.84;
      if (!ball.hitBackboard) {
        ball.hitBackboard = true;
        cb.onBackboardHit(ball);
      }
    }

    // Rim torus collision (skipped for clean SWISH / center MAKE shots)
    if (!ball.skipRimCollision && Math.abs(ball.pos.z - hoopPos.z) < 0.72) {
      const relX = ball.pos.x - hoopPos.x;
      const relY = ball.pos.y - hoopPos.y;
      const rHoriz = Math.hypot(relX, relY);
      if (rHoriz > 0.001) {
        const closestX = hoopPos.x + (relX / rHoriz) * RIM_RADIUS;
        const closestY = hoopPos.y + (relY / rHoriz) * RIM_RADIUS;
        const closestZ = hoopPos.z;

        const dx = ball.pos.x - closestX;
        const dy = ball.pos.y - closestY;
        const dz = ball.pos.z - closestZ;
        const dist = Math.hypot(dx, dy, dz);
        const minDist = BALL_RADIUS + 0.045;

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          const overlap = minDist - dist;
          ball.pos.x += nx * overlap;
          ball.pos.y += ny * overlap;
          ball.pos.z += nz * overlap;

          const vn = ball.vel.x * nx + ball.vel.y * ny + ball.vel.z * nz;
          if (vn < 0) {
            // If intended MAKE, damp bounce gently into cylinder
            const restitution = ball.intendedOutcome === 'MAKE' ? 0.25 : 0.56;
            ball.vel.x -= (1 + restitution) * vn * nx;
            ball.vel.y -= (1 + restitution) * vn * ny;
            ball.vel.z -= (1 + restitution) * vn * nz;
            ball.vel.x *= 0.85;
            ball.vel.y *= 0.85;
            ball.hitRimCount += 1;
            cb.onRimHit(ball, Math.abs(vn));
          }
        }
      }
    }

    // Score check: passing downward through hoop plane inside rim cylinder
    if (!ball.hasScored && prevZ >= hoopPos.z && ball.pos.z < hoopPos.z && ball.vel.z < 0) {
      const rHoriz = Math.hypot(ball.pos.x - hoopPos.x, ball.pos.y - hoopPos.y);
      if (rHoriz < RIM_RADIUS - 0.04) {
        ball.hasScored = true;
        ball.hasResolved = true;
        ball.vel.x *= 0.25;
        ball.vel.y *= 0.25;
        ball.vel.z *= 0.72;
        cb.onScore(ball);
      }
    }

    // Early miss detection once clearly below rim outside cylinder
    if (
      !ball.hasScored &&
      !ball.hasResolved &&
      ball.vel.z < 0 &&
      ball.pos.z < hoopPos.z - 1.7 &&
      Math.hypot(ball.pos.x - hoopPos.x, ball.pos.y - hoopPos.y) > RIM_RADIUS + 0.55
    ) {
      ball.hasResolved = true;
      cb.onMiss(ball);
    }

    // Floor bounce
    if (ball.pos.z <= BALL_RADIUS && ball.vel.z < 0) {
      ball.pos.z = BALL_RADIUS;
      ball.vel.z = -ball.vel.z * 0.58;
      ball.vel.x *= 0.82;
      ball.vel.y *= 0.82;
      ball.spinRate *= 0.7;

      if (!ball.hasScored && !ball.hasResolved) {
        ball.hasResolved = true;
        cb.onMiss(ball);
      }
    }
  }

  // Record trail (longer history on high-streak shots)
  ball.trail.push({ ...ball.pos });
  const maxTrailLen = (ball.streakAtRelease ?? 0) >= 3 ? 28 : 14;
  if (ball.trail.length > maxTrailLen) {
    ball.trail.shift();
  }
}
