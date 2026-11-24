import {
  BACKBOARD_BOTTOM_Z,
  BACKBOARD_TOP_Z,
  BACKBOARD_WIDTH,
  BACKBOARD_Y,
  BALL_RADIUS,
  BASELINE_Y,
  getRackBallCount,
  getSlotIndex,
  HOOP_POS,
  METER_PERFECT_CENTER,
  RACK_CONFIGS,
  RIM_RADIUS,
  STAMINA_EXHAUSTED_THRESHOLD,
} from './constants';
import { CourtThemeConfig, getCourtThemeConfig } from './courts';
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
  CourtThemeId,
  DifficultyTier,
  Flashbulb,
  FloatingCallout,
  GameMode,
  GamePhase,
  OpponentGhostState,
  Particle,
  ProjectedPoint,
  ShooterAnimState,
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
  runBlend?: number;
  isMovingToRack: boolean;
  shooterAnimState?: ShooterAnimState;
  dribbleBlend?: number;
  gatherAmount: number;
  followThroughAmount: number;
  landingSquat?: number;
  ballPickupBlend?: number;
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
  shooterLabelAlpha: number;
  crowdHypeTimer?: number;
  crowdHypeDuration?: number;
  stamina: number;
  courtTheme: CourtThemeId;
  hideShotMeter?: boolean;
  sessionBestScore?: number;
  sessionBestStreak?: number;
}

export function renderArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RenderState
): void {
  ctx.save();

  const exhaustion =
    state.phase === 'PLAYING' && state.stamina < STAMINA_EXHAUSTED_THRESHOLD
      ? Math.max(
          0,
          Math.min(1, (STAMINA_EXHAUSTED_THRESHOLD - state.stamina) / STAMINA_EXHAUSTED_THRESHOLD)
        )
      : 0;

  // Apply decaying impact camera shake + subtle exhaustion tremor below 20% stamina
  let shakeX = 0;
  let shakeY = 0;
  if (state.screenShake > 0.01) {
    shakeX += (Math.random() - 0.5) * state.screenShake * 10;
    shakeY += (Math.random() - 0.5) * state.screenShake * 8;
  }
  if (exhaustion > 0.01) {
    const tremor = 0.35 + exhaustion * 0.65;
    shakeX +=
      (Math.sin(state.clockTime * 19.3) * 1.45 + Math.cos(state.clockTime * 31.7) * 0.75) *
      tremor;
    shakeY +=
      (Math.cos(state.clockTime * 16.7) * 1.15 + Math.sin(state.clockTime * 27.1) * 0.65) *
      tremor;
  }
  if (Math.abs(shakeX) > 0.01 || Math.abs(shakeY) > 0.01) {
    ctx.translate(shakeX, shakeY);
  }

  const theme = getCourtThemeConfig(state.courtTheme);

  // 1. Arena Dark Backdrop & Crowd Bowl
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, theme.palette.bgStops[0]);
  bgGrad.addColorStop(0.45, theme.palette.bgStops[1]);
  bgGrad.addColorStop(1, theme.palette.bgStops[2]);
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
    isClockActive && state.phase === 'PLAYING' ? state.timeLeft : 60,
    theme
  );
  drawArenaCrowd(
    ctx,
    width,
    height,
    state.flashbulbs,
    state.clockTime,
    state.streak,
    hypeBurst,
    theme,
    state.sessionBestScore ?? 0,
    state.sessionBestStreak ?? 0,
    state.shooterName,
    state.phase === 'TITLE' || state.phase === 'GAME_OVER'
  );

  if (dimFactor > 0.01) {
    ctx.fillStyle = `rgba(4, 6, 12, ${(dimFactor * 0.48).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height * 0.46);
  }

  // 2. Build 3D->2D camera basis
  const basis = buildCameraBasis(state.camera, width, height);

  // 3. Draw Court Surface & Markings
  drawCourtFloor(ctx, basis, theme);

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
  drawStanchion(ctx, basis, state.hoopPos, theme);

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
        draw: () => drawBallRack(ctx, basis, r, state, theme),
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
  const backboardDepth = hoopProj.visible ? hoopProj.depth + 1.35 : Number.POSITIVE_INFINITY;
  if (hoopProj.visible) {
    drawables.push({
      depth: backboardDepth,
      draw: () => drawBackboard(ctx, basis, state.hoopPos, state.mode === 'HEAT_CHECK', theme),
    });
    drawables.push({
      depth: hoopProj.depth + 0.15,
      draw: () => drawHoopAndNet(ctx, basis, state, 'back', theme),
    });
    drawables.push({
      depth: hoopProj.depth - 0.15,
      draw: () => drawHoopAndNet(ctx, basis, state, 'front', theme),
    });
  }

  // Hoop & Score Callouts (Swish, Money Ball, Buzzer Beater, etc.) positioned above & behind the backboard plane
  for (const c of state.callouts) {
    if (!c.behindBackboard) continue;
    const progress = 1 - c.life / c.maxLife;
    const cp = projectPoint(basis, {
      x: c.worldPos.x,
      y: c.worldPos.y,
      z: c.worldPos.z + progress * 1.25,
    });
    if (cp.visible) {
      drawables.push({
        depth: hoopProj.visible ? Math.max(cp.depth, backboardDepth + 0.35) : cp.depth,
        draw: () => drawBackgroundCallout(ctx, basis, width, height, state.hoopPos, c),
      });
    }
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

  // 6b. Subtle peripheral exhaustion vignette when stamina < 20%
  if (exhaustion > 0.01) {
    const pulse = 0.78 + 0.22 * Math.sin(state.clockTime * 5.2);
    const edgeAlpha = (0.14 + exhaustion * 0.24) * pulse;
    const exhVig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.28,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    exhVig.addColorStop(0, 'rgba(18, 6, 10, 0)');
    exhVig.addColorStop(0.68, `rgba(48, 10, 14, ${(edgeAlpha * 0.38).toFixed(3)})`);
    exhVig.addColorStop(1, `rgba(127, 29, 29, ${edgeAlpha.toFixed(3)})`);
    ctx.fillStyle = exhVig;
    ctx.fillRect(-12, -12, width + 24, height + 24);
  }

  // 7. Shot Timing Arc Meter
  if (state.phase === 'PLAYING' && !state.hideShotMeter) {
    drawShotMeter(ctx, basis, width, height, state);
  }

  // 8. Foreground Floating Callouts (shooter-side cues like Second Wind / Difficulty)
  drawCallouts(
    ctx,
    basis,
    width,
    height,
    state.callouts.filter((c) => !c.behindBackboard)
  );

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
  timeLeft: number,
  theme: CourtThemeConfig
): void {
  ctx.save();
  const sweep = hypeBurst > 0.02 ? Math.sin(clockTime * 4.5) * width * 0.06 * hypeBurst : 0;
  const sideScale = Math.max(0.28, 1 - dimFactor * 0.65);
  const centerBoost = 1 + dimFactor * 0.55;
  const beams = [
    { x0: width * 0.22, x1: width * 0.36 + sweep, w: width * 0.24, mult: sideScale, isSec: true },
    { x0: width * 0.5, x1: width * 0.5 - sweep * 0.6, w: width * (0.32 - dimFactor * 0.07), mult: centerBoost, isSec: false },
    { x0: width * 0.78, x1: width * 0.64 + sweep, w: width * 0.24, mult: sideScale, isSec: true },
  ];
  const baseAlpha = (streak >= 3 ? 0.095 : 0.06) + hypeBurst * 0.09;
  for (const b of beams) {
    const warmAlpha = baseAlpha * b.mult;
    const rgb = b.isSec ? theme.palette.spotlightSecondary : theme.palette.spotlightPrimary;
    const grad = ctx.createLinearGradient(b.x0, 0, b.x1, height * 0.8);
    grad.addColorStop(
      0,
      hypeBurst > 0.05
        ? `rgba(253, 212, 118, ${warmAlpha})`
        : `rgba(${rgb}, ${warmAlpha})`
    );
    grad.addColorStop(0.7, `rgba(${rgb}, ${(0.015 + hypeBurst * 0.035) * b.mult})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
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
    horizonGlow.addColorStop(0, `rgba(${theme.palette.spotlightPrimary}, ${hypeBurst * 0.22})`);
    horizonGlow.addColorStop(0.55, `rgba(${theme.palette.spotlightSecondary}, ${hypeBurst * 0.09})`);
    horizonGlow.addColorStop(1, 'rgba(249, 99, 28, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, width, height * 0.55);
  }
  ctx.restore();
}

const bannerTextureCache = new Map<string, CanvasPattern | null>();

function getArenaBannerPattern(
  ctx: CanvasRenderingContext2D,
  theme: CourtThemeConfig
): CanvasPattern | null {
  const cached = bannerTextureCache.get(theme.id);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return null;

  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const tctx = tile.getContext('2d');
  if (!tctx) {
    bannerTextureCache.set(theme.id, null);
    return null;
  }

  // Base dark banner surface
  tctx.fillStyle = 'rgba(4, 6, 11, 0.97)';
  tctx.fillRect(0, 0, 16, 16);

  if (theme.palette.isOutdoorFence) {
    // Diagonal vinyl weave texture for street blacktop fence banners
    tctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(0, 16);
    tctx.lineTo(16, 0);
    tctx.moveTo(-4, 4);
    tctx.lineTo(4, -4);
    tctx.moveTo(12, 20);
    tctx.lineTo(20, 12);
    tctx.stroke();
  } else if (theme.palette.lineGlow) {
    // LED pixel matrix + cyber scanline texture
    tctx.fillStyle = `${theme.palette.accentHex}22`;
    for (let y = 1; y < 16; y += 4) {
      for (let x = 1; x < 16; x += 4) {
        tctx.fillRect(x, y, 2, 2);
      }
    }
    tctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    tctx.fillRect(0, 2, 16, 1);
    tctx.fillRect(0, 10, 16, 1);
  } else {
    // Classic arena ribbon LED dot-matrix & vertical seam texture
    tctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    for (let y = 1; y < 16; y += 4) {
      for (let x = 1; x < 16; x += 4) {
        tctx.fillRect(x, y, 1.5, 1.5);
      }
    }
    tctx.fillStyle = `${theme.palette.accentHex}18`;
    tctx.fillRect(0, 0, 1, 16);
  }

  const pattern = ctx.createPattern(tile, 'repeat');
  bannerTextureCache.set(theme.id, pattern);
  return pattern;
}

function drawArenaCrowdBanners(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  standTop: number,
  standBot: number,
  clockTime: number,
  streak: number,
  hypeBurst: number,
  theme: CourtThemeConfig,
  sessionBestScore: number,
  sessionBestStreak: number,
  shooterName?: string
): void {
  if (width < 260 || height < 180) return;

  const isCompact = width < 560;
  const standH = standBot - standTop;
  const bannerH = Math.max(22, Math.min(38, Math.round(standH * 0.25)));
  const bannerY = Math.round(standBot - bannerH - 3);
  const sideMargin = isCompact ? 8 : Math.max(18, Math.round(width * 0.025));
  const centerGap = isCompact ? Math.round(width * 0.26) : Math.max(180, Math.round(width * 0.28));
  const panelW = Math.max(88, Math.floor((width - sideMargin * 2 - centerGap) * 0.5));
  if (panelW < 84) return;

  const leftX = sideMargin;
  const rightX = width - sideMargin - panelW;
  const pattern = getArenaBannerPattern(ctx, theme);
  const pulse = 0.72 + 0.28 * Math.sin(clockTime * 3.1);
  const cleanHandle = (shooterName || 'SHOOTER').trim().slice(0, 12).toUpperCase();

  const drawPanel = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    valueText: string,
    accentColor: string,
    alignRight: boolean,
    highlightGlow: boolean
  ) => {
    ctx.save();

    // Panel drop shadow into bleachers
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.roundRect(x, y + 2, w, h, 3);
    ctx.fill();

    // Textured LED / woven banner fill
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fillStyle = pattern ?? 'rgba(4, 6, 11, 0.97)';
    ctx.fill();

    // Subtle glossy sweep along top edge
    const sheen = ctx.createLinearGradient(x, y, x, y + h);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = sheen;
    ctx.fill();

    // Border & animated accent trim
    ctx.strokeStyle = highlightGlow ? accentColor : 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = highlightGlow ? 1.5 : 1.15;
    ctx.stroke();

    // Accent power bar on outer side
    const barW = 3;
    const barX = alignRight ? x + w - barW : x;
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = highlightGlow ? 1 : 0.85 * pulse;
    ctx.fillRect(barX, y + 3, barW, h - 6);

    // Corner grommets / rivets for tactile physical feel
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 4, y + 3, 2, 2);
    ctx.fillRect(x + w - 6, y + 3, 2, 2);

    ctx.globalAlpha = 1;
    const padX = isCompact ? 8 : 11;
    const textX = alignRight ? x + w - padX : x + padX;
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const labelSize = isCompact ? 7.5 : 9;
    const valSize = isCompact ? 11.5 : 14;
    ctx.font = `700 ${labelSize}px "JetBrains Mono", monospace`;
    ctx.strokeStyle = '#030508';
    ctx.lineWidth = 2.5;
    ctx.strokeText(label, textX, y + h * 0.31, w - padX * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, textX, y + h * 0.31, w - padX * 2);

    ctx.font = `800 ${valSize}px "JetBrains Mono", monospace`;
    if (highlightGlow) {
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = '#030508';
    ctx.lineWidth = 2.8;
    ctx.strokeText(valueText, textX, y + h * 0.7, w - padX * 2);
    ctx.fillStyle = accentColor;
    ctx.fillText(valueText, textX, y + h * 0.7, w - padX * 2);

    ctx.restore();
  };

  const scoreAccent = sessionBestScore > 0 ? '#00FFAA' : '#FFFFFF';
  const streakHot = sessionBestStreak >= 3 || streak >= 3 || hypeBurst > 0.1;
  const streakAccent = streakHot ? '#FEF08A' : '#FFFFFF';

  drawPanel(
    leftX,
    bannerY,
    panelW,
    bannerH,
    isCompact ? 'TOP SCORE' : `${cleanHandle} · TOP SCORE`,
    `${sessionBestScore} PTS`,
    scoreAccent,
    false,
    sessionBestScore > 0
  );

  drawPanel(
    rightX,
    bannerY,
    panelW,
    bannerH,
    isCompact ? 'BEST STREAK' : 'SESSION BEST STREAK',
    `${sessionBestStreak} ${sessionBestStreak === 1 ? 'MAKE' : 'STREAK'}`,
    streakAccent,
    true,
    streakHot
  );
}

function drawArenaCrowd(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  flashbulbs: Flashbulb[],
  clockTime: number,
  streak: number,
  hypeBurst: number,
  theme: CourtThemeConfig,
  sessionBestScore: number,
  sessionBestStreak: number,
  shooterName?: string,
  showCrowdBanners: boolean = false
): void {
  ctx.save();
  const standTop = height * 0.14;
  const standBot = height * 0.44;
  const standHeight = standBot - standTop;
  ctx.fillStyle = theme.palette.standBg;
  ctx.fillRect(0, standTop, width, standHeight);

  // Subtle park chain-link perimeter mesh behind the baseline on Street Asphalt
  if (theme.palette.isOutdoorFence) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = 1;
    const step = 22;
    for (let x = -standHeight; x < width + standHeight; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, standTop);
      ctx.lineTo(x + standHeight * 0.7, standBot);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + standHeight * 0.7, standTop);
      ctx.lineTo(x, standBot);
      ctx.stroke();
    }
    ctx.restore();
  }

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
        : theme.palette.standRowLine;
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

  // Personalized session banners shown outside active live gameplay
  if (showCrowdBanners) {
    drawArenaCrowdBanners(
      ctx,
      width,
      height,
      standTop,
      standBot,
      clockTime,
      streak,
      hypeBurst,
      theme,
      sessionBestScore,
      sessionBestStreak,
      shooterName
    );
  }
  ctx.restore();
}

function drawCourtFloor(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  theme: CourtThemeConfig
): void {
  const { palette } = theme;
  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: -34, y: -10, z: 0 },
      { x: 34, y: -10, z: 0 },
      { x: 34, y: 56, z: 0 },
      { x: -34, y: 56, z: 0 },
    ],
    palette.apron
  );

  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: -25, y: BASELINE_Y, z: 0 },
      { x: 25, y: BASELINE_Y, z: 0 },
      { x: 25, y: 42.8, z: 0 },
      { x: -25, y: 42.8, z: 0 },
    ],
    palette.plankColors[0]
  );

  const plankColors = palette.plankColors;
  const stripWidth = 2.5;
  for (let x = -25, idx = 0; x < 25; x += stripWidth, idx++) {
    const color = plankColors[idx % plankColors.length];
    drawWorldPolygon(
      ctx,
      basis,
      [
        { x, y: BASELINE_Y, z: 0 },
        { x: Math.min(25, x + stripWidth), y: BASELINE_Y, z: 0 },
        { x: Math.min(25, x + stripWidth), y: 42.8, z: 0 },
        { x, y: 42.8, z: 0 },
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
    palette.paint
  );

  ctx.save();
  if (palette.lineGlow) {
    ctx.shadowColor = palette.threeArcColor;
    ctx.shadowBlur = 10;
  }

  const ftCirclePts: Vec3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ftCirclePts.push({
      x: Math.cos(a) * 6,
      y: 14.8 + Math.sin(a) * 6,
      z: 0,
    });
  }
  drawWorldPolyline(ctx, basis, ftCirclePts, palette.lineColor, 2);

  // Half-court center jump circle arc (curving onto active half-court from y = 42.8)
  const centerCirclePts: Vec3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    centerCirclePts.push({
      x: Math.cos(a) * 6,
      y: 42.8 + Math.sin(a) * 6,
      z: 0,
    });
  }
  drawWorldPolyline(ctx, basis, centerCirclePts, palette.threeArcColor, 2.2);

  const lineColor = palette.lineColor;
  drawWorldPolyline(
    ctx,
    basis,
    [
      { x: -25, y: BASELINE_Y, z: 0 },
      { x: 25, y: BASELINE_Y, z: 0 },
      { x: 25, y: 42.8, z: 0 },
      { x: -25, y: 42.8, z: 0 },
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
  drawWorldPolyline(ctx, basis, threePts, palette.threeArcColor, 2.8);
  ctx.restore();

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
    drawWorldPolyline(ctx, basis, markerPts, `${palette.accentHex}59`, 1.5);
  }
}

function drawStanchion(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  hoopPos: Vec3,
  theme: CourtThemeConfig
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

  ctx.strokeStyle = theme.palette.stanchionColor;
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

  ctx.strokeStyle = theme.palette.stanchionColor;
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
  highlightMove = false,
  theme: CourtThemeConfig
): void {
  const ox = hoopPos.x;
  const oy = hoopPos.y + (BACKBOARD_Y - HOOP_POS.y);
  const oz = hoopPos.z - HOOP_POS.z;
  const hw = BACKBOARD_WIDTH * 0.5;
  const corners: Vec3[] = [
    { x: ox - hw, y: oy, z: BACKBOARD_BOTTOM_Z + oz },
    { x: ox + hw, y: oy, z: BACKBOARD_BOTTOM_Z + oz },
    { x: ox + hw, y: oy, z: BACKBOARD_TOP_Z + oz },
    { x: ox - hw, y: oy, z: BACKBOARD_TOP_Z + oz },
  ];

  drawWorldPolygon(
    ctx,
    basis,
    corners,
    highlightMove ? 'rgba(245, 196, 120, 0.22)' : theme.palette.backboardGlass,
    highlightMove ? 'rgba(253, 224, 150, 0.94)' : theme.palette.threeArcColor,
    2.6
  );

  // Subtle diagonal glass specular reflection streaks so objects/alerts behind the glass show clear 3D depth
  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: ox - hw * 0.72, y: oy + 0.01, z: BACKBOARD_BOTTOM_Z + oz + 0.12 },
      { x: ox - hw * 0.34, y: oy + 0.01, z: BACKBOARD_BOTTOM_Z + oz + 0.12 },
      { x: ox + hw * 0.18, y: oy + 0.01, z: BACKBOARD_TOP_Z + oz - 0.12 },
      { x: ox - hw * 0.2, y: oy + 0.01, z: BACKBOARD_TOP_Z + oz - 0.12 },
    ],
    'rgba(255, 255, 255, 0.075)'
  );
  drawWorldPolygon(
    ctx,
    basis,
    [
      { x: ox + hw * 0.22, y: oy + 0.01, z: BACKBOARD_BOTTOM_Z + oz + 0.12 },
      { x: ox + hw * 0.42, y: oy + 0.01, z: BACKBOARD_BOTTOM_Z + oz + 0.12 },
      { x: ox + hw * 0.76, y: oy + 0.01, z: BACKBOARD_TOP_Z + oz - 0.12 },
      { x: ox + hw * 0.56, y: oy + 0.01, z: BACKBOARD_TOP_Z + oz - 0.12 },
    ],
    'rgba(255, 255, 255, 0.05)'
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
    highlightMove ? 'rgba(245, 158, 11, 0.92)' : theme.palette.threeArcColor,
    2
  );
}

function drawHoopAndNet(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  state: RenderState,
  half: 'back' | 'front',
  theme: CourtThemeConfig
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
      half === 'front' ? theme.palette.netFront : theme.palette.netBack,
      1.6
    );
  }

  drawWorldPolyline(
    ctx,
    basis,
    rimPts,
    state.mode === 'HEAT_CHECK' ? '#F59E0B' : theme.palette.rimColor,
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
      theme.palette.rimBraceColor,
      5
    );
  }
}

function drawBallRack(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  rackIndex: number,
  state: RenderState,
  theme: CourtThemeConfig
): void {
  const rack = RACK_CONFIGS[rackIndex];
  const rackBallCount = getRackBallCount(rackIndex);
  const isSinglePedestal = rackBallCount === 1;
  const rx = rack.x + rack.rackOffsetX;
  const ry = rack.y + rack.rackOffsetY;

  const len = Math.hypot(rack.x, rack.y) || 1;
  const tx = -rack.y / len;
  const ty = rack.x / len;

  const railHalf = isSinglePedestal ? 0.45 : 1.65;
  const pLeftBot = projectPoint(basis, { x: rx - tx * railHalf, y: ry - ty * railHalf, z: 0 });
  const pRightBot = projectPoint(basis, { x: rx + tx * railHalf, y: ry + ty * railHalf, z: 0 });
  const pLeftTop = projectPoint(basis, { x: rx - tx * railHalf, y: ry - ty * railHalf, z: 2.8 });
  const pRightTop = projectPoint(basis, { x: rx + tx * railHalf, y: ry + ty * railHalf, z: 2.8 });

  if (!pLeftBot.visible || !pRightBot.visible || !pLeftTop.visible || !pRightTop.visible) return;

  ctx.save();
  const isActiveRack = state.phase !== 'TITLE' && rackIndex === state.currentRack;
  // Subtle court shooting-spot ring on active rack so players feel the exact plant zone
  if (isActiveRack && (state.phase === 'PLAYING' || state.phase === 'COUNTDOWN')) {
    const spotPts: ProjectedPoint[] = [];
    const spotR = 1.45;
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      spotPts.push(
        projectPoint(basis, {
          x: rack.x + Math.cos(a) * spotR,
          y: rack.y + Math.sin(a) * spotR,
          z: 0.03,
        })
      );
    }
    const visiblePts = spotPts.filter((p) => p.visible);
    if (visiblePts.length >= 3) {
      const pulse = state.isMovingToRack ? 0.5 + 0.5 * Math.sin(state.clockTime * 11) : 0.72;
      ctx.strokeStyle = state.isMovingToRack
        ? `rgba(253, 224, 71, ${(0.35 + pulse * 0.4).toFixed(3)})`
        : isSinglePedestal
          ? 'rgba(253, 224, 71, 0.7)'
          : 'rgba(0, 255, 170, 0.45)';
      ctx.lineWidth = state.isMovingToRack ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(visiblePts[0].x, visiblePts[0].y);
      for (let i = 1; i < visiblePts.length; i++) {
        ctx.lineTo(visiblePts[i].x, visiblePts[i].y);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = isActiveRack
    ? isSinglePedestal
      ? '#FDE047'
      : theme.palette.rackActiveColor
    : isSinglePedestal
      ? '#F59E0B'
      : theme.palette.rackColor;
  ctx.lineWidth = Math.max(2, pLeftTop.scale * 0.14);
  ctx.lineCap = 'round';

  if (isSinglePedestal) {
    const pCenterBot = projectPoint(basis, { x: rx, y: ry, z: 0 });
    const pCenterTop = projectPoint(basis, { x: rx, y: ry, z: 2.76 });
    if (pCenterBot.visible && pCenterTop.visible) {
      ctx.beginPath();
      ctx.moveTo(pLeftBot.x, pLeftBot.y);
      ctx.lineTo(pRightBot.x, pRightBot.y);
      ctx.moveTo(pCenterBot.x, pCenterBot.y);
      ctx.lineTo(pCenterTop.x, pCenterTop.y);
      ctx.moveTo(pLeftTop.x, pLeftTop.y);
      ctx.lineTo(pRightTop.x, pRightTop.y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(pLeftBot.x, pLeftBot.y);
    ctx.lineTo(pLeftTop.x, pLeftTop.y);
    ctx.lineTo(pRightTop.x, pRightTop.y);
    ctx.lineTo(pRightBot.x, pRightBot.y);
    ctx.stroke();
  }

  const startIdx = getSlotIndex(rackIndex, 0);
  for (let b = 0; b < rackBallCount; b++) {
    const slot = state.ballsRecord[startIdx + b];
    const isCurrentlyInHands =
      isActiveRack &&
      b === state.currentBall &&
      (state.phase === 'PLAYING' || state.phase === 'COUNTDOWN') &&
      !state.isMovingToRack;
    if (!slot || slot.status !== 'PENDING' || isCurrentlyInHands) continue;

    const u = (b - (rackBallCount - 1) * 0.5) * 0.72;
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
  runBlend?: number;
  isMoving: boolean;
  isDribbling?: boolean;
  dribbleBlend?: number;
  gatherAmount: number;
  followThroughAmount: number;
  landingSquat?: number;
  ballPickupBlend?: number;
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
  labelAlpha?: number;
}

function solveTwoBoneLimb(
  root: Vec3,
  target: Vec3,
  len1: number,
  len2: number,
  poleDir: Vec3
): { mid: Vec3; end: Vec3 } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dz = target.z - root.z;
  const rawDist = Math.hypot(dx, dy, dz) || 0.001;
  const minDist = Math.abs(len1 - len2) + 0.06;
  const maxDist = len1 + len2 - 0.03;
  const clampedDist = Math.max(minDist, Math.min(maxDist, rawDist));

  const ux = dx / rawDist;
  const uy = dy / rawDist;
  const uz = dz / rawDist;

  const end: Vec3 =
    rawDist > maxDist || rawDist < minDist
      ? {
          x: root.x + ux * clampedDist,
          y: root.y + uy * clampedDist,
          z: root.z + uz * clampedDist,
        }
      : target;

  const cosA = Math.max(
    -1,
    Math.min(1, (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist))
  );
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  // Project poleDir orthogonal to limb direction
  const dotP = poleDir.x * ux + poleDir.y * uy + poleDir.z * uz;
  let px = poleDir.x - ux * dotP;
  let py = poleDir.y - uy * dotP;
  let pz = poleDir.z - uz * dotP;
  const pLen = Math.hypot(px, py, pz);
  if (pLen > 0.0001) {
    px /= pLen;
    py /= pLen;
    pz /= pLen;
  } else {
    px = 0;
    py = 0;
    pz = 1;
  }

  const mid: Vec3 = {
    x: root.x + (ux * cosA + px * sinA) * len1,
    y: root.y + (uy * cosA + py * sinA) * len1,
    z: root.z + (uz * cosA + pz * sinA) * len1,
  };

  return { mid, end };
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
    runBlend,
    isMoving,
    isDribbling = false,
    dribbleBlend,
    gatherAmount,
    followThroughAmount: ft,
    landingSquat = 0,
    ballPickupBlend = 0,
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
    labelAlpha = 1,
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

  const dribbleWeight = isDribbling
    ? Math.max(0.28, Math.min(1, dribbleBlend ?? 1))
    : 0;

  // Escalating streak-based dribbling pattern & tempo
  const dribbleTier = streak >= 9 ? 3 : streak >= 6 ? 2 : streak >= 3 ? 1 : 0;
  const dribbleHz =
    dribbleTier === 3 ? 3.95 : dribbleTier === 2 ? 3.22 : dribbleTier === 1 ? 2.58 : 2.05;
  const rawDribbleClock = clockTime * dribbleHz;
  const dribbleMod =
    dribbleTier === 2
      ? Math.sin(rawDribbleClock * Math.PI) * 0.08
      : dribbleTier === 3
        ? Math.sin(rawDribbleClock * Math.PI * 0.5) * 0.06
        : 0;
  const dribblePhase = (((rawDribbleClock + dribbleMod) % 1) + 1) % 1;
  const dNorm = Math.abs(dribblePhase * 2 - 1); // 0 at floor, 1 at hand
  const dribblePowerCurve = dribbleTier >= 2 ? 0.6 : dribbleTier === 1 ? 0.65 : 0.7;
  const dribbleBounce = isDribbling ? Math.pow(dNorm, dribblePowerCurve) : 1;

  // Pattern geometry: right-side athletic pound (0) -> V-crossover (1) -> rapid in-and-out hesi (2) -> speed blur (3)
  let dribbleLat = 0.96;
  let dribbleFwd = 0.76;
  let dribblePeakZ = 2.74;
  if (isDribbling) {
    if (dribbleTier === 0) {
      dribbleLat = 0.94 + Math.sin(clockTime * dribbleHz * Math.PI) * 0.08;
      dribbleFwd = 0.76 + (1 - dribbleBounce) * 0.08;
      dribblePeakZ = 2.72;
    } else if (dribbleTier === 1) {
      const crossWave = Math.cos(clockTime * dribbleHz * 0.5 * Math.PI * 2);
      dribbleLat = crossWave * 0.94;
      dribbleFwd = 0.8 + (1 - Math.abs(crossWave)) * 0.24;
      dribblePeakZ = 2.52;
    } else if (dribbleTier === 2) {
      dribbleLat =
        Math.sin(clockTime * 5.2) * 0.72 + Math.cos(clockTime * 10.4) * 0.34;
      dribbleFwd = 0.84 + Math.sin(clockTime * 6.8) * 0.18;
      dribblePeakZ = 2.24;
    } else if (dribbleTier === 3) {
      dribbleLat = Math.sin(clockTime * 8.1) * 1.02;
      dribbleFwd = 0.86 + Math.sin(clockTime * 16.2) * 0.22;
      dribblePeakZ = 1.95;
    }
  }

  const dribbleKneeBase =
    dribbleTier === 3 ? 0.44 : dribbleTier === 2 ? 0.38 : dribbleTier === 1 ? 0.32 : 0.26;
  const dribbleKneeDip = isDribbling
    ? ((1 - dribbleBounce) * dribbleKneeBase + 0.12 + dribbleTier * 0.07) * dribbleWeight
    : 0;
  const dribbleWeightShift = isDribbling
    ? Math.sin(clockTime * dribbleHz * Math.PI) * (0.1 + dribbleTier * 0.04) * dribbleWeight
    : 0;

  const runMix = isMoving
    ? Math.max(0.18, Math.min(1, runBlend ?? 1))
    : Math.max(0, Math.min(1, runBlend ?? 0));
  const isSprinting = runMix > 0.04;

  const activePhase = isSprinting ? runPhase : 0;
  const strideSin = isSprinting ? Math.sin(activePhase) : 0;
  // Mid-stance compression (-1) -> toe-off flight peak (+1) aligned with asymmetric stance/swing phase
  const strideFloat = isSprinting ? Math.cos(activePhase * 2 - 0.22) : 0;
  const runBounce = isSprinting ? runMix * (0.14 + strideFloat * 0.34) : 0;

  // Shooting triple-threat dip -> upward triple-extension -> elevated set-point -> gooseneck release
  const clampedGather = Math.max(0, Math.min(1, gatherAmount));
  const gatherEase = clampedGather * clampedGather * (3 - 2 * clampedGather);
  const shotDipWave = isHoldingShot
    ? Math.sin(Math.min(1, meterValue / 0.48) * Math.PI)
    : 0;
  const shotRiseProgress = isHoldingShot
    ? 1 - Math.pow(1 - Math.max(0, Math.min(1, (meterValue - 0.16) / 0.6)), 2.25)
    : ft > 0
      ? 1
      : 0;
  const landBounce = landingSquat > 0 ? Math.sin(Math.min(1, landingSquat) * Math.PI * 0.5) : 0;

  const shootCrouch = isHoldingShot
    ? Math.max(gatherEase * 0.28, shotDipWave * 0.78 * (1 - shotRiseProgress * 0.62))
    : landBounce * 0.68 + ballPickupBlend * 0.32;
  const crouch = isSprinting
    ? (0.28 + Math.max(0, -strideFloat) * 0.08) * runMix + shootCrouch * (1 - runMix)
    : Math.max(shootCrouch, dribbleKneeDip);
  const breath = isSprinting || sz > 0.1 || isDribbling ? 0 : Math.sin(clockTime * 2.8) * 0.04;
  const jumpKick = sz > 0.08 ? Math.min(0.58, sz * 0.44) : 0;
  const heelLift =
    !isSprinting && sz <= 0.06 && isHoldingShot && meterValue > 0.3
      ? Math.min(0.58, ((meterValue - 0.3) / 0.42) * 0.58)
      : 0;
  const shootTorque = isHoldingShot
    ? 0.16 + shotRiseProgress * 0.14
    : ft > 0
      ? 0.26 * Math.min(1, ft * 1.9)
      : isDribbling
        ? (dribbleTier >= 2
            ? Math.sin(clockTime * (dribbleTier === 3 ? 8.1 : 5.2)) * 0.18
            : dribbleTier === 1
              ? dribbleLat * 0.14
              : 0.1 + (1 - dribbleBounce) * 0.06) * dribbleWeight
        : 0;

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
    const airFactor = Math.max(0.45, 1 - (sz + Math.max(0, runBounce) * 0.5) * 0.22);
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

  // World joint positions with 2-bone biomechanical leg & arm IK
  const hipSway = isSprinting ? -strideSin * 0.14 * runMix : dribbleWeightShift;
  const bodyZ = sz + runBounce;
  const hipWorld: Vec3 = {
    x: sx + rx * hipSway + fx * (crouch * 0.06 + runMix * 0.1 - jumpKick * 0.14),
    y: sy + ry * hipSway + fy * (crouch * 0.06 + runMix * 0.1 - jumpKick * 0.14),
    z: bodyZ + 3.22 - crouch * 0.6 + breath * 0.3 + heelLift * 0.68,
  };
  const hip = projectPoint(basis, hipWorld);

  const THIGH_LEN = 1.66;
  const SHIN_LEN = 1.64;

  const computeRunLeg = (legPhase: number, sideSign: -1 | 1, idleLead: number) => {
    const hipSocket: Vec3 = {
      x: hipWorld.x + rx * (0.28 * sideSign),
      y: hipWorld.y + ry * (0.28 * sideSign),
      z: hipWorld.z - 0.05,
    };
    const kneePole: Vec3 = {
      x: fx + rx * (0.18 * sideSign),
      y: fy + ry * (0.18 * sideSign),
      z: isSprinting ? 0.5 * runMix + 0.2 * (1 - runMix) : 0.24,
    };

    if (!isSprinting) {
      const shooterStagger =
        isHoldingShot || ft > 0 ? (sideSign > 0 ? 0.18 : -0.08) : 0;
      const dribbleStanceLat = isDribbling ? 0.08 * dribbleWeight : 0;
      const dribbleFootShift = isDribbling
        ? Math.sin(clockTime * dribbleHz * Math.PI + (sideSign > 0 ? 0 : Math.PI)) *
          0.08 *
          dribbleWeight
        : 0;
      const sideLead =
        idleLead +
        shooterStagger +
        dribbleFootShift +
        jumpKick * (sideSign > 0 ? 1.04 : 0.74);
      const ankleTarget: Vec3 = {
        x: sx + rx * ((0.48 + dribbleStanceLat) * sideSign) + fx * sideLead,
        y: sy + ry * ((0.48 + dribbleStanceLat) * sideSign) + fy * sideLead,
        z: Math.max(
          0.22,
          sz + 0.24 + heelLift * (sideSign > 0 ? 0.94 : 0.78) - sz * 0.15
        ),
      };
      const solved = solveTwoBoneLimb(hipSocket, ankleTarget, THIGH_LEN, SHIN_LEN, kneePole);
      const toeDrop = sz > 0.1 ? Math.min(0.28, sz * 0.26) : 0;
      const toeWorld: Vec3 = {
        x: solved.end.x + fx * 0.52,
        y: solved.end.y + fy * 0.52,
        z: Math.max(0.04, solved.end.z - 0.18 - heelLift * 0.8 - toeDrop),
      };
      return { kneeWorld: solved.mid, ankleWorld: solved.end, toeWorld };
    }

    // Normalized gait phase u in [0, 1):
    // [0.00..0.40] = Ground Stance & Toe-off Push | [0.40..1.00] = Heel-Kick Recovery & High Knee Drive
    const u = (((legPhase / (Math.PI * 2)) % 1) + 1) % 1;
    let footFwd = 0;
    let ankleZ = 0.24;
    let toeOffsetZ = -0.19;
    let toeOffsetFwd = 0.52;

    if (u < 0.4) {
      const st = u / 0.4; // 0 (front strike) -> 1 (rear toe-off)
      footFwd = 1.68 - st * 3.32;
      if (st < 0.15) {
        // Crisp strike into flat plant
        const strike = 1 - st / 0.15;
        ankleZ = 0.24 + strike * 0.12;
        toeOffsetZ = -0.18 + strike * 0.2;
      } else if (st > 0.58) {
        // Explosive toe-off roll: heel rises while toe drives off hardwood
        const push = (st - 0.58) / 0.42;
        ankleZ = 0.24 + push * 0.52;
        toeOffsetZ = -0.19 - push * 0.3;
        toeOffsetFwd = 0.52 - push * 0.18;
      } else {
        ankleZ = 0.24;
        toeOffsetZ = -0.19;
      }
    } else {
      const sw = (u - 0.4) / 0.6; // 0 (toe-off) -> 1 (next strike)
      if (sw < 0.35) {
        // Early recovery: rapid heel tuck behind hips
        const k = sw / 0.35;
        const smoothK = k * k * (3 - 2 * k);
        footFwd = -1.64 + smoothK * 0.72;
        ankleZ = 0.74 + Math.sin(k * Math.PI * 0.5) * 1.24;
        toeOffsetZ = -0.4;
        toeOffsetFwd = 0.34;
      } else if (sw < 0.78) {
        // Mid-swing: high knee drive & shin cycling forward cleanly
        const m = (sw - 0.35) / 0.43;
        const smoothM = m * m * (3 - 2 * m);
        footFwd = -0.92 + smoothM * 1.84;
        ankleZ = 1.98 - smoothM * 0.86;
        toeOffsetZ = -0.22 + smoothM * 0.16;
        toeOffsetFwd = 0.48;
      } else {
        // Terminal swing: shin extends forward into active front strike
        const t = (sw - 0.78) / 0.22;
        const smoothT = 1 - Math.pow(1 - t, 2);
        footFwd = 0.92 + smoothT * 0.76;
        ankleZ = 1.12 - smoothT * 0.76;
        toeOffsetZ = -0.06 + smoothT * 0.06;
        toeOffsetFwd = 0.52;
      }
    }

    const blendedFwd = footFwd * runMix + idleLead * (1 - runMix);
    const blendedAnkleZ = sz + ankleZ * runMix + 0.24 * (1 - runMix);
    const ankleTarget: Vec3 = {
      x: sx + rx * ((0.38 - 0.06 * runMix) * sideSign + hipSway * 0.5) + fx * blendedFwd,
      y: sy + ry * ((0.38 - 0.06 * runMix) * sideSign + hipSway * 0.5) + fy * blendedFwd,
      z: blendedAnkleZ,
    };

    const solved = solveTwoBoneLimb(hipSocket, ankleTarget, THIGH_LEN, SHIN_LEN, kneePole);
    const toeWorld: Vec3 = {
      x: solved.end.x + fx * (toeOffsetFwd * runMix + 0.5 * (1 - runMix)),
      y: solved.end.y + fy * (toeOffsetFwd * runMix + 0.5 * (1 - runMix)),
      z: Math.max(0.04, solved.end.z + toeOffsetZ * runMix - 0.19 * (1 - runMix)),
    };
    return { kneeWorld: solved.mid, ankleWorld: solved.end, toeWorld };
  };

  const legL = computeRunLeg(activePhase, -1, -0.14);
  const legR = computeRunLeg(activePhase + Math.PI, 1, 0.26);

  const kneeL = projectPoint(basis, legL.kneeWorld);
  const kneeR = projectPoint(basis, legR.kneeWorld);
  const ankleL = projectPoint(basis, legL.ankleWorld);
  const ankleR = projectPoint(basis, legR.ankleWorld);
  const toeL = projectPoint(basis, legL.toeWorld);
  const toeR = projectPoint(basis, legR.toeWorld);

  const torsoLean = isSprinting
    ? (0.96 + Math.max(0, strideFloat) * 0.14) * runMix + crouch * 0.24 * (1 - runMix)
    : isDribbling
      ? (0.28 + (1 - dribbleBounce) * 0.1) * dribbleWeight + crouch * 0.14
      : crouch * 0.25 - ft * 0.18 - Math.min(0.16, sz * 0.14);
  const torsoTwist = isSprinting
    ? Math.sin(activePhase + 0.15) * 0.42 * runMix + shootTorque * (1 - runMix)
    : shootTorque;
  const shoulderRollZ = isSprinting ? Math.sin(activePhase) * 0.14 * runMix : 0;
  const shoulderZ =
    bodyZ + 5.18 - crouch * 0.66 + breath + heelLift * 0.74 + (isSprinting ? -0.12 * runMix : 0);
  const shoulderCenterWorld: Vec3 = {
    x: sx + rx * (hipSway * 0.45) + fx * torsoLean,
    y: sy + ry * (hipSway * 0.45) + fy * torsoLean,
    z: shoulderZ,
  };
  const releaseShoulderLift = ft > 0 ? Math.min(1, ft * 2.15) * 0.26 : 0;
  const shoulderRWorld: Vec3 = {
    x: sx + rx * (0.72 + hipSway * 0.45) + fx * (torsoLean + torsoTwist),
    y: sy + ry * (0.72 + hipSway * 0.45) + fy * (torsoLean + torsoTwist),
    z: shoulderZ - 0.06 + shoulderRollZ + (isHoldingShot ? 0.14 : 0) + releaseShoulderLift,
  };
  const shoulderLWorld: Vec3 = {
    x: sx + rx * (-0.72 + hipSway * 0.45) + fx * (torsoLean - torsoTwist),
    y: sy + ry * (-0.72 + hipSway * 0.45) + fy * (torsoLean - torsoTwist),
    z: shoulderZ - 0.06 - shoulderRollZ,
  };

  const shoulderCenter = projectPoint(basis, shoulderCenterWorld);
  const shoulderL = projectPoint(basis, shoulderLWorld);
  const shoulderR = projectPoint(basis, shoulderRWorld);
  const dribbleHeadBob = isDribbling ? (dribbleBounce - 0.5) * 0.11 * dribbleWeight : 0;
  const head = projectPoint(basis, {
    x: sx + rx * (hipSway * 0.22) + fx * (torsoLean + 0.24 * runMix + 0.1 * (1 - runMix)),
    y: sy + ry * (hipSway * 0.22) + fy * (torsoLean + 0.24 * runMix + 0.1 * (1 - runMix)),
    z:
      bodyZ +
      6.12 -
      crouch * 0.64 +
      breath * 1.1 +
      dribbleHeadBob +
      heelLift * 0.76 -
      (isSprinting ? strideFloat * 0.06 * runMix : 0),
  });

  const UPPER_ARM_LEN = 1.24;
  const FOREARM_LEN = 1.18;

  let handRWorld: Vec3;
  let wristRWorld: Vec3;
  let elbowRWorld: Vec3;
  let handLWorld: Vec3;
  let wristLWorld: Vec3;
  let elbowLWorld: Vec3;

  if (isSprinting) {
    // Athletic ~90-degree bent-arm cheek-to-hip sprint pump with 2-bone arm IK
    const armDriveR = Math.sin(activePhase + 0.18); // right arm swings forward as left leg drives
    const armDriveL = -armDriveR;

    const buildSprintArm = (
      shoulderPos: Vec3,
      drive: number,
      sideSign: -1 | 1
    ): { elbow: Vec3; wrist: Vec3; hand: Vec3 } => {
      const fwdSwing = Math.max(0, drive);
      const backSwing = Math.max(0, -drive);
      const wristTarget: Vec3 = {
        x:
          shoulderPos.x -
          rx * sideSign * (0.08 + fwdSwing * 0.26) +
          fx * (0.48 + fwdSwing * 0.72 - backSwing * 0.56) * runMix,
        y:
          shoulderPos.y -
          ry * sideSign * (0.08 + fwdSwing * 0.26) +
          fy * (0.48 + fwdSwing * 0.72 - backSwing * 0.56) * runMix,
        z: shoulderPos.z - 0.42 + fwdSwing * 0.96 - backSwing * 0.34,
      };
      // Elbow pole always bends backward & downward behind torso
      const armPole: Vec3 = {
        x: -fx * 0.85 + rx * sideSign * 0.28,
        y: -fy * 0.85 + ry * sideSign * 0.28,
        z: -0.78,
      };
      const solved = solveTwoBoneLimb(
        shoulderPos,
        wristTarget,
        UPPER_ARM_LEN,
        FOREARM_LEN,
        armPole
      );
      const hand: Vec3 = {
        x: solved.end.x - rx * sideSign * 0.05 + fx * 0.14,
        y: solved.end.y - ry * sideSign * 0.05 + fy * 0.14,
        z: solved.end.z + 0.14 + fwdSwing * 0.1,
      };
      return { elbow: solved.mid, wrist: solved.end, hand };
    };

    const armR = buildSprintArm(shoulderRWorld, armDriveR, 1);
    const armL = buildSprintArm(shoulderLWorld, armDriveL, -1);
    elbowRWorld = armR.elbow;
    wristRWorld = armR.wrist;
    handRWorld = armR.hand;
    elbowLWorld = armL.elbow;
    wristLWorld = armL.wrist;
    handLWorld = armL.hand;
  } else if (isDribbling) {
    // Streak-reactive 2-bone IK dribbling kinematics + rack ball-pickup reach
    const handPush = Math.max(0.18, dribbleBounce);
    const palmDrop = (1 - handPush) * (0.85 + dribbleTier * 0.12);
    const activeRight = dribbleLat >= 0;
    const pickupDip = ballPickupBlend * 0.46;
    const ballTopZ =
      sz +
      (3.96 - dribbleTier * 0.16) -
      palmDrop -
      crouch * 0.45 -
      pickupDip +
      breath;
    const ballTrackX = sx + rx * dribbleLat * 0.96 + fx * (dribbleFwd - 0.06);
    const ballTrackY = sy + ry * dribbleLat * 0.96 + fy * (dribbleFwd - 0.06);

    const dribblePoleR: Vec3 = { x: -fx * 0.45 + rx * 0.85, y: -fy * 0.45 + ry * 0.85, z: -0.35 };
    const dribblePoleL: Vec3 = { x: -fx * 0.45 - rx * 0.85, y: -fy * 0.45 - ry * 0.85, z: -0.35 };

    if (activeRight) {
      const wristRTarget: Vec3 = {
        x: ballTrackX - fx * 0.1,
        y: ballTrackY - fy * 0.1,
        z: ballTopZ + 0.14,
      };
      const solvedR = solveTwoBoneLimb(
        shoulderRWorld,
        wristRTarget,
        UPPER_ARM_LEN,
        FOREARM_LEN,
        dribblePoleR
      );
      elbowRWorld = solvedR.mid;
      wristRWorld = solvedR.end;
      handRWorld = {
        x: wristRWorld.x + fx * 0.12,
        y: wristRWorld.y + fy * 0.12,
        z: wristRWorld.z - 0.14,
      };

      const wristLTarget: Vec3 = {
        x: sx - rx * (0.52 + dribbleTier * 0.08) + fx * 0.64,
        y: sy - ry * (0.52 + dribbleTier * 0.08) + fy * 0.64,
        z: sz + 4.02 - crouch * 0.45 - pickupDip * 0.6 + breath,
      };
      const solvedL = solveTwoBoneLimb(
        shoulderLWorld,
        wristLTarget,
        UPPER_ARM_LEN,
        FOREARM_LEN,
        dribblePoleL
      );
      elbowLWorld = solvedL.mid;
      wristLWorld = solvedL.end;
      handLWorld = {
        x: wristLWorld.x + fx * 0.1,
        y: wristLWorld.y + fy * 0.1,
        z: wristLWorld.z + (1 - dribbleBounce) * (0.12 + dribbleTier * 0.05),
      };
    } else {
      const wristLTarget: Vec3 = {
        x: ballTrackX - fx * 0.1,
        y: ballTrackY - fy * 0.1,
        z: ballTopZ + 0.14,
      };
      const solvedL = solveTwoBoneLimb(
        shoulderLWorld,
        wristLTarget,
        UPPER_ARM_LEN,
        FOREARM_LEN,
        dribblePoleL
      );
      elbowLWorld = solvedL.mid;
      wristLWorld = solvedL.end;
      handLWorld = {
        x: wristLWorld.x + fx * 0.12,
        y: wristLWorld.y + fy * 0.12,
        z: wristLWorld.z - 0.14,
      };

      const wristRTarget: Vec3 = {
        x: sx + rx * 0.56 + fx * 0.62,
        y: sy + ry * 0.56 + fy * 0.62,
        z: sz + 4.04 - crouch * 0.45 - pickupDip * 0.6 + breath,
      };
      const solvedR = solveTwoBoneLimb(
        shoulderRWorld,
        wristRTarget,
        UPPER_ARM_LEN,
        FOREARM_LEN,
        dribblePoleR
      );
      elbowRWorld = solvedR.mid;
      wristRWorld = solvedR.end;
      handRWorld = {
        x: wristRWorld.x + fx * 0.1,
        y: wristRWorld.y + fy * 0.1,
        z: wristRWorld.z + (1 - dribbleBounce) * 0.14,
      };
    }
  } else {
    // Fluid 2-bone IK jump-shot stroke: shot-pocket dip -> forehead set point -> full release extension & gooseneck snap
    const pocketLift = isHoldingShot
      ? 0.14 + shotRiseProgress * 0.88
      : ft > 0
        ? 1.24
        : 0.14;
    const dipDrop = isHoldingShot
      ? Math.sin(Math.min(1, meterValue / 0.42) * Math.PI) * 0.34
      : 0;
    const releaseExt = ft > 0 ? Math.min(1, ft * 2.2) : 0;
    const pickupDrop = !isHoldingShot && ft <= 0 ? ballPickupBlend * 0.62 : 0;
    const pickupSide = !isHoldingShot && ft <= 0 ? ballPickupBlend * 0.36 : 0;

    // Right shooting wrist sweeps smoothly upward along vertical shot line above shoulder
    const wristRTarget: Vec3 = {
      x:
        sx +
        rx * (0.34 - pocketLift * 0.16 + pickupSide) +
        fx * (0.58 + pocketLift * 0.48 + releaseExt * 0.24),
      y:
        sy +
        ry * (0.34 - pocketLift * 0.16 + pickupSide) +
        fy * (0.58 + pocketLift * 0.48 + releaseExt * 0.24),
      z:
        sz +
        4.32 +
        pocketLift * 2.66 +
        releaseExt * 0.68 -
        dipDrop -
        pickupDrop -
        crouch * 0.46 +
        breath +
        heelLift * 0.78,
    };
    // Shooting elbow stays tucked under the ball pointing forward toward the rim
    const elbowRPole: Vec3 = {
      x: fx * 0.92 + rx * 0.18,
      y: fy * 0.92 + ry * 0.18,
      z: -0.46,
    };
    const solvedR = solveTwoBoneLimb(
      shoulderRWorld,
      wristRTarget,
      UPPER_ARM_LEN,
      FOREARM_LEN,
      elbowRPole
    );
    elbowRWorld = solvedR.mid;
    wristRWorld = solvedR.end;
    handRWorld = {
      x: wristRWorld.x + fx * (0.1 + releaseExt * 0.22),
      y: wristRWorld.y + fy * (0.1 + releaseExt * 0.22),
      z: wristRWorld.z + (0.16 - releaseExt * 0.28),
    };

    // Guide hand (left) cradles side of ball in pocket & peels off cleanly upon release
    const guidePeel = ft > 0 ? 0.3 + Math.min(1, ft * 1.55) * 0.22 : 0;
    const wristLTarget: Vec3 = {
      x: sx - rx * (0.26 + guidePeel) + fx * (0.56 + Math.min(0.88, pocketLift) * 0.44),
      y: sy - ry * (0.26 + guidePeel) + fy * (0.56 + Math.min(0.88, pocketLift) * 0.44),
      z:
        sz +
        4.26 +
        Math.min(0.88, pocketLift) * 2.48 -
        dipDrop -
        pickupDrop * 0.65 -
        crouch * 0.46 +
        breath +
        heelLift * 0.78,
    };
    const elbowLPole: Vec3 = {
      x: fx * 0.42 - rx * 0.84,
      y: fy * 0.42 - ry * 0.84,
      z: -0.52,
    };
    const solvedL = solveTwoBoneLimb(
      shoulderLWorld,
      wristLTarget,
      UPPER_ARM_LEN,
      FOREARM_LEN,
      elbowLPole
    );
    elbowLWorld = solvedL.mid;
    wristLWorld = solvedL.end;
    handLWorld = {
      x: wristLWorld.x + fx * (0.1 - guidePeel * 0.14),
      y: wristLWorld.y + fy * (0.1 - guidePeel * 0.14),
      z: wristLWorld.z + (0.15 + guidePeel * 0.08),
    };
  }

  const elbowR = projectPoint(basis, elbowRWorld);
  const wristR = projectPoint(basis, wristRWorld);
  const handR = projectPoint(basis, handRWorld);
  const elbowL = projectPoint(basis, elbowLWorld);
  const wristL = projectPoint(basis, wristLWorld);
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

  // Subtle speed streaks trailing behind runner while sprinting
  if (isSprinting && runMix > 0.35 && !isGhost) {
    ctx.save();
    ctx.lineCap = 'round';
    const streakSpecs = [
      { z: bodyZ + 5.1, lat: 0.45, len: 1.55 },
      { z: bodyZ + 3.6, lat: -0.5, len: 1.95 },
      { z: bodyZ + 2.0, lat: 0.35, len: 1.35 },
    ];
    for (let i = 0; i < streakSpecs.length; i++) {
      const sp = streakSpecs[i];
      const pStart = projectPoint(basis, {
        x: sx + rx * sp.lat - fx * 0.45,
        y: sy + ry * sp.lat - fy * 0.45,
        z: sp.z,
      });
      const pEnd = projectPoint(basis, {
        x: sx + rx * sp.lat - fx * (0.45 + sp.len * runMix),
        y: sy + ry * sp.lat - fy * (0.45 + sp.len * runMix),
        z: sp.z,
      });
      if (!pStart.visible || !pEnd.visible) continue;
      ctx.strokeStyle = i === 1 ? accentColor : 'rgba(244, 239, 230, 0.72)';
      ctx.globalAlpha = alpha * runMix * (i === 1 ? 0.34 : 0.22);
      ctx.lineWidth = Math.max(1.2, lineW * 0.38);
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 1. Stick Legs (hip -> knee -> ankle -> toe) + athletic sneaker accents
  drawStickLimb(ctx, [hip, kneeL, ankleL, toeL], lineW, activeStroke, outlineStyle);
  drawStickLimb(ctx, [hip, kneeR, ankleR, toeR], lineW, activeStroke, outlineStyle);
  if (ankleL.visible && toeL.visible) {
    drawStickLimb(ctx, [ankleL, toeL], Math.max(2.4, lineW * 1.15), accentColor);
  }
  if (ankleR.visible && toeR.visible) {
    drawStickLimb(ctx, [ankleR, toeR], Math.max(2.4, lineW * 1.15), accentColor);
  }

  // 2. Stick Spine, Neck & Shoulder Bar
  drawStickLimb(ctx, [hip, shoulderCenter, head], lineW * 1.08, activeStroke, outlineStyle);
  drawStickLimb(ctx, [shoulderL, shoulderCenter, shoulderR], lineW, activeStroke, outlineStyle);

  // 3. Guide Arm (left) & Shooting Arm (right)
  drawStickLimb(
    ctx,
    [shoulderL, elbowL, wristL, handL],
    lineW * 0.9,
    activeStroke,
    outlineStyle
  );
  drawStickLimb(
    ctx,
    [shoulderR, elbowR, wristR, handR],
    lineW * 0.92,
    activeStroke,
    outlineStyle
  );

  // Crisp gooseneck follow-through snap tip on release (wrist flexion toward hoop)
  if (ft > 0.08 && handR.visible && wristR.visible) {
    const snapAmount = Math.min(1, ft * 1.9);
    const snapWorld: Vec3 = {
      x: handRWorld.x + fx * (0.3 * snapAmount),
      y: handRWorld.y + fy * (0.3 * snapAmount),
      z: handRWorld.z - 0.36 * snapAmount,
    };
    const snapPt = projectPoint(basis, snapWorld);
    if (snapPt.visible) {
      drawStickLimb(ctx, [handR, snapPt], Math.max(1.9, lineW * 0.68), activeStroke, outlineStyle);
    }
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
  if (heldBall && ft <= 0.01 && (isHoldingShot || sz < 0.35)) {
    if (isDribbling) {
      const dribbleBallPos: Vec3 = {
        x: sx + rx * dribbleLat + fx * dribbleFwd,
        y: sy + ry * dribbleLat + fy * dribbleFwd,
        z: BALL_RADIUS + dribbleBounce * dribblePeakZ,
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
        if (dribbleTier >= 2 && dribbleBounce < 0.22) {
          ctx.strokeStyle =
            dribbleTier >= 3 ? 'rgba(245, 158, 11, 0.55)' : 'rgba(249, 99, 28, 0.45)';
          ctx.lineWidth = Math.max(1.2, dbShadow.scale * 0.06);
          ctx.beginPath();
          ctx.ellipse(
            dbShadow.x,
            dbShadow.y,
            sr * (1.5 + (0.22 - dribbleBounce) * 2.2),
            sr * (0.72 + (0.22 - dribbleBounce) * 1.1),
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
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
          clockTime * (4.5 + dribbleTier * 2.4),
          streak >= 6 ? 1.15 : streak >= 3 ? 0.85 : 0
        );
      }
    } else {
      const heldBallPos: Vec3 = {
        x: (handRWorld.x + handLWorld.x) * 0.5 + fx * 0.16,
        y: (handRWorld.y + handLWorld.y) * 0.5 + fy * 0.16,
        z: handRWorld.z + 0.28,
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

  // Optional floating player username tag above head (fades out cleanly during active shooting)
  if (labelTag && (isGhost || labelAlpha > 0.015)) {
    ctx.save();
    ctx.shadowBlur = 0;
    if (isGhost) {
      ctx.globalAlpha = 0.98;
      const tagText = streak >= 2 ? `${labelTag} · ${streak} STREAK` : labelTag;
      const floatBob = Math.sin(clockTime * 2.2) * 1.2;
      const labelY = head.y - headR - 14 + floatBob;
      ctx.font = '700 12px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(tagText).width;
      const boxW = textW + 14;
      const boxH = 20;
      const boxX = head.x - boxW * 0.5;
      const boxY = labelY - boxH * 0.5;

      ctx.fillStyle = 'rgba(3, 5, 9, 0.97)';
      ctx.strokeStyle =
        streak >= 2 ? 'rgba(253, 224, 71, 0.95)' : 'rgba(125, 211, 252, 0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = streak >= 2 ? '#FEF08A' : '#FFFFFF';
      ctx.fillText(tagText, head.x, labelY + 0.5);
    } else {
      const clampedLabelAlpha = Math.max(0, Math.min(1, labelAlpha));
      ctx.globalAlpha = alpha * clampedLabelAlpha;
      const cleanName =
        labelTag.length > 18 ? `${labelTag.slice(0, 17).trimEnd()}…` : labelTag;
      const floatBob = Math.sin(clockTime * 2.2) * 1.4;
      const labelY = head.y - headR - 14 + floatBob;
      ctx.font = '700 12px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(cleanName).width;
      const boxW = textW + 14;
      const boxH = 20;
      const boxX = head.x - boxW * 0.5;
      const boxY = labelY - boxH * 0.5;

      ctx.fillStyle = 'rgba(3, 5, 9, 0.97)';
      ctx.strokeStyle =
        streak >= 3 ? 'rgba(253, 224, 71, 0.95)' : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(cleanName, head.x, labelY + 0.5);
    }
    ctx.restore();
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
    state.currentBall < getRackBallCount(state.currentRack)
  ) {
    const slotIndex = getSlotIndex(state.currentRack, state.currentBall);
    const slot = state.ballsRecord[slotIndex];
    if (slot && slot.status === 'PENDING') {
      heldBall = { isMoney: slot.isMoney };
    }
  }

  const isDribbling =
    Boolean(heldBall) &&
    (state.shooterAnimState === 'DRIBBLING' ||
      (!state.isMovingToRack &&
        (state.runBlend ?? 0) < 0.1 &&
        !state.isHoldingShot &&
        state.followThroughAmount <= 0.05 &&
        state.shooterZ <= 0.08 &&
        (state.ballPickupBlend ?? 0) <= 0.05));

  drawAthleteModel(ctx, basis, {
    pos: state.shooterPos,
    z: state.shooterZ,
    facing: state.shooterFacing,
    runPhase: state.runPhase,
    runBlend: state.runBlend,
    isMoving: state.isMovingToRack,
    isDribbling,
    dribbleBlend: state.dribbleBlend ?? (isDribbling ? 1 : 0),
    gatherAmount: state.gatherAmount,
    followThroughAmount: state.followThroughAmount,
    landingSquat: state.landingSquat ?? 0,
    ballPickupBlend: state.ballPickupBlend ?? 0,
    isHoldingShot: state.isHoldingShot,
    meterValue: state.meterValue,
    streak: state.streak,
    clockTime: state.clockTime,
    strokeColor: '#F4EFE6',
    accentColor: '#00ffaa',
    alpha: 1.0,
    heldBall,
    labelTag: state.shooterName?.trim() || 'Shooter',
    labelAlpha: state.shooterLabelAlpha,
  });
}

function drawOpponentGhost(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  ghost: OpponentGhostState,
  clockTime: number
): void {
  const ghostMoving = Boolean(ghost.isMoving);
  const ghostDribbling = !ghostMoving && ghost.z <= 0.08 && ghost.followThrough <= 0.05;
  drawAthleteModel(ctx, basis, {
    pos: ghost.pos,
    z: ghost.z,
    facing: ghost.facing,
    runPhase: ghost.runPhase ?? 0,
    runBlend: ghost.runBlend ?? (ghostMoving ? 1 : 0),
    isMoving: ghostMoving,
    isDribbling: ghostDribbling,
    dribbleBlend: ghostDribbling ? 1 : 0,
    gatherAmount: 0,
    followThroughAmount: ghost.followThrough,
    isHoldingShot: false,
    meterValue: 0,
    streak: ghost.streak,
    clockTime,
    strokeColor: '#93C5FD',
    accentColor: ghost.streak >= 6 ? '#FBBF24' : '#38BDF8',
    alpha: 0.56,
    heldBall: ghostDribbling ? { isMoney: false } : null,
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
  const isPracticeGuide =
    state.mode === 'PRACTICE' && (state.phase === 'PLAYING' || state.phase === 'COUNTDOWN');
  const showMeter = state.isHoldingShot || state.meterFeedbackTimer > 0 || isPracticeGuide;
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
  const my = Math.max(radius + 108, Math.min(viewportHeight - 54, rawMy));

  if (!showMeter) {
    if (state.isMovingToRack && state.phase === 'PLAYING') {
      ctx.save();
      const moveText = 'MOVING TO NEXT RACK';
      ctx.font = `800 ${isCompact ? 10 : 11}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const promptW = ctx.measureText(moveText).width + 16;
      const promptH = 22;
      const px = Math.max(10, Math.min(viewportWidth - promptW - 10, mx - promptW * 0.5));
      const py = my - 10 - promptH * 0.5;
      ctx.fillStyle = 'rgba(3, 5, 9, 0.96)';
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(px, py, promptW, promptH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FEF08A';
      ctx.fillText(moveText, px + promptW * 0.5, py + promptH * 0.5 + 0.5);
      ctx.restore();
    } else if (!state.hasShotAnyBall) {
      ctx.save();
      const promptText = isCompact ? 'HOLD & RELEASE TO SHOOT' : 'HOLD SPACE / CLICK';
      ctx.font = `700 ${isCompact ? 10 : 11}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const promptW = ctx.measureText(promptText).width + 16;
      const promptH = 22;
      const px = Math.max(10, Math.min(viewportWidth - promptW - 10, mx - promptW * 0.5));
      const py = my - 10 - promptH * 0.5;
      ctx.fillStyle = 'rgba(3, 5, 9, 0.96)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(px, py, promptW, promptH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(promptText, px + promptW * 0.5, py + promptH * 0.5 + 0.5);
      ctx.restore();
    }
    return;
  }

  const startAngle = Math.PI * 0.78;
  const endAngle = Math.PI * 1.44;
  const span = endAngle - startAngle;

  const hasLiveOrFeedback = state.isHoldingShot || state.meterFeedbackTimer > 0;
  const activeVal = state.isHoldingShot
    ? state.meterValue
    : state.meterFeedbackTimer > 0
      ? state.lastReleaseMeter
      : 0;
  const clampedVal = Math.max(0, Math.min(1.06, activeVal));

  const diff = state.difficulty;
  const makeStart = Math.max(0, METER_PERFECT_CENTER - diff.makeHalfWindow);
  const makeEnd = Math.min(1, METER_PERFECT_CENTER + diff.makeHalfWindow);
  const perfStart = Math.max(0, METER_PERFECT_CENTER - diff.perfectHalfWindow);
  const perfEnd = Math.min(1, METER_PERFECT_CENTER + diff.perfectHalfWindow);

  const perfStartAngle = startAngle + perfStart * span;
  const perfEndAngle = startAngle + perfEnd * span;
  const perfCenterAngle = startAngle + METER_PERFECT_CENTER * span;

  const inPerf = hasLiveOrFeedback && clampedVal >= perfStart && clampedVal <= perfEnd;
  const inMake = hasLiveOrFeedback && clampedVal >= makeStart && clampedVal <= makeEnd;
  const approachingPerf =
    state.isHoldingShot && clampedVal >= perfStart - 0.14 && clampedVal < perfStart;

  ctx.save();
  ctx.lineCap = 'round';

  // Practice mode golden outer halo behind the Perfect Release Window
  if (isPracticeGuide) {
    const pulse = 0.5 + 0.5 * Math.sin(state.clockTime * (inPerf ? 18 : 5.5));
    ctx.strokeStyle = inPerf
      ? `rgba(253, 224, 71, ${0.65 + pulse * 0.3})`
      : approachingPerf
        ? `rgba(245, 158, 11, ${0.42 + pulse * 0.25})`
        : `rgba(245, 158, 11, ${0.24 + pulse * 0.14})`;
    ctx.lineWidth = (isCompact ? 18 : 22) + (inPerf ? 4 : 0);
    ctx.beginPath();
    ctx.arc(mx, my, radius, perfStartAngle, perfEndAngle);
    ctx.stroke();
  }

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

  ctx.strokeStyle = isPracticeGuide && inPerf ? '#FDE047' : '#F59E0B';
  ctx.lineWidth = isPracticeGuide ? (isCompact ? 12 : 14) : isCompact ? 10 : 12;
  ctx.beginPath();
  ctx.arc(mx, my, radius, perfStartAngle, perfEndAngle);
  ctx.stroke();

  // Practice mode crisp Perfect Window bracket boundaries & center sweet-spot tick
  if (isPracticeGuide) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 2;
    for (const boundaryAngle of [perfStartAngle, perfEndAngle]) {
      ctx.beginPath();
      ctx.moveTo(
        mx + Math.cos(boundaryAngle) * (radius - 9),
        my + Math.sin(boundaryAngle) * (radius - 9)
      );
      ctx.lineTo(
        mx + Math.cos(boundaryAngle) * (radius + 9),
        my + Math.sin(boundaryAngle) * (radius + 9)
      );
      ctx.stroke();
    }

    // Sweet-spot diamond/tick at METER_PERFECT_CENTER
    const spotX = mx + Math.cos(perfCenterAngle) * (radius + 13);
    const spotY = my + Math.sin(perfCenterAngle) * (radius + 13);
    ctx.fillStyle = inPerf ? '#FDE047' : '#F59E0B';
    ctx.beginPath();
    ctx.arc(spotX, spotY, inPerf ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
  }

  if (hasLiveOrFeedback) {
    const fillAngle = startAngle + Math.min(1.03, clampedVal) * span;
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
  }

  // Practice mode callout badge pointing to the Perfect Release Window
  if (isPracticeGuide) {
    const labelText = state.isHoldingShot
      ? inPerf
        ? 'NOW! RELEASE!'
        : clampedVal > perfEnd
          ? 'PAST GOLD · RELEASE'
          : approachingPerf
            ? 'ALMOST THERE...'
            : 'HOLD TO GOLD'
      : 'PERFECT WINDOW';
    const badgeColor =
      state.isHoldingShot && inPerf
        ? '#FEF08A'
        : state.isHoldingShot && clampedVal > perfEnd
          ? '#FECACA'
          : '#FDE047';

    const pointerTargetX = mx + Math.cos(perfCenterAngle) * (radius + 17);
    const pointerTargetY = my + Math.sin(perfCenterAngle) * (radius + 17);
    const badgeW = isCompact ? 96 : 112;
    const badgeH = 20;
    const rawBadgeX = mx - badgeW * 0.5;
    const badgeX = Math.max(10, Math.min(viewportWidth - badgeW - 10, rawBadgeX));
    const badgeY = Math.max(82, my - radius - 34);

    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(badgeX + badgeW * 0.5, badgeY + badgeH);
    ctx.lineTo(pointerTargetX, pointerTargetY);
    ctx.stroke();

    ctx.fillStyle =
      state.isHoldingShot && inPerf ? '#FEF08A' : 'rgba(3, 5, 9, 0.97)';
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.font = `800 ${isCompact ? 10 : 11}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.isHoldingShot && inPerf ? '#030508' : badgeColor;
    ctx.fillText(labelText, badgeX + badgeW * 0.5, badgeY + badgeH * 0.5 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  if (!state.isHoldingShot && state.meterFeedbackTimer > 0 && state.lastReleaseLabel) {
    ctx.font = `800 ${isCompact ? 15 : 17}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#030508';
    ctx.lineWidth = isCompact ? 5.5 : 6.5;
    ctx.strokeText(state.lastReleaseLabel, mx, my + 22);
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

function drawBackgroundCallout(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  viewportWidth: number,
  viewportHeight: number,
  hoopPos: Vec3,
  c: FloatingCallout
): void {
  const progress = Math.max(0, Math.min(1, 1 - c.life / c.maxLife));
  const alpha = c.life < 0.25 ? c.life / 0.25 : 1;
  const p = projectPoint(basis, {
    x: c.worldPos.x,
    y: c.worldPos.y,
    z: c.worldPos.z + progress * 1.25,
  });
  if (!p.visible) return;

  const isCompact = viewportWidth < 560;
  const distScale = Math.max(0.86, Math.min(1.22, p.scale / 13.5));
  const mainSize = Math.round((isCompact ? 18 : 22) * distScale);
  const subSize = Math.round((isCompact ? 10 : 11.5) * distScale);
  const subOffset = Math.round(mainSize * 0.74);

  // Guarantee alerts sit strictly above the top edge of the backboard across all racks & replay heights
  const oz = hoopPos.z - HOOP_POS.z;
  const backboardTopProj = projectPoint(basis, {
    x: hoopPos.x,
    y: hoopPos.y + (BACKBOARD_Y - HOOP_POS.y),
    z: BACKBOARD_TOP_Z + oz,
  });
  const clearanceAboveBoard = c.subText ? subOffset + 12 : 12;
  const maxAllowedCy = backboardTopProj.visible
    ? backboardTopProj.y - clearanceAboveBoard
    : viewportHeight - 34;

  const cx = Math.max(78, Math.min(viewportWidth - 78, p.x));
  const cy = Math.max(20, Math.min(maxAllowedCy, p.y));

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 10 * distScale;

  ctx.font = `800 ${mainSize}px "Barlow Condensed", sans-serif`;
  ctx.strokeStyle = '#030508';
  ctx.lineWidth = isCompact ? 6 : 7.5;
  ctx.strokeText(c.text, cx, cy);
  ctx.fillStyle = c.color;
  ctx.fillText(c.text, cx, cy);

  if (c.subText) {
    const subY = cy + subOffset;
    ctx.shadowBlur = 6;
    ctx.font = `700 ${subSize}px "JetBrains Mono", monospace`;
    ctx.strokeStyle = '#030508';
    ctx.lineWidth = isCompact ? 4 : 4.5;
    ctx.strokeText(c.subText, cx, subY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(c.subText, cx, subY);
  }
  ctx.restore();
}

function drawCallouts(
  ctx: CanvasRenderingContext2D,
  basis: ReturnType<typeof buildCameraBasis>,
  viewportWidth: number,
  viewportHeight: number,
  callouts: FloatingCallout[]
): void {
  if (callouts.length === 0) return;
  const isCompact = viewportWidth < 560;
  const minTopY = Math.min(108, Math.round(viewportHeight * 0.22));
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
    const cy = Math.max(minTopY, p.y);

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 8;
    ctx.font = `800 ${isCompact ? 20 : 24}px "Barlow Condensed", sans-serif`;
    ctx.strokeStyle = '#030508';
    ctx.lineWidth = isCompact ? 6 : 7.5;
    ctx.strokeText(c.text, cx, cy);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, cx, cy);

    if (c.subText) {
      const subY = cy + (isCompact ? 16 : 19);
      ctx.font = `700 ${isCompact ? 11 : 13}px "JetBrains Mono", monospace`;
      ctx.strokeStyle = '#030508';
      ctx.lineWidth = isCompact ? 4.5 : 5;
      ctx.strokeText(c.subText, cx, subY);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(c.subText, cx, subY);
    }
  }
  ctx.restore();
}
