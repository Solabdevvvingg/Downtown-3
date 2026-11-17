import {
  BACKBOARD_BOTTOM_Z,
  BACKBOARD_TOP_Z,
  BACKBOARD_WIDTH,
  BACKBOARD_Y,
  BALL_RADIUS,
  BALLS_PER_RACK,
  BASELINE_Y,
  HOOP_POS,
  METER_PERFECT_CENTER,
  RACK_CONFIGS,
  RIM_RADIUS,
} from './constants';
import {
  buildCameraBasis,
  CameraRig,
  drawWorldPolygon,
  drawWorldPolyline,
  projectPoint,
} from './projection';
import {
  ActiveBall,
  BallSlotRecord,
  DifficultyTier,
  Flashbulb,
  FloatingCallout,
  GameMode,
  GamePhase,
  OpponentGhostState,
  Particle,
  ProjectedPoint,
  Vec3,
} from './types';

export interface RenderState {
  mode: GameMode;
  phase: GamePhase;
  camera: CameraRig;
  hoopPos: Vec3;
  shooterPos: Vec3;
  shooterZ: number;
  shooterFacing: { x: number; y: number };
  runPhase: number;
  isMovingToRack: boolean;
  gatherAmount: number;
  followThroughAmount: number;
  isHoldingShot: boolean;
  meterValue: number;
  meterFeedbackTimer: number;
  lastReleaseMeter: number;
  lastReleaseLabel: string | null;
  lastReleaseColor: string;
  difficulty: DifficultyTier;
  streak: number;
  multiplier: number;
  currentRack: number;
  currentBall: number;
  moneyRack: number;
  ballsRecord: BallSlotRecord[];
  activeBalls: ActiveBall[];
  opponentGhost: OpponentGhostState | null;
  particles: Particle[];
  callouts: FloatingCallout[];
  flashbulbs: Flashbulb[];
  netWhip: number;
  netWhipPhase: number;
  rimShake: number;
  screenShake: number;
  clockTime: number;
  timeLeft: number;
  hasShotAnyBall: boolean;
  shooterName?: string;
  crowdHypeTimer?: number;
  crowdHypeDuration?: number;
}

export function renderArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RenderState
): void {
  ctx.save();

  // Apply decaying camera shake
  if (state.screenShake > 0.01) {
    const sx = (Math.random() - 0.5) * state.screenShake * 10;
    const sy = (Math.random() - 0.5) * state.screenShake * 8;
    ctx.translate(sx, sy);
  }

  // 1. Arena Dark Backdrop & Crowd Bowl
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#07090E');
  bgGrad.addColorStop(0.45, '#0F1522');
  bgGrad.addColorStop(1, '#121824');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const hypeBurst =
    state.crowdHypeTimer && state.crowdHypeDuration && state.crowdHypeTimer > 0
      ? Math.sin((state.crowdHypeTimer / state.crowdHypeDuration) * Math.PI)
      : 0;

  // Dynamic arena lighting: smoothly dim stadium lights during final ~10 seconds (disabled in Heat Check)
  const isClockActive = state.mode !== 'HEAT_CHECK';
  const rawClutch =
    isClockActive && (state.phase === 'PLAYING' || state.phase === 'PAUSED')
      ? Math.max(0, Math.min(1, (10.5 - state.timeLeft) / 10.5))
      : 0;
  const dimFactor = Math.pow(rawClutch, 0.85);

  drawArenaSpotlights(
    ctx,
    width,
    height,
    state.streak,
    hypeBurst,
    state.clockTime,
    dimFactor,
    isClockActive && state.phase === 'PLAYING' ? state.timeLeft : 60
  );
  drawArenaCrowd(
    ctx,
    width,
    height,
    state.flashbulbs,
    state.clockTime,
    state.streak,
    hypeBurst
  );

  if (dimFactor > 0.01) {
    ctx.fillStyle = `rgba(4, 6, 12, ${(dimFactor * 0.48).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height * 0.46);
  }

  // 2. Build 3D->2D camera basis
  const basis = buildCameraBasis(state.camera, width, height);

  // 3. Draw Hardwood Court & Markings
  drawCourtFloor(ctx, basis);

  // In Heat Check mode, draw subtle court floor beacon under the relocated hoop for spatial clarity
  if (state.mode === 'HEAT_CHECK') {
    const shiftDist = Math.hypot(state.hoopPos.x - HOOP_POS.x, state.hoopPos.y - HOOP_POS.y);
    if (shiftDist > 0.15 || Math.abs(state.hoopPos.z - HOOP_POS.z) > 0.1) {
      const floorRingPts: Vec3[] = [];
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        floorRingPts.push({
          x: state.hoopPos.x + Math.cos(a) * 1.15,
          y: state.hoopPos.y + Math.sin(a) * 1.15,
          z: 0.03,
        });
      }
      drawWorldPolyline(ctx, basis, floorRingPts, 'rgba(245, 158, 11, 0.42)', 1.8);
    }
  }

  if (dimFactor > 0.01) {
    // Clutch spotlight vignette: darkens outer court apron while keeping hoop & shooter illuminated
    const clutchVig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.47,
      Math.min(width, height) * 0.22,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    clutchVig.addColorStop(0, 'rgba(4, 6, 12, 0)');
    clutchVig.addColorStop(0.55, `rgba(4, 6, 12, ${(dimFactor * 0.16).toFixed(3)})`);
    clutchVig.addColorStop(1, `rgba(4, 6, 12, ${(dimFactor * 0.42).toFixed(3)})`);
    ctx.fillStyle = clutchVig;
    ctx.fillRect(0, 0, width, height);
  }

  // 4. Draw Stanchion anchored dynamically to moving hoopPos
  drawStanchion(ctx, basis, state.hoopPos);

  // 5. Collect depth-sorted elements
  const drawables: { depth: number; draw: () => void }[] = [];

  for (let r = 0; r < RACK_CONFIGS.length; r++) {
    const rack = RACK_CONFIGS[r];
    const rackWorldPos: Vec3 = {
      x: rack.x + rack.rackOffsetX,
      y: rack.y + rack.rackOffsetY,
      z: 0,
    };
    const p = projectPoint(basis, rackWorldPos);
    if (p.visible) {
      drawables.push({
        depth: p.depth,
        draw: () => drawBallRack(ctx, basis, r, state),
      });
    }
  }

  // Opponent Ghost Shooter (in PVP)
  if (state.opponentGhost && state.opponentGhost.active) {
    const gPos = state.opponentGhost.pos;
    const gp = projectPoint(basis, { x: gPos.x, y: gPos.y, z: 0 });
    if (gp.visible) {
      drawables.push({
        depth: gp.depth + 0.05,
        draw: () => drawOpponentGhost(ctx, basis, state.opponentGhost!, state.clockTime),
      });
    }
  }

  // Local Shooter
  const shooterProj = projectPoint(basis, {
    x: state.shooterPos.x,
    y: state.shooterPos.y,
    z: 0,
  });
  if (shooterProj.visible) {
    drawables.push({
      depth: shooterProj.depth,
      draw: () => drawShooter(ctx, basis, state),
    });
  }

  // Hoop & Backboard depth anchor
  const hoopProj = projectPoint(basis, state.hoopPos);
  if (hoopProj.visible) {
    drawables.push({
      depth: hoopProj.depth + 1.35,
      draw: () => drawBackboard(ctx, basis, state.hoopPos, state.mode === 'HEAT_CHECK'),
    });
    drawables.push({
      depth: hoopProj.depth + 0.15,
      draw: () => drawHoopAndNet(ctx, basis, state, 'back'),
    });
    drawables.push({
      depth: hoopProj.depth - 0.15,
      draw: () => drawHoopAndNet(ctx, basis, state, 'front'),
    });
  }

  // Active balls in flight
  for (const ball of state.activeBalls) {
    const bp = projectPoint(basis, ball.pos);
    if (bp.visible) {
      drawables.push({
        depth: bp.depth,
        draw: () => drawActiveBall(ctx, basis, ball, state.streak),
      });
    }
  }

  // Trail particles depth-sorted with scene geometry so arcs sit naturally behind foreground shooter & ball
  for (const pt of state.particles) {
    if (!pt.isTrail) continue;
    const pp = projectPoint(basis, { x: pt.x, y: pt.y, z: pt.z });
    if (pp.visible) {
      drawables.push({
        depth: pp.depth + 0.25,
        draw: () => drawTrailParticle(ctx, pp.x, pp.y, pp.scale, pt),
      });
    }
  }

  drawables.sort((a, b) => b.depth - a.depth);
  for (const item of drawables) {
    item.draw();
  }

  // 6. Burst Particles (rim/swish sparks)
  drawParticles(ctx, basis, state.particles);

  // 7. Shot Timing Arc Meter
  if (state.phase === 'PLAYING') {
    drawShotMeter(ctx, basis, width, height, state);
  }

  // 8. Floating Callouts
  drawCallouts(ctx, basis, width, state.callouts);

  ctx.restore();
}

function drawArenaSpotlights(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  streak: number,
  hypeBurst: number,
  clockTime: number,
  dimFactor: number,
  timeLeft: number
): void {
  ctx.save();
  const sweep = hypeBurst > 0.02 ? Math.sin(clockTime * 4.5) * width * 0.06 * hypeBurst : 0;
  const sideScale = Math.max(0.28, 1 - dimFactor * 0.65);
  const centerBoost = 1 + dimFactor * 0.55;
  const beams = [
    { x0: width * 0.22, x1: width * 0.36 + sweep, w: width * 0.24, mult: sideScale },
    { x0: width * 0.5, x1: width * 0.5 - sweep * 0.6, w: width * (0.32 - dimFactor * 0.07), mult: centerBoost },
    { x0: width * 0.78, x1: width * 0.64 + sweep, w: width * 0.24, mult: sideScale },
  ];
  const baseAlpha = (streak >= 3 ? 0.085 : 0.055) + hypeBurst * 0.09;
  for (const b of beams) {
    const warmAlpha = baseAlpha * b.mult;
    const grad = ctx.createLinearGradient(b.x0, 0, b.x1, height * 0.8);
    grad.addColorStop(
      0,
      hypeBurst > 0.05
        ? `rgba(253, 212, 118, ${warmAlpha})`
        : `rgba(255, 224, 178, ${warmAlpha})`
    );
    grad.addColorStop(0.7, `rgba(255, 210, 150, ${(0.015 + hypeBurst * 0.035) * b.mult})`);
    grad.addColorStop(1, 'rgba(255, 210, 150, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(b.x0 - b.w * 0.16, 0);
    ctx.lineTo(b.x0 + b.w * 0.16, 0);
    ctx.lineTo(b.x1 + b.w * 0.65, height * 0.85);
    ctx.lineTo(b.x1 - b.w * 0.65, height * 0.85);
    ctx.closePath();
    ctx.fill();
  }

  if (timeLeft <= 5.0 && dimFactor > 0.35) {
    const urgentPulse = 0.5 + 0.5 * Math.sin(clockTime * 7.2);
    const tensionAlpha = (0.04 + urgentPulse * 0.055) * ((5.0 - Math.max(0, timeLeft)) / 5.0);
    const rimGrad = ctx.createLinearGradient(0, 0, 0, height * 0.35);
    rimGrad.addColorStop(0, `rgba(239, 68, 68, ${tensionAlpha.toFixed(3)})`);
    rimGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, width, height * 0.35);
  }

  if (hypeBurst > 0.03) {
    const horizonGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.28,
      width * 0.04,
      width * 0.5,
      height * 0.28,
      width * 0.58
    );
    horizonGlow.addColorStop(0, `rgba(245, 158, 11, ${hypeBurst * 0.22})`);
    horizonGlow.addColorStop(0.55, `rgba(249, 99, 28, ${hypeBurst * 0.09})`);
    horizonGlow.addColorStop(1, 'rgba(249, 99, 28, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, width, height * 0.55);
  }
  ctx.restore();
}

function drawArenaCrowd(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  flashbulbs: Flashbulb[],
  clockTime: number,
  streak: number,
  hypeBurst: number
): void {
  ctx.save();
  const standTop = height * 0.14;
  const standBot = height * 0.44;
  const standHeight = standBot - standTop;
  ctx.fillStyle = '#0D111A';
  ctx.fillRect(0, standTop, width, standHeight);

  // Tiered bleacher risers + subtle silhouetted spectators
  const rows = 7;
  const hype = Math.min(1.6, (streak >= 6 ? 1.0 : streak >= 3 ? 0.65 : 0.25) + hypeBurst * 0.9);
  const bobSpeed = streak >= 3 || hypeBurst > 0.1 ? 6.5 + hypeBurst * 3.5 : 2.2;

  for (let row = 0; row < rows; row++) {
    const rowFrac = row / rows;
    const y = standTop + rowFrac * standHeight;

    ctx.strokeStyle =
      hypeBurst > 0.08
        ? `rgba(245, 158, 11, ${0.035 + hypeBurst * 0.12})`
        : 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    const spacing = Math.max(16, Math.round(14 + row * 2.2));
    const headR = Math.max(2.6, 2.8 + row * 0.35);
    const shade = 18 + row * 2 + Math.round(hypeBurst * 10);
    ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 16})`;

    const offset = (row % 2) * (spacing * 0.5);
    for (let x = offset, seat = 0; x < width + spacing; x += spacing, seat++) {
      const seed = (row * 31 + seat * 17) % 13;
      const stadiumWave =
        hypeBurst > 0.05
          ? Math.max(0, Math.sin(x * 0.02 - clockTime * 11.5 - row * 0.35)) *
            hypeBurst *
            (5.5 + row * 0.5)
          : 0;
      const sway =
        Math.sin(clockTime * bobSpeed + seed * 0.7) * (1.1 + hype * 2.6) - stadiumWave;
      const sx = x + ((seed % 5) - 2) * 1.4;
      const sy = y + headR * 1.2 + sway;

      // Shoulders
      ctx.beginPath();
      ctx.ellipse(sx, sy + headR * 1.35, headR * 1.45, headR * 1.05, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(sx, sy, headR * 0.78, 0, Math.PI * 2);
      ctx.fill();

      // Raised cheering arms on hot streaks or record-streak stadium eruptions
      const raiseArms =
        (streak >= 3 && seed % 4 === 0) ||
        (hypeBurst > 0.12 && (seed % 2 === 0 || stadiumWave > 1.8));
      if (raiseArms) {
        const armR = hypeBurst > 0.15 ? shade + 24 : shade + 4;
        const armG = hypeBurst > 0.15 ? shade + 18 : shade + 10;
        const armB = hypeBurst > 0.15 ? shade + 10 : shade + 22;
        ctx.strokeStyle = `rgb(${armR}, ${armG}, ${armB})`;
        ctx.lineWidth = Math.max(1.2, headR * 0.38);
        ctx.beginPath();
        ctx.moveTo(sx - headR * 0.9, sy + headR * 0.5);
        ctx.lineTo(sx - headR * 1.35, sy - headR * (0.95 + hype * 0.45));
        ctx.moveTo(sx + headR * 0.9, sy + headR * 0.5);
        ctx.lineTo(sx + headR * 1.35, sy - headR * (0.95 + hype * 0.45));
        ctx.stroke();
      }
    }
  }

  for (const fb of flashbulbs) {
    const t = fb.life / fb.maxLife;
    const alpha = Math.sin(t * Math.PI);
    const fx = fb.x * width;
    const fy = fb.y * height;
    const r = fb.size * (0.6 + 0.5 * (1 - t));
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    grad.addColorStop(0, `rgba(255, 252, 240, ${alpha * 0.9})`);
    grad.addColorStop(0.3, `rgba(255, 230, 180, ${alpha * 0.35})`);
    grad.addColorStop(1, 'rgba(255, 230, 180, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCourtFloor(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>
): void {
  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: -34, y: -10, z: 0 },
      { x: 34, y: -10, z: 0 },
      { x: 34, y: 38, z: 0 },
      { x: -34, y: 38, z: 0 },
    ],
    '#141C2B'
  );

  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: -25, y: BASELINE_Y, z: 0 },
      { x: 25, y: BASELINE_Y, z: 0 },
      { x: 25, y: 34, z: 0 },
      { x: -25, y: 34, z: 0 },
    ],
    '#C48447'
  );

  const plankColors = ['#C88A4E', '#BC7B3F', '#CE9156', '#C08044'];
  const stripWidth = 2.5;
  for (let x = -25, idx = 0; x < 25; x += stripWidth, idx++) {
    const color = plankColors[idx % plankColors.length];
    drawWorldPolygon(
      ctx,
      basis,
      [
        { x, y: BASELINE_Y, z: 0 },
        { x: Math.min(25, x + stripWidth), y: BASELINE_Y, z: 0 },
        { x: Math.min(25, x + stripWidth), y: 34, z: 0 },
        { x, y: 34, z: 0 },
      ],
      color
    );
  }

  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: -8, y: BASELINE_Y, z: 0 },
      { x: 8, y: BASELINE_Y, z: 0 },
      { x: 8, y: 14.8, z: 0 },
      { x: -8, y: 14.8, z: 0 },
    ],
    '#182741'
  );

  const ftCirclePts: Vec3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ftCirclePts.push({
      x: Math.cos(a) * 6,
      y: 14.8 + Math.sin(a) * 6,
      z: 0,
    });
  }
  drawWorldPolyline(ctx, basis, ftCirclePts, 'rgba(244, 239, 230, 0.85)', 2);

  const lineColor = 'rgba(244, 239, 230, 0.9)';
  drawWorldPolyline(
    ctx,
    basis,
    [
      { x: -25, y: BASELINE_Y, z: 0 },
      { x: 25, y: BASELINE_Y, z: 0 },
      { x: 25, y: 34, z: 0 },
      { x: -25, y: 34, z: 0 },
      { x: -25, y: BASELINE_Y, z: 0 },
    ],
    lineColor,
    2.4
  );

  drawWorldPolyline(
    ctx,
    basis,
    [
      { x: -8, y: BASELINE_Y, z: 0 },
      { x: -8, y: 14.8, z: 0 },
      { x: 8, y: 14.8, z: 0 },
      { x: 8, y: BASELINE_Y, z: 0 },
    ],
    lineColor,
    2.2
  );

  const restrictedPts: Vec3[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    restrictedPts.push({
      x: Math.cos(a) * 4,
      y: Math.sin(a) * 4,
      z: 0,
    });
  }
  drawWorldPolyline(ctx, basis, restrictedPts, lineColor, 2);

  const threePts: Vec3[] = [];
  const cornerAngle = Math.acos(22 / 23.75);
  const cornerJoinY = Math.sin(cornerAngle) * 23.75;
  threePts.push({ x: -22, y: BASELINE_Y, z: 0 });
  threePts.push({ x: -22, y: cornerJoinY, z: 0 });

  const arcSteps = 44;
  for (let i = 0; i <= arcSteps; i++) {
    const a = Math.PI - cornerAngle - (i / arcSteps) * (Math.PI - 2 * cornerAngle);
    threePts.push({
      x: Math.cos(a) * 23.75,
      y: Math.sin(a) * 23.75,
      z: 0,
    });
  }
  threePts.push({ x: 22, y: cornerJoinY, z: 0 });
  threePts.push({ x: 22, y: BASELINE_Y, z: 0 });
  drawWorldPolyline(ctx, basis, threePts, '#F8F4EC', 2.8);

  for (const rack of RACK_CONFIGS) {
    const markerPts: Vec3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      markerPts.push({
        x: rack.x + Math.cos(a) * 1.15,
        y: rack.y + Math.sin(a) * 1.15,
        z: 0,
      });
    }
    drawWorldPolyline(ctx, basis, markerPts, 'rgba(249, 99, 28, 0.35)', 1.5);
  }
}

function drawStanchion(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  hoopPos: Vec3
): void {
  const ox = hoopPos.x;
  const oy = hoopPos.y;
  const oz = hoopPos.z - HOOP_POS.z;
  const backboardY = oy + (BACKBOARD_Y - HOOP_POS.y);

  const baseBack = projectPoint(basis, { x: ox, y: backboardY - 3.6, z: 0 });
  const topPost = projectPoint(basis, { x: ox, y: backboardY - 3.6, z: 11.4 + oz });
  const armJoint = projectPoint(basis, { x: ox, y: backboardY - 0.15, z: 11.4 + oz });
  if (!baseBack.visible || !topPost.visible || !armJoint.visible) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = '#181D29';
  ctx.lineWidth = Math.max(8, topPost.scale * 0.95);
  ctx.beginPath();
  ctx.moveTo(baseBack.x, baseBack.y);
  ctx.lineTo(topPost.x, topPost.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = Math.max(2, topPost.scale * 0.16);
  ctx.beginPath();
  ctx.moveTo(baseBack.x, baseBack.y);
  ctx.lineTo(topPost.x, topPost.y);
  ctx.lineTo(armJoint.x, armJoint.y);
  ctx.stroke();

  ctx.strokeStyle = '#202636';
  ctx.lineWidth = Math.max(6, armJoint.scale * 0.65);
  ctx.beginPath();
  ctx.moveTo(topPost.x, topPost.y);
  ctx.lineTo(armJoint.x, armJoint.y);
  ctx.stroke();
  ctx.restore();
}

function drawBackboard(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  hoopPos: Vec3,
  highlightMove = false
): void {
  const ox = hoopPos.x;
  const oy = hoopPos.y + (BACKBOARD_Y - HOOP_POS.y);
  const oz = hoopPos.z - HOOP_POS.z;
  const hw = BACKBOARD_WIDTH * 0.5;
  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: ox - hw, y: oy, z: BACKBOARD_BOTTOM_Z + oz },
      { x: ox + hw, y: oy, z: BACKBOARD_BOTTOM_Z + oz },
      { x: ox + hw, y: oy, z: BACKBOARD_TOP_Z + oz },
      { x: ox - hw, y: oy, z: BACKBOARD_TOP_Z + oz },
    ],
    highlightMove ? 'rgba(245, 196, 120, 0.18)' : 'rgba(210, 232, 255, 0.16)',
    highlightMove ? 'rgba(253, 224, 150, 0.94)' : 'rgba(248, 244, 236, 0.92)',
    2.6
  );

  drawWorldPolyline(
    ctx,
    basis,
    [
      { x: ox - 1.0, y: oy + 0.02, z: 10.0 + oz },
      { x: ox + 1.0, y: oy + 0.02, z: 10.0 + oz },
      { x: ox + 1.0, y: oy + 0.02, z: 11.5 + oz },
      { x: ox - 1.0, y: oy + 0.02, z: 11.5 + oz },
      { x: ox - 1.0, y: oy + 0.02, z: 10.0 + oz },
    ],
    highlightMove ? 'rgba(245, 158, 11, 0.92)' : 'rgba(248, 244, 236, 0.85)',
    2
  );
}

function drawHoopAndNet(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  state: RenderState,
  half: 'back' | 'front'
): void {
  const shakeOffset = state.rimShake * Math.sin(state.clockTime * 55) * 0.06;
  const hx = state.hoopPos.x;
  const hy = state.hoopPos.y;
  const hoopZ = state.hoopPos.z + shakeOffset;
  const backboardY = hy + (BACKBOARD_Y - HOOP_POS.y);

  const rimPts: Vec3[] = [];
  const startAngle = half === 'back' ? Math.PI : 0;
  const endAngle = half === 'back' ? Math.PI * 2 : Math.PI;
  const steps = 16;

  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (i / steps) * (endAngle - startAngle);
    rimPts.push({
      x: hx + Math.cos(a) * RIM_RADIUS,
      y: hy + Math.sin(a) * RIM_RADIUS,
      z: hoopZ,
    });
  }

  const strands = 7;
  const whip = state.netWhip;
  const netBottomZ = hoopZ - 1.38 + whip * 0.42;
  const bottomRadius = RIM_RADIUS * (0.56 + whip * 0.34);

  for (let i = 0; i < strands; i++) {
    const t = i / strands;
    const a = startAngle + t * (endAngle - startAngle);
    const topPt: Vec3 = {
      x: hx + Math.cos(a) * RIM_RADIUS,
      y: hy + Math.sin(a) * RIM_RADIUS,
      z: hoopZ,
    };
    const midSwishX =
      hx +
      Math.cos(a + whip * 0.25 * Math.sin(state.netWhipPhase + i)) *
        (RIM_RADIUS * 0.72 + whip * 0.22);
    const midSwishY =
      hy +
      Math.sin(a + whip * 0.25 * Math.sin(state.netWhipPhase + i)) *
        (RIM_RADIUS * 0.72 + whip * 0.22);
    const midPt: Vec3 = {
      x: midSwishX,
      y: midSwishY,
      z: hoopZ - 0.68 + whip * 0.24,
    };
    const botPt: Vec3 = {
      x: hx + Math.cos(a) * bottomRadius,
      y: hy + Math.sin(a) * bottomRadius,
      z: netBottomZ,
    };
    drawWorldPolyline(
      ctx,
      basis,
      [topPt, midPt, botPt],
      half === 'front' ? 'rgba(248, 244, 236, 0.88)' : 'rgba(248, 244, 236, 0.5)',
      1.6
    );
  }

  drawWorldPolyline(
    ctx,
    basis,
    rimPts,
    state.mode === 'HEAT_CHECK' ? '#F59E0B' : '#F9631C',
    4.2
  );

  if (half === 'back') {
    drawWorldPolyline(
      ctx,
      basis,
      [
        { x: hx, y: hy - RIM_RADIUS, z: hoopZ },
        { x: hx, y: backboardY, z: hoopZ },
      ],
      '#E04E0D',
      5
    );
  }
}

function drawBallRack(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  rackIndex: number,
  state: RenderState
): void {
  const rack = RACK_CONFIGS[rackIndex];
  const rx = rack.x + rack.rackOffsetX;
  const ry = rack.y + rack.rackOffsetY;

  const len = Math.hypot(rack.x, rack.y) || 1;
  const tx = -rack.y / len;
  const ty = rack.x / len;

  const railHalf = 1.65;
  const pLeftBot = projectPoint(basis, { x: rx - tx * railHalf, y: ry - ty * railHalf, z: 0 });
  const pRightBot = projectPoint(basis, { x: rx + tx * railHalf, y: ry + ty * railHalf, z: 0 });
  const pLeftTop = projectPoint(basis, { x: rx - tx * railHalf, y: ry - ty * railHalf, z: 2.8 });
  const pRightTop = projectPoint(basis, { x: rx + tx * railHalf, y: ry + ty * railHalf, z: 2.8 });

  if (!pLeftBot.visible || !pRightBot.visible || !pLeftTop.visible || !pRightTop.visible) return;

  ctx.save();
  const isActiveRack = state.phase !== 'TITLE' && rackIndex === state.currentRack;
  ctx.strokeStyle = isActiveRack ? '#5B677D' : '#353E50';
  ctx.lineWidth = Math.max(2, pLeftTop.scale * 0.14);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(pLeftBot.x, pLeftBot.y);
  ctx.lineTo(pLeftTop.x, pLeftTop.y);
  ctx.lineTo(pRightTop.x, pRightTop.y);
  ctx.lineTo(pRightBot.x, pRightBot.y);
  ctx.stroke();

  const startIdx = rackIndex * BALLS_PER_RACK;
  for (let b = 0; b < BALLS_PER_RACK; b++) {
    const slot = state.ballsRecord[startIdx + b];
    const isCurrentlyInHands =
      isActiveRack &&
      b === state.currentBall &&
      (state.phase === 'PLAYING' || state.phase === 'COUNTDOWN') &&
      !state.isMovingToRack;
    if (!slot || slot.status !== 'PENDING' || isCurrentlyInHands) continue;

    const u = (b - 2) * 0.72;
    const ballPos: Vec3 = {
      x: rx + tx * u,
      y: ry + ty * u,
      z: 2.8 + BALL_RADIUS * 0.9,
    };
    const bp = projectPoint(basis, ballPos);
    if (bp.visible) {
      drawBasketballSprite(ctx, bp.x, bp.y, BALL_RADIUS * bp.scale, slot.isMoney, b * 0.7);
    }
  }
  ctx.restore();
}

function drawBasketballSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  isMoney: boolean,
  spinAngle: number,
  heatGlow = 0,
  isRemote = false
): void {
  if (r < 1.5) return;
  ctx.save();

  if (isRemote) {
    ctx.globalAlpha = 0.65;
  }

  if (heatGlow > 0 && !isRemote) {
    ctx.shadowColor = isMoney ? '#F59E0B' : '#F9631C';
    ctx.shadowBlur = Math.min(18, r * 0.9 * heatGlow);
  }

  const grad = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.32, r * 0.1, cx, cy, r);
  if (isRemote) {
    grad.addColorStop(0, '#93C5FD');
    grad.addColorStop(0.5, '#3B82F6');
    grad.addColorStop(1, '#1E3A8A');
  } else if (isMoney) {
    grad.addColorStop(0, '#FDE68A');
    grad.addColorStop(0.35, '#F59E0B');
    grad.addColorStop(0.75, '#B45309');
    grad.addColorStop(1, '#78350F');
  } else {
    grad.addColorStop(0, '#FB923C');
    grad.addColorStop(0.4, '#F9631C');
    grad.addColorStop(0.82, '#C2410C');
    grad.addColorStop(1, '#7C2D12');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (isMoney && !isRemote) {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.86)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.45 * Math.cos(spinAngle), cy, r * 0.32, r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(29, 78, 216, 0.85)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.48 * Math.cos(spinAngle), cy, r * 0.3, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(20, 14, 10, 0.72)';
  ctx.lineWidth = Math.max(1, r * 0.085);

  const seamOffset = Math.sin(spinAngle) * r * 0.45;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + seamOffset * 0.25);
  ctx.quadraticCurveTo(cx, cy + seamOffset, cx + r, cy - seamOffset * 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + seamOffset * 0.3, cy - r);
  ctx.quadraticCurveTo(cx - seamOffset, cy, cx - seamOffset * 0.3, cy + r);
  ctx.stroke();

  ctx.restore();
}

function drawActiveBall(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  ball: ActiveBall,
  streak: number
): void {
  const shadowP = projectPoint(basis, { x: ball.pos.x, y: ball.pos.y, z: 0.02 });
  if (shadowP.visible) {
    const heightFactor = Math.max(0.28, 1 - ball.pos.z / 20);
    const sr = BALL_RADIUS * shadowP.scale * (0.8 + 0.35 * (1 - heightFactor));
    ctx.save();
    ctx.fillStyle = `rgba(6, 8, 12, ${(ball.isRemote ? 0.18 : 0.38) * heightFactor})`;
    ctx.beginPath();
    ctx.ellipse(shadowP.x, shadowP.y, sr * 1.15, sr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const effectiveStreak = Math.max(streak, ball.streakAtRelease ?? 0);
  const isHighStreak = !ball.isRemote && effectiveStreak >= 3;

  if ((ball.isRemote || isHighStreak || ball.isMoney) && ball.trail.length > 2) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < ball.trail.length; i++) {
      const p0 = projectPoint(basis, ball.trail[i - 1]);
      const p1 = projectPoint(basis, ball.trail[i]);
      if (!p0.visible || !p1.visible) continue;
      const frac = i / ball.trail.length;
      const fade = frac * frac;

      if (isHighStreak) {
        // Outer luminous trajectory aura
        ctx.strokeStyle =
          effectiveStreak >= 6 || ball.isMoney
            ? `rgba(245, 158, 11, ${fade * 0.28})`
            : `rgba(249, 99, 28, ${fade * 0.26})`;
        ctx.lineWidth = Math.max(2, BALL_RADIUS * p1.scale * 1.9 * frac);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        // Inner crisp arc filament
        ctx.strokeStyle =
          effectiveStreak >= 9
            ? `rgba(254, 240, 138, ${fade * 0.72})`
            : effectiveStreak >= 6 || ball.isMoney
              ? `rgba(253, 224, 71, ${fade * 0.62})`
              : `rgba(253, 186, 116, ${fade * 0.56})`;
        ctx.lineWidth = Math.max(1.2, BALL_RADIUS * p1.scale * 0.78 * frac);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = ball.isRemote
          ? `rgba(96, 165, 250, ${fade * 0.35})`
          : `rgba(245, 158, 11, ${fade * 0.45})`;
        ctx.lineWidth = Math.max(1.5, BALL_RADIUS * p1.scale * 1.1 * frac);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const bp = projectPoint(basis, ball.pos);
  if (bp.visible) {
    drawBasketballSprite(
      ctx,
      bp.x,
      bp.y,
      BALL_RADIUS * bp.scale,
      ball.isMoney,
      ball.spinAngle,
      effectiveStreak >= 6 ? 1.25 : effectiveStreak >= 3 ? 1 : ball.isMoney ? 0.6 : 0,
      Boolean(ball.isRemote)
    );
  }
}

interface AthleteRenderParams {
  pos: Vec3;
  z: number;
  facing?: { x: number; y: number };
  runPhase?: number;
  isMoving: boolean;
  isDribbling?: boolean;
  gatherAmount: number;
  followThroughAmount: number;
  isHoldingShot: boolean;
  meterValue: number;
  streak: number;
  clockTime: number;
  strokeColor: string;
  accentColor: string;
  alpha: number;
  heldBall: { isMoney: boolean } | null;
  isGhost?: boolean;
  labelTag?: string;
}

function drawStickLimb(
  ctx: CanvasRenderingContext2D,
  pts: ProjectedPoint[],
  lineWidth: number,
  strokeStyle: string,
  outlineStyle?: string
): void {
  const valid = pts.filter((p) => p.visible);
  if (valid.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(valid[0].x, valid[0].y);
  for (let i = 1; i < valid.length; i++) {
    ctx.lineTo(valid[i].x, valid[i].y);
  }

  if (outlineStyle) {
    ctx.strokeStyle = outlineStyle;
    ctx.lineWidth = lineWidth + Math.max(2, lineWidth * 0.45);
    ctx.stroke();
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawAthleteModel(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  params: AthleteRenderParams
): void {
  const {
    pos,
    z: sz,
    facing,
    runPhase = 0,
    isMoving,
    isDribbling = false,
    gatherAmount,
    followThroughAmount: ft,
    isHoldingShot,
    meterValue,
    streak,
    clockTime,
    strokeColor,
    accentColor,
    alpha,
    heldBall,
    isGhost = false,
    labelTag,
  } = params;

  const sx = pos.x;
  const sy = pos.y;

  const rawFx = facing ? facing.x : -sx;
  const rawFy = facing ? facing.y : -sy;
  const len = Math.hypot(rawFx, rawFy) || 1;
  const fx = rawFx / len;
  const fy = rawFy / len;
  const rx = -fy;
  const ry = fx;

  // Parabolic dribble bounce cycle: 1 at top palm, 0 on floor impact
  const dribblePhase = (clockTime * 1.92) % 1;
  const dNorm = Math.abs(dribblePhase * 2 - 1); // 0 at floor, 1 at hand
  const dribbleBounce = isDribbling ? Math.pow(dNorm, 0.72) : 1;
  const dribbleKneeDip = isDribbling ? (1 - dribbleBounce) * 0.22 : 0;

  const activePhase = isMoving ? runPhase : clockTime * 16;
  const strideSin = isMoving ? Math.sin(activePhase) : 0;
  const strideCos = isMoving ? Math.cos(activePhase) : 0;
  const runBounce = isMoving ? Math.abs(strideSin) * 0.34 : 0;

  const crouch = isMoving ? 0.14 : Math.max(gatherAmount * 0.74, dribbleKneeDip);
  const breath = isMoving || sz > 0.1 ? 0 : Math.sin(clockTime * 2.8) * 0.04;
  const stride = isMoving ? strideSin * 1.42 : 0;
  const jumpKick = sz > 0.25 ? Math.min(0.46, sz * 0.22) : 0;
  const heelLift = !isMoving && gatherAmount > 0.65 ? (gatherAmount - 0.65) * 0.36 : 0;
  const shootTorque = isHoldingShot ? 0.15 : ft > 0 ? 0.12 * ft : isDribbling ? 0.08 : 0;

  // Opponent Ghost aura intensity scales smoothly with streak (0 -> 1 across 0..9+)
  const ghostAuraPower = isGhost ? Math.min(1, streak / 9) : 0;
  const ghostAuraColors =
    streak >= 9
      ? { primary: '253, 224, 71', secondary: '249, 115, 22', hex: '#FDE047' }
      : streak >= 6
        ? { primary: '251, 191, 36', secondary: '245, 158, 11', hex: '#FBBF24' }
        : streak >= 3
          ? { primary: '56, 189, 248', secondary: '245, 158, 11', hex: '#F59E0B' }
          : { primary: '96, 165, 250', secondary: '56, 189, 248', hex: '#60A5FA' };

  // Ground shadow + streak floor ring / opponent growing floor aura
  const shadowP = projectPoint(basis, { x: sx, y: sy, z: 0.02 });
  if (shadowP.visible) {
    const airFactor = Math.max(0.45, 1 - (sz + runBounce * 0.5) * 0.22);
    const rad = shadowP.scale * 1.15 * airFactor;
    ctx.save();
    ctx.globalAlpha = isGhost ? Math.max(0.35, alpha) : alpha;
    ctx.fillStyle = `rgba(6, 8, 12, ${(isGhost ? 0.28 : 0.45) * airFactor})`;
    ctx.beginPath();
    ctx.ellipse(shadowP.x, shadowP.y, rad, rad * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isGhost) {
      const pulseSpeed = 3.2 + Math.min(streak, 10) * 0.75;
      const pulse = 0.72 + 0.28 * Math.sin(clockTime * pulseSpeed);
      const baseRingScale = 1.18 + ghostAuraPower * 0.72;
      ctx.strokeStyle = `rgba(${ghostAuraColors.primary}, ${(0.22 + ghostAuraPower * 0.62) * pulse})`;
      ctx.lineWidth = Math.max(1.5, shadowP.scale * (0.045 + ghostAuraPower * 0.07));
      ctx.beginPath();
      ctx.ellipse(
        shadowP.x,
        shadowP.y,
        rad * baseRingScale,
        rad * baseRingScale * 0.5,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      if (streak >= 2) {
        const wave = (clockTime * (1.1 + ghostAuraPower * 0.9)) % 1;
        const rippleScale = baseRingScale + wave * (0.45 + ghostAuraPower * 0.65);
        ctx.strokeStyle = `rgba(${ghostAuraColors.secondary}, ${(1 - wave) * (0.28 + ghostAuraPower * 0.48)})`;
        ctx.lineWidth = Math.max(1.2, shadowP.scale * 0.05);
        ctx.beginPath();
        ctx.ellipse(
          shadowP.x,
          shadowP.y,
          rad * rippleScale,
          rad * rippleScale * 0.5,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    } else if (streak >= 3) {
      const pulse = 0.7 + 0.3 * Math.sin(clockTime * 8);
      ctx.strokeStyle =
        streak >= 6
          ? `rgba(245, 158, 11, ${0.72 * pulse})`
          : `rgba(249, 99, 28, ${0.58 * pulse})`;
      ctx.lineWidth = Math.max(2, shadowP.scale * 0.09);
      ctx.beginPath();
      ctx.ellipse(shadowP.x, shadowP.y, rad * 1.52, rad * 0.76, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // World joint positions (stick-figure proportions matching court height)
  const stanceLeadR = isMoving ? 0 : 0.24;
  const footLLift = isMoving ? Math.max(0, -strideSin) * 0.85 : heelLift * 0.45;
  const footRLift = isMoving ? Math.max(0, strideSin) * 0.85 : heelLift * 0.55;
  const bodyZ = sz + runBounce;

  const footLWorld: Vec3 = {
    x: sx - rx * 0.48 + fx * (-stanceLeadR * 0.5 + stride * 0.85 + jumpKick),
    y: sy - ry * 0.48 + fy * (-stanceLeadR * 0.5 + stride * 0.85 + jumpKick),
    z: sz + 0.06 + footLLift,
  };
  const footRWorld: Vec3 = {
    x: sx + rx * 0.48 + fx * (stanceLeadR - stride * 0.85 + jumpKick * 1.15),
    y: sy + ry * 0.48 + fy * (stanceLeadR - stride * 0.85 + jumpKick * 1.15),
    z: sz + 0.06 + footRLift,
  };

  const kneeDriveL = isMoving ? Math.max(-0.25, strideSin) * 0.78 : crouch * 0.48;
  const kneeDriveR = isMoving ? Math.max(-0.25, -strideSin) * 0.78 : crouch * 0.48;

  const kneeL = projectPoint(basis, {
    x: sx - rx * 0.44 + fx * (kneeDriveL + stride * 0.35 + jumpKick * 0.4),
    y: sy - ry * 0.44 + fy * (kneeDriveL + stride * 0.35 + jumpKick * 0.4),
    z: bodyZ + 1.66 - crouch * 0.34 + Math.max(0, strideSin) * (isMoving ? 0.36 : 0),
  });
  const kneeR = projectPoint(basis, {
    x: sx + rx * 0.44 + fx * ((isMoving ? 0 : 0.12) + kneeDriveR - stride * 0.35 + jumpKick * 0.45),
    y: sy + ry * 0.44 + fy * ((isMoving ? 0 : 0.12) + kneeDriveR - stride * 0.35 + jumpKick * 0.45),
    z: bodyZ + 1.66 - crouch * 0.34 + Math.max(0, -strideSin) * (isMoving ? 0.36 : 0),
  });
  const ankleL = projectPoint(basis, {
    x: footLWorld.x - fx * 0.04,
    y: footLWorld.y - fy * 0.04,
    z: footLWorld.z + 0.2,
  });
  const ankleR = projectPoint(basis, {
    x: footRWorld.x - fx * 0.04,
    y: footRWorld.y - fy * 0.04,
    z: footRWorld.z + 0.2,
  });
  const toeL = projectPoint(basis, {
    x: footLWorld.x + fx * 0.48,
    y: footLWorld.y + fy * 0.48,
    z: Math.max(0.04, footLWorld.z - heelLift * 0.42),
  });
  const toeR = projectPoint(basis, {
    x: footRWorld.x + fx * 0.48,
    y: footRWorld.y + fy * 0.48,
    z: Math.max(0.04, footRWorld.z - heelLift * 0.5),
  });

  const hip = projectPoint(basis, {
    x: sx + fx * (crouch * 0.04),
    y: sy + fy * (crouch * 0.04),
    z: bodyZ + 3.22 - crouch * 0.56 + breath * 0.3,
  });

  const torsoLean = isMoving ? 0.54 + Math.abs(strideCos) * 0.06 : crouch * 0.24 - ft * 0.1;
  const torsoTwist = isMoving ? strideSin * 0.16 : shootTorque;
  const shoulderZ = bodyZ + 5.18 - crouch * 0.66 + breath;
  const shoulderCenter = projectPoint(basis, {
    x: sx + fx * torsoLean,
    y: sy + fy * torsoLean,
    z: shoulderZ,
  });
  const shoulderL = projectPoint(basis, {
    x: sx - rx * 0.72 + fx * (torsoLean - torsoTwist),
    y: sy - ry * 0.72 + fy * (torsoLean - torsoTwist),
    z: shoulderZ - 0.06,
  });
  const shoulderR = projectPoint(basis, {
    x: sx + rx * 0.72 + fx * (torsoLean + torsoTwist),
    y: sy + ry * 0.72 + fy * (torsoLean + torsoTwist),
    z: shoulderZ - 0.06 + (isHoldingShot ? 0.08 : 0),
  });
  const head = projectPoint(basis, {
    x: sx + fx * (torsoLean + 0.14),
    y: sy + fy * (torsoLean + 0.14),
    z: bodyZ + 6.12 - crouch * 0.66 + breath * 1.1,
  });

  let handRWorld: Vec3;
  let wristRWorld: Vec3;
  let elbowRWorld: Vec3;
  let handLWorld: Vec3;
  let elbowLWorld: Vec3;

  if (isMoving) {
    // Opposite arm-leg sprinting pump
    const armPumpR = strideSin * 0.95; // right arm matches left leg forward
    const armPumpL = -strideSin * 0.95;
    elbowRWorld = {
      x: sx + rx * 0.76 + fx * (torsoLean - 0.1 + armPumpR * 0.52),
      y: sy + ry * 0.76 + fy * (torsoLean - 0.1 + armPumpR * 0.52),
      z: bodyZ + 3.95 + Math.abs(armPumpR) * 0.15,
    };
    wristRWorld = {
      x: elbowRWorld.x - rx * 0.08 + fx * (0.48 + Math.max(0, armPumpR) * 0.32),
      y: elbowRWorld.y - ry * 0.08 + fy * (0.48 + Math.max(0, armPumpR) * 0.32),
      z: elbowRWorld.z + 0.52 + armPumpR * 0.36,
    };
    handRWorld = {
      x: wristRWorld.x + fx * 0.14,
      y: wristRWorld.y + fy * 0.14,
      z: wristRWorld.z + 0.16,
    };
    elbowLWorld = {
      x: sx - rx * 0.76 + fx * (torsoLean - 0.1 + armPumpL * 0.52),
      y: sy - ry * 0.76 + fy * (torsoLean - 0.1 + armPumpL * 0.52),
      z: bodyZ + 3.95 + Math.abs(armPumpL) * 0.15,
    };
    handLWorld = {
      x: elbowLWorld.x + rx * 0.08 + fx * (0.58 + Math.max(0, armPumpL) * 0.34),
      y: elbowLWorld.y + ry * 0.08 + fy * (0.58 + Math.max(0, armPumpL) * 0.34),
      z: elbowLWorld.z + 0.64 + armPumpL * 0.36,
    };
  } else if (isDribbling) {
    // Procedural right-hand dribble rhythm with athletic off-arm guard
    const handPush = Math.max(0.18, dribbleBounce);
    const palmDrop = (1 - handPush) * 0.92;
    handRWorld = {
      x: sx + rx * 0.96 + fx * 0.64,
      y: sy + ry * 0.96 + fy * 0.64,
      z: sz + 3.96 - palmDrop - crouch * 0.45 + breath,
    };
    wristRWorld = {
      x: handRWorld.x - fx * 0.12,
      y: handRWorld.y - fy * 0.12,
      z: handRWorld.z + 0.16,
    };
    elbowRWorld = {
      x: sx + rx * 0.88 + fx * 0.28,
      y: sy + ry * 0.88 + fy * 0.28,
      z: sz + 4.46 - palmDrop * 0.38 - crouch * 0.48 + breath,
    };
    elbowLWorld = {
      x: sx - rx * 0.84 + fx * 0.28,
      y: sy - ry * 0.84 + fy * 0.28,
      z: sz + 4.12 - crouch * 0.48 + breath,
    };
    handLWorld = {
      x: sx - rx * 0.46 + fx * 0.72,
      y: sy - ry * 0.46 + fy * 0.72,
      z: sz + 4.02 + (1 - dribbleBounce) * 0.12 - crouch * 0.45 + breath,
    };
  } else {
    // Shooting arm kinematics (triple-threat pocket -> high set point -> gooseneck release)
    const armLift = isHoldingShot
      ? 0.28 + Math.min(1, meterValue / 0.72) * 0.74
      : ft > 0
        ? 1.16
        : 0.24;

    handRWorld = {
      x: sx + rx * (0.32 - armLift * 0.13) + fx * (0.54 + armLift * 0.74),
      y: sy + ry * (0.32 - armLift * 0.13) + fy * (0.54 + armLift * 0.74),
      z: sz + 4.38 + armLift * 2.86 - crouch * 0.48 + breath,
    };
    wristRWorld = {
      x: handRWorld.x - fx * (0.12 + ft * 0.08),
      y: handRWorld.y - fy * (0.12 + ft * 0.08),
      z: handRWorld.z - (0.18 - ft * 0.06),
    };
    elbowRWorld = {
      x: sx + rx * 0.68 + fx * (0.38 + armLift * 0.32),
      y: sy + ry * 0.68 + fy * (0.38 + armLift * 0.32),
      z: sz + 4.2 + armLift * 1.64 - crouch * 0.52 + breath,
    };
    handLWorld = {
      x: sx - rx * (0.32 + ft * 0.3) + fx * (0.56 + armLift * 0.44),
      y: sy - ry * (0.32 + ft * 0.3) + fy * (0.56 + armLift * 0.44),
      z: sz + 4.34 + Math.min(0.84, armLift) * 2.4 - crouch * 0.48 + breath,
    };
    elbowLWorld = {
      x: sx - rx * 0.82 + fx * 0.3,
      y: sy - ry * 0.82 + fy * 0.3,
      z: sz + 4.1 + Math.min(0.8, armLift) * 1.18 - crouch * 0.52 + breath,
    };
  }

  const elbowR = projectPoint(basis, elbowRWorld);
  const wristR = projectPoint(basis, wristRWorld);
  const handR = projectPoint(basis, handRWorld);
  const elbowL = projectPoint(basis, elbowLWorld);
  const handL = projectPoint(basis, handLWorld);

  if (!hip.visible || !shoulderCenter.visible || !head.visible) return;

  const s = shoulderCenter.scale;
  const lineW = Math.max(2.6, s * 0.145);
  const headR = Math.max(5.0, s * 0.38);
  const outlineStyle = isGhost ? undefined : 'rgba(9, 13, 22, 0.72)';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Growing body aura envelope & rising energy wisps for streaking opponent ghost
  if (isGhost && streak >= 1) {
    const bodyMidX = (shoulderCenter.x + hip.x) * 0.5;
    const bodyMidY = (shoulderCenter.y + hip.y) * 0.5;
    const auraPulse = 0.86 + 0.14 * Math.sin(clockTime * (4 + Math.min(streak, 10) * 0.7));
    const auraRadius = s * (1.25 + ghostAuraPower * 1.65) * auraPulse;

    ctx.save();
    const auraGrad = ctx.createRadialGradient(
      bodyMidX,
      bodyMidY,
      s * 0.15,
      bodyMidX,
      bodyMidY,
      auraRadius
    );
    auraGrad.addColorStop(
      0,
      `rgba(${ghostAuraColors.primary}, ${0.22 + ghostAuraPower * 0.42})`
    );
    auraGrad.addColorStop(
      0.48,
      `rgba(${ghostAuraColors.secondary}, ${0.12 + ghostAuraPower * 0.28})`
    );
    auraGrad.addColorStop(1, `rgba(${ghostAuraColors.secondary}, 0)`);
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.ellipse(bodyMidX, bodyMidY, auraRadius * 0.78, auraRadius * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated rising aura wisps scaling in count & height with streak
    if (streak >= 2) {
      const wispCount = 3 + Math.min(9, streak);
      for (let i = 0; i < wispCount; i++) {
        const phase = (clockTime * (0.9 + ghostAuraPower * 1.1) + i / wispCount) % 1;
        const angle = i * 2.39996 + clockTime * 1.8;
        const spread = s * (0.42 + ghostAuraPower * 0.62) * (1 - phase * 0.35);
        const wx = bodyMidX + Math.cos(angle) * spread;
        const wy = hip.y + s * 0.4 - phase * s * (1.8 + ghostAuraPower * 1.5);
        const wr = Math.max(1.4, s * (0.065 + ghostAuraPower * 0.055) * (1 - phase));
        ctx.fillStyle = `rgba(${i % 2 === 0 ? ghostAuraColors.primary : ghostAuraColors.secondary}, ${(1 - phase) * (0.45 + ghostAuraPower * 0.45)})`;
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  ctx.globalAlpha = isGhost ? Math.min(0.92, alpha + ghostAuraPower * 0.34) : alpha;

  const activeStroke = isGhost && streak >= 3 ? ghostAuraColors.hex : strokeColor;
  if (isGhost && streak >= 2) {
    ctx.shadowColor = ghostAuraColors.hex;
    ctx.shadowBlur = Math.min(24, s * (0.28 + ghostAuraPower * 0.75));
  } else if (!isGhost && streak >= 3) {
    ctx.shadowColor = streak >= 6 ? '#F59E0B' : '#F9631C';
    ctx.shadowBlur = Math.min(18, s * 0.45);
  }

  // 1. Stick Legs (hip -> knee -> ankle -> toe)
  drawStickLimb(ctx, [hip, kneeL, ankleL, toeL], lineW, activeStroke, outlineStyle);
  drawStickLimb(ctx, [hip, kneeR, ankleR, toeR], lineW, activeStroke, outlineStyle);

  // 2. Stick Spine, Neck & Shoulder Bar
  drawStickLimb(ctx, [hip, shoulderCenter, head], lineW * 1.08, activeStroke, outlineStyle);
  drawStickLimb(ctx, [shoulderL, shoulderCenter, shoulderR], lineW, activeStroke, outlineStyle);

  // 3. Guide Arm (left) & Shooting Arm (right)
  drawStickLimb(ctx, [shoulderL, elbowL, handL], lineW * 0.9, activeStroke, outlineStyle);
  drawStickLimb(
    ctx,
    [shoulderR, elbowR, wristR, handR],
    lineW * 0.92,
    activeStroke,
    outlineStyle
  );

  // Crisp gooseneck follow-through snap tip on release
  if (ft > 0.12 && handR.visible) {
    ctx.strokeStyle = activeStroke;
    ctx.lineWidth = Math.max(1.8, lineW * 0.65);
    ctx.beginPath();
    ctx.moveTo(handR.x, handR.y);
    ctx.lineTo(handR.x + headR * 0.28, handR.y + headR * 0.55 * Math.min(1, ft));
    ctx.stroke();
  }

  // Subtle joint dots at knees/elbows/shoulders for clean stick articulation
  ctx.fillStyle = accentColor;
  for (const jt of [hip, kneeL, kneeR, shoulderL, shoulderR, elbowL, elbowR]) {
    if (!jt.visible) continue;
    ctx.beginPath();
    ctx.arc(jt.x, jt.y, Math.max(1.8, lineW * 0.58), 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Stick Figure Head (clean circle + athletic headband stripe)
  ctx.fillStyle = isGhost ? 'rgba(15, 23, 42, 0.55)' : '#141B29';
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = activeStroke;
  ctx.lineWidth = Math.max(2.2, lineW * 0.92);
  ctx.stroke();

  if (!isGhost) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = Math.max(1.8, headR * 0.24);
    ctx.beginPath();
    ctx.moveTo(head.x - headR * 0.92, head.y - headR * 0.18);
    ctx.lineTo(head.x + headR * 0.92, head.y - headR * 0.18);
    ctx.stroke();
  }

  // 5. Held or Procedural Dribbling Basketball
  if (heldBall && ft <= 0.01 && sz < 0.3) {
    if (isDribbling) {
      const dribbleBallPos: Vec3 = {
        x: sx + rx * 1.0 + fx * 0.7,
        y: sy + ry * 1.0 + fy * 0.7,
        z: BALL_RADIUS + dribbleBounce * 2.88,
      };
      const dbShadow = projectPoint(basis, {
        x: dribbleBallPos.x,
        y: dribbleBallPos.y,
        z: 0.02,
      });
      if (dbShadow.visible) {
        const proximity = 1 - dribbleBounce * 0.55;
        const sr = BALL_RADIUS * dbShadow.scale * (0.78 + 0.32 * (1 - dribbleBounce));
        ctx.save();
        ctx.fillStyle = `rgba(6, 8, 12, ${(0.52 * proximity).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(dbShadow.x, dbShadow.y, sr * 1.12, sr * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const db = projectPoint(basis, dribbleBallPos);
      if (db.visible) {
        drawBasketballSprite(
          ctx,
          db.x,
          db.y,
          BALL_RADIUS * db.scale,
          heldBall.isMoney,
          clockTime * 4.5,
          streak >= 3 ? 0.8 : 0
        );
      }
    } else {
      const heldBallPos: Vec3 = {
        x: handRWorld.x + fx * 0.22 - rx * 0.08,
        y: handRWorld.y + fy * 0.22 - ry * 0.08,
        z: handRWorld.z + 0.18,
      };
      const hb = projectPoint(basis, heldBallPos);
      if (hb.visible) {
        drawBasketballSprite(
          ctx,
          hb.x,
          hb.y,
          BALL_RADIUS * hb.scale,
          heldBall.isMoney,
          0.3,
          streak >= 3 ? 0.8 : 0
        );
      }
    }
  }

  // Optional player tag above head (rival name + live streak state in PVP)
  if (labelTag) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.95;
    const tagText = streak >= 2 ? `${labelTag} · ${streak} STREAK` : labelTag;
    ctx.font = '700 12px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = streak >= 2 ? ghostAuraColors.hex : 'rgba(147, 197, 253, 0.94)';
    ctx.fillText(tagText, head.x, head.y - headR - 10);
  }

  ctx.restore();
}

function drawShooter(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  state: RenderState
): void {
  let heldBall: { isMoney: boolean } | null = null;
  if (state.phase === 'TITLE') {
    heldBall = { isMoney: false };
  } else if (
    (state.phase === 'PLAYING' || state.phase === 'COUNTDOWN') &&
    !state.isMovingToRack &&
    state.currentRack < RACK_CONFIGS.length &&
    state.currentBall < BALLS_PER_RACK
  ) {
    const slotIndex = state.currentRack * BALLS_PER_RACK + state.currentBall;
    const slot = state.ballsRecord[slotIndex];
    if (slot && slot.status === 'PENDING') {
      heldBall = { isMoney: slot.isMoney };
    }
  }

  const isDribbling =
    Boolean(heldBall) &&
    !state.isMovingToRack &&
    !state.isHoldingShot &&
    state.followThroughAmount <= 0.05 &&
    state.shooterZ <= 0.08;

  drawAthleteModel(ctx, basis, {
    pos: state.shooterPos,
    z: state.shooterZ,
    facing: state.shooterFacing,
    runPhase: state.runPhase,
    isMoving: state.isMovingToRack,
    isDribbling,
    gatherAmount: state.gatherAmount,
    followThroughAmount: state.followThroughAmount,
    isHoldingShot: state.isHoldingShot,
    meterValue: state.meterValue,
    streak: state.streak,
    clockTime: state.clockTime,
    strokeColor: '#F4EFE6',
    accentColor: '#F9631C',
    alpha: 1.0,
    heldBall,
  });
}

function drawOpponentGhost(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  ghost: OpponentGhostState,
  clockTime: number
): void {
  drawAthleteModel(ctx, basis, {
    pos: ghost.pos,
    z: ghost.z,
    isMoving: false,
    gatherAmount: 0,
    followThroughAmount: ghost.followThrough,
    isHoldingShot: false,
    meterValue: 0,
    streak: ghost.streak,
    clockTime,
    strokeColor: '#93C5FD',
    accentColor: ghost.streak >= 6 ? '#FBBF24' : '#38BDF8',
    alpha: 0.56,
    heldBall: null,
    isGhost: true,
    labelTag: ghost.name,
  });
}

function drawShotMeter(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  viewportWidth: number,
  viewportHeight: number,
  state: RenderState
): void {
  const showMeter = state.isHoldingShot || state.meterFeedbackTimer > 0;
  const anchorProj = projectPoint(basis, {
    x: state.shooterPos.x,
    y: state.shooterPos.y,
    z: state.shooterZ + 4.9,
  });
  if (!anchorProj.visible) return;

  const isCompact = viewportWidth < 560;
  const radius = isCompact ? 48 : 60;
  const placeLeft = anchorProj.x > viewportWidth * 0.52;
  const offsetX = (placeLeft ? -1 : 1) * Math.max(isCompact ? 46 : 58, anchorProj.scale * 2.7);
  const rawMx = anchorProj.x + offsetX;
  const rawMy = anchorProj.y - 12;

  const mx = Math.max(radius + 22, Math.min(viewportWidth - radius - 22, rawMx));
  const my = Math.max(radius + 96, Math.min(viewportHeight - 42, rawMy));

  if (!showMeter) {
    if (!state.hasShotAnyBall) {
      ctx.save();
      ctx.font = `700 ${isCompact ? 11 : 12}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(244, 239, 230, 0.9)';
      ctx.fillText(isCompact ? 'HOLD & RELEASE TO SHOOT' : 'HOLD SPACE / CLICK', mx, my - 10);
      ctx.restore();
    }
    return;
  }

  const startAngle = Math.PI * 0.78;
  const endAngle = Math.PI * 1.44;
  const span = endAngle - startAngle;

  const activeVal = state.isHoldingShot ? state.meterValue : state.lastReleaseMeter;
  const clampedVal = Math.max(0, Math.min(1.06, activeVal));

  const diff = state.difficulty;
  const makeStart = Math.max(0, METER_PERFECT_CENTER - diff.makeHalfWindow);
  const makeEnd = Math.min(1, METER_PERFECT_CENTER + diff.makeHalfWindow);
  const perfStart = Math.max(0, METER_PERFECT_CENTER - diff.perfectHalfWindow);
  const perfEnd = Math.min(1, METER_PERFECT_CENTER + diff.perfectHalfWindow);

  ctx.save();
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(11, 14, 20, 0.85)';
  ctx.lineWidth = isCompact ? 13 : 15;
  ctx.beginPath();
  ctx.arc(mx, my, radius, startAngle, endAngle);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = isCompact ? 9 : 11;
  ctx.beginPath();
  ctx.arc(mx, my, radius, startAngle, endAngle);
  ctx.stroke();

  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = isCompact ? 9 : 11;
  ctx.beginPath();
  ctx.arc(mx, my, radius, startAngle + makeStart * span, startAngle + makeEnd * span);
  ctx.stroke();

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = isCompact ? 10 : 12;
  ctx.beginPath();
  ctx.arc(mx, my, radius, startAngle + perfStart * span, startAngle + perfEnd * span);
  ctx.stroke();

  const fillAngle = startAngle + Math.min(1.03, clampedVal) * span;
  const inPerf = clampedVal >= perfStart && clampedVal <= perfEnd;
  const inMake = clampedVal >= makeStart && clampedVal <= makeEnd;
  ctx.strokeStyle = inPerf ? '#FDE047' : inMake ? '#34D399' : '#F4EFE6';
  ctx.lineWidth = isCompact ? 4.5 : 5;
  ctx.beginPath();
  ctx.arc(mx, my, radius, startAngle, fillAngle);
  ctx.stroke();

  const nx1 = mx + Math.cos(fillAngle) * (radius - 9);
  const ny1 = my + Math.sin(fillAngle) * (radius - 9);
  const nx2 = mx + Math.cos(fillAngle) * (radius + 9);
  const ny2 = my + Math.sin(fillAngle) * (radius + 9);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(nx1, ny1);
  ctx.lineTo(nx2, ny2);
  ctx.stroke();

  if (!state.isHoldingShot && state.meterFeedbackTimer > 0 && state.lastReleaseLabel) {
    ctx.font = `800 ${isCompact ? 14 : 16}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = state.lastReleaseColor;
    ctx.fillText(state.lastReleaseLabel, mx, my + 22);
  }

  ctx.restore();
}

function drawTrailParticle(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  scale: number,
  pt: Particle
): void {
  const t = Math.max(0, Math.min(1, pt.life / pt.maxLife));
  const fade = t * t;
  const r = Math.max(1.4, pt.size * scale * 0.14 * (0.4 + 0.6 * t));

  ctx.save();
  ctx.globalAlpha = fade * 0.28;
  ctx.fillStyle = pt.glowColor ?? pt.color;
  ctx.beginPath();
  ctx.arc(px, py, r * 2.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = fade * 0.88;
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  particles: Particle[]
): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const pt of particles) {
    if (pt.isTrail) continue;
    const p = projectPoint(basis, { x: pt.x, y: pt.y, z: pt.z });
    if (!p.visible) continue;
    const alpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;

    if (pt.shape === 'confetti') {
      const w = Math.max(3, pt.size * p.scale * 0.34);
      const tumble = Math.cos((pt.rot ?? 0) * 1.6);
      const h = Math.max(1.2, w * (pt.aspect ?? 0.55) * Math.abs(tumble));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(pt.rot ?? 0);
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
      ctx.restore();
    } else if (pt.shape === 'spark') {
      const r = Math.max(1.6, pt.size * p.scale * 0.16);
      const angle = Math.atan2(-pt.vz, pt.vx || 0.01);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      if (pt.glowColor) {
        ctx.shadowColor = pt.glowColor;
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(-r * 2.2, -r * 0.55, r * 4.4, r * 1.1);
      ctx.restore();
    } else {
      const r = Math.max(1.5, pt.size * p.scale * 0.14);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCallouts(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  viewportWidth: number,
  callouts: FloatingCallout[]
): void {
  if (callouts.length === 0) return;
  const isCompact = viewportWidth < 560;
  ctx.save();
  for (const c of callouts) {
    const progress = 1 - c.life / c.maxLife;
    const alpha = c.life < 0.25 ? c.life / 0.25 : 1;
    const p = projectPoint(basis, {
      x: c.worldPos.x,
      y: c.worldPos.y,
      z: c.worldPos.z + progress * 2.4,
    });
    if (!p.visible) continue;

    const cx = Math.max(84, Math.min(viewportWidth - 84, p.x));
    const cy = Math.max(108, p.y);

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = 'center';
    ctx.font = `800 ${isCompact ? 20 : 24}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = 'rgba(11, 14, 20, 0.78)';
    ctx.fillText(c.text, cx + 1.5, cy + 1.5);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, cx, cy);

    if (c.subText) {
      ctx.font = `700 ${isCompact ? 11 : 13}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#F4EFE6';
      ctx.fillText(c.subText, cx, cy + (isCompact ? 15 : 18));
    }
  }
  ctx.restore();
}
