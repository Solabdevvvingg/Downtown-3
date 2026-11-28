import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Clock, Swords, X } from 'lucide-react';
import { AuthPage } from './components/AuthPage';
import { CourtLockerModal } from './components/CourtLockerModal';
import { CrowdReactionOverlay } from './components/CrowdReactionOverlay';
import { EditUsernameModal } from './components/EditUsernameModal';
import { FindingOpponentOverlay } from './components/FindingOpponentOverlay';
import { FriendsModal } from './components/FriendsModal';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { HighlightReplayModal } from './components/HighlightReplayModal';
import { LeaguesModal } from './components/LeaguesModal';
import { LoadingChecklist, LoadingScreen } from './components/LoadingScreen';
import { PauseModal } from './components/PauseModal';
import { PvpIntroOverlay } from './components/PvpIntroOverlay';
import { findRivalryForUsername, RivalBadgeIcon } from './components/RivalBadgeIcon';
import { SettingsPage } from './components/SettingsPage';
import { TitleOverlay } from './components/TitleOverlay';
import {
  acceptFriendRequest,
  auth,
  declineOrRemoveFriendship,
  fetchUserProfile,
  fetchUserRivalries,
  mergeCareerStats,
  mergeRivalries,
  recordLeagueMatchResult,
  sendFriendRequest,
  sendFriendRequestByUsername,
  subscribeToFriendships,
  syncCareerStatsToFirestore,
  syncPvpGlobalRankingToFirestore,
  syncRivalryToFirestore,
} from './firebase';
import { soundEngine } from './game/audio';
import {
  BACKBOARD_TOP_Z,
  BACKBOARD_Y,
  computeRackCameraRig,
  CONTEST_DURATION_SECONDS,
  DEFAULT_MONEY_RACK_INDEX,
  DIFFICULTY_TIERS,
  getDifficultyForStreak,
  getEffectiveDifficulty,
  getRackBallCount,
  getSlotIndex,
  HOOP_POS,
  isMoneyBallSlot,
  METER_PERFECT_CENTER,
  normalizeMoneyRackIndex,
  RACK_CONFIGS,
  RACKS_COUNT,
  STAMINA_EXHAUSTED_THRESHOLD,
} from './game/constants';
import { getBallSkinConfig, isBallSkinUnlocked } from './game/ballSkins';
import { isCourtUnlocked } from './game/courts';
import {
  setHapticIntensity,
  triggerBuzzerHaptic,
  triggerFootstepHaptic,
  triggerHapticPreview,
  triggerMatchStartHaptic,
  triggerMissHaptic,
  triggerPerfectZoneCueHaptic,
  triggerRackArrivalHaptic,
  triggerRimHangHaptic,
  triggerRimHitHaptic,
  triggerSecondWindHaptic,
  triggerShotGatherHaptic,
  triggerShotReleaseHaptic,
  triggerSwishHaptic,
} from './game/haptics';
import { computeShotLaunch, stepBallPhysics } from './game/physics';
import { CameraRig } from './game/projection';
import { OpponentShotEvent, pvpClient } from './game/pvpClient';
import { renderArena, RenderState } from './game/renderer';
import {
  createEmptyCareerStats,
  loadAudioMuted,
  loadAudioVolume,
  loadCameraMode,
  loadCareerStats,
  loadGuestName,
  loadHapticIntensity,
  loadInstantReplayEnabled,
  loadLastHighlight,
  loadLastVisitAt,
  loadRivalries,
  loadSelectedBallSkin,
  loadSelectedCourt,
  loadShotSensitivity,
  loadShotTrajectoryEnabled,
  LONG_AWAY_THRESHOLD_MS,
  normalizeOpponentKey,
  saveAudioMuted,
  saveAudioVolume,
  saveCameraMode,
  saveCareerStats,
  saveGuestName,
  saveHapticIntensity,
  saveInstantReplayEnabled,
  saveLastHighlight,
  saveLastVisitAt,
  saveRivalries,
  saveSelectedBallSkin,
  saveSelectedCourt,
  saveShotSensitivity,
  saveShotTrajectoryEnabled,
} from './game/storage';
import {
  ActiveBall,
  BallSkinId,
  BallSlotRecord,
  CameraMode,
  CareerStats,
  ContestHighlight,
  CourtThemeId,
  CrowdReactionOverlayData,
  FastBreakSplit,
  Flashbulb,
  FloatingCallout,
  FriendPresence,
  FriendshipRecord,
  GameMode,
  GamePhase,
  HapticIntensity,
  HudSnapshot,
  MatchInvitePayload,
  Particle,
  PvpLeague,
  PvpLobbyStats,
  PvpMatchSnapshot,
  RivalryRecord,
  ShooterAnimState,
  ShotChartEntry,
  ShotTrajectoryArc,
  TimingBreakdown,
  TimingQuality,
  UserProfile,
  Vec3,
  WindState,
} from './game/types';

function createInitialBallsRecord(moneyRack: number): BallSlotRecord[] {
  const list: BallSlotRecord[] = [];
  for (let r = 0; r < RACKS_COUNT; r++) {
    const count = getRackBallCount(r);
    for (let b = 0; b < count; b++) {
      const isMoney = isMoneyBallSlot(r, b, moneyRack);
      list.push({
        rackIndex: r,
        ballIndex: b,
        isMoney,
        status: 'PENDING',
        pointsAwarded: 0,
        multiplierUsed: 1,
      });
    }
  }
  return list;
}

interface EngineState {
  mode: GameMode;
  phase: GamePhase;
  score: number;
  bestScore: number;
  career: CareerStats;
  contestStartCareer: CareerStats;
  contestCountedInCareer: boolean;
  isNewBest: boolean;
  timeLeft: number;
  lastTickSecond: number;
  countdownTimer: number;
  currentRack: number;
  currentBall: number;
  moneyRack: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  madeCount: number;
  attemptsCount: number;
  resolvedLocalCount: number;
  swishCount: number;
  moneyMadeCount: number;
  moneyTotalCount: number;
  ballsRecord: BallSlotRecord[];
  timingBreakdown: TimingBreakdown;
  activeBalls: ActiveBall[];
  particles: Particle[];
  callouts: FloatingCallout[];
  flashbulbs: Flashbulb[];
  nextBallId: number;
  nextCalloutId: number;
  nextCrowdReactionId: number;
  streakRecordBaseline: number;
  recordBrokenThisRun: boolean;
  crowdReaction: CrowdReactionOverlayData | null;
  crowdHypeTimer: number;
  crowdHypeDuration: number;

  // Shooter & animation state
  shooterPos: Vec3;
  shooterZ: number;
  shooterVelZ: number;
  shooterFacing: { x: number; y: number };
  runPhase: number;
  runBlend: number;
  runStepTimer: number;
  isMovingToRack: boolean;
  shooterAnimState: ShooterAnimState;
  dribbleBlend: number;
  stamina: number;
  staminaSavedTiming: number;
  staminaRecoveredMovement: number;
  staminaMinObserved: number;
  consecutivePerfectShots: number;
  secondWindCount: number;
  secondWindFlashTimer: number;
  shotChart: ShotChartEntry[];
  gatherBuffered: boolean;
  gatherAmount: number;
  followThroughAmount: number;
  landingSquat: number;
  ballPickupTimer: number;
  sprintDelayTimer: number;
  gatherCooldown: number;
  rackMoveTimer: number;
  isHoldingShot: boolean;
  meterValue: number;
  meterFeedbackTimer: number;
  lastReleaseMeter: number;
  lastReleaseLabel: string | null;
  lastReleaseColor: string;
  lastTimingQuality: TimingQuality | null;
  hasShotAnyBall: boolean;
  shooterLabelAlpha: number;

  // Heat Check dynamic hoop state
  hoopPos: Vec3;
  hoopTargetPos: Vec3;
  heatCheckShiftTimer: number;

  // Finish / buzzer grace
  contestShootingClosed: boolean;
  finishGraceTimer: number;
  gameOverTimestamp: number;

  // PVP State
  myPlayerId: string | null;
  pvpMatch: PvpMatchSnapshot | null;
  pvpIntroElapsed: number;

  // Camera & VFX
  camera: CameraRig;
  cameraSnapZoom: number;
  netWhip: number;
  netWhipPhase: number;
  rimShake: number;
  screenShake: number;
  clockTime: number;
  flashSpawnTimer: number;

  // Arena Wind Simulation
  windAngle: number;
  windTargetAngle: number;
  windMph: number;
  windVec: { x: number; y: number };
  windShiftTimer: number;
  courtTheme: CourtThemeId;
  ballSkin: BallSkinId;
  shooterDisplayName: string;
  bestContestHighlight: ContestHighlight | null;
  lastHighlight: ContestHighlight | null;
  rivalries: Record<string, RivalryRecord>;
  fastBreakElapsedMs: number;
  fastBreakFinishMs: number | null;
  fastBreakRackCumulativesMs: (number | null)[];
  fastBreakIsNewBest: boolean;
  leagueResultRecorded: boolean;
  instantReplayEnabled: boolean;
  cameraMode: CameraMode;
  shotTrajectoryEnabled: boolean;
  shotSensitivity: number;
  hapticIntensity: HapticIntensity;
  lastShotTrajectory: ShotTrajectoryArc | null;
  perfectZoneHapticFired: boolean;
  sessionBestScore: number;
  sessionBestStreak: number;
}

function pickNextHeatCheckHoopTarget(current: Vec3): Vec3 {
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = (Math.random() - 0.5) * 8.4; // -4.2 to +4.2 ft laterally
    const y = -0.9 + Math.random() * 3.4; // -0.9 to +2.5 ft forward/back
    const z = 9.45 + Math.random() * 1.45; // 9.45 to 10.90 ft height
    if (Math.hypot(x - current.x, y - current.y) >= 2.2 || attempt === 7) {
      return { x, y, z };
    }
  }
  return { x: 0, y: 0, z: HOOP_POS.z };
}

interface PvpIntroKeyframe {
  t: number;
  pos: Vec3;
  target: Vec3;
  focal: number;
}

const PVP_INTRO_KEYFRAMES: PvpIntroKeyframe[] = [
  { t: 0.0, pos: { x: 25.0, y: 42.0, z: 18.0 }, target: { x: 0, y: 12.0, z: 5.2 }, focal: 0.86 },
  { t: 0.26, pos: { x: 7.0, y: 44.5, z: 14.0 }, target: { x: 0, y: 10.0, z: 5.4 }, focal: 0.9 },
  { t: 0.48, pos: { x: 21.5, y: 19.5, z: 6.2 }, target: { x: -1.5, y: 7.5, z: 6.2 }, focal: 0.96 },
  { t: 0.68, pos: { x: 0.0, y: 29.8, z: 5.6 }, target: { x: 0, y: 2.5, z: 7.2 }, focal: 1.0 },
  { t: 0.85, pos: { x: -22.5, y: 18.8, z: 6.6 }, target: { x: -3.5, y: 0.5, z: 7.8 }, focal: 1.0 },
  {
    t: 1.0,
    pos: { ...RACK_CONFIGS[0].camPos },
    target: { ...RACK_CONFIGS[0].camTarget },
    focal: 1.0,
  },
];

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

function computePvpIntroCamera(elapsedSec: number): CameraRig {
  const norm = Math.max(0, Math.min(1, elapsedSec / 15.0));
  const lastIdx = PVP_INTRO_KEYFRAMES.length - 1;
  let idx = 0;
  while (idx < lastIdx - 1 && norm > PVP_INTRO_KEYFRAMES[idx + 1].t) {
    idx += 1;
  }
  const k1 = PVP_INTRO_KEYFRAMES[idx];
  const k2 = PVP_INTRO_KEYFRAMES[idx + 1];
  const k0 = PVP_INTRO_KEYFRAMES[Math.max(0, idx - 1)];
  const k3 = PVP_INTRO_KEYFRAMES[Math.min(lastIdx, idx + 2)];
  const span = Math.max(0.0001, k2.t - k1.t);
  const rawU = Math.max(0, Math.min(1, (norm - k1.t) / span));
  // Smooth final lock-in so camera eases gently into Rack 1 POV
  const u = idx === lastIdx - 1 ? rawU * rawU * (3 - 2 * rawU) : rawU;

  return {
    pos: {
      x: catmullRomScalar(k0.pos.x, k1.pos.x, k2.pos.x, k3.pos.x, u),
      y: catmullRomScalar(k0.pos.y, k1.pos.y, k2.pos.y, k3.pos.y, u),
      z: catmullRomScalar(k0.pos.z, k1.pos.z, k2.pos.z, k3.pos.z, u),
    },
    target: {
      x: catmullRomScalar(k0.target.x, k1.target.x, k2.target.x, k3.target.x, u),
      y: catmullRomScalar(k0.target.y, k1.target.y, k2.target.y, k3.target.y, u),
      z: catmullRomScalar(k0.target.z, k1.target.z, k2.target.z, k3.target.z, u),
    },
    focalLength: catmullRomScalar(k0.focal, k1.focal, k2.focal, k3.focal, u),
  };
}

function buildServerProfileStats(career: CareerStats) {
  const accuracyPct =
    career.totalShotsAttempted > 0
      ? Math.round((career.totalShotsMade / career.totalShotsAttempted) * 100)
      : 0;
  return {
    bestScore: career.bestScore,
    bestStreak: career.allTimeBestStreak,
    accuracyPct,
  };
}

function computeWindState(e: EngineState): WindState {
  const dx = e.hoopPos.x - e.shooterPos.x;
  const dy = e.hoopPos.y - e.shooterPos.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = dx / len;
  const fy = dy / len;
  const rx = fy;
  const ry = -fx;

  const dotRight = e.windVec.x * rx + e.windVec.y * ry;
  const dotForward = e.windVec.x * fx + e.windVec.y * fy;
  const relativeAngleRad = Math.atan2(-dotForward, dotRight);
  const intensity = Math.min(1, Math.max(0, e.windMph / 8.5));

  let dirLabel = 'CALM';
  if (e.windMph >= 0.6) {
    const deg = (relativeAngleRad * 180) / Math.PI;
    if (deg >= -22.5 && deg < 22.5) dirLabel = 'RIGHT';
    else if (deg >= 22.5 && deg < 67.5) dirLabel = 'IN-R';
    else if (deg >= 67.5 && deg < 112.5) dirLabel = 'HEAD';
    else if (deg >= 112.5 && deg < 157.5) dirLabel = 'IN-L';
    else if (deg >= 157.5 || deg < -157.5) dirLabel = 'LEFT';
    else if (deg >= -157.5 && deg < -112.5) dirLabel = 'OUT-L';
    else if (deg >= -112.5 && deg < -67.5) dirLabel = 'TAIL';
    else dirLabel = 'OUT-R';
  }

  return {
    x: e.windVec.x,
    y: e.windVec.y,
    mph: e.windMph,
    relativeAngleRad,
    intensity,
    dirLabel,
  };
}

function buildHighlightFromBall(e: EngineState, ball: ActiveBall): ContestHighlight | null {
  if (
    ball.isRemote ||
    !ball.hasScored ||
    !ball.highlightMeta ||
    !ball.highlightFrames ||
    ball.highlightFrames.length < 2 ||
    !ball.shooterPosAtRelease ||
    !ball.shooterFacingAtRelease ||
    !ball.hoopPosAtRelease
  ) {
    return null;
  }

  const meta = ball.highlightMeta;
  const rackCfg = RACK_CONFIGS[ball.rackIndex];
  const scoreAtTime = ball.highlightScoreAtTime ?? ball.age;
  const duration = Math.max(
    scoreAtTime + 0.35,
    ball.highlightFrames[ball.highlightFrames.length - 1].t
  );

  return {
    id: ball.id,
    mode: e.mode,
    courtTheme: e.courtTheme,
    ballSkin: ball.ballSkin ?? e.ballSkin,
    rackIndex: ball.rackIndex,
    rackLabel: rackCfg?.label ?? `Rack ${ball.rackIndex + 1}`,
    ballIndex: ball.ballIndex,
    isMoney: ball.isMoney,
    isSwish: meta.isCleanSwish,
    isBuzzerBeater: ball.isBuzzerBeater,
    hadRimHang: Boolean(ball.hadRimHang),
    timingQuality: ball.timingQualityAtRelease ?? 'GOOD',
    pointsAwarded: meta.pointsAwarded,
    multiplier: meta.multiplier,
    streakAtMake: meta.streakAtMake,
    windMph: ball.windMphAtRelease ?? 0,
    shooterName: e.shooterDisplayName,
    shooterPos: { ...ball.shooterPosAtRelease },
    shooterFacing: { ...ball.shooterFacingAtRelease },
    hoopPos: { ...ball.hoopPosAtRelease },
    frames: ball.highlightFrames.map((f) => ({ ...f })),
    rimHitsAt: [...(ball.rimHitTimes ?? [])],
    scoreAtTime,
    duration,
    priorityScore: meta.priorityScore,
    recordedAt: Date.now(),
  };
}

function tryCommitBallHighlight(e: EngineState, ball: ActiveBall): void {
  if (ball.highlightSaved || e.mode === 'PRACTICE') return;
  const hl = buildHighlightFromBall(e, ball);
  if (!hl) return;
  ball.highlightSaved = true;
  if (!e.bestContestHighlight || hl.priorityScore >= e.bestContestHighlight.priorityScore) {
    e.bestContestHighlight = hl;
  }
}

function finalizeContestHighlights(e: EngineState): void {
  for (const ball of e.activeBalls) {
    tryCommitBallHighlight(e, ball);
  }
  if (e.bestContestHighlight) {
    e.lastHighlight = e.bestContestHighlight;
    saveLastHighlight(e.bestContestHighlight);
  }
}

function buildHudSnapshot(e: EngineState): HudSnapshot {
  const difficulty =
    e.mode === 'PRACTICE'
      ? DIFFICULTY_TIERS[0]
      : getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
  const timingRatio =
    e.attemptsCount > 0
      ? Math.min(1, e.staminaSavedTiming / (e.attemptsCount * 2.3))
      : 0;
  const movementRatio = Math.min(
    1,
    (e.stamina * 0.6 +
      Math.min(60, e.staminaRecoveredMovement) * 0.55 +
      (e.staminaMinObserved >= 20 ? 12 : 0)) /
      92
  );
  const rawEff =
    e.attemptsCount > 0
      ? (timingRatio * 0.52 + movementRatio * 0.48) * 100
      : movementRatio * 100;
  const efficiencyPct = Math.max(0, Math.min(100, Math.round(rawEff)));
  const rating: HudSnapshot['staminaEfficiency']['rating'] =
    efficiencyPct >= 82
      ? 'Elite'
      : efficiencyPct >= 62
        ? 'Sharp'
        : efficiencyPct >= 40
          ? 'Steady'
          : 'Winded';

  return {
    mode: e.mode,
    phase: e.phase,
    score: e.score,
    bestScore: e.bestScore,
    career: { ...e.career },
    careerBaseline: {
      contestsPlayed: e.contestStartCareer.contestsPlayed,
      totalCareerScore: e.contestStartCareer.totalCareerScore,
      totalSwishes: e.contestStartCareer.totalSwishes,
      totalSwishTrackedAttempts: e.contestStartCareer.totalSwishTrackedAttempts,
      totalBestStreakSum: e.contestStartCareer.totalBestStreakSum,
      streakTrackedContests: e.contestStartCareer.streakTrackedContests,
      allTimeBestStreak: e.contestStartCareer.allTimeBestStreak,
      bestScore: e.contestStartCareer.bestScore,
      bestFastBreakMs: e.contestStartCareer.bestFastBreakMs,
    },
    timeLeft: Math.max(0, e.timeLeft),
    countdownValue:
      e.mode === 'PVP' && e.pvpMatch ? e.pvpMatch.countdownLeft : Math.ceil(e.countdownTimer),
    currentRack: e.currentRack,
    currentBall: e.currentBall,
    moneyRack: e.moneyRack,
    streak: e.streak,
    bestStreak: e.bestStreak,
    multiplier: e.multiplier,
    difficulty,
    madeCount: e.madeCount,
    attemptsCount: e.attemptsCount,
    swishCount: e.swishCount,
    moneyMadeCount: e.moneyMadeCount,
    moneyTotalCount: e.moneyTotalCount,
    balls: e.ballsRecord.map((b) => ({ ...b })),
    timingBreakdown: { ...e.timingBreakdown },
    isNewBest: e.isNewBest,
    muted: soundEngine.isMuted(),
    lastFeedback: e.lastReleaseLabel,
    lastReleaseMeter: e.lastReleaseMeter,
    lastTimingQuality: e.lastTimingQuality,
    activeBallsInAir: e.activeBalls.filter((b) => !b.isRemote && !b.hasResolved).length,
    pvpMatch: e.pvpMatch,
    myPlayerId: e.myPlayerId,
    crowdReaction: e.crowdReaction ? { ...e.crowdReaction } : null,
    wind: computeWindState(e),
    hoopPos: { ...e.hoopPos },
    heatCheckShiftIn: e.mode === 'HEAT_CHECK' ? Math.max(0, e.heatCheckShiftTimer) : 0,
    isMovingToRack: e.isMovingToRack,
    shooterAnimState: e.shooterAnimState,
    stamina: Math.round(e.stamina),
    consecutivePerfectShots: e.consecutivePerfectShots,
    secondWindCount: e.secondWindCount,
    secondWindActive: e.secondWindFlashTimer > 0,
    shotChart: e.shotChart.map((s) => ({ ...s })),
    staminaEfficiency: {
      efficiencyPct,
      totalSaved: Math.round(e.staminaSavedTiming + e.staminaRecoveredMovement),
      timingSaved: Math.round(e.staminaSavedTiming),
      movementRecovered: Math.round(e.staminaRecoveredMovement),
      endStamina: Math.round(e.stamina),
      minStamina: Math.round(e.staminaMinObserved),
      rating,
    },
    courtTheme: e.courtTheme,
    ballSkin: e.ballSkin,
    contestHighlight: e.bestContestHighlight,
    lastHighlight: e.lastHighlight,
    rivalries: Object.values(e.rivalries).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt),
    fastBreakElapsedMs: e.fastBreakElapsedMs,
    fastBreakFinishMs: e.fastBreakFinishMs,
    fastBreakSplits: RACK_CONFIGS.map((rack, i): FastBreakSplit => {
      const cum = e.fastBreakRackCumulativesMs[i] ?? null;
      const prevCum = i > 0 ? (e.fastBreakRackCumulativesMs[i - 1] ?? null) : 0;
      const lapMs =
        cum !== null && (i === 0 || prevCum !== null)
          ? Math.max(0, cum - (i === 0 ? 0 : (prevCum ?? 0)))
          : null;
      const baselineCum = e.contestStartCareer.bestFastBreakSplitsMs[i] ?? 0;
      const deltaMs = cum !== null && baselineCum > 0 ? cum - baselineCum : null;
      return {
        rackIndex: rack.id,
        shortLabel: rack.shortLabel,
        lapMs,
        cumulativeMs: cum,
        deltaMs,
      };
    }),
    fastBreakIsNewBest: e.fastBreakIsNewBest,
    instantReplayEnabled: e.instantReplayEnabled,
    instantReplayActive: false,
    instantReplayHeadline: null,
    instantReplayPoints: 0,
    cameraMode: e.cameraMode,
    shotTrajectoryEnabled: e.shotTrajectoryEnabled,
    audioVolume: soundEngine.getVolume(),
    shotSensitivity: e.shotSensitivity,
    hapticIntensity: e.hapticIntensity,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeShotPointerIdRef = useRef<number | null>(null);
  const initialCareer = useRef<CareerStats>(loadCareerStats());
  const initialRivalries = useRef<Record<string, RivalryRecord>>(loadRivalries());
  const initialHighlight = useRef<ContestHighlight | null>(loadLastHighlight());
  const initialCourt = useRef<CourtThemeId>(
    (() => {
      const saved = loadSelectedCourt();
      return isCourtUnlocked(saved, initialCareer.current) ? saved : 'wooden_gym';
    })()
  );
  const initialBallSkin = useRef<BallSkinId>(
    (() => {
      const saved = loadSelectedBallSkin();
      return isBallSkinUnlocked(saved, initialCareer.current) ? saved : 'classic_leather';
    })()
  );

  const initialGuestName = useRef<string>(loadGuestName());
  const initialInstantReplay = useRef<boolean>(loadInstantReplayEnabled());
  const initialCameraMode = useRef<CameraMode>(loadCameraMode());
  const initialShotTrajectory = useRef<boolean>(loadShotTrajectoryEnabled());
  const initialAudioVolume = useRef<number>(loadAudioVolume());
  const initialAudioMuted = useRef<boolean>(loadAudioMuted());
  const initialShotSensitivity = useRef<number>(loadShotSensitivity());
  const initialHapticIntensity = useRef<HapticIntensity>(loadHapticIntensity());
  const initialVisitReasonRef = useRef<'FIRST_VISIT' | 'LONG_AWAY' | null>(
    (() => {
      const last = loadLastVisitAt();
      if (last === null) return 'FIRST_VISIT';
      if (Date.now() - last >= LONG_AWAY_THRESHOLD_MS) return 'LONG_AWAY';
      return null;
    })()
  );
  const [loadingState, setLoadingState] = useState<{
    visible: boolean;
    reason: 'FIRST_VISIT' | 'LONG_AWAY';
  }>(() => ({
    visible: initialVisitReasonRef.current !== null,
    reason: initialVisitReasonRef.current ?? 'FIRST_VISIT',
  }));
  const [loadingRunId, setLoadingRunId] = useState<number>(() =>
    initialVisitReasonRef.current !== null ? 1 : 0
  );
  const [loadingChecklist, setLoadingChecklist] = useState<LoadingChecklist>({
    fontsReady: false,
    arenaReady: false,
    accountReady: false,
    lobbyReady: false,
  });
  const loadingVisibleRef = useRef(loadingState.visible);
  const arenaRenderedFramesRef = useRef(0);
  const arenaReadyMarkedRef = useRef(false);
  const hiddenSinceRef = useRef<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(false);
  const [playerName, setPlayerName] = useState(initialGuestName.current);
  const playerNameRef = useRef(initialGuestName.current);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const userProfileRef = useRef<UserProfile | null>(null);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const showAuthOverlayRef = useRef(false);
  const [showEditUsername, setShowEditUsername] = useState(false);
  const showEditUsernameRef = useRef(false);
  const [showCourtLocker, setShowCourtLocker] = useState(false);
  const showCourtLockerRef = useRef(false);
  const [showLeaguesModal, setShowLeaguesModal] = useState(false);
  const showLeaguesModalRef = useRef(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const showFriendsModalRef = useRef(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const showSettingsPageRef = useRef(false);
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendPresence>>({});
  const [incomingInvite, setIncomingInvite] = useState<MatchInvitePayload | null>(null);
  const [outgoingInvite, setOutgoingInvite] = useState<MatchInvitePayload | null>(null);
  const [inviteNotice, setInviteNotice] = useState<{
    id: number;
    text: string;
    tone: 'ok' | 'err';
  } | null>(null);
  const [inviteCountdownMs, setInviteCountdownMs] = useState<number>(0);
  const [activeLeague, setActiveLeague] = useState<PvpLeague | null>(null);
  const [queuedLeagueInfo, setQueuedLeagueInfo] = useState<{
    leagueId: string | null;
    leagueName: string | null;
  }>({ leagueId: null, leagueName: null });
  const [activeHighlight, setActiveHighlight] = useState<ContestHighlight | null>(null);
  const activeHighlightRef = useRef<ContestHighlight | null>(null);
  const [globalRankingsRefreshNonce, setGlobalRankingsRefreshNonce] = useState(0);
  const initialAuthCheckDoneRef = useRef(false);
  const [lobbyStats, setLobbyStats] = useState<PvpLobbyStats>({
    onlinePlayers: 1,
    queuedPlayers: 0,
    activeMatches: 0,
  });
  const [inQueue, setInQueue] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);

  useEffect(() => {
    loadingVisibleRef.current = loadingState.visible;
  }, [loadingState.visible]);

  useEffect(() => {
    wsConnectedRef.current = wsConnected;
  }, [wsConnected]);

  useEffect(() => {
    playerNameRef.current = playerName;
    engineRef.current.shooterDisplayName = userProfileRef.current
      ? `@${userProfileRef.current.username}`
      : playerName;
  }, [playerName]);

  useEffect(() => {
    userProfileRef.current = userProfile;
    engineRef.current.shooterDisplayName = userProfile
      ? `@${userProfile.username}`
      : playerNameRef.current;
  }, [userProfile]);

  useEffect(() => {
    showAuthOverlayRef.current = showAuthOverlay;
  }, [showAuthOverlay]);

  useEffect(() => {
    showEditUsernameRef.current = showEditUsername;
  }, [showEditUsername]);

  useEffect(() => {
    showCourtLockerRef.current = showCourtLocker;
  }, [showCourtLocker]);

  useEffect(() => {
    showLeaguesModalRef.current = showLeaguesModal;
  }, [showLeaguesModal]);

  useEffect(() => {
    showFriendsModalRef.current = showFriendsModal;
  }, [showFriendsModal]);

  useEffect(() => {
    showSettingsPageRef.current = showSettingsPage;
  }, [showSettingsPage]);

  useEffect(() => {
    activeHighlightRef.current = activeHighlight;
  }, [activeHighlight]);

  useEffect(() => {
    soundEngine.setCourtTheme(initialCourt.current);
    soundEngine.setVolume(initialAudioVolume.current);
    if (initialAudioMuted.current) {
      soundEngine.setMuted(true);
    }
    setHapticIntensity(initialHapticIntensity.current);
    setHud(buildHudSnapshot(engineRef.current));
  }, []);

  useEffect(() => {
    const recordVisitExit = () => {
      saveLastVisitAt(Date.now());
    };
    window.addEventListener('pagehide', recordVisitExit);
    window.addEventListener('beforeunload', recordVisitExit);
    return () => {
      window.removeEventListener('pagehide', recordVisitExit);
      window.removeEventListener('beforeunload', recordVisitExit);
    };
  }, []);

  const engineRef = useRef<EngineState>({
    mode: 'SOLO',
    phase: 'TITLE',
    score: 0,
    bestScore: initialCareer.current.bestScore,
    career: { ...initialCareer.current },
    contestStartCareer: { ...initialCareer.current },
    contestCountedInCareer: false,
    isNewBest: false,
    timeLeft: CONTEST_DURATION_SECONDS,
    lastTickSecond: 6,
    countdownTimer: 0,
    currentRack: 0,
    currentBall: 0,
    moneyRack: DEFAULT_MONEY_RACK_INDEX,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    madeCount: 0,
    attemptsCount: 0,
    resolvedLocalCount: 0,
    swishCount: 0,
    moneyMadeCount: 0,
    moneyTotalCount: 10,
    ballsRecord: createInitialBallsRecord(DEFAULT_MONEY_RACK_INDEX),
    timingBreakdown: { perfect: 0, good: 0, early: 0, late: 0 },
    activeBalls: [],
    particles: [],
    callouts: [],
    flashbulbs: [],
    nextBallId: 1,
    nextCalloutId: 1,
    nextCrowdReactionId: 1,
    streakRecordBaseline: Math.max(2, initialCareer.current.allTimeBestStreak),
    recordBrokenThisRun: false,
    crowdReaction: null,
    crowdHypeTimer: 0,
    crowdHypeDuration: 2.6,

    shooterPos: { x: RACK_CONFIGS[2].x, y: RACK_CONFIGS[2].y, z: 0 },
    shooterZ: 0,
    shooterVelZ: 0,
    shooterFacing: { x: 0, y: -1 },
    runPhase: 0,
    runBlend: 0,
    runStepTimer: 0,
    isMovingToRack: false,
    shooterAnimState: 'DRIBBLING',
    dribbleBlend: 1,
    stamina: 100,
    staminaSavedTiming: 0,
    staminaRecoveredMovement: 0,
    staminaMinObserved: 100,
    consecutivePerfectShots: 0,
    secondWindCount: 0,
    secondWindFlashTimer: 0,
    shotChart: [],
    gatherBuffered: false,
    gatherAmount: 0,
    followThroughAmount: 0,
    landingSquat: 0,
    ballPickupTimer: 0,
    sprintDelayTimer: 0,
    gatherCooldown: 0,
    rackMoveTimer: 0,
    isHoldingShot: false,
    meterValue: 0,
    meterFeedbackTimer: 0,
    lastReleaseMeter: 0,
    lastReleaseLabel: null,
    lastReleaseColor: '#FFFFFF',
    lastTimingQuality: null,
    hasShotAnyBall: false,
    shooterLabelAlpha: 1,

    hoopPos: { ...HOOP_POS },
    hoopTargetPos: { ...HOOP_POS },
    heatCheckShiftTimer: 5.5,

    contestShootingClosed: false,
    finishGraceTimer: 0,
    gameOverTimestamp: 0,

    myPlayerId: null,
    pvpMatch: null,
    pvpIntroElapsed: 0,

    camera: {
      pos: { ...RACK_CONFIGS[2].camPos },
      target: { ...RACK_CONFIGS[2].camTarget },
      focalLength: 1.0,
    },
    cameraSnapZoom: 0,
    netWhip: 0,
    netWhipPhase: 0,
    rimShake: 0,
    screenShake: 0,
    clockTime: 0,
    flashSpawnTimer: 0.4,

    windAngle: 0.2,
    windTargetAngle: 0.2,
    windMph: 0.45,
    windVec: { x: 0.018, y: 0.004 },
    windShiftTimer: 6.0,
    courtTheme: initialCourt.current,
    ballSkin: initialBallSkin.current,
    shooterDisplayName: initialGuestName.current,
    bestContestHighlight: null,
    lastHighlight: initialHighlight.current,
    rivalries: { ...initialRivalries.current },
    fastBreakElapsedMs: 0,
    fastBreakFinishMs: null,
    fastBreakRackCumulativesMs: new Array(RACKS_COUNT).fill(null),
    fastBreakIsNewBest: false,
    leagueResultRecorded: false,
    instantReplayEnabled: initialInstantReplay.current,
    cameraMode: initialCameraMode.current,
    shotTrajectoryEnabled: initialShotTrajectory.current,
    shotSensitivity: initialShotSensitivity.current,
    hapticIntensity: initialHapticIntensity.current,
    lastShotTrajectory: null,
    perfectZoneHapticFired: false,
    sessionBestScore: 0,
    sessionBestStreak: 0,
  });

  const [hud, setHud] = useState<HudSnapshot>(() => buildHudSnapshot(engineRef.current));

  useEffect(() => {
    if (hud.phase !== 'TITLE' && showSettingsPageRef.current) {
      setShowSettingsPage(false);
    }
  }, [hud.phase]);

  const syncHud = useCallback(() => {
    const e = engineRef.current;
    const crowdMode =
      e.phase === 'PAUSED'
        ? 'PAUSED'
        : e.phase === 'GAME_OVER'
          ? 'GAME_OVER'
          : e.phase === 'COUNTDOWN' || e.phase === 'PLAYING'
            ? 'ACTIVE'
            : 'TITLE';
    const timeUrgency =
      e.phase === 'PLAYING' &&
      e.mode !== 'HEAT_CHECK' &&
      e.mode !== 'PRACTICE' &&
      e.mode !== 'FAST_BREAK' &&
      e.timeLeft <= 12
        ? ((12 - e.timeLeft) / 12) * 0.45
        : 0;
    const streakBoost = Math.min(0.7, e.streak * 0.1);
    soundEngine.setCrowdState(crowdMode, Math.min(1, timeUrgency + streakBoost), e.currentRack);
    setHud(buildHudSnapshot(e));
  }, []);

  const persistCareer = useCallback((career: CareerStats) => {
    saveCareerStats(career);
    const activeUid = userProfileRef.current?.uid;
    if (activeUid) {
      void syncCareerStatsToFirestore(activeUid, career).catch((err: unknown) => {
        console.error('Failed to sync career stats:', err);
      });
    }
  }, []);

  const applyAuthenticatedProfile = useCallback(
    (profile: UserProfile) => {
      const e = engineRef.current;
      const merged = mergeCareerStats(e.career, {
        bestScore: profile.bestScore,
        totalShotsMade: profile.totalShotsMade,
        totalShotsAttempted: profile.totalShotsAttempted,
        totalCareerScore: profile.totalCareerScore,
        allTimeBestStreak: profile.allTimeBestStreak,
        contestsPlayed: profile.contestsPlayed,
        totalSwishes: profile.totalSwishes,
        totalSwishTrackedAttempts: profile.totalSwishTrackedAttempts,
        totalBestStreakSum: profile.totalBestStreakSum,
        streakTrackedContests: profile.streakTrackedContests,
        pvpWins: profile.pvpWins,
        pvpLosses: profile.pvpLosses,
        pvpDraws: profile.pvpDraws,
        bestFastBreakMs: profile.bestFastBreakMs ?? 0,
        bestFastBreakSplitsMs: profile.bestFastBreakSplitsMs ?? [0, 0, 0, 0, 0],
        fastBreakContests: profile.fastBreakContests ?? 0,
      });
      e.career = merged;
      if (e.phase === 'TITLE') {
        e.contestStartCareer = { ...merged };
      }
      e.bestScore = merged.bestScore;
      e.streakRecordBaseline = Math.max(2, merged.allTimeBestStreak);
      e.recordBrokenThisRun = false;
      saveCareerStats(merged);

      const updatedProfile: UserProfile = {
        ...profile,
        ...merged,
      };
      setUserProfile(updatedProfile);
      userProfileRef.current = updatedProfile;
      setPlayerName(profile.username);
      playerNameRef.current = profile.username;
      pvpClient.setProfile(
        profile.username,
        e.moneyRack,
        {
          wins: merged.pvpWins,
          losses: merged.pvpLosses,
          draws: merged.pvpDraws,
        },
        profile.uid,
        buildServerProfileStats(merged)
      );

      const remoteSplits = profile.bestFastBreakSplitsMs ?? [0, 0, 0, 0, 0];
      const splitsChanged = merged.bestFastBreakSplitsMs.some(
        (val, idx) => val !== (remoteSplits[idx] ?? 0)
      );

      if (
        merged.bestScore !== profile.bestScore ||
        merged.totalShotsMade !== profile.totalShotsMade ||
        merged.totalShotsAttempted !== profile.totalShotsAttempted ||
        merged.totalCareerScore !== profile.totalCareerScore ||
        merged.allTimeBestStreak !== profile.allTimeBestStreak ||
        merged.contestsPlayed !== profile.contestsPlayed ||
        merged.totalSwishes !== profile.totalSwishes ||
        merged.totalSwishTrackedAttempts !== profile.totalSwishTrackedAttempts ||
        merged.totalBestStreakSum !== profile.totalBestStreakSum ||
        merged.streakTrackedContests !== profile.streakTrackedContests ||
        merged.pvpWins !== profile.pvpWins ||
        merged.pvpLosses !== profile.pvpLosses ||
        merged.pvpDraws !== profile.pvpDraws ||
        merged.bestFastBreakMs !== (profile.bestFastBreakMs ?? 0) ||
        merged.fastBreakContests !== (profile.fastBreakContests ?? 0) ||
        splitsChanged
      ) {
        void syncCareerStatsToFirestore(profile.uid, merged).catch((err: unknown) => {
          console.error('Failed to merge career stats to cloud:', err);
        });
      }

      void fetchUserRivalries(profile.uid)
        .then((remoteRivalries) => {
          const mergedRivalries = mergeRivalries(e.rivalries, remoteRivalries);
          e.rivalries = mergedRivalries;
          saveRivalries(mergedRivalries);

          for (const [key, localRec] of Object.entries(mergedRivalries)) {
            const remoteRec = remoteRivalries[key];
            const localTotal = localRec.wins + localRec.losses + localRec.draws;
            const remoteTotal = remoteRec
              ? remoteRec.wins + remoteRec.losses + remoteRec.draws
              : 0;
            if (!remoteRec || localTotal > remoteTotal || localRec.lastPlayedAt > remoteRec.lastPlayedAt) {
              void syncRivalryToFirestore(profile.uid, localRec).catch((err: unknown) => {
                console.error('Failed to merge rivalry to cloud:', err);
              });
            }
          }
          syncHud();
        })
        .catch((err: unknown) => {
          console.error('Failed to load PVP rivalries:', err);
        });

      setProfileLoadError(null);
      setShowAuthOverlay(false);
      syncHud();
    },
    [syncHud]
  );

  const syncUserProfileFromAuth = useCallback(
    async (user: User) => {
      setProfileSyncing(true);
      setProfileLoadError(null);
      try {
        const profile = await fetchUserProfile(user.uid);
        if (profile && profile.username) {
          applyAuthenticatedProfile(profile);
        } else {
          setUserProfile(null);
          userProfileRef.current = null;
          setShowAuthOverlay(true);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
        let readable = 'Could not reach Firestore to load your shooter profile. Check your connection and retry.';
        const rawMsg = err instanceof Error ? err.message : String(err);
        try {
          const parsed = JSON.parse(rawMsg) as { error?: string };
          if (parsed && typeof parsed.error === 'string') {
            if (parsed.error.includes('Quota exceeded')) {
              readable = 'Daily Firestore quota exceeded. Quota resets tomorrow.';
            } else if (parsed.error.includes('client is offline')) {
              readable = 'Firestore appears offline. Check your connection or VPN/Brave Shields and retry.';
            } else {
              readable = `Could not load profile: ${parsed.error}`;
            }
          }
        } catch {
          if (rawMsg) readable = rawMsg;
        }
        setUserProfile(null);
        userProfileRef.current = null;
        setProfileLoadError(readable);
        setShowAuthOverlay(true);
      } finally {
        setProfileSyncing(false);
      }
    },
    [applyAuthenticatedProfile]
  );

  const handleOpenAuth = useCallback(() => {
    setShowAuthOverlay(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      userProfileRef.current = null;
      setProfileLoadError(null);
      setProfileSyncing(false);
      setActiveLeague(null);
      const guest = loadGuestName();
      setPlayerName(guest);
      playerNameRef.current = guest;
      engineRef.current.shooterDisplayName = guest;
      const c = engineRef.current.career;
      pvpClient.setProfile(
        guest,
        engineRef.current.moneyRack,
        {
          wins: c.pvpWins,
          losses: c.pvpLosses,
          draws: c.pvpDraws,
        },
        null,
        buildServerProfileStats(c)
      );
      setFriendships([]);
      setFriendStatuses({});
      setIncomingInvite(null);
      setOutgoingInvite(null);
      syncHud();
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  }, [syncHud]);

  // Subscribe to persistent Firestore friendships while authenticated
  useEffect(() => {
    if (!userProfile?.uid) {
      setFriendships([]);
      setFriendStatuses({});
      return;
    }
    const unsub = subscribeToFriendships(
      userProfile.uid,
      (list) => {
        setFriendships(list);
      },
      (err) => {
        console.error('Friendships subscription error:', err);
      }
    );
    return () => unsub();
  }, [userProfile?.uid]);

  // Sync live friend presence watches over WebSocket
  useEffect(() => {
    if (!wsConnected) return;
    if (!userProfile?.uid) {
      pvpClient.watchFriends([]);
      return;
    }
    const acceptedUids = friendships
      .filter((f) => f.status === 'ACCEPTED')
      .map((f) => f.friendUid);
    pvpClient.watchFriends(acceptedUids);
  }, [wsConnected, userProfile?.uid, friendships]);

  // Live countdown ticker for incoming or outgoing match requests
  useEffect(() => {
    const active = incomingInvite ?? outgoingInvite;
    if (!active) {
      setInviteCountdownMs(0);
      return;
    }
    const update = () => {
      setInviteCountdownMs(Math.max(0, active.expiresAtMs - Date.now()));
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [incomingInvite, outgoingInvite]);

  const showTimedInviteNotice = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now();
    setInviteNotice({ id, text, tone });
    window.setTimeout(() => {
      setInviteNotice((prev) => (prev && prev.id === id ? null : prev));
    }, 4200);
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        userProfileRef.current = null;
        setProfileLoadError(null);
        setProfileSyncing(false);
        if (!initialAuthCheckDoneRef.current) {
          setShowAuthOverlay(true);
        }
        initialAuthCheckDoneRef.current = true;
        setLoadingChecklist((prev) => (prev.accountReady ? prev : { ...prev, accountReady: true }));
        return;
      }

      try {
        await syncUserProfileFromAuth(user);
      } finally {
        initialAuthCheckDoneRef.current = true;
        setLoadingChecklist((prev) => (prev.accountReady ? prev : { ...prev, accountReady: true }));
      }
    });

    return () => unsubscribe();
  }, [syncUserProfileFromAuth]);

  // Verify real readiness milestones whenever LoadingScreen is active
  useEffect(() => {
    if (loadingRunId === 0) {
      saveLastVisitAt(Date.now());
      return;
    }

    let cancelled = false;

    const markFontsReady = () => {
      if (cancelled) return;
      setLoadingChecklist((prev) => (prev.fontsReady ? prev : { ...prev, fontsReady: true }));
    };

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(markFontsReady).catch(markFontsReady);
    } else {
      markFontsReady();
    }

    const fontsFallback = window.setTimeout(markFontsReady, 1800);

    const lobbyFallback = window.setTimeout(() => {
      if (cancelled) return;
      setLoadingChecklist((prev) => (prev.lobbyReady ? prev : { ...prev, lobbyReady: true }));
    }, 1300);

    if (wsConnectedRef.current) {
      setLoadingChecklist((prev) => (prev.lobbyReady ? prev : { ...prev, lobbyReady: true }));
    }

    if (loadingRunId > 1) {
      if (auth.currentUser) {
        void syncUserProfileFromAuth(auth.currentUser).finally(() => {
          if (cancelled) return;
          setLoadingChecklist((prev) => (prev.accountReady ? prev : { ...prev, accountReady: true }));
        });
      } else {
        setLoadingChecklist((prev) => (prev.accountReady ? prev : { ...prev, accountReady: true }));
      }
    }

    const accountFallback = window.setTimeout(() => {
      if (cancelled) return;
      setLoadingChecklist((prev) => (prev.accountReady ? prev : { ...prev, accountReady: true }));
    }, 2600);

    return () => {
      cancelled = true;
      window.clearTimeout(fontsFallback);
      window.clearTimeout(lobbyFallback);
      window.clearTimeout(accountFallback);
    };
  }, [loadingRunId, syncUserProfileFromAuth]);

  const handleLoadingComplete = useCallback(() => {
    saveLastVisitAt(Date.now());
    setLoadingState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const resetCourtForMatch = (e: EngineState, mode: GameMode) => {
    const balls = createInitialBallsRecord(e.moneyRack);
    const moneyTotal = balls.filter((b) => b.isMoney).length;

    e.mode = mode;
    e.phase = 'COUNTDOWN';
    e.score = 0;
    e.contestStartCareer = { ...e.career };
    e.contestCountedInCareer = false;
    e.isNewBest = false;
    e.timeLeft =
      mode === 'HEAT_CHECK' || mode === 'PRACTICE' || mode === 'FAST_BREAK'
        ? 0
        : CONTEST_DURATION_SECONDS;
    e.lastTickSecond = 6;
    e.countdownTimer = 1.65;
    e.currentRack = 0;
    e.currentBall = 0;
    e.streak = 0;
    e.bestStreak = 0;
    e.multiplier = 1;
    e.madeCount = 0;
    e.attemptsCount = 0;
    e.resolvedLocalCount = 0;
    e.swishCount = 0;
    e.moneyMadeCount = 0;
    e.moneyTotalCount = moneyTotal;
    e.ballsRecord = balls;
    e.timingBreakdown = { perfect: 0, good: 0, early: 0, late: 0 };
    e.activeBalls = [];
    e.particles = [];
    e.callouts = [];
    e.streakRecordBaseline = Math.max(2, e.career.allTimeBestStreak);
    e.recordBrokenThisRun = false;
    e.crowdReaction = null;
    e.crowdHypeTimer = 0;

    e.hoopPos = { ...HOOP_POS };
    e.hoopTargetPos =
      mode === 'HEAT_CHECK' ? pickNextHeatCheckHoopTarget(HOOP_POS) : { ...HOOP_POS };
    e.heatCheckShiftTimer = 5.2;

    const r0 = RACK_CONFIGS[0];
    const fLen = Math.hypot(-r0.x, -r0.y) || 1;
    e.shooterPos = { x: r0.x, y: r0.y, z: 0 };
    e.shooterZ = 0;
    e.shooterVelZ = 0;
    e.shooterFacing = { x: -r0.x / fLen, y: -r0.y / fLen };
    e.runPhase = 0;
    e.runBlend = 0;
    e.runStepTimer = 0;
    e.isMovingToRack = false;
    e.shooterAnimState = 'DRIBBLING';
    e.dribbleBlend = 1;
    e.stamina = 100;
    e.staminaSavedTiming = 0;
    e.staminaRecoveredMovement = 0;
    e.staminaMinObserved = 100;
    e.consecutivePerfectShots = 0;
    e.secondWindCount = 0;
    e.secondWindFlashTimer = 0;
    e.shotChart = [];
    e.gatherBuffered = false;
    e.gatherAmount = 0;
    e.followThroughAmount = 0;
    e.landingSquat = 0;
    e.ballPickupTimer = 0;
    e.sprintDelayTimer = 0;
    e.gatherCooldown = 0;
    e.rackMoveTimer = 0;
    e.isHoldingShot = false;
    e.meterValue = 0;
    e.meterFeedbackTimer = 0;
    e.lastReleaseLabel = null;
    e.lastTimingQuality = null;
    e.hasShotAnyBall = false;
    e.shooterLabelAlpha = 1;
    e.contestShootingClosed = false;
    e.finishGraceTimer = 0;
    e.bestContestHighlight = null;
    e.fastBreakElapsedMs = 0;
    e.fastBreakFinishMs = null;
    e.fastBreakRackCumulativesMs = new Array(RACKS_COUNT).fill(null);
    e.fastBreakIsNewBest = false;
    e.leagueResultRecorded = false;
    e.lastShotTrajectory = null;
    e.perfectZoneHapticFired = false;

    e.pvpIntroElapsed = 0;
    if (mode === 'PVP') {
      const introCam = computePvpIntroCamera(0);
      e.camera.pos = { ...introCam.pos };
      e.camera.target = { ...introCam.target };
      e.camera.focalLength = introCam.focalLength;
    } else {
      const initRig = computeRackCameraRig(RACK_CONFIGS[0], e.cameraMode);
      e.camera.pos = { ...initRig.pos };
      e.camera.target = { ...initRig.target };
      e.camera.focalLength = initRig.focalLength;
    }
    e.cameraSnapZoom = 0;
    e.netWhip = 0;
    e.rimShake = 0;
    e.screenShake = 0;

    const initAngle = Math.random() * Math.PI * 2;
    e.windAngle = initAngle;
    e.windTargetAngle = initAngle;
    e.windMph = mode === 'PRACTICE' ? 0 : 0.45;
    e.windVec =
      mode === 'PRACTICE'
        ? { x: 0, y: 0 }
        : {
            x: Math.cos(initAngle) * 0.45 * 0.044,
            y: Math.sin(initAngle) * 0.45 * 0.044,
          };
    e.windShiftTimer = 6.5;
  };

  const spawnParticles = (
    e: EngineState,
    origin: Vec3,
    count: number,
    color: string | string[],
    speed = 7.5,
    options?: {
      shape?: Particle['shape'];
      glowColor?: string;
      gravity?: number;
      drag?: number;
      sizeScale?: number;
    }
  ) => {
    const palette = Array.isArray(color) ? color : [color];
    const shape = options?.shape ?? 'circle';
    const sizeScale = options?.sizeScale ?? 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.25 + Math.random() * 0.9;
      const sp = speed * (0.45 + Math.random() * 0.75);
      const picked = palette[Math.floor(Math.random() * palette.length)];
      e.particles.push({
        x: origin.x + (Math.random() - 0.5) * 0.4,
        y: origin.y + (Math.random() - 0.5) * 0.4,
        z: origin.z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * sp * 0.65,
        vy: Math.sin(a) * sp * 0.65,
        vz: up * sp,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: (0.8 + Math.random() * 0.9) * sizeScale,
        color: picked,
        glowColor: options?.glowColor,
        shape,
        gravity: options?.gravity,
        drag: options?.drag,
        rot: shape === 'confetti' || shape === 'spark' ? Math.random() * Math.PI * 2 : undefined,
        rotSpeed: shape === 'confetti' ? (Math.random() - 0.5) * 14 : undefined,
        aspect: shape === 'confetti' ? 0.45 + Math.random() * 0.45 : undefined,
      });
    }
  };

  const spawnBallTrailParticles = (
    e: EngineState,
    ball: ActiveBall,
    prevPos: Vec3,
    dt: number,
    shotStreak: number
  ) => {
    const segLen = Math.hypot(
      ball.pos.x - prevPos.x,
      ball.pos.y - prevPos.y,
      ball.pos.z - prevPos.z
    );
    if (segLen < 0.01) return;

    const skinCfg = getBallSkinConfig(ball.ballSkin ?? e.ballSkin);
    const palette =
      skinCfg.alwaysTrail
        ? skinCfg.palette.trailParticles
        : shotStreak >= 9
          ? ['#FEF08A', '#FDE047', '#F59E0B', '#FB923C']
          : shotStreak >= 6
            ? ['#FDE68A', '#F59E0B', '#FBBF24', '#F9631C']
            : ball.isMoney
              ? ['#FDE68A', '#F59E0B', '#FB923C']
              : ['#FDBA74', '#F9631C', '#FB923C'];

    const glowColor = skinCfg.alwaysTrail
      ? skinCfg.palette.glowHex
      : shotStreak >= 6 || ball.isMoney
        ? '#F59E0B'
        : '#F9631C';
    const shape = skinCfg.alwaysTrail ? skinCfg.palette.trailParticleShape : 'circle';
    const baseLife = skinCfg.alwaysTrail
      ? shotStreak >= 6
        ? 1.1
        : 0.86
      : shotStreak >= 9
        ? 1.25
        : shotStreak >= 6
          ? 1.08
          : 0.9;
    const rate = skinCfg.alwaysTrail ? (shotStreak >= 6 ? 135 : 95) : shotStreak >= 6 ? 130 : 95;
    const count = Math.min(4, Math.max(1, Math.round(dt * rate)));

    // Keep total active particles bounded for smooth frame pacing
    while (e.particles.length + count > 420) {
      const oldestTrailIdx = e.particles.findIndex((p) => p.isTrail);
      if (oldestTrailIdx >= 0) {
        e.particles.splice(oldestTrailIdx, 1);
      } else {
        e.particles.shift();
      }
    }

    for (let i = 0; i < count; i++) {
      const t = (i + 0.35 + Math.random() * 0.3) / (count + 0.3);
      const life = baseLife * (0.85 + Math.random() * 0.25);
      const color = palette[Math.floor(Math.random() * palette.length)];
      const spreadVel = skinCfg.trailStyle === 'electric' ? 1.5 : 0.45;
      const liftVel = skinCfg.trailStyle === 'flame' ? 0.55 + Math.random() * 0.85 : 0.2 + Math.random() * 0.45;
      e.particles.push({
        x: prevPos.x + (ball.pos.x - prevPos.x) * t + (Math.random() - 0.5) * 0.12,
        y: prevPos.y + (ball.pos.y - prevPos.y) * t + (Math.random() - 0.5) * 0.12,
        z: prevPos.z + (ball.pos.z - prevPos.z) * t + (Math.random() - 0.5) * 0.1,
        vx: (Math.random() - 0.5) * spreadVel,
        vy: (Math.random() - 0.5) * spreadVel,
        vz: liftVel,
        life,
        maxLife: life,
        size: (shotStreak >= 6 ? 1.08 : 0.88) + Math.random() * 0.58,
        color,
        glowColor,
        shape,
        rot: shape !== 'circle' ? Math.random() * Math.PI * 2 : undefined,
        rotSpeed: shape === 'confetti' ? (Math.random() - 0.5) * 10 : undefined,
        gravity: skinCfg.trailStyle === 'flame' ? -0.35 : 0.45,
        isTrail: true,
      });
    }
  };

  const addCallout = (
    e: EngineState,
    text: string,
    color: string,
    worldPos: Vec3,
    subText?: string,
    behindBackboard = false
  ) => {
    e.callouts.push({
      id: e.nextCalloutId++,
      text,
      subText,
      color,
      worldPos: { ...worldPos },
      life: 1.15,
      maxLife: 1.15,
      behindBackboard,
    });
  };

  const triggerRecordStreakCrowdReaction = (
    e: EngineState,
    newStreak: number,
    previousRecord: number,
    rackIndex: number
  ) => {
    const duration = 2.6;
    const highHeadlines = [
      'STADIUM ERUPTION',
      'HISTORIC HEAT CHECK',
      'ARENA IN FRENZY',
      'RECORD SHATTERED',
    ];
    const standardHeadlines = [
      'NEW STREAK RECORD',
      'CROWD GOES WILD',
      'UNSTOPPABLE RUN',
      'LIGHTS OUT SHOOTER',
    ];
    const pool = newStreak >= 7 ? highHeadlines : standardHeadlines;
    const headline = pool[Math.floor(Math.random() * pool.length)];

    const chants = [
      'CROWD ON THEIR FEET!',
      'MVP! MVP! MVP!',
      'ROOF BLOWN OFF THE ARENA!',
      'PURE SILK FROM DEEP!',
      'STANDING OVATION IN THE BOWL!',
    ];
    const chant = chants[Math.floor(Math.random() * chants.length)];
    const decibels = Number(
      (113.2 + Math.min(newStreak, 14) * 1.1 + Math.random() * 2.2).toFixed(1)
    );
    const accentColor = newStreak >= 8 ? '#FDE047' : '#F59E0B';
    const bars = Array.from({ length: 18 }, (_, idx) => {
      const bell = 1 - Math.abs(idx - 8.5) / 11;
      return Math.min(1, Math.max(0.32, 0.45 + bell * 0.45 + (Math.random() - 0.5) * 0.25));
    });

    e.crowdReaction = {
      id: e.nextCrowdReactionId++,
      streak: newStreak,
      previousRecord,
      headline,
      chant,
      decibels,
      accentColor,
      bars,
      life: duration,
      maxLife: duration,
    };
    e.crowdHypeTimer = duration;
    e.crowdHypeDuration = duration;

    // Trim oldest particles if approaching cap so celebration bursts always render cleanly
    while (e.particles.length > 460) {
      e.particles.shift();
    }

    // 1. Rim-area golden spark explosion anchored at current hoopPos
    const sparkPalette = ['#FEF08A', '#FDE047', '#F59E0B', '#F9631C', '#F4EFE6'];
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 7.5 + Math.random() * 8.5;
      const life = 0.65 + Math.random() * 0.45;
      const color = sparkPalette[i % sparkPalette.length];
      e.particles.push({
        x: e.hoopPos.x + (Math.random() - 0.5) * 0.9,
        y: e.hoopPos.y + (Math.random() - 0.5) * 0.9,
        z: e.hoopPos.z + 0.35,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        vz: 3.5 + Math.random() * 8.5,
        life,
        maxLife: life,
        size: 1.05 + Math.random() * 0.7,
        color,
        glowColor: '#F59E0B',
        gravity: 16,
        drag: 0.97,
        shape: 'spark',
      });
    }

    // 2. Tumbling stadium confetti shower across the court/hoop vista
    const confettiPalette = ['#FDE047', '#F59E0B', '#F9631C', '#F4EFE6', '#34D399', '#38BDF8'];
    for (let i = 0; i < 54; i++) {
      const life = 1.85 + Math.random() * 0.85;
      e.particles.push({
        x: (Math.random() - 0.5) * 24,
        y: -3.5 + Math.random() * 17,
        z: 11.5 + Math.random() * 6.5,
        vx: (Math.random() - 0.5) * 5.2,
        vy: (Math.random() - 0.5) * 4.2,
        vz: 1.5 + Math.random() * 4.5,
        life,
        maxLife: life,
        size: 1.25 + Math.random() * 0.8,
        color: confettiPalette[i % confettiPalette.length],
        gravity: 3.6,
        drag: 0.975,
        shape: 'confetti',
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 7),
        aspect: 0.48 + Math.random() * 0.35,
      });
    }

    // 3. Baseline pyro spark fountains flanking the court
    [-13.5, 13.5].forEach((sideX) => {
      for (let i = 0; i < 12; i++) {
        const life = 0.85 + Math.random() * 0.45;
        e.particles.push({
          x: sideX + (Math.random() - 0.5) * 1.1,
          y: -2.8 + (Math.random() - 0.5) * 1.1,
          z: 1.1,
          vx: (sideX > 0 ? -1 : 1) * (1.2 + Math.random() * 3.0) + (Math.random() - 0.5) * 1.4,
          vy: (Math.random() - 0.5) * 2.4,
          vz: 13.5 + Math.random() * 7.5,
          life,
          maxLife: life,
          size: 1.15 + Math.random() * 0.55,
          color: i % 2 === 0 ? '#FEF08A' : '#F9631C',
          glowColor: '#F59E0B',
          gravity: 14,
          drag: 0.98,
          shape: 'spark',
        });
      }
    });

    // 4. Instant paparazzi flashbulb salvo across the stands
    for (let i = 0; i < 12; i++) {
      e.flashbulbs.push({
        x: 0.05 + Math.random() * 0.9,
        y: 0.14 + Math.random() * 0.27,
        life: 0.24 + Math.random() * 0.18,
        maxLife: 0.4,
        size: 20 + Math.random() * 22,
      });
    }

    soundEngine.playRecordStreakEruption(newStreak, rackIndex);
  };

  // Setup WebSocket client handlers
  useEffect(() => {
    pvpClient.setHandlers({
      onConnected: (conn) => {
        setWsConnected(conn);
        if (conn) {
          setLoadingChecklist((prev) => (prev.lobbyReady ? prev : { ...prev, lobbyReady: true }));
          const e = engineRef.current;
          pvpClient.setProfile(
            userProfileRef.current ? userProfileRef.current.username : playerNameRef.current,
            e.moneyRack,
            {
              wins: e.career.pvpWins,
              losses: e.career.pvpLosses,
              draws: e.career.pvpDraws,
            },
            userProfileRef.current?.uid ?? null,
            buildServerProfileStats(e.career)
          );
        }
      },
      onWelcome: (id, assignedName) => {
        engineRef.current.myPlayerId = id;
        setLoadingChecklist((prev) => (prev.lobbyReady ? prev : { ...prev, lobbyReady: true }));
        if (!userProfileRef.current && playerNameRef.current === 'Shooter') {
          setPlayerName(assignedName);
        }
        syncHud();
      },
      onLobbyStats: (stats) => {
        setLobbyStats(stats);
      },
      onQueueStatus: (queued, leagueId, leagueName) => {
        setInQueue(queued);
        setQueuedLeagueInfo({
          leagueId: leagueId ?? null,
          leagueName: leagueName ?? null,
        });
      },
      onFriendStatuses: (statuses) => {
        setFriendStatuses(statuses);
      },
      onMatchInviteSent: (invite) => {
        setOutgoingInvite(invite);
      },
      onMatchInviteReceived: (invite) => {
        setIncomingInvite(invite);
      },
      onMatchInviteDeclined: ({ inviteId, byName, expired }) => {
        setOutgoingInvite((prev) => (prev?.inviteId === inviteId ? null : prev));
        setIncomingInvite((prev) => (prev?.inviteId === inviteId ? null : prev));
        showTimedInviteNotice(
          expired
            ? `Match request to ${byName} expired.`
            : `${byName} declined your match request.`,
          'err'
        );
      },
      onMatchInviteCancelled: ({ inviteId, reason }) => {
        setOutgoingInvite((prev) => (prev?.inviteId === inviteId ? null : prev));
        setIncomingInvite((prev) => (prev?.inviteId === inviteId ? null : prev));
        if (reason === 'OFFLINE') {
          showTimedInviteNotice('Shooter went offline — match request closed.', 'err');
        }
      },
      onError: (msg) => {
        setPvpError(msg);
        showTimedInviteNotice(msg, 'err');
        window.setTimeout(() => setPvpError(null), 4000);
      },
      onOpponentLeft: () => {
        const e = engineRef.current;
        e.pvpMatch = null;
        e.phase = 'TITLE';
        setPvpError('Opponent left the room.');
        syncHud();
      },
      onMatchState: (match) => {
        const e = engineRef.current;
        const prevStatus = e.pvpMatch?.status;
        const prevCountdown = e.pvpMatch?.countdownLeft ?? 15;
        e.pvpMatch = match;

        const me = match.players.find((p) => p.id === e.myPlayerId);
        const opp = match.players.find((p) => p.id !== e.myPlayerId);

        if (match.status === 'COUNTDOWN' && prevStatus !== 'COUNTDOWN') {
          setInQueue(false);
          setPvpError(null);
          setIncomingInvite(null);
          setOutgoingInvite(null);
          setShowFriendsModal(false);
          resetCourtForMatch(e, 'PVP');
        } else if (match.status === 'COUNTDOWN') {
          const targetElapsed = Math.max(0, 15 - match.countdownLeft);
          if (Math.abs(targetElapsed - e.pvpIntroElapsed) > 1.1) {
            e.pvpIntroElapsed = targetElapsed;
          }
          if (
            prevStatus === 'COUNTDOWN' &&
            match.countdownLeft !== prevCountdown &&
            match.countdownLeft <= 3 &&
            match.countdownLeft >= 1
          ) {
            soundEngine.playTick(false);
          }
        } else if (match.status === 'PLAYING') {
          if (e.phase !== 'PLAYING') {
            e.phase = 'PLAYING';
            soundEngine.playWhistle();
            triggerMatchStartHaptic();
          }
          // Gently keep time synced with authoritative server clock
          if (Math.abs(e.timeLeft - match.timeLeft) > 0.7) {
            e.timeLeft = match.timeLeft;
          }
          if (match.timeLeft <= 0 && !e.contestShootingClosed) {
            e.timeLeft = 0;
            e.contestShootingClosed = true;
            e.isHoldingShot = false;
            soundEngine.playBuzzer(e.currentRack, e.streak);
            triggerBuzzerHaptic();
          }

          // Reconcile local player score when server has caught up
          if (me && me.attemptsCount >= e.resolvedLocalCount) {
            e.score = me.score;
            e.streak = me.streak;
            e.multiplier = me.multiplier;
          }
        } else if (match.status === 'FINISHED') {
          if (me) {
            e.score = me.score;
            e.streak = me.streak;
            e.multiplier = me.multiplier;
          }
          if (e.phase !== 'GAME_OVER') {
            finalizeContestHighlights(e);
            e.phase = 'GAME_OVER';
            e.isHoldingShot = false;
            e.gatherBuffered = false;
            e.gameOverTimestamp = performance.now();
            if (e.instantReplayEnabled && e.bestContestHighlight) {
              soundEngine.unlock();
              setActiveHighlight(e.bestContestHighlight);
            }
            if (!e.contestCountedInCareer) {
              e.contestCountedInCareer = true;
              const contestBestStreak = Math.max(e.bestStreak, me?.bestStreak ?? 0);
              e.career.contestsPlayed += 1;
              e.career.totalBestStreakSum += contestBestStreak;
              e.career.streakTrackedContests += 1;
              if (match.isTie) {
                e.career.pvpDraws += 1;
              } else if (match.winnerId === e.myPlayerId) {
                e.career.pvpWins += 1;
              } else if (opp) {
                e.career.pvpLosses += 1;
              }
              if (e.score > e.career.bestScore) {
                e.career.bestScore = e.score;
                e.bestScore = e.score;
                e.isNewBest = true;
              }
              if (opp) {
                const result: 'WIN' | 'LOSS' | 'DRAW' = match.isTie
                  ? 'DRAW'
                  : match.winnerId === e.myPlayerId
                    ? 'WIN'
                    : 'LOSS';
                const myFinalScore = me?.score ?? e.score;
                const oppFinalScore = opp.score;
                const oppKey = normalizeOpponentKey(opp.name);
                const prevRivalry = e.rivalries[oppKey];
                const nextStreak =
                  result === 'WIN'
                    ? prevRivalry && prevRivalry.currentStreak > 0
                      ? prevRivalry.currentStreak + 1
                      : 1
                    : result === 'LOSS'
                      ? prevRivalry && prevRivalry.currentStreak < 0
                        ? prevRivalry.currentStreak - 1
                        : -1
                      : 0;
                const updatedRivalry: RivalryRecord = {
                  opponentKey: oppKey,
                  opponentName: opp.name.trim().slice(0, 24) || 'Opponent',
                  wins: (prevRivalry?.wins ?? 0) + (result === 'WIN' ? 1 : 0),
                  losses: (prevRivalry?.losses ?? 0) + (result === 'LOSS' ? 1 : 0),
                  draws: (prevRivalry?.draws ?? 0) + (result === 'DRAW' ? 1 : 0),
                  pointsFor: (prevRivalry?.pointsFor ?? 0) + myFinalScore,
                  pointsAgainst: (prevRivalry?.pointsAgainst ?? 0) + oppFinalScore,
                  lastScoreFor: myFinalScore,
                  lastScoreAgainst: oppFinalScore,
                  lastResult: result,
                  currentStreak: nextStreak,
                  lastPlayedAt: Date.now(),
                };
                e.rivalries[oppKey] = updatedRivalry;
                saveRivalries(e.rivalries);
                const activeUid = userProfileRef.current?.uid;
                if (activeUid) {
                  void syncRivalryToFirestore(activeUid, updatedRivalry).catch((err: unknown) => {
                    console.error('Failed to sync rivalry record:', err);
                  });
                  if (match.leagueId && !e.leagueResultRecorded && userProfileRef.current) {
                    e.leagueResultRecorded = true;
                    void recordLeagueMatchResult(
                      match.leagueId,
                      userProfileRef.current.uid,
                      userProfileRef.current.username,
                      result,
                      myFinalScore,
                      oppFinalScore
                    ).catch((err: unknown) => {
                      console.error('Failed to record league match result:', err);
                    });
                  }
                }
              }
              persistCareer(e.career);
              if (userProfileRef.current) {
                const swishTotal = me ? me.swishCount : e.swishCount;
                const finalScore = me ? me.score : e.score;
                const pvpResult: 'WIN' | 'LOSS' | 'DRAW' = match.isTie
                  ? 'DRAW'
                  : match.winnerId === e.myPlayerId
                    ? 'WIN'
                    : 'LOSS';
                void syncPvpGlobalRankingToFirestore(
                  userProfileRef.current.uid,
                  userProfileRef.current.username,
                  e.courtTheme,
                  finalScore,
                  contestBestStreak,
                  swishTotal,
                  pvpResult
                )
                  .then(() => setGlobalRankingsRefreshNonce((n) => n + 1))
                  .catch((err: unknown) => {
                    console.error('Failed to sync PVP global ranking:', err);
                  });
              }
              pvpClient.setProfile(
                userProfileRef.current ? userProfileRef.current.username : playerNameRef.current,
                e.moneyRack,
                {
                  wins: e.career.pvpWins,
                  losses: e.career.pvpLosses,
                  draws: e.career.pvpDraws,
                },
                userProfileRef.current?.uid ?? null,
                buildServerProfileStats(e.career)
              );
            }
          }
        }

        syncHud();
      },
      onOpponentShot: (_shot: OpponentShotEvent) => {
        // Opponent avatar & shots are intentionally hidden during PVP matches;
        // live opponent score tally updates via match_state.
      },
    });

    pvpClient.connect();
    return () => {
      pvpClient.disconnect();
    };
  }, [persistCareer, showTimedInviteNotice, syncHud]);

  const startLocalContest = useCallback(
    (targetMode?: 'SOLO' | 'FAST_BREAK' | 'HEAT_CHECK' | 'PRACTICE') => {
      soundEngine.unlock();
      const e = engineRef.current;
      const chosenMode: GameMode =
        targetMode ??
        (e.mode === 'FAST_BREAK'
          ? 'FAST_BREAK'
          : e.mode === 'HEAT_CHECK'
            ? 'HEAT_CHECK'
            : e.mode === 'PRACTICE'
              ? 'PRACTICE'
              : 'SOLO');
      e.pvpMatch = null;
      resetCourtForMatch(e, chosenMode);
      soundEngine.playTick(false);
      syncHud();
    },
    [syncHud]
  );

  const handleSelectMode = useCallback(
    (mode: GameMode) => {
      const e = engineRef.current;
      e.mode = mode;
      setPvpError(null);
      syncHud();
    },
    [syncHud]
  );

  const handleSelectMoneyRack = useCallback(
    (rackIdx: number) => {
      const safeRackIdx = normalizeMoneyRackIndex(rackIdx);
      const e = engineRef.current;
      e.moneyRack = safeRackIdx;
      e.ballsRecord = createInitialBallsRecord(safeRackIdx);
      e.moneyTotalCount = e.ballsRecord.filter((b) => b.isMoney).length;
      pvpClient.setProfile(
        userProfileRef.current ? userProfileRef.current.username : playerName,
        safeRackIdx,
        {
          wins: e.career.pvpWins,
          losses: e.career.pvpLosses,
          draws: e.career.pvpDraws,
        },
        userProfileRef.current?.uid ?? null,
        buildServerProfileStats(e.career)
      );
      syncHud();
    },
    [playerName, syncHud]
  );

  const handleChangePlayerName = useCallback((name: string) => {
    const cleaned = saveGuestName(name);
    setPlayerName(cleaned);
    playerNameRef.current = cleaned;
    const e = engineRef.current;
    if (!userProfileRef.current) {
      e.shooterDisplayName = cleaned;
    }
    pvpClient.setProfile(
      userProfileRef.current ? userProfileRef.current.username : cleaned,
      e.moneyRack,
      {
        wins: e.career.pvpWins,
        losses: e.career.pvpLosses,
        draws: e.career.pvpDraws,
      },
      userProfileRef.current?.uid ?? null,
      buildServerProfileStats(e.career)
    );
    syncHud();
  }, [syncHud]);

  const handleUpdatedAccountProfile = useCallback(
    (updated: UserProfile) => {
      setUserProfile(updated);
      userProfileRef.current = updated;
      setPlayerName(updated.username);
      playerNameRef.current = updated.username;
      const e = engineRef.current;
      e.shooterDisplayName = `@${updated.username}`;
      pvpClient.setProfile(
        updated.username,
        e.moneyRack,
        {
          wins: e.career.pvpWins,
          losses: e.career.pvpLosses,
          draws: e.career.pvpDraws,
        },
        updated.uid,
        buildServerProfileStats(e.career)
      );
      syncHud();
      setGlobalRankingsRefreshNonce((n) => n + 1);
    },
    [syncHud]
  );

  const handleToggleMute = useCallback(() => {
    const nextMuted = !soundEngine.isMuted();
    soundEngine.setMuted(nextMuted);
    saveAudioMuted(soundEngine.isMuted());
    saveAudioVolume(soundEngine.getStoredVolume());
    if (!nextMuted) {
      soundEngine.unlock();
      soundEngine.playVolumePreviewTone();
    }
    syncHud();
  }, [syncHud]);

  const handleChangeAudioVolume = useCallback(
    (volume: number) => {
      soundEngine.setVolume(volume);
      saveAudioVolume(soundEngine.getStoredVolume());
      saveAudioMuted(soundEngine.isMuted());
      if (!soundEngine.isMuted()) {
        soundEngine.unlock();
        soundEngine.playVolumePreviewTone();
      }
      syncHud();
    },
    [syncHud]
  );

  const handleChangeShotSensitivity = useCallback(
    (sensitivity: number) => {
      const clamped = Math.max(0.6, Math.min(1.5, Math.round(sensitivity * 20) / 20));
      engineRef.current.shotSensitivity = clamped;
      saveShotSensitivity(clamped);
      syncHud();
    },
    [syncHud]
  );

  const handleChangeHapticIntensity = useCallback(
    (intensity: HapticIntensity) => {
      engineRef.current.hapticIntensity = intensity;
      setHapticIntensity(intensity);
      saveHapticIntensity(intensity);
      triggerHapticPreview(intensity);
      syncHud();
    },
    [syncHud]
  );

  const handleSelectCourt = useCallback(
    (theme: CourtThemeId) => {
      const e = engineRef.current;
      if (!isCourtUnlocked(theme, e.career)) return;
      e.courtTheme = theme;
      saveSelectedCourt(theme);
      soundEngine.unlock();
      soundEngine.setCourtTheme(theme);
      soundEngine.playCourtPreviewChant(theme);
      syncHud();
    },
    [syncHud]
  );

  const handlePreviewCourtChant = useCallback((theme: CourtThemeId) => {
    soundEngine.unlock();
    soundEngine.playCourtPreviewChant(theme);
  }, []);

  const handleSelectBallSkin = useCallback(
    (skin: BallSkinId) => {
      const e = engineRef.current;
      if (!isBallSkinUnlocked(skin, e.career)) return;
      e.ballSkin = skin;
      saveSelectedBallSkin(skin);
      soundEngine.unlock();
      soundEngine.playTick(false);
      syncHud();
    },
    [syncHud]
  );

  const handlePause = useCallback(() => {
    const e = engineRef.current;
    if (e.mode === 'PVP') return; // Live PVP matches don't pause the shared clock
    if (e.phase === 'PLAYING' || e.phase === 'COUNTDOWN') {
      e.isHoldingShot = false;
      e.gatherAmount = 0;
      e.phase = 'PAUSED';
      syncHud();
    } else if (e.phase === 'PAUSED') {
      e.phase = e.countdownTimer > 0 ? 'COUNTDOWN' : 'PLAYING';
      syncHud();
    }
  }, [syncHud]);

  const handleToggleInstantReplay = useCallback(() => {
    const e = engineRef.current;
    e.instantReplayEnabled = !e.instantReplayEnabled;
    saveInstantReplayEnabled(e.instantReplayEnabled);
    syncHud();
  }, [syncHud]);

  const handleSetCameraMode = useCallback(
    (nextMode: CameraMode) => {
      const e = engineRef.current;
      e.cameraMode = nextMode;
      saveCameraMode(nextMode);
      e.cameraSnapZoom = 0;
      const activeRack = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
      if (activeRack && e.phase !== 'TITLE') {
        const hoopDelta = {
          x: e.hoopPos.x - HOOP_POS.x,
          y: e.hoopPos.y - HOOP_POS.y,
          z: e.hoopPos.z - HOOP_POS.z,
        };
        const rig = computeRackCameraRig(activeRack, nextMode, hoopDelta);
        e.camera.pos = { ...rig.pos };
        e.camera.target = { ...rig.target };
        e.camera.focalLength = rig.focalLength;
      }
      syncHud();
    },
    [syncHud]
  );

  const handleToggleCameraMode = useCallback(() => {
    const nextMode: CameraMode =
      engineRef.current.cameraMode === 'PRO_STATIC' ? 'FOLLOW' : 'PRO_STATIC';
    handleSetCameraMode(nextMode);
  }, [handleSetCameraMode]);

  const handleToggleShotTrajectory = useCallback(() => {
    const e = engineRef.current;
    e.shotTrajectoryEnabled = !e.shotTrajectoryEnabled;
    saveShotTrajectoryEnabled(e.shotTrajectoryEnabled);
    syncHud();
  }, [syncHud]);

  const handleResetSettingsToDefaults = useCallback(() => {
    const e = engineRef.current;
    soundEngine.setVolume(100);
    soundEngine.setMuted(false);
    saveAudioVolume(100);
    saveAudioMuted(false);

    e.shotSensitivity = 1.0;
    saveShotSensitivity(1.0);

    e.hapticIntensity = 'MEDIUM';
    setHapticIntensity('MEDIUM');
    saveHapticIntensity('MEDIUM');

    e.cameraMode = 'FOLLOW';
    saveCameraMode('FOLLOW');

    e.shotTrajectoryEnabled = false;
    saveShotTrajectoryEnabled(false);

    e.instantReplayEnabled = true;
    saveInstantReplayEnabled(true);

    e.ballSkin = 'classic_leather';
    saveSelectedBallSkin('classic_leather');

    syncHud();
  }, [syncHud]);

  const handleClearLocalProgress = useCallback(() => {
    const e = engineRef.current;
    const empty = createEmptyCareerStats();
    e.career = empty;
    e.contestStartCareer = { ...empty };
    e.bestScore = 0;
    e.streakRecordBaseline = 2;
    e.sessionBestScore = 0;
    e.sessionBestStreak = 0;
    e.rivalries = {};
    e.lastHighlight = null;
    e.bestContestHighlight = null;
    if (!isBallSkinUnlocked(e.ballSkin, empty)) {
      e.ballSkin = 'classic_leather';
      saveSelectedBallSkin('classic_leather');
    }
    saveCareerStats(empty);
    saveRivalries({});
    saveLastHighlight(null);
    syncHud();
  }, [syncHud]);

  const handleSkipInstantReplay = useCallback(() => {
    setActiveHighlight(null);
  }, []);

  const handleQuitToTitle = useCallback(() => {
    const e = engineRef.current;
    setActiveHighlight(null);
    if (e.mode === 'PVP') {
      pvpClient.leaveRoom();
      pvpClient.leaveQueue();
      e.pvpMatch = null;
    }
    e.phase = 'TITLE';
    e.isHoldingShot = false;
    e.gatherBuffered = false;
    e.isMovingToRack = false;
    e.runBlend = 0;
    e.hoopPos = { ...HOOP_POS };
    e.hoopTargetPos = { ...HOOP_POS };
    e.activeBalls = [];
    e.lastShotTrajectory = null;
    e.particles = [];
    e.callouts = [];
    e.ballsRecord = createInitialBallsRecord(e.moneyRack);
    setInQueue(false);
    syncHud();
  }, [syncHud]);

  const beginShotGather = useCallback(() => {
    const e = engineRef.current;
    if (e.phase !== 'PLAYING' || e.contestShootingClosed) return;
    if (e.isHoldingShot) return;
    if (e.currentRack >= RACKS_COUNT || e.currentBall >= getRackBallCount(e.currentRack)) return;

    const targetRack = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
    const distToRack = targetRack
      ? Math.hypot(targetRack.x - e.shooterPos.x, targetRack.y - e.shooterPos.y)
      : 999;

    // Never allow gathering, shooting, or buffering while moving/sprinting between racks
    if (
      e.isMovingToRack ||
      e.rackMoveTimer > 0 ||
      e.sprintDelayTimer > 0 ||
      distToRack > 0.16
    ) {
      e.gatherBuffered = false;
      return;
    }

    // Only allow crisp same-rack buffer while cooling down / landing at the current rack
    if (e.gatherCooldown > 0 || e.shooterZ > 0.06 || e.runBlend > 0.14) {
      e.gatherBuffered = true;
      return;
    }

    e.gatherBuffered = false;
    e.perfectZoneHapticFired = false;
    soundEngine.unlock();
    soundEngine.playGather();
    triggerShotGatherHaptic();
    e.isHoldingShot = true;
    e.meterValue = 0;
    e.followThroughAmount = 0;
  }, []);

  const releaseShot = useCallback(() => {
    const e = engineRef.current;
    e.gatherBuffered = false;
    if (!e.isHoldingShot) return;
    e.isHoldingShot = false;

    if (e.phase !== 'PLAYING' || e.contestShootingClosed) return;
    if (e.currentRack >= RACKS_COUNT || e.currentBall >= getRackBallCount(e.currentRack)) return;

    const targetRack = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
    const distToRack = targetRack
      ? Math.hypot(targetRack.x - e.shooterPos.x, targetRack.y - e.shooterPos.y)
      : 999;
    if (e.isMovingToRack || e.rackMoveTimer > 0 || distToRack > 0.25 || e.runBlend > 0.2) {
      e.gatherAmount = 0;
      e.meterValue = 0;
      return;
    }

    const slotIdx = getSlotIndex(e.currentRack, e.currentBall);
    const slot = e.ballsRecord[slotIdx];
    if (!slot || slot.status !== 'PENDING') return;

    const diff =
      e.mode === 'PRACTICE'
        ? DIFFICULTY_TIERS[0]
        : getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
    const releaseVal = e.meterValue;

    const hdx = e.hoopPos.x - e.shooterPos.x;
    const hdy = e.hoopPos.y - e.shooterPos.y;
    const dirLen = Math.hypot(hdx, hdy) || 1;
    const fx = hdx / dirLen;
    const fy = hdy / dirLen;

    const releasePos: Vec3 = {
      x: e.shooterPos.x + fx * 0.75,
      y: e.shooterPos.y + fy * 0.75,
      z: 8.05,
    };

    const launch = computeShotLaunch(releasePos, releaseVal, diff, e.windVec, e.hoopPos);

    const shotStaminaCost =
      e.mode === 'PRACTICE'
        ? 0
        : launch.timingQuality === 'PERFECT'
          ? 1.2
          : launch.timingQuality === 'MAKE'
            ? 2.2
            : 3.5;
    e.shooterVelZ = 8.65;
    e.landingSquat = 0;
    e.ballPickupTimer = 0;
    e.stamina = e.mode === 'PRACTICE' ? 100 : Math.max(0, e.stamina - shotStaminaCost);
    e.staminaMinObserved = Math.min(e.staminaMinObserved, e.stamina);
    e.staminaSavedTiming += e.mode === 'PRACTICE' ? 0 : 3.5 - shotStaminaCost;
    e.gatherAmount = 0;
    e.followThroughAmount = 1.0;
    e.hasShotAnyBall = true;
    e.attemptsCount += 1;
    e.gatherCooldown = diff.gatherCooldown;

    e.lastReleaseMeter = releaseVal;
    e.meterFeedbackTimer = 0.65;
    let recordedTiming: TimingQuality;
    if (launch.timingQuality === 'PERFECT') {
      e.lastReleaseLabel = 'PERFECT';
      e.lastReleaseColor = '#FEF08A';
      e.timingBreakdown.perfect += 1;
      recordedTiming = 'PERFECT';
      // Trigger crisp camera snap zoom on perfect release
      e.cameraSnapZoom = 1.0;

      // Second Wind: 3 consecutive perfect releases restore +10% stamina
      e.consecutivePerfectShots += 1;
      if (e.consecutivePerfectShots >= 3) {
        e.consecutivePerfectShots = 0;
        e.secondWindCount += 1;
        e.secondWindFlashTimer = 1.85;
        e.stamina = Math.min(100, e.stamina + 10);
        e.staminaSavedTiming += 10;
        triggerSecondWindHaptic();
        spawnParticles(
          e,
          { x: e.shooterPos.x, y: e.shooterPos.y, z: 5.2 },
          18,
          '#6EE7B7',
          6.8
        );
        addCallout(
          e,
          'SECOND WIND! +10% STAMINA',
          '#6EE7B7',
          { x: e.shooterPos.x, y: e.shooterPos.y, z: 9.4 },
          '3× PERFECT RELEASES'
        );
      }
    } else if (launch.timingQuality === 'MAKE') {
      e.lastReleaseLabel = 'GOOD';
      e.lastReleaseColor = '#6EE7B7';
      e.timingBreakdown.good += 1;
      recordedTiming = 'GOOD';
      e.consecutivePerfectShots = 0;
    } else if (launch.timingQuality === 'EARLY') {
      e.lastReleaseLabel = 'EARLY';
      e.lastReleaseColor = '#7DD3FC';
      e.timingBreakdown.early += 1;
      recordedTiming = 'EARLY';
      e.consecutivePerfectShots = 0;
    } else {
      e.lastReleaseLabel = 'LATE';
      e.lastReleaseColor = '#FECACA';
      e.timingBreakdown.late += 1;
      recordedTiming = 'LATE';
      e.consecutivePerfectShots = 0;
    }

    slot.status = 'IN_AIR';
    slot.timingQuality = recordedTiming;
    slot.multiplierUsed = e.multiplier;
    e.lastTimingQuality = recordedTiming;

    const ballId = e.nextBallId++;
    const ball: ActiveBall = {
      id: ballId,
      rackIndex: e.currentRack,
      ballIndex: e.currentBall,
      isMoney: slot.isMoney,
      multiplierAtRelease: e.multiplier,
      streakAtRelease: e.streak,
      difficultyLevelAtRelease: diff.level,
      timingQualityAtRelease: recordedTiming,
      isBuzzerBeater:
        e.mode !== 'HEAT_CHECK' &&
        e.mode !== 'PRACTICE' &&
        e.mode !== 'FAST_BREAK' &&
        e.timeLeft <= 0.35,
      ballSkin: e.ballSkin,
      skipRimCollision: launch.skipRimCollision,
      pos: releasePos,
      vel: launch.vel,
      spinAngle: 0,
      spinRate: -11.5,
      intendedOutcome: launch.intendedOutcome,
      hasScored: false,
      hasResolved: false,
      hitRimCount: 0,
      hitBackboard: false,
      shooterPosAtRelease: { ...e.shooterPos },
      shooterFacingAtRelease: { x: fx, y: fy },
      hoopPosAtRelease: { ...e.hoopPos },
      windMphAtRelease: e.windMph,
      highlightFrames: [
        { t: 0, x: releasePos.x, y: releasePos.y, z: releasePos.z, spinAngle: 0 },
      ],
      rimHitTimes: [],
      trail: [{ ...releasePos }],
      age: 0,
    };
    e.activeBalls.push(ball);
    const releaseSkinCfg = getBallSkinConfig(e.ballSkin);
    if (releaseSkinCfg.alwaysTrail) {
      spawnParticles(
        e,
        releasePos,
        8,
        releaseSkinCfg.palette.releaseBurstColors,
        5.8,
        {
          shape: releaseSkinCfg.palette.releaseBurstShape,
          glowColor: releaseSkinCfg.palette.glowHex,
          gravity: releaseSkinCfg.trailStyle === 'flame' ? 4.5 : 14,
        }
      );
    }
    e.lastShotTrajectory = {
      ballId,
      points: [{ ...releasePos }],
      hoopPos: { ...e.hoopPos },
      timingQuality: recordedTiming,
      isMoney: slot.isMoney,
      outcome: null,
      age: 0,
      fadeAfter: 2.7,
      frozen: false,
    };
    e.shotChart.push({
      id: ballId,
      rackIndex: e.currentRack,
      ballIndex: e.currentBall,
      x: e.shooterPos.x,
      y: e.shooterPos.y,
      isMoney: slot.isMoney,
      timingQuality: recordedTiming,
      status: 'IN_AIR',
      pointsAwarded: 0,
    });
    soundEngine.playRelease();
    triggerShotReleaseHaptic(recordedTiming);

    if (e.mode === 'PVP') {
      pvpClient.sendShotReleased(
        e.currentRack,
        e.currentBall,
        slot.isMoney,
        releasePos,
        launch.vel
      );
    }

    const curRackBallCount = getRackBallCount(e.currentRack);
    if (e.currentBall + 1 < curRackBallCount) {
      e.currentBall += 1;
    } else {
      if (e.mode === 'FAST_BREAK') {
        const cumMs = Math.round(e.fastBreakElapsedMs);
        e.fastBreakRackCumulativesMs[e.currentRack] = cumMs;
        if (e.currentRack === RACKS_COUNT - 1) {
          e.fastBreakFinishMs = cumMs;
          const completedSplits = e.fastBreakRackCumulativesMs.map((v) => v ?? cumMs);
          if (e.career.bestFastBreakMs === 0 || cumMs < e.career.bestFastBreakMs) {
            e.fastBreakIsNewBest = true;
            e.career.bestFastBreakMs = cumMs;
            e.career.bestFastBreakSplitsMs = completedSplits;
          }
          e.career.fastBreakContests += 1;
          persistCareer(e.career);
          triggerBuzzerHaptic();
        }
      }

      if (e.currentRack + 1 < RACKS_COUNT) {
        e.currentRack += 1;
        e.currentBall = 0;
        e.sprintDelayTimer = e.mode === 'FAST_BREAK' ? 0.14 : 0.26;
        e.rackMoveTimer = 0.28;
        e.windTargetAngle += (Math.random() - 0.5) * 0.9;
      } else if (e.mode === 'HEAT_CHECK' || e.mode === 'PRACTICE') {
        // Endless Heat Check / Practice rotation: refill next rack and cycle smoothly
        const nextRack = 0;
        const startIdx = getSlotIndex(nextRack, 0);
        const nextCount = getRackBallCount(nextRack);
        for (let b = 0; b < nextCount; b++) {
          const s = e.ballsRecord[startIdx + b];
          if (s) {
            s.status = 'PENDING';
            s.outcome = undefined;
            s.timingQuality = undefined;
            s.pointsAwarded = 0;
            s.multiplierUsed = 1;
          }
        }
        e.currentRack = nextRack;
        e.currentBall = 0;
        e.sprintDelayTimer = 0.28;
        e.rackMoveTimer = 0.35;
        e.windTargetAngle += (Math.random() - 0.5) * 0.9;
      } else {
        e.currentBall = curRackBallCount;
        e.contestShootingClosed = true;
        e.finishGraceTimer = 0.65;
      }
    }

    // In Heat Check & Practice, pre-reset the rack we just left when transitioning between racks so HUD stays fresh
    if (
      (e.mode === 'HEAT_CHECK' || e.mode === 'PRACTICE') &&
      e.currentBall === 0 &&
      e.currentRack > 0
    ) {
      const startIdx = getSlotIndex(e.currentRack, 0);
      const curCount = getRackBallCount(e.currentRack);
      for (let b = 0; b < curCount; b++) {
        const s = e.ballsRecord[startIdx + b];
        if (s && s.status !== 'PENDING') {
          s.status = 'PENDING';
          s.outcome = undefined;
          s.timingQuality = undefined;
          s.pointsAwarded = 0;
          s.multiplierUsed = 1;
        }
      }
    }

    syncHud();
  }, [persistCareer, syncHud]);

  // Keyboard & window blur bindings
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (loadingVisibleRef.current) return;
      const e = engineRef.current;

      // Don't hijack typing inside name/room input fields
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (ev.code === 'Escape' && showEditUsernameRef.current) {
          ev.preventDefault();
          setShowEditUsername(false);
        }
        return;
      }

      if (showEditUsernameRef.current) {
        if (ev.code === 'Escape') {
          ev.preventDefault();
          setShowEditUsername(false);
        }
        return;
      }

      if (ev.code === 'KeyM') {
        ev.preventDefault();
        handleToggleMute();
        return;
      }

      if (activeHighlightRef.current) {
        if (ev.code === 'Escape') {
          ev.preventDefault();
          setActiveHighlight(null);
        }
        return;
      }

      const isLocalMode =
        e.mode === 'SOLO' ||
        e.mode === 'FAST_BREAK' ||
        e.mode === 'HEAT_CHECK' ||
        e.mode === 'PRACTICE';

      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        if (
          ev.code === 'Escape' &&
          showSettingsPageRef.current &&
          !showAuthOverlayRef.current &&
          !showEditUsernameRef.current &&
          !showCourtLockerRef.current
        ) {
          ev.preventDefault();
          setShowSettingsPage(false);
          return;
        }
        if (
          isLocalMode &&
          (e.phase === 'PLAYING' || e.phase === 'COUNTDOWN' || e.phase === 'PAUSED')
        ) {
          ev.preventDefault();
          handlePause();
        }
        return;
      }

      if (
        !showAuthOverlayRef.current &&
        !showEditUsernameRef.current &&
        !showCourtLockerRef.current &&
        !showLeaguesModalRef.current &&
        !showFriendsModalRef.current &&
        !showSettingsPageRef.current &&
        !activeHighlightRef.current &&
        e.phase === 'TITLE' &&
        isLocalMode &&
        (!target || !target.closest('button, a, [role="button"]')) &&
        (ev.code === 'Enter' || ev.code === 'Space')
      ) {
        ev.preventDefault();
        startLocalContest(
          e.mode === 'FAST_BREAK'
            ? 'FAST_BREAK'
            : e.mode === 'HEAT_CHECK'
              ? 'HEAT_CHECK'
              : e.mode === 'PRACTICE'
                ? 'PRACTICE'
                : 'SOLO'
        );
        return;
      }

      if (e.phase === 'COUNTDOWN' && isLocalMode && ev.code === 'Space') {
        ev.preventDefault();
        e.countdownTimer = 0;
        e.phase = 'PLAYING';
        soundEngine.playWhistle();
        triggerMatchStartHaptic();
        syncHud();
        return;
      }

      if (
        !activeHighlightRef.current &&
        !showEditUsernameRef.current &&
        e.phase === 'GAME_OVER' &&
        isLocalMode &&
        (ev.code === 'Enter' || ev.code === 'Space')
      ) {
        if (performance.now() - e.gameOverTimestamp > 450) {
          ev.preventDefault();
          startLocalContest(
            e.mode === 'FAST_BREAK'
              ? 'FAST_BREAK'
              : e.mode === 'HEAT_CHECK'
                ? 'HEAT_CHECK'
                : e.mode === 'PRACTICE'
                  ? 'PRACTICE'
                  : 'SOLO'
          );
        }
        return;
      }

      if (e.phase === 'PLAYING' && ev.code === 'Space') {
        ev.preventDefault();
        beginShotGather();
      }
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        releaseShot();
      }
    };

    const onBlur = () => {
      const e = engineRef.current;
      activeShotPointerIdRef.current = null;
      e.isHoldingShot = false;
      e.gatherBuffered = false;
      e.gatherAmount = 0;
    };

    const onVisibilityChange = () => {
      const hidden = document.hidden;
      soundEngine.handleVisibilityChange(hidden);
      if (hidden) {
        hiddenSinceRef.current = Date.now();
        saveLastVisitAt(Date.now());
        const e = engineRef.current;
        activeShotPointerIdRef.current = null;
        e.isHoldingShot = false;
        e.gatherBuffered = false;
        e.gatherAmount = 0;
        if (
          (e.mode === 'SOLO' ||
            e.mode === 'FAST_BREAK' ||
            e.mode === 'HEAT_CHECK' ||
            e.mode === 'PRACTICE') &&
          (e.phase === 'PLAYING' || e.phase === 'COUNTDOWN')
        ) {
          e.phase = 'PAUSED';
          syncHud();
        }
      } else {
        const awayMs = hiddenSinceRef.current !== null ? Date.now() - hiddenSinceRef.current : 0;
        hiddenSinceRef.current = null;
        if (awayMs >= LONG_AWAY_THRESHOLD_MS && engineRef.current.phase === 'TITLE') {
          arenaRenderedFramesRef.current = 0;
          arenaReadyMarkedRef.current = false;
          setLoadingChecklist({
            fontsReady: false,
            arenaReady: false,
            accountReady: auth.currentUser === null,
            lobbyReady: wsConnectedRef.current,
          });
          setLoadingState({ visible: true, reason: 'LONG_AWAY' });
          setLoadingRunId((id) => id + 1);
        } else {
          saveLastVisitAt(Date.now());
        }
      }
    };

    const onFirstGestureUnlock = () => {
      soundEngine.unlock();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('touchstart', onFirstGestureUnlock, { passive: true, capture: true });
    window.addEventListener('pointerdown', onFirstGestureUnlock, { passive: true, capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('touchstart', onFirstGestureUnlock, { capture: true });
      window.removeEventListener('pointerdown', onFirstGestureUnlock, { capture: true });
    };
  }, [beginShotGather, handlePause, handleToggleMute, releaseShot, startLocalContest, syncHud]);

  // Main 60fps simulation & render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const canvas = canvasRef.current;
      const e = engineRef.current;

      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const isMobileTouch =
          rect.width < 900 ||
          (typeof window.matchMedia === 'function' &&
            window.matchMedia('(pointer: coarse)').matches);
        const maxDpr = isMobileTouch ? 1.75 : 2;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const targetW = Math.max(1, Math.round(rect.width * dpr));
        const targetH = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          e.clockTime += dt;

          // Arena flashbulbs
          e.flashSpawnTimer -= dt;
          if (e.flashSpawnTimer <= 0) {
            const freq = e.streak >= 3 || (e.phase === 'PLAYING' && e.timeLeft <= 10) ? 0.22 : 0.65;
            e.flashSpawnTimer = freq + Math.random() * freq;
            e.flashbulbs.push({
              x: 0.06 + Math.random() * 0.88,
              y: 0.15 + Math.random() * 0.24,
              life: 0.24,
              maxLife: 0.24,
              size: 16 + Math.random() * 20,
            });
          }
          for (let i = e.flashbulbs.length - 1; i >= 0; i--) {
            e.flashbulbs[i].life -= dt;
            if (e.flashbulbs[i].life <= 0) e.flashbulbs.splice(i, 1);
          }

          if (e.phase === 'TITLE') {
            const sway = Math.sin(e.clockTime * 0.35);
            const swayCos = Math.cos(e.clockTime * 0.35);
            e.hoopPos = { ...HOOP_POS };
            e.hoopTargetPos = { ...HOOP_POS };

            let rackIdx = 2;
            let desiredPos = {
              x: RACK_CONFIGS[2].camPos.x + sway * 4.5,
              y: RACK_CONFIGS[2].camPos.y + swayCos * 1.4,
              z: RACK_CONFIGS[2].camPos.z + 0.35,
            };
            let desiredTarget = { x: sway * 0.8, y: 0, z: 9.2 };
            let desiredFocal = 1.0;

            if (e.mode === 'FAST_BREAK') {
              rackIdx = 1;
              const r1 = RACK_CONFIGS[1];
              desiredPos = {
                x: r1.camPos.x + sway * 3.4 - 1.5,
                y: r1.camPos.y + 1.2 + swayCos * 1.2,
                z: r1.camPos.z + 0.95,
              };
              desiredTarget = { x: sway * 0.6, y: 0.4, z: 9.4 };
              desiredFocal = 0.94;
            } else if (e.mode === 'HEAT_CHECK') {
              rackIdx = 2;
              desiredPos = {
                x: sway * 6.5,
                y: 31.5 + swayCos * 1.6,
                z: 11.4,
              };
              desiredTarget = { x: sway * 1.1, y: 2.0, z: 9.8 };
              desiredFocal = 0.92;
            } else if (e.mode === 'PRACTICE') {
              rackIdx = 4;
              const r4 = RACK_CONFIGS[4];
              desiredPos = {
                x: r4.camPos.x + sway * 2.8 + 1.2,
                y: r4.camPos.y + swayCos * 1.1,
                z: r4.camPos.z - 0.1,
              };
              desiredTarget = { x: sway * 0.5, y: 0, z: 9.3 };
              desiredFocal = 1.06;
            } else if (e.mode === 'PVP') {
              rackIdx = 2;
              desiredPos = {
                x: sway * 7.2,
                y: 33.8 + swayCos * 1.5,
                z: 9.6,
              };
              desiredTarget = { x: sway * 0.9, y: 0, z: 9.4 };
              desiredFocal = 0.90;
            }

            const titleLerp = 1 - Math.exp(-5.0 * dt);
            e.camera.pos.x += (desiredPos.x - e.camera.pos.x) * titleLerp;
            e.camera.pos.y += (desiredPos.y - e.camera.pos.y) * titleLerp;
            e.camera.pos.z += (desiredPos.z - e.camera.pos.z) * titleLerp;
            e.camera.target.x += (desiredTarget.x - e.camera.target.x) * titleLerp;
            e.camera.target.y += (desiredTarget.y - e.camera.target.y) * titleLerp;
            e.camera.target.z += (desiredTarget.z - e.camera.target.z) * titleLerp;
            e.camera.focalLength += (desiredFocal - e.camera.focalLength) * titleLerp;
            e.cameraSnapZoom = 0;

            const showcaseRack = RACK_CONFIGS[rackIdx];
            e.shooterPos.x += (showcaseRack.x - e.shooterPos.x) * titleLerp;
            e.shooterPos.y += (showcaseRack.y - e.shooterPos.y) * titleLerp;
            e.shooterPos.z = 0;
            const sfx = -e.shooterPos.x;
            const sfy = -e.shooterPos.y;
            const sfLen = Math.hypot(sfx, sfy) || 1;
            e.shooterFacing = { x: sfx / sfLen, y: sfy / sfLen };
            e.isMovingToRack = false;
            e.runBlend = 0;
            e.gatherAmount = 0;
            e.followThroughAmount = 0;
            e.shooterAnimState = 'DRIBBLING';
            e.dribbleBlend = 1;
            e.stamina = 100;
            e.shooterLabelAlpha += (1 - e.shooterLabelAlpha) * (1 - Math.exp(-8 * dt));
          } else if (e.phase !== 'PAUSED') {
            const isActiveShooting =
              e.phase === 'PLAYING' &&
              (e.isHoldingShot ||
                e.gatherBuffered ||
                e.gatherAmount > 0.04 ||
                e.followThroughAmount > 0.04 ||
                e.shooterZ > 0.04 ||
                e.meterFeedbackTimer > 0 ||
                e.gatherCooldown > 0);
            const targetLabelAlpha =
              e.phase === 'PLAYING' ? (isActiveShooting ? 0 : 0.88) : 1;
            const labelLerpRate = targetLabelAlpha < e.shooterLabelAlpha ? 11.5 : 3.2;
            e.shooterLabelAlpha +=
              (targetLabelAlpha - e.shooterLabelAlpha) *
              (1 - Math.exp(-labelLerpRate * dt));
            const isLocalContest =
              e.mode === 'SOLO' ||
              e.mode === 'FAST_BREAK' ||
              e.mode === 'HEAT_CHECK' ||
              e.mode === 'PRACTICE';

            // Local contest countdown
            if (e.phase === 'COUNTDOWN' && isLocalContest) {
              const prevCeil = Math.ceil(e.countdownTimer);
              e.countdownTimer -= dt * 1.1;
              const nextCeil = Math.ceil(e.countdownTimer);
              if (nextCeil !== prevCeil && nextCeil > 0) {
                soundEngine.playTick(false);
                syncHud();
              }
              if (e.countdownTimer <= 0) {
                e.countdownTimer = 0;
                e.phase = 'PLAYING';
                soundEngine.playWhistle();
                triggerMatchStartHaptic();
                syncHud();
              }
            }

            // Active Play Clock (Fast-Break counts up; Heat Check & Practice unclocked)
            if (e.phase === 'PLAYING' && !e.contestShootingClosed && e.mode === 'FAST_BREAK') {
              e.fastBreakElapsedMs += dt * 1000;
            } else if (
              e.phase === 'PLAYING' &&
              !e.contestShootingClosed &&
              e.mode !== 'HEAT_CHECK' &&
              e.mode !== 'PRACTICE'
            ) {
              e.timeLeft -= dt;
              const sec = Math.ceil(e.timeLeft);
              if (sec <= 5 && sec >= 1 && sec < e.lastTickSecond) {
                e.lastTickSecond = sec;
                soundEngine.playTick(sec <= 2);
              }

              if (e.timeLeft <= 0) {
                e.timeLeft = 0;
                e.contestShootingClosed = true;
                e.isHoldingShot = false;
                e.gatherBuffered = false;
                e.gatherAmount = 0;
                e.finishGraceTimer = 0.75;
                soundEngine.playBuzzer(e.currentRack, e.streak);
                triggerBuzzerHaptic();
                syncHud();
              }
            }

            // Heat Check Dynamic Moving Hoop
            if (e.mode === 'HEAT_CHECK' && e.phase === 'PLAYING' && !e.contestShootingClosed) {
              e.heatCheckShiftTimer -= dt;
              if (e.heatCheckShiftTimer <= 0) {
                e.hoopTargetPos = pickNextHeatCheckHoopTarget(e.hoopTargetPos);
                e.heatCheckShiftTimer = Math.max(3.6, 5.8 - Math.min(2.0, e.streak * 0.18));
                spawnParticles(
                  e,
                  { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z + 0.3 },
                  10,
                  '#F59E0B',
                  6.2
                );
                addCallout(
                  e,
                  'HOOP SHIFT!',
                  '#FDE047',
                  {
                    x: e.hoopTargetPos.x,
                    y: e.hoopTargetPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
                    z: e.hoopTargetPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
                  },
                  undefined,
                  true
                );
              }

              // Add subtle continuous sway on high streaks on top of periodic shifts
              const swayAmp = e.streak >= 4 ? Math.min(1.6, 0.35 + (e.streak - 4) * 0.18) : 0;
              const goalX = e.hoopTargetPos.x + Math.sin(e.clockTime * 1.45) * swayAmp;
              const goalY = e.hoopTargetPos.y + Math.cos(e.clockTime * 1.1) * (swayAmp * 0.45);
              const goalZ = e.hoopTargetPos.z + Math.sin(e.clockTime * 1.8) * (swayAmp * 0.16);
              const hoopLerp = 1 - Math.exp(-3.4 * dt);
              e.hoopPos.x += (goalX - e.hoopPos.x) * hoopLerp;
              e.hoopPos.y += (goalY - e.hoopPos.y) * hoopLerp;
              e.hoopPos.z += (goalZ - e.hoopPos.z) * hoopLerp;
            }

            // Shooter jump, grounded toe-rise pre-release, follow-through, and soft landing absorption
            if (e.shooterZ > 0 || e.shooterVelZ > 0) {
              const wasAirborne = e.shooterZ > 0.04;
              e.shooterVelZ -= 32 * dt;
              e.shooterZ += e.shooterVelZ * dt;
              if (e.shooterZ <= 0) {
                e.shooterZ = 0;
                e.shooterVelZ = 0;
                if (wasAirborne) {
                  e.landingSquat = 0.78;
                  const nextRackPos = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
                  const distOnLand = Math.hypot(
                    nextRackPos.x - e.shooterPos.x,
                    nextRackPos.y - e.shooterPos.y
                  );
                  if (
                    distOnLand <= 0.12 &&
                    !e.contestShootingClosed &&
                    e.currentBall < getRackBallCount(e.currentRack)
                  ) {
                    e.ballPickupTimer = 0.18;
                  }
                }
              }
            }
            if (e.landingSquat > 0) {
              e.landingSquat = Math.max(0, e.landingSquat - dt * 3.6);
            }
            if (e.ballPickupTimer > 0) {
              e.ballPickupTimer = Math.max(0, e.ballPickupTimer - dt);
            }
            if (e.sprintDelayTimer > 0) {
              e.sprintDelayTimer = Math.max(0, e.sprintDelayTimer - dt);
            }
            if (e.followThroughAmount > 0) {
              e.followThroughAmount = Math.max(0, e.followThroughAmount - dt * 1.75);
            }
            if (e.gatherCooldown > 0) {
              e.gatherCooldown = Math.max(0, e.gatherCooldown - dt);
            }
            if (e.rackMoveTimer > 0) {
              e.rackMoveTimer = Math.max(0, e.rackMoveTimer - dt);
            }
            if (e.meterFeedbackTimer > 0) {
              e.meterFeedbackTimer = Math.max(0, e.meterFeedbackTimer - dt);
            }
            if (e.secondWindFlashTimer > 0) {
              e.secondWindFlashTimer = Math.max(0, e.secondWindFlashTimer - dt);
            }

            // Stick-figure athletic rack-to-rack running along 3-point perimeter / court chord
            const targetRack = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
            const dxRack = targetRack.x - e.shooterPos.x;
            const dyRack = targetRack.y - e.shooterPos.y;
            const distToRack = Math.hypot(dxRack, dyRack);
            const readyToSprint = distToRack > 0.12 && e.sprintDelayTimer <= 0 && e.shooterZ <= 0.14;

            if (distToRack > 0.16 || e.rackMoveTimer > 0) {
              e.isHoldingShot = false;
              e.gatherBuffered = false;
              e.gatherAmount = 0;
              e.meterValue = 0;
            }

            if (readyToSprint) {
              e.isMovingToRack = true;
              e.runBlend = Math.min(1, e.runBlend + dt * 12);
              if (e.mode !== 'PRACTICE') {
                const drainRate = distToRack > 28 ? 22 : 30;
                e.stamina = Math.max(0, e.stamina - drainRate * dt);
                if (e.phase === 'PLAYING') {
                  e.staminaMinObserved = Math.min(e.staminaMinObserved, e.stamina);
                }
              }
              const curAngle = Math.atan2(e.shooterPos.y, e.shooterPos.x);
              const tgtAngle = Math.atan2(targetRack.y, targetRack.x);
              const curRadius = Math.hypot(e.shooterPos.x, e.shooterPos.y);
              const tgtRadius = Math.hypot(targetRack.x, targetRack.y);
              const angleDiff = tgtAngle - curAngle;

              // Smooth sprint acceleration out of landing & plant-step deceleration into rack
              const decelFactor = Math.max(0.28, Math.min(1, distToRack / 3.2));
              const speedCurve = (0.45 + 0.55 * e.runBlend) * decelFactor;

              let nextX = e.shooterPos.x;
              let nextY = e.shooterPos.y;

              if (Math.abs(angleDiff) < 1.35 && curRadius > 16 && tgtRadius > 16 && tgtRadius < 29 && curRadius < 29) {
                // Sprint along the 3-point arc between adjacent perimeter racks
                const runSpeedFt = 23.2 * speedCurve;
                const arcStep = Math.min(distToRack, runSpeedFt * dt);
                const angularStep = arcStep / Math.max(curRadius, 18);
                const newAngle =
                  Math.abs(angleDiff) <= angularStep
                    ? tgtAngle
                    : curAngle + Math.sign(angleDiff) * angularStep;
                const frac = Math.min(1, arcStep / Math.max(0.01, distToRack));
                const newRadius = curRadius + (tgtRadius - curRadius) * frac;
                nextX = Math.cos(newAngle) * newRadius;
                nextY = Math.sin(newAngle) * newRadius;
              } else {
                // Sprint directly across court (e.g. Right Corner to Half Court or Half Court back to Left Corner)
                const runSpeedFt = (distToRack > 28 ? 33.0 : 28.0) * speedCurve;
                const step = Math.min(distToRack, runSpeedFt * dt);
                nextX = e.shooterPos.x + (dxRack / distToRack) * step;
                nextY = e.shooterPos.y + (dyRack / distToRack) * step;
              }

              const moveDx = nextX - e.shooterPos.x;
              const moveDy = nextY - e.shooterPos.y;
              const stepDist = Math.hypot(moveDx, moveDy);
              e.shooterPos.x = nextX;
              e.shooterPos.y = nextY;
              const prevRunPhase = e.runPhase;
              e.runPhase += stepDist * 0.78;

              if (stepDist > 0.005) {
                const vx = moveDx / stepDist;
                const vy = moveDy / stepDist;
                // Begin pivoting toward hoop during final 2.4 ft deceleration plant
                const hdxTurn = e.hoopPos.x - e.shooterPos.x;
                const hdyTurn = e.hoopPos.y - e.shooterPos.y;
                const hLenTurn = Math.hypot(hdxTurn, hdyTurn) || 1;
                const turnBlend = distToRack < 2.4 ? (2.4 - distToRack) / 2.4 : 0;
                const desiredFx = vx * (1 - turnBlend * 0.72) + (hdxTurn / hLenTurn) * (turnBlend * 0.72);
                const desiredFy = vy * (1 - turnBlend * 0.72) + (hdyTurn / hLenTurn) * (turnBlend * 0.72);
                const turnLerp = 1 - Math.exp(-15 * dt);
                e.shooterFacing.x += (desiredFx - e.shooterFacing.x) * turnLerp;
                e.shooterFacing.y += (desiredFy - e.shooterFacing.y) * turnLerp;
                const fl = Math.hypot(e.shooterFacing.x, e.shooterFacing.y) || 1;
                e.shooterFacing.x /= fl;
                e.shooterFacing.y /= fl;

                // Sneaker court scuff dust puffs + tactile footstep synced to actual foot-strike zero crossings
                const prevSin = Math.sin(prevRunPhase);
                const curSin = Math.sin(e.runPhase);
                const footStrikeSide =
                  prevSin <= 0 && curSin > 0 ? 1 : prevSin >= 0 && curSin < 0 ? -1 : 0;
                if (footStrikeSide !== 0) {
                  triggerFootstepHaptic();
                  const latX = -vy * footStrikeSide * 0.42;
                  const latY = vx * footStrikeSide * 0.42;
                  for (let puff = 0; puff < 2; puff++) {
                    e.particles.push({
                      x: e.shooterPos.x + latX - vx * 0.25 + (Math.random() - 0.5) * 0.22,
                      y: e.shooterPos.y + latY - vy * 0.25 + (Math.random() - 0.5) * 0.22,
                      z: 0.1,
                      vx: -vx * (1.2 + puff * 0.6) + (Math.random() - 0.5) * 0.8,
                      vy: -vy * (1.2 + puff * 0.6) + (Math.random() - 0.5) * 0.8,
                      vz: 0.75 + Math.random() * 0.65,
                      life: 0.26,
                      maxLife: 0.26,
                      size: 0.48 + puff * 0.16,
                      color: 'rgba(244, 239, 230, 0.52)',
                      gravity: 2.6,
                    });
                  }
                }
              }
            } else if (distToRack <= 0.12) {
              const wasMoving = e.isMovingToRack;
              e.shooterPos.x = targetRack.x;
              e.shooterPos.y = targetRack.y;
              e.isMovingToRack = false;
              if (wasMoving) {
                e.landingSquat = Math.max(e.landingSquat, 0.38);
                e.ballPickupTimer = Math.max(e.ballPickupTimer, 0.18);
                triggerRackArrivalHaptic();
              }
              e.runBlend = Math.max(0, e.runBlend - dt * 12);
              if (!e.isHoldingShot && e.shooterZ <= 0.05) {
                const prevStamina = e.stamina;
                e.stamina = Math.min(100, e.stamina + 10.5 * dt);
                if (e.phase === 'PLAYING') {
                  e.staminaRecoveredMovement += e.stamina - prevStamina;
                }
              }

              // Turn smoothly back toward hoop upon planting feet at the rack
              const hdx = e.hoopPos.x - e.shooterPos.x;
              const hdy = e.hoopPos.y - e.shooterPos.y;
              const hLen = Math.hypot(hdx, hdy) || 1;
              const turnLerp = 1 - Math.exp(-18 * dt);
              e.shooterFacing.x += (hdx / hLen - e.shooterFacing.x) * turnLerp;
              e.shooterFacing.y += (hdy / hLen - e.shooterFacing.y) * turnLerp;
              const fl = Math.hypot(e.shooterFacing.x, e.shooterFacing.y) || 1;
              e.shooterFacing.x /= fl;
              e.shooterFacing.y /= fl;

              if (
                e.gatherBuffered &&
                e.rackMoveTimer <= 0 &&
                e.sprintDelayTimer <= 0 &&
                e.gatherCooldown <= 0 &&
                e.shooterZ <= 0.06 &&
                e.runBlend <= 0.14
              ) {
                beginShotGather();
              }
            } else {
              // Waiting for follow-through / jump landing before taking off into sprint
              e.isMovingToRack = false;
              e.runBlend = Math.max(0, e.runBlend - dt * 10);
            }

            // Update explicit shooter animation state & dribbling blend
            const hasPendingRackBall =
              e.phase === 'COUNTDOWN' ||
              (e.phase === 'PLAYING' &&
                !e.contestShootingClosed &&
                e.currentBall < getRackBallCount(e.currentRack));
            if (e.isMovingToRack || e.runBlend > 0.14) {
              e.shooterAnimState = 'RUNNING';
            } else if (e.isHoldingShot || e.gatherAmount > 0.05) {
              e.shooterAnimState = 'GATHER';
            } else if (e.shooterZ > 0.08 && e.followThroughAmount > 0.45) {
              e.shooterAnimState = 'RELEASE';
            } else if (e.followThroughAmount > 0.08) {
              e.shooterAnimState = 'FOLLOW_THROUGH';
            } else if (e.landingSquat > 0.08) {
              e.shooterAnimState = 'LANDING';
            } else if (e.ballPickupTimer > 0.02) {
              e.shooterAnimState = 'PICKUP';
            } else {
              e.shooterAnimState = 'DRIBBLING';
            }

            if (e.shooterAnimState === 'DRIBBLING' && hasPendingRackBall) {
              e.dribbleBlend = Math.min(1, e.dribbleBlend + dt * 8.5);
            } else {
              e.dribbleBlend = Math.max(0, e.dribbleBlend - dt * 13);
            }

            // Dynamic camera: 15-sec cinematic court & ball-racks sweep in PVP pre-match intro,
            // or dynamic over-the-shoulder shooter tracking during live play
            if (e.mode === 'PVP' && e.phase === 'COUNTDOWN') {
              e.pvpIntroElapsed = Math.min(15, e.pvpIntroElapsed + dt);
              const cinematicCam = computePvpIntroCamera(e.pvpIntroElapsed);
              const introLerp = 1 - Math.exp(-8.5 * dt);
              e.camera.pos.x += (cinematicCam.pos.x - e.camera.pos.x) * introLerp;
              e.camera.pos.y += (cinematicCam.pos.y - e.camera.pos.y) * introLerp;
              e.camera.pos.z += (cinematicCam.pos.z - e.camera.pos.z) * introLerp;
              e.camera.target.x += (cinematicCam.target.x - e.camera.target.x) * introLerp;
              e.camera.target.y += (cinematicCam.target.y - e.camera.target.y) * introLerp;
              e.camera.target.z += (cinematicCam.target.z - e.camera.target.z) * introLerp;
              e.camera.focalLength += (cinematicCam.focalLength - e.camera.focalLength) * introLerp;
            } else if (e.cameraMode === 'PRO_STATIC') {
              const staticRig = computeRackCameraRig(targetRack, 'PRO_STATIC', {
                x: e.hoopPos.x - HOOP_POS.x,
                y: e.hoopPos.y - HOOP_POS.y,
                z: e.hoopPos.z - HOOP_POS.z,
              });
              const staticLerp = 1 - Math.exp(-16.0 * dt);
              e.camera.pos.x += (staticRig.pos.x - e.camera.pos.x) * staticLerp;
              e.camera.pos.y += (staticRig.pos.y - e.camera.pos.y) * staticLerp;
              e.camera.pos.z += (staticRig.pos.z - e.camera.pos.z) * staticLerp;
              e.camera.target.x += (staticRig.target.x - e.camera.target.x) * staticLerp;
              e.camera.target.y += (staticRig.target.y - e.camera.target.y) * staticLerp;
              e.camera.target.z += (staticRig.target.z - e.camera.target.z) * staticLerp;
              e.cameraSnapZoom = 0;
              e.camera.focalLength += (staticRig.focalLength - e.camera.focalLength) * staticLerp;
            } else {
              const camFollowRate = e.isMovingToRack ? 5.0 : 6.5;
              const camLerp = 1 - Math.exp(-camFollowRate * dt);
              const curSDist = Math.hypot(e.shooterPos.x, e.shooterPos.y) || 1;
              const sux = -e.shooterPos.x / curSDist;
              const suy = -e.shooterPos.y / curSDist;
              const srx = suy;
              const sry = -sux;
              const desiredCamX = e.isMovingToRack
                ? e.shooterPos.x - sux * 8.8 + srx * 1.15
                : targetRack.camPos.x;
              const desiredCamY = e.isMovingToRack
                ? e.shooterPos.y - suy * 8.8 + sry * 1.15
                : targetRack.camPos.y;

              e.camera.pos.x += (desiredCamX - e.camera.pos.x) * camLerp;
              e.camera.pos.y += (desiredCamY - e.camera.pos.y) * camLerp;
              e.camera.pos.z +=
                (targetRack.camPos.z + e.shooterZ * 0.42 - e.camera.pos.z) * camLerp;

              const desiredTargetX = targetRack.camTarget.x + (e.hoopPos.x - HOOP_POS.x) * 0.65;
              const desiredTargetY = targetRack.camTarget.y + (e.hoopPos.y - HOOP_POS.y) * 0.65;
              const desiredTargetZ = targetRack.camTarget.z + (e.hoopPos.z - HOOP_POS.z) * 0.65;
              e.camera.target.x += (desiredTargetX - e.camera.target.x) * camLerp;
              e.camera.target.y += (desiredTargetY - e.camera.target.y) * camLerp;
              e.camera.target.z += (desiredTargetZ - e.camera.target.z) * camLerp;

              if (e.cameraSnapZoom > 0) {
                e.cameraSnapZoom = Math.max(0, e.cameraSnapZoom - dt * 1.45);
              }
              const snapBoost =
                e.cameraSnapZoom > 0 ? Math.pow(e.cameraSnapZoom, 0.45) * 0.135 : 0;
              const targetFocal = 1.0 + snapBoost;
              const focalRate = targetFocal > e.camera.focalLength ? 28 : 7.5;
              const focalLerp = 1 - Math.exp(-focalRate * dt);
              e.camera.focalLength += (targetFocal - e.camera.focalLength) * focalLerp;
            }

            if (
              e.isHoldingShot &&
              e.phase === 'PLAYING' &&
              !e.contestShootingClosed &&
              !e.isMovingToRack &&
              distToRack <= 0.16
            ) {
              const diff =
                e.mode === 'PRACTICE'
                  ? DIFFICULTY_TIERS[0]
                  : getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
              e.meterValue += diff.meterSpeed * e.shotSensitivity * dt;
              e.gatherAmount = Math.min(1, e.meterValue / METER_PERFECT_CENTER);
              const perfStart = METER_PERFECT_CENTER - diff.perfectHalfWindow;
              const perfEnd = METER_PERFECT_CENTER + diff.perfectHalfWindow;
              if (!e.perfectZoneHapticFired && e.meterValue >= perfStart && e.meterValue <= perfEnd) {
                e.perfectZoneHapticFired = true;
                triggerPerfectZoneCueHaptic();
              }
              if (e.meterValue >= 1.07) {
                releaseShot();
              }
            } else if (!e.isHoldingShot) {
              e.gatherAmount = Math.max(0, e.gatherAmount - dt * 6);
            }

            // Update Wind Simulation (calm in Practice; climbs smoothly with streak otherwise)
            if (e.mode === 'PRACTICE') {
              e.windMph = 0;
              e.windVec.x = 0;
              e.windVec.y = 0;
            } else {
              const baseMph = e.streak === 0 ? 0.45 : Math.min(8.5, 0.9 + e.streak * 0.82);
              const gust = Math.sin(e.clockTime * 1.35) * (e.streak >= 3 ? 0.45 : 0.15);
              const targetMph = Math.max(0.3, Math.min(8.8, baseMph + gust));
              e.windMph += (targetMph - e.windMph) * (1 - Math.exp(-3.2 * dt));
              e.windShiftTimer -= dt;
              if (e.windShiftTimer <= 0) {
                e.windShiftTimer = 6.5 + Math.random() * 3.5;
                e.windTargetAngle += (Math.random() - 0.5) * 1.8;
              }
              e.windAngle += (e.windTargetAngle - e.windAngle) * (1 - Math.exp(-1.6 * dt));
              const windAccel = e.windMph * 0.044;
              e.windVec.x = Math.cos(e.windAngle) * windAccel;
              e.windVec.y = Math.sin(e.windAngle) * windAccel;
            }

            // Step Basketballs
            for (const ball of e.activeBalls) {
              const wasResolved = ball.hasResolved;
              const prevPos: Vec3 = { ...ball.pos };
              stepBallPhysics(
                ball,
                dt,
                {
                onRimHit: (b, impact) => {
                  if (b.isRemote) return;
                  if (!b.rimHitTimes) b.rimHitTimes = [];
                  b.rimHitTimes.push(b.age);
                  soundEngine.playRimClank(Math.min(1.4, impact / 10));
                  triggerRimHitHaptic(impact);
                  e.rimShake = Math.min(1, e.rimShake + (b.rimHang ? 0.35 : 0.65));
                  e.screenShake = Math.min(0.45, e.screenShake + (b.rimHang ? 0.06 : 0.14));
                  const rimSkinCfg = getBallSkinConfig(b.ballSkin ?? e.ballSkin);
                  if (rimSkinCfg.alwaysTrail && impact >= 3.2) {
                    spawnParticles(
                      e,
                      { x: b.pos.x, y: b.pos.y, z: b.pos.z },
                      6,
                      rimSkinCfg.palette.rimSparkColors,
                      5.4,
                      {
                        shape: 'spark',
                        glowColor: rimSkinCfg.palette.glowHex,
                      }
                    );
                  }
                },
                onRimHangStart: (b) => {
                  if (b.isRemote) return;
                  triggerRimHangHaptic();
                  addCallout(
                    e,
                    'RIM HANG...',
                    '#FEF08A',
                    {
                      x: e.hoopPos.x,
                      y: e.hoopPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
                      z: e.hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
                    },
                    'HOLD YOUR BREATH',
                    true
                  );
                },
                onBackboardHit: (b) => {
                  if (b.isRemote) return;
                  soundEngine.playBackboard();
                },
                onScore: (b) => {
                  if (b.isRemote) {
                    e.netWhip = Math.max(e.netWhip, 0.55);
                    return;
                  }

                  const slotIdx = getSlotIndex(b.rackIndex, b.ballIndex);
                  const slot = e.ballsRecord[slotIdx];
                  const prevDiff = getDifficultyForStreak(e.streak);

                  const isCleanSwish = b.hitRimCount === 0 && !b.hitBackboard;
                  const basePts = b.isMoney ? 2 : 1;
                  const activeMult = e.multiplier;
                  const pointsEarned = basePts * activeMult;

                  e.score += pointsEarned;
                  e.streak += 1;
                  if (e.streak > e.bestStreak) e.bestStreak = e.streak;
                  e.multiplier += 1;
                  e.madeCount += 1;
                  e.resolvedLocalCount += 1;
                  if (isCleanSwish) e.swishCount += 1;
                  if (b.isMoney) e.moneyMadeCount += 1;

                  const prevAllTimeBest = e.career.allTimeBestStreak;
                  if (e.mode !== 'PRACTICE') {
                    if (e.score > e.sessionBestScore) e.sessionBestScore = e.score;
                    if (e.bestStreak > e.sessionBestStreak) e.sessionBestStreak = e.bestStreak;
                    e.career.totalShotsMade += 1;
                    e.career.totalShotsAttempted += 1;
                    e.career.totalSwishTrackedAttempts += 1;
                    if (isCleanSwish) e.career.totalSwishes += 1;
                    e.career.totalCareerScore += pointsEarned;
                    if (e.streak > e.career.allTimeBestStreak) {
                      e.career.allTimeBestStreak = e.streak;
                    }
                    if (e.score > e.bestScore) {
                      e.bestScore = e.score;
                      e.career.bestScore = e.score;
                      e.isNewBest = true;
                    }
                    persistCareer(e.career);

                    if (!e.recordBrokenThisRun && e.streak > e.streakRecordBaseline) {
                      e.recordBrokenThisRun = true;
                      triggerRecordStreakCrowdReaction(
                        e,
                        e.streak,
                        prevAllTimeBest,
                        b.rackIndex
                      );
                    }
                  }

                  if (slot) {
                    slot.status = 'MADE';
                    slot.outcome = isCleanSwish ? 'SWISH' : 'MAKE';
                    slot.pointsAwarded = pointsEarned;
                    slot.multiplierUsed = activeMult;
                  }
                  const chartMake = e.shotChart.find((entry) => entry.id === b.id);
                  if (chartMake) {
                    chartMake.status = 'MADE';
                    chartMake.isSwish = isCleanSwish;
                    chartMake.pointsAwarded = pointsEarned;
                  }

                  if (e.mode === 'PVP') {
                    pvpClient.sendShotResolved(b.rackIndex, b.ballIndex, true, isCleanSwish);
                  }

                  e.netWhip = 1.0;
                  e.netWhipPhase = Math.random() * Math.PI * 2;
                  e.screenShake = Math.min(0.5, e.screenShake + (b.isMoney ? 0.25 : 0.12));

                  soundEngine.playSwish(b.isMoney, e.streak, isCleanSwish, b.rackIndex);
                  if (isCleanSwish || b.isMoney || b.isBuzzerBeater) {
                    triggerSwishHaptic(
                      b.timingQualityAtRelease === 'PERFECT',
                      b.isMoney,
                      b.isBuzzerBeater
                    );
                  }
                  const scoreSkinCfg = getBallSkinConfig(b.ballSkin ?? e.ballSkin);
                  spawnParticles(
                    e,
                    { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z - 0.5 },
                    b.isMoney ? 22 : scoreSkinCfg.alwaysTrail ? 18 : 14,
                    scoreSkinCfg.alwaysTrail
                      ? scoreSkinCfg.palette.scoreBurstColors
                      : b.isMoney
                        ? '#F59E0B'
                        : isCleanSwish
                          ? '#34D399'
                          : '#F9631C',
                    b.isMoney ? 9.2 : 7.4,
                    scoreSkinCfg.alwaysTrail
                      ? {
                          shape: scoreSkinCfg.palette.releaseBurstShape,
                          glowColor: scoreSkinCfg.palette.glowHex,
                        }
                      : undefined
                  );

                  const label = b.isBuzzerBeater
                    ? `BUZZER BEATER! +${pointsEarned}`
                    : b.hadRimHang
                      ? `SHOOTER’S ROLL! +${pointsEarned}`
                      : b.isMoney
                        ? `MONEY BALL! +${pointsEarned}`
                        : isCleanSwish
                          ? `SWISH! +${pointsEarned}`
                          : `GOOD! +${pointsEarned}`;
                  const sub =
                    activeMult > 1
                      ? `${activeMult}x MULTIPLIER · NEXT ${e.multiplier}x`
                      : `NEXT SHOT ${e.multiplier}x`;
                  addCallout(
                    e,
                    label,
                    b.isMoney ? '#FEF08A' : isCleanSwish ? '#6EE7B7' : '#FFFFFF',
                    {
                      x: e.hoopPos.x,
                      y: e.hoopPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
                      z: e.hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
                    },
                    sub,
                    true
                  );

                  const nextDiff = getDifficultyForStreak(e.streak);
                  if (e.mode !== 'PRACTICE' && nextDiff.level > prevDiff.level) {
                    soundEngine.playDifficultyUp(nextDiff.level);
                    addCallout(
                      e,
                      `${nextDiff.label.toUpperCase()}!`,
                      '#FDBA74',
                      { x: e.shooterPos.x, y: e.shooterPos.y, z: 9.2 },
                      `DIFFICULTY LV.${nextDiff.level} · FASTER METER`
                    );
                  }

                  const priorityScore =
                    (b.isBuzzerBeater ? 1000 : 0) +
                    (b.hadRimHang ? 700 : 0) +
                    pointsEarned * 18 +
                    (isCleanSwish ? 120 : 0) +
                    (b.timingQualityAtRelease === 'PERFECT' ? 90 : 0) +
                    e.streak * 25 +
                    (b.isMoney ? 80 : 0);
                  b.highlightScoreAtTime = b.age;
                  b.highlightMeta = {
                    pointsAwarded: pointsEarned,
                    multiplier: activeMult,
                    streakAtMake: e.streak,
                    isCleanSwish,
                    priorityScore,
                  };
                  if (e.lastShotTrajectory && e.lastShotTrajectory.ballId === b.id) {
                    e.lastShotTrajectory.outcome = 'MADE';
                    e.lastShotTrajectory.hoopPos = { ...e.hoopPos };
                  }

                  syncHud();
                },
                onMiss: (b) => {
                  if (b.isRemote) return;
                  const slotIdx = getSlotIndex(b.rackIndex, b.ballIndex);
                  const slot = e.ballsRecord[slotIdx];
                  if (slot) {
                    slot.status = 'MISSED';
                    slot.outcome = b.intendedOutcome;
                    slot.pointsAwarded = 0;
                  }
                  const chartMiss = e.shotChart.find((entry) => entry.id === b.id);
                  if (chartMiss) {
                    chartMiss.status = 'MISSED';
                    chartMiss.pointsAwarded = 0;
                  }

                  const prevStreak = e.streak;
                  const hadStreak = prevStreak >= 2;
                  e.streak = 0;
                  e.recordBrokenThisRun = false;
                  e.streakRecordBaseline = Math.max(2, e.career.allTimeBestStreak);
                  e.multiplier = 1;
                  e.resolvedLocalCount += 1;
                  if (e.mode !== 'PRACTICE') {
                    e.career.totalShotsAttempted += 1;
                    e.career.totalSwishTrackedAttempts += 1;
                    persistCareer(e.career);
                  }

                  if (e.mode === 'PVP') {
                    pvpClient.sendShotResolved(b.rackIndex, b.ballIndex, false, false);
                  }

                  triggerMissHaptic(hadStreak || e.mode === 'HEAT_CHECK');

                  if (e.mode === 'HEAT_CHECK') {
                    e.contestShootingClosed = true;
                    e.isHoldingShot = false;
                    e.gatherBuffered = false;
                    e.gatherAmount = 0;
                    e.finishGraceTimer = 0.72;
                    soundEngine.playCrowdGroan(b.rackIndex, prevStreak);
                    triggerBuzzerHaptic();
                    addCallout(
                      e,
                      'HEAT CHECK ENDED!',
                      '#FECACA',
                      {
                        x: e.hoopPos.x,
                        y: e.hoopPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
                        z: e.hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
                      },
                      prevStreak > 0 ? `FINAL STREAK: ${prevStreak}` : 'STREAK ENDED ON MISS',
                      true
                    );
                  } else if (hadStreak) {
                    soundEngine.playCrowdGroan(b.rackIndex, prevStreak);
                    addCallout(
                      e,
                      'STREAK BROKEN',
                      '#FECACA',
                      {
                        x: e.hoopPos.x,
                        y: e.hoopPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
                        z: e.hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
                      },
                      'MULTIPLIER RESET TO 1x',
                      true
                    );
                  }
                  if (e.lastShotTrajectory && e.lastShotTrajectory.ballId === b.id) {
                    e.lastShotTrajectory.outcome = 'MISSED';
                    e.lastShotTrajectory.hoopPos = { ...e.hoopPos };
                  }
                  syncHud();
                },
              }, e.windVec, e.hoopPos);

              if (!ball.isRemote && e.lastShotTrajectory && e.lastShotTrajectory.ballId === ball.id && !e.lastShotTrajectory.frozen) {
                const arc = e.lastShotTrajectory;
                if (!arc.rimCrossPoint && prevPos.z >= e.hoopPos.z && ball.pos.z <= e.hoopPos.z && ball.vel.z < 0) {
                  const dzSpan = prevPos.z - ball.pos.z;
                  const tCross = dzSpan > 0.0001 ? (prevPos.z - e.hoopPos.z) / dzSpan : 0.5;
                  const crossPt: Vec3 = {
                    x: prevPos.x + (ball.pos.x - prevPos.x) * tCross,
                    y: prevPos.y + (ball.pos.y - prevPos.y) * tCross,
                    z: e.hoopPos.z,
                  };
                  arc.rimCrossPoint = crossPt;
                  arc.points.push(crossPt);
                }
                const lastPt = arc.points[arc.points.length - 1];
                if (!lastPt || Math.hypot(ball.pos.x - lastPt.x, ball.pos.y - lastPt.y, ball.pos.z - lastPt.z) >= 0.55) {
                  arc.points.push({ ...ball.pos });
                }
                if (
                  (ball.hasScored && ball.pos.z < e.hoopPos.z - 1.1) ||
                  (ball.hasResolved && !ball.hasScored && (ball.pos.z < e.hoopPos.z - 1.4 || ball.pos.z <= 0.65)) ||
                  ball.age >= 2.2
                ) {
                  arc.frozen = true;
                }
              }

              if (!ball.isRemote && ball.highlightFrames && ball.age <= 3.6) {
                ball.highlightFrames.push({
                  t: ball.age,
                  x: ball.pos.x,
                  y: ball.pos.y,
                  z: ball.pos.z,
                  spinAngle: ball.spinAngle,
                });
              }

              if (
                !ball.isRemote &&
                e.mode !== 'PRACTICE' &&
                !ball.highlightSaved &&
                ball.hasScored &&
                ball.highlightScoreAtTime !== undefined &&
                (ball.age - ball.highlightScoreAtTime >= 0.65 || ball.age >= 3.5)
              ) {
                tryCommitBallHighlight(e, ball);
              }

              if (!ball.isRemote && !wasResolved && (ball.age < 1.85 || Boolean(ball.rimHang))) {
                const shotStreak =
                  ball.streakAtRelease ?? Math.max(0, ball.multiplierAtRelease - 1);
                const ballSkinCfg = getBallSkinConfig(ball.ballSkin ?? e.ballSkin);
                if (shotStreak >= 3 || ballSkinCfg.alwaysTrail) {
                  spawnBallTrailParticles(e, ball, prevPos, dt, shotStreak);
                }
              }
            }

            if (e.lastShotTrajectory) {
              e.lastShotTrajectory.age += dt;
              if (e.lastShotTrajectory.age >= e.lastShotTrajectory.fadeAfter) {
                e.lastShotTrajectory = null;
              }
            }

            e.activeBalls = e.activeBalls.filter((b) => b.age < 4.6);

            // End-of-contest transition for Solo, Fast-Break & Heat Check (PVP ends via server match_state)
            if (
              (e.mode === 'SOLO' || e.mode === 'FAST_BREAK' || e.mode === 'HEAT_CHECK') &&
              e.phase === 'PLAYING' &&
              e.contestShootingClosed
            ) {
              const unresolved = e.activeBalls.some((b) => !b.isRemote && !b.hasResolved);
              if (!unresolved) {
                e.finishGraceTimer -= dt;
                if (e.finishGraceTimer <= 0) {
                  finalizeContestHighlights(e);
                  e.phase = 'GAME_OVER';
                  e.gameOverTimestamp = performance.now();
                  if (!e.contestCountedInCareer) {
                    e.contestCountedInCareer = true;
                    e.career.contestsPlayed += 1;
                    e.career.totalBestStreakSum += e.bestStreak;
                    e.career.streakTrackedContests += 1;
                    persistCareer(e.career);
                  }
                  if (e.instantReplayEnabled && e.bestContestHighlight) {
                    soundEngine.unlock();
                    setActiveHighlight(e.bestContestHighlight);
                  }
                  syncHud();
                }
              }
            }

            e.netWhip = Math.max(0, e.netWhip - dt * 2.7);
            e.netWhipPhase += dt * 18;
            e.rimShake = Math.max(0, e.rimShake - dt * 4.5);
            e.screenShake = Math.max(0, e.screenShake - dt * 3.8);

            for (let i = e.particles.length - 1; i >= 0; i--) {
              const p = e.particles[i];
              const gravity = p.gravity ?? 20;
              p.vz -= gravity * dt;
              if (p.drag) {
                const damp = Math.pow(p.drag, dt * 60);
                p.vx *= damp;
                p.vy *= damp;
              }
              if (p.shape === 'confetti') {
                p.vx += Math.sin(e.clockTime * 7.5 + (p.rot ?? 0)) * 2.2 * dt;
              }
              if (p.rot !== undefined && p.rotSpeed !== undefined) {
                p.rot += p.rotSpeed * dt;
              }
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;
              p.life -= dt;
              if (p.life <= 0) e.particles.splice(i, 1);
            }

            for (let i = e.callouts.length - 1; i >= 0; i--) {
              e.callouts[i].life -= dt;
              if (e.callouts[i].life <= 0) e.callouts.splice(i, 1);
            }

            if (e.crowdHypeTimer > 0) {
              e.crowdHypeTimer = Math.max(0, e.crowdHypeTimer - dt);
            }
            if (e.crowdReaction) {
              e.crowdReaction.life -= dt;
              if (e.crowdReaction.life <= 0) {
                e.crowdReaction = null;
                syncHud();
              }
            }

            hudTimer += dt;
            if (hudTimer >= 0.065) {
              hudTimer = 0;
              syncHud();
            }
          }

          // Render live court frame
          ctx.save();
          ctx.scale(dpr, dpr);
          const renderState: RenderState = {
            mode: e.mode,
            phase: e.phase,
            camera: e.camera,
            hoopPos: e.hoopPos,
            shooterPos: e.shooterPos,
            shooterZ: e.shooterZ,
            shooterFacing: e.shooterFacing,
            runPhase: e.runPhase,
            runBlend: e.runBlend,
            isMovingToRack: e.isMovingToRack,
            shooterAnimState: e.shooterAnimState,
            dribbleBlend: e.dribbleBlend,
            gatherAmount: e.gatherAmount,
            followThroughAmount: e.followThroughAmount,
            landingSquat: e.landingSquat,
            ballPickupBlend:
              e.ballPickupTimer > 0 ? Math.sin((e.ballPickupTimer / 0.18) * Math.PI) : 0,
            isHoldingShot: e.isHoldingShot,
            meterValue: e.meterValue,
            meterFeedbackTimer: e.meterFeedbackTimer,
            lastReleaseMeter: e.lastReleaseMeter,
            lastReleaseLabel: e.lastReleaseLabel,
            lastReleaseColor: e.lastReleaseColor,
            difficulty:
              e.mode === 'PRACTICE'
                ? DIFFICULTY_TIERS[0]
                : getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina),
            streak: e.streak,
            multiplier: e.multiplier,
            currentRack: e.currentRack,
            currentBall: e.currentBall,
            moneyRack: e.moneyRack,
            ballsRecord: e.ballsRecord,
            activeBalls: e.activeBalls,
            opponentGhost: null,
            particles: e.particles,
            callouts: e.callouts,
            flashbulbs: e.flashbulbs,
            netWhip: e.netWhip,
            netWhipPhase: e.netWhipPhase,
            rimShake: e.rimShake,
            screenShake: e.cameraMode === 'PRO_STATIC' ? 0 : e.screenShake,
            clockTime: e.clockTime,
            timeLeft: e.timeLeft,
            hasShotAnyBall: e.hasShotAnyBall,
            shooterName: playerNameRef.current,
            shooterLabelAlpha: e.shooterLabelAlpha,
            crowdHypeTimer: e.crowdHypeTimer,
            crowdHypeDuration: e.crowdHypeDuration,
            stamina: e.stamina,
            courtTheme: e.courtTheme,
            ballSkin: e.ballSkin,
            sessionBestScore: e.sessionBestScore,
            sessionBestStreak: e.sessionBestStreak,
            lastShotTrajectory: e.shotTrajectoryEnabled ? e.lastShotTrajectory : null,
          };
          renderArena(ctx, rect.width, rect.height, renderState);
          ctx.restore();
          arenaRenderedFramesRef.current += 1;
          if (!arenaReadyMarkedRef.current && arenaRenderedFramesRef.current >= 2) {
            arenaReadyMarkedRef.current = true;
            setLoadingChecklist((prev) => (prev.arenaReady ? prev : { ...prev, arenaReady: true }));
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [beginShotGather, persistCareer, releaseShot, syncHud]);

  const handleCanvasPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    soundEngine.unlock();
    const e = engineRef.current;
    if (
      e.phase === 'COUNTDOWN' &&
      (e.mode === 'SOLO' ||
        e.mode === 'FAST_BREAK' ||
        e.mode === 'HEAT_CHECK' ||
        e.mode === 'PRACTICE')
    ) {
      e.countdownTimer = 0;
      e.phase = 'PLAYING';
      soundEngine.playWhistle();
      triggerMatchStartHaptic();
      syncHud();
      return;
    }
    if (e.phase === 'PLAYING') {
      if (activeShotPointerIdRef.current !== null) return;
      activeShotPointerIdRef.current = ev.pointerId;
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch {
        // Safe fallback on WebKit/Android WebView environments where capture is unsupported
      }
      beginShotGather();
    }
  };

  const handleCanvasPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      activeShotPointerIdRef.current !== null &&
      ev.pointerId !== activeShotPointerIdRef.current
    ) {
      return;
    }
    activeShotPointerIdRef.current = null;
    try {
      if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      }
    } catch {
      // Ignore pointer capture release errors
    }
    releaseShot();
  };

  const waitingRoom =
    hud.pvpMatch && hud.pvpMatch.status === 'WAITING' ? hud.pvpMatch : null;

  const exhaustionFactor =
    hud.phase === 'PLAYING' && hud.stamina < STAMINA_EXHAUSTED_THRESHOLD
      ? Math.max(
          0,
          Math.min(1, (STAMINA_EXHAUSTED_THRESHOLD - hud.stamina) / STAMINA_EXHAUSTED_THRESHOLD)
        )
      : 0;
  const exhaustionBlurPx = exhaustionFactor > 0 ? 0.35 + exhaustionFactor * 1.15 : 0;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0b0c10]">
      <div
        className={`relative h-full transition-all duration-300 ${
          hud.phase === 'TITLE'
            ? 'w-full md:ml-[356px] md:w-[calc(100%-356px)] lg:ml-[368px] lg:w-[calc(100%-368px)] bg-[radial-gradient(circle_at_center,#1a1c23_0%,#0b0c10_100%)]'
            : 'w-full bg-[#0b0c10]'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          style={
            exhaustionBlurPx > 0
              ? { filter: `blur(${exhaustionBlurPx.toFixed(2)}px)` }
              : undefined
          }
          className={`block w-full h-full touch-none cursor-pointer transition-[filter,opacity] duration-300 ${
            hud.phase === 'TITLE' ? 'opacity-65' : 'opacity-100'
          }`}
        />
      </div>

      <AnimatePresence mode="wait">
        {hud.phase === 'TITLE' && (
          <TitleOverlay
            key="title-overlay"
            mode={hud.mode}
            moneyRack={hud.moneyRack}
            career={hud.career}
            muted={hud.muted}
            wsConnected={wsConnected}
            lobbyStats={lobbyStats}
            playerName={playerName}
            userProfile={userProfile}
            myPlayerId={hud.myPlayerId}
            rivalries={hud.rivalries}
            inQueue={inQueue}
            waitingRoom={waitingRoom}
            pvpError={pvpError}
            courtTheme={hud.courtTheme}
            lastHighlight={hud.lastHighlight}
            activeLeague={activeLeague}
            globalRankingsRefreshNonce={globalRankingsRefreshNonce}
            friendsCount={friendships.filter((f) => f.status === 'ACCEPTED').length}
            onlineFriendsCount={
              friendships.filter(
                (f) => f.status === 'ACCEPTED' && friendStatuses[f.friendUid] === 'ONLINE'
              ).length
            }
            incomingFriendRequestsCount={
              friendships.filter((f) => f.status === 'PENDING' && f.isIncoming).length
            }
            hasModalOpen={
              showAuthOverlay ||
              showEditUsername ||
              showCourtLocker ||
              showLeaguesModal ||
              showFriendsModal ||
              showSettingsPage ||
              Boolean(activeHighlight)
            }
            onSelectMode={handleSelectMode}
            onSelectMoneyRack={handleSelectMoneyRack}
            onChangePlayerName={handleChangePlayerName}
            onToggleMute={handleToggleMute}
            onOpenAuth={handleOpenAuth}
            onOpenEditUsername={() => setShowEditUsername(true)}
            onOpenCourtLocker={() => setShowCourtLocker(true)}
            onOpenSettings={() => setShowSettingsPage(true)}
            onOpenHighlightReplay={() => {
              if (hud.lastHighlight) {
                soundEngine.unlock();
                setActiveHighlight(hud.lastHighlight);
              }
            }}
            onOpenLeagues={() => setShowLeaguesModal(true)}
            onOpenFriends={() => setShowFriendsModal(true)}
            onClearActiveLeague={() => setActiveLeague(null)}
            onSignOut={handleSignOut}
            onStartSolo={() => startLocalContest('SOLO')}
            onStartFastBreak={() => startLocalContest('FAST_BREAK')}
            onStartHeatCheck={() => startLocalContest('HEAT_CHECK')}
            onStartPractice={() => startLocalContest('PRACTICE')}
            onJoinQueue={() => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              pvpClient.joinQueue(activeLeague);
            }}
            onLeaveQueue={() => pvpClient.leaveQueue()}
            onCreateRoom={() => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              pvpClient.createRoom(activeLeague);
            }}
            onJoinRoom={(code) => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              pvpClient.joinRoom(code);
            }}
            onLeaveRoom={() => {
              pvpClient.leaveRoom();
              engineRef.current.pvpMatch = null;
              syncHud();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hud.phase === 'TITLE' && inQueue && (
          <FindingOpponentOverlay
            key="finding-opponent"
            playerName={userProfile ? `@${userProfile.username}` : playerName}
            moneyRack={hud.moneyRack}
            career={hud.career}
            lobbyStats={lobbyStats}
            leagueName={queuedLeagueInfo.leagueName ?? activeLeague?.name ?? null}
            leagueId={queuedLeagueInfo.leagueId ?? activeLeague?.id ?? null}
            onCancel={() => {
              pvpClient.leaveQueue();
              setInQueue(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsPage && hud.phase === 'TITLE' && (
          <SettingsPage
            key="settings-page"
            muted={hud.muted}
            audioVolume={hud.audioVolume}
            shotSensitivity={hud.shotSensitivity}
            hapticIntensity={hud.hapticIntensity}
            cameraMode={hud.cameraMode}
            shotTrajectoryEnabled={hud.shotTrajectoryEnabled}
            instantReplayEnabled={hud.instantReplayEnabled}
            courtTheme={hud.courtTheme}
            ballSkin={hud.ballSkin}
            career={hud.career}
            playerName={playerName}
            userProfile={userProfile}
            rivalriesCount={hud.rivalries.length}
            onBack={() => setShowSettingsPage(false)}
            onToggleMute={handleToggleMute}
            onChangeAudioVolume={handleChangeAudioVolume}
            onChangeShotSensitivity={handleChangeShotSensitivity}
            onChangeHapticIntensity={handleChangeHapticIntensity}
            onSetCameraMode={handleSetCameraMode}
            onToggleShotTrajectory={handleToggleShotTrajectory}
            onToggleInstantReplay={handleToggleInstantReplay}
            onSelectBallSkin={handleSelectBallSkin}
            onOpenEditUsername={() => setShowEditUsername(true)}
            onOpenCourtLocker={() => setShowCourtLocker(true)}
            onOpenAuth={handleOpenAuth}
            onSignOut={handleSignOut}
            onResetDefaults={handleResetSettingsToDefaults}
            onClearLocalProgress={handleClearLocalProgress}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeaguesModal && hud.phase === 'TITLE' && (
          <LeaguesModal
            key="pvp-leagues"
            userProfile={userProfile}
            activeLeague={activeLeague}
            rivalries={hud.rivalries}
            onSelectActiveLeague={setActiveLeague}
            onOpenAuth={handleOpenAuth}
            onClose={() => setShowLeaguesModal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCourtLocker && hud.phase === 'TITLE' && (
          <CourtLockerModal
            key="court-locker"
            selectedCourt={hud.courtTheme}
            career={hud.career}
            onSelectCourt={handleSelectCourt}
            onPreviewChant={handlePreviewCourtChant}
            onClose={() => setShowCourtLocker(false)}
          />
        )}
      </AnimatePresence>

      {showAuthOverlay &&
        !loadingState.visible &&
        (hud.phase === 'TITLE' || hud.phase === 'GAME_OVER') && (
          <AuthPage
            mode={
              firebaseUser && !userProfile
                ? profileLoadError
                  ? 'PROFILE_ERROR'
                  : 'USERNAME_SETUP'
                : 'AUTH'
            }
            firebaseUser={firebaseUser}
            career={hud.career}
            profileSyncing={profileSyncing}
            profileLoadError={profileLoadError}
            onRetryProfileLoad={() => {
              const current = auth.currentUser;
              if (current) {
                void syncUserProfileFromAuth(current);
              }
            }}
            onProfileReady={applyAuthenticatedProfile}
            onContinueAsGuest={() => setShowAuthOverlay(false)}
          />
        )}

      <AnimatePresence>
        {loadingState.visible && (
          <LoadingScreen
            key={`app-loading-${loadingRunId}`}
            reason={loadingState.reason}
            checklist={loadingChecklist}
            onComplete={handleLoadingComplete}
          />
        )}
      </AnimatePresence>

      {(hud.phase === 'COUNTDOWN' || hud.phase === 'PLAYING') && (
        <CrowdReactionOverlay reaction={hud.crowdReaction} />
      )}

      <AnimatePresence>
        {(hud.phase === 'COUNTDOWN' || hud.phase === 'PLAYING' || hud.phase === 'PAUSED') &&
          !(hud.mode === 'PVP' && hud.phase === 'COUNTDOWN') && (
            <GameHud
              key="game-hud"
              hud={hud}
              onToggleMute={handleToggleMute}
              onPause={handlePause}
              onToggleInstantReplay={handleToggleInstantReplay}
              onSkipInstantReplay={handleSkipInstantReplay}
            />
          )}
      </AnimatePresence>

      <AnimatePresence>
        {hud.mode === 'PVP' && hud.phase === 'COUNTDOWN' && hud.pvpMatch && (
          <PvpIntroOverlay
            key="pvp-intro-overlay"
            match={hud.pvpMatch}
            myPlayerId={hud.myPlayerId}
            countdownSeconds={hud.countdownValue}
            rivalry={(() => {
              const opp = hud.pvpMatch.players.find((p) => p.id !== hud.myPlayerId);
              if (!opp) return null;
              return hud.rivalries.find((r) => r.opponentKey === normalizeOpponentKey(opp.name)) ?? null;
            })()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hud.phase === 'PAUSED' && (
          <PauseModal
            key="pause-modal"
            mode={hud.mode}
            muted={hud.muted}
            audioVolume={hud.audioVolume}
            shotSensitivity={hud.shotSensitivity}
            hapticIntensity={hud.hapticIntensity}
            cameraMode={hud.cameraMode}
            shotTrajectoryEnabled={hud.shotTrajectoryEnabled}
            displayUsername={userProfile ? `@${userProfile.username}` : playerName}
            onToggleMute={handleToggleMute}
            onChangeAudioVolume={handleChangeAudioVolume}
            onChangeShotSensitivity={handleChangeShotSensitivity}
            onChangeHapticIntensity={handleChangeHapticIntensity}
            onToggleCameraMode={handleToggleCameraMode}
            onToggleShotTrajectory={handleToggleShotTrajectory}
            onOpenEditUsername={() => setShowEditUsername(true)}
            onResume={handlePause}
            onRestart={() =>
              startLocalContest(
                hud.mode === 'FAST_BREAK'
                  ? 'FAST_BREAK'
                  : hud.mode === 'HEAT_CHECK'
                    ? 'HEAT_CHECK'
                    : hud.mode === 'PRACTICE'
                      ? 'PRACTICE'
                      : 'SOLO'
              )
            }
            onQuitToTitle={handleQuitToTitle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFriendsModal && (
          <FriendsModal
            key="friends-modal"
            userProfile={userProfile}
            wsConnected={wsConnected}
            friendships={friendships}
            friendStatuses={friendStatuses}
            rivalries={hud.rivalries}
            activeLeague={activeLeague}
            outgoingInvite={outgoingInvite}
            onAddFriendByUsername={async (targetUsername) => {
              if (!userProfile) {
                throw new Error('Sign in first to add friends.');
              }
              return sendFriendRequestByUsername(
                userProfile.uid,
                userProfile.username,
                targetUsername
              );
            }}
            onAcceptFriendRequest={async (pairId) => {
              if (!userProfile) return;
              await acceptFriendRequest(pairId, userProfile.username);
            }}
            onRemoveFriendship={async (pairId) => {
              await declineOrRemoveFriendship(pairId);
            }}
            onSendMatchInvite={(targetUid, targetName, isRematch) => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              pvpClient.sendMatchInvite({
                targetUid,
                targetName,
                isRematch,
                leagueId: activeLeague?.id ?? null,
                leagueName: activeLeague?.name ?? null,
              });
            }}
            onCancelMatchInvite={(inviteId) => pvpClient.cancelMatchInvite(inviteId)}
            onCreatePrivateRoom={() => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              handleSelectMode('PVP');
              pvpClient.createRoom(activeLeague);
            }}
            onOpenAuth={handleOpenAuth}
            onClose={() => setShowFriendsModal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hud.phase === 'GAME_OVER' && (
          <GameOverModal
            key="game-over-modal"
            hud={hud}
            playerName={userProfile ? `@${userProfile.username}` : playerName}
            myUid={userProfile?.uid ?? null}
            friendships={friendships}
            friendStatuses={friendStatuses}
            outgoingInvite={outgoingInvite}
            onPlayAgain={() =>
              startLocalContest(
                hud.mode === 'FAST_BREAK'
                  ? 'FAST_BREAK'
                  : hud.mode === 'HEAT_CHECK'
                    ? 'HEAT_CHECK'
                    : hud.mode === 'PRACTICE'
                      ? 'PRACTICE'
                      : 'SOLO'
              )
            }
            onRequestRematch={() => pvpClient.requestRematch()}
            onAddFriend={async (targetUid, targetName) => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              await sendFriendRequest(
                userProfile.uid,
                userProfile.username,
                targetUid,
                targetName
              );
            }}
            onAcceptFriend={async (pairId) => {
              if (!userProfile) return;
              await acceptFriendRequest(pairId, userProfile.username);
            }}
            onSendMatchInvite={(targetUid, targetName, isRematch) => {
              if (!userProfile) {
                handleOpenAuth();
                return;
              }
              soundEngine.unlock();
              const c = engineRef.current.career;
              pvpClient.setProfile(
                userProfile.username,
                engineRef.current.moneyRack,
                {
                  wins: c.pvpWins,
                  losses: c.pvpLosses,
                  draws: c.pvpDraws,
                },
                userProfile.uid,
                buildServerProfileStats(c)
              );
              pvpClient.sendMatchInvite({
                targetUid,
                targetName,
                isRematch,
                leagueId: activeLeague?.id ?? null,
                leagueName: activeLeague?.name ?? null,
              });
            }}
            onCancelMatchInvite={(inviteId) => pvpClient.cancelMatchInvite(inviteId)}
            onOpenHighlightReplay={() => {
              if (hud.contestHighlight) {
                soundEngine.unlock();
                setActiveHighlight(hud.contestHighlight);
              }
            }}
            onBackToTitle={handleQuitToTitle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeHighlight && (
          <HighlightReplayModal
            key={`highlight-${activeHighlight.id}-${activeHighlight.recordedAt}`}
            highlight={activeHighlight}
            onClose={() => setActiveHighlight(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditUsername && (
          <EditUsernameModal
            key="edit-username"
            userProfile={userProfile}
            guestName={playerName}
            onSaveAccountProfile={handleUpdatedAccountProfile}
            onSaveGuestName={handleChangePlayerName}
            onOpenAuth={handleOpenAuth}
            onClose={() => setShowEditUsername(false)}
          />
        )}
      </AnimatePresence>

      {/* Global Incoming & Outgoing Direct Match Request Overlays */}
      <AnimatePresence>
        {incomingInvite &&
          (hud.phase === 'TITLE' || hud.phase === 'GAME_OVER' || hud.phase === 'PAUSED') && (
            <motion.div
              key={`incoming-invite-${incomingInvite.inviteId}`}
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              role="dialog"
              aria-label="Incoming Match Request"
              className="fixed top-[max(0.75rem,env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:right-5 sm:w-[380px] z-40 bg-[#05070B] border border-[#00ffaa] rounded-[4px] p-4 shadow-[0_16px_44px_rgba(0,0,0,0.95)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                    <Swords className="w-3.5 h-3.5" />
                    <span>
                      {incomingInvite.isRematch ? 'Rematch Request' : '1v1 Match Request'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] truncate">
                      @{incomingInvite.fromName}
                    </span>
                    <RivalBadgeIcon
                      rivalry={findRivalryForUsername(
                        hud.rivalries,
                        incomingInvite.fromName,
                        userProfile?.username ?? playerName
                      )}
                    />
                  </div>
                  {incomingInvite.leagueName && (
                    <div className="font-mono text-[10px] font-semibold text-[#FEF08A] truncate">
                      League: {incomingInvite.leagueName}
                    </div>
                  )}
                </div>
                <span className="font-mono text-xs font-bold text-[#00ffaa] tabular-nums shrink-0">
                  {Math.max(0, Math.ceil(inviteCountdownMs / 1000))}s
                </span>
              </div>

              <div className="w-full h-1 bg-white/25 rounded-[2px] overflow-hidden mb-3">
                <div
                  className="h-full bg-[#00ffaa] transition-[width] duration-200"
                  style={{
                    width: `${Math.max(0, Math.min(100, (inviteCountdownMs / 45000) * 100))}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    if (userProfile) {
                      const c = engineRef.current.career;
                      pvpClient.setProfile(
                        userProfile.username,
                        engineRef.current.moneyRack,
                        {
                          wins: c.pvpWins,
                          losses: c.pvpLosses,
                          draws: c.pvpDraws,
                        },
                        userProfile.uid,
                        buildServerProfileStats(c)
                      );
                    }
                    pvpClient.respondMatchInvite(incomingInvite.inviteId, true);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm font-extrabold uppercase tracking-wider cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pvpClient.respondMatchInvite(incomingInvite.inviteId, false);
                    setIncomingInvite(null);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-[2px] bg-[#141824] hover:bg-[#240A0E] border border-white/35 hover:border-[#FCA5A5] text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {outgoingInvite &&
          !incomingInvite &&
          (hud.phase === 'TITLE' || hud.phase === 'GAME_OVER') && (
            <motion.div
              key={`outgoing-invite-${outgoingInvite.inviteId}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.18 }}
              className="fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] inset-x-3 sm:inset-x-auto sm:right-5 sm:w-[360px] z-40 bg-[#05070B] border border-[#FDE047] rounded-[4px] p-3.5 shadow-2xl flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FEF08A]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {outgoingInvite.isRematch ? 'Rematch Request Sent' : 'Match Request Sent'} ·{' '}
                    {Math.max(0, Math.ceil(inviteCountdownMs / 1000))}s
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-[#FFFFFF] truncate">
                    Waiting for @{outgoingInvite.toName}...
                  </span>
                  <RivalBadgeIcon
                    rivalry={findRivalryForUsername(
                      hud.rivalries,
                      outgoingInvite.toName,
                      userProfile?.username ?? playerName
                    )}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  pvpClient.cancelMatchInvite(outgoingInvite.inviteId);
                  setOutgoingInvite(null);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-[10px] font-bold uppercase text-[#FFFFFF] cursor-pointer shrink-0"
              >
                Cancel
              </button>
            </motion.div>
          )}
      </AnimatePresence>

      <AnimatePresence>
        {inviteNotice && (
          <motion.div
            key={`invite-notice-${inviteNotice.id}`}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[4px] border shadow-xl flex items-center gap-2.5 max-w-[92vw] ${
              inviteNotice.tone === 'err'
                ? 'bg-[#18070A] border-[#FCA5A5] text-[#FEE2E2]'
                : 'bg-[#05070B] border-[#00ffaa] text-[#00ffaa]'
            }`}
          >
            <span className="font-mono text-xs font-semibold">{inviteNotice.text}</span>
            <button
              type="button"
              onClick={() => setInviteNotice(null)}
              aria-label="Dismiss notification"
              className="p-1 text-[#FFFFFF] hover:text-[#00ffaa] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
