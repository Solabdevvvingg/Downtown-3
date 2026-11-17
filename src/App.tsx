import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { AuthPage } from './components/AuthPage';
import { CrowdReactionOverlay } from './components/CrowdReactionOverlay';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { PauseModal } from './components/PauseModal';
import { TitleOverlay } from './components/TitleOverlay';
import {
  auth,
  fetchUserProfile,
  mergeCareerStats,
  syncCareerStatsToFirestore,
} from './firebase';
import { soundEngine } from './game/audio';
import {
  BALLS_PER_RACK,
  CONTEST_DURATION_SECONDS,
  getDifficultyForStreak,
  getEffectiveDifficulty,
  HOOP_POS,
  METER_PERFECT_CENTER,
  RACK_CONFIGS,
  RACKS_COUNT,
} from './game/constants';
import { computeShotLaunch, stepBallPhysics } from './game/physics';
import { CameraRig } from './game/projection';
import { OpponentShotEvent, pvpClient } from './game/pvpClient';
import { renderArena, RenderState } from './game/renderer';
import { loadCareerStats, saveCareerStats } from './game/storage';
import {
  ActiveBall,
  BallSlotRecord,
  CareerStats,
  CrowdReactionOverlayData,
  Flashbulb,
  FloatingCallout,
  GameMode,
  GamePhase,
  HudSnapshot,
  OpponentGhostState,
  Particle,
  PvpLobbyStats,
  PvpMatchSnapshot,
  TimingBreakdown,
  TimingQuality,
  UserProfile,
  Vec3,
  WindState,
} from './game/types';

function createInitialBallsRecord(moneyRack: number): BallSlotRecord[] {
  const list: BallSlotRecord[] = [];
  for (let r = 0; r < RACKS_COUNT; r++) {
    for (let b = 0; b < BALLS_PER_RACK; b++) {
      const isMoney = r === moneyRack || b === BALLS_PER_RACK - 1;
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
  runStepTimer: number;
  isMovingToRack: boolean;
  stamina: number;
  gatherBuffered: boolean;
  gatherAmount: number;
  followThroughAmount: number;
  gatherCooldown: number;
  rackMoveTimer: number;
  isHoldingShot: boolean;
  meterValue: number;
  meterFeedbackTimer: number;
  lastReleaseMeter: number;
  lastReleaseLabel: string | null;
  lastReleaseColor: string;
  hasShotAnyBall: boolean;

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
  opponentGhost: OpponentGhostState | null;

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

function buildHudSnapshot(e: EngineState): HudSnapshot {
  const difficulty = getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
  return {
    mode: e.mode,
    phase: e.phase,
    score: e.score,
    bestScore: e.bestScore,
    career: { ...e.career },
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
    activeBallsInAir: e.activeBalls.filter((b) => !b.isRemote && !b.hasResolved).length,
    pvpMatch: e.pvpMatch,
    myPlayerId: e.myPlayerId,
    crowdReaction: e.crowdReaction ? { ...e.crowdReaction } : null,
    wind: computeWindState(e),
    hoopPos: { ...e.hoopPos },
    heatCheckShiftIn: e.mode === 'HEAT_CHECK' ? Math.max(0, e.heatCheckShiftTimer) : 0,
    isMovingToRack: e.isMovingToRack,
    stamina: Math.round(e.stamina),
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialCareer = useRef<CareerStats>(loadCareerStats());

  const [wsConnected, setWsConnected] = useState(false);
  const [playerName, setPlayerName] = useState('Shooter');
  const playerNameRef = useRef('Shooter');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const userProfileRef = useRef<UserProfile | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const showAuthOverlayRef = useRef(false);
  const initialAuthCheckDoneRef = useRef(false);
  const [lobbyStats, setLobbyStats] = useState<PvpLobbyStats>({
    onlinePlayers: 1,
    queuedPlayers: 0,
    activeMatches: 0,
  });
  const [inQueue, setInQueue] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    showAuthOverlayRef.current = showAuthOverlay;
  }, [showAuthOverlay]);

  const engineRef = useRef<EngineState>({
    mode: 'SOLO',
    phase: 'TITLE',
    score: 0,
    bestScore: initialCareer.current.bestScore,
    career: { ...initialCareer.current },
    contestCountedInCareer: false,
    isNewBest: false,
    timeLeft: CONTEST_DURATION_SECONDS,
    lastTickSecond: 6,
    countdownTimer: 0,
    currentRack: 0,
    currentBall: 0,
    moneyRack: 4,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    madeCount: 0,
    attemptsCount: 0,
    resolvedLocalCount: 0,
    swishCount: 0,
    moneyMadeCount: 0,
    moneyTotalCount: 9,
    ballsRecord: createInitialBallsRecord(4),
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
    runStepTimer: 0,
    isMovingToRack: false,
    stamina: 100,
    gatherBuffered: false,
    gatherAmount: 0,
    followThroughAmount: 0,
    gatherCooldown: 0,
    rackMoveTimer: 0,
    isHoldingShot: false,
    meterValue: 0,
    meterFeedbackTimer: 0,
    lastReleaseMeter: 0,
    lastReleaseLabel: null,
    lastReleaseColor: '#F4EFE6',
    hasShotAnyBall: false,

    hoopPos: { ...HOOP_POS },
    hoopTargetPos: { ...HOOP_POS },
    heatCheckShiftTimer: 5.5,

    contestShootingClosed: false,
    finishGraceTimer: 0,
    gameOverTimestamp: 0,

    myPlayerId: null,
    pvpMatch: null,
    opponentGhost: null,

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
  });

  const [hud, setHud] = useState<HudSnapshot>(() => buildHudSnapshot(engineRef.current));

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
      e.phase === 'PLAYING' && e.mode !== 'HEAT_CHECK' && e.timeLeft <= 12
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
        pvpWins: profile.pvpWins,
        pvpLosses: profile.pvpLosses,
        pvpDraws: profile.pvpDraws,
      });
      e.career = merged;
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
      pvpClient.setProfile(profile.username, e.moneyRack, {
        wins: merged.pvpWins,
        losses: merged.pvpLosses,
        draws: merged.pvpDraws,
      });

      if (
        merged.bestScore !== profile.bestScore ||
        merged.totalShotsMade !== profile.totalShotsMade ||
        merged.totalShotsAttempted !== profile.totalShotsAttempted ||
        merged.totalCareerScore !== profile.totalCareerScore ||
        merged.allTimeBestStreak !== profile.allTimeBestStreak ||
        merged.contestsPlayed !== profile.contestsPlayed ||
        merged.pvpWins !== profile.pvpWins ||
        merged.pvpLosses !== profile.pvpLosses ||
        merged.pvpDraws !== profile.pvpDraws
      ) {
        void syncCareerStatsToFirestore(profile.uid, merged).catch((err: unknown) => {
          console.error('Failed to merge career stats to cloud:', err);
        });
      }

      setShowAuthOverlay(false);
      syncHud();
    },
    [syncHud]
  );

  const syncUserProfileFromAuth = useCallback(
    async (user: User) => {
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
        setShowAuthOverlay(true);
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
      setPlayerName('Shooter');
      playerNameRef.current = 'Shooter';
      const c = engineRef.current.career;
      pvpClient.setProfile('Shooter', engineRef.current.moneyRack, {
        wins: c.pvpWins,
        losses: c.pvpLosses,
        draws: c.pvpDraws,
      });
      syncHud();
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  }, [syncHud]);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        userProfileRef.current = null;
        if (!initialAuthCheckDoneRef.current) {
          setShowAuthOverlay(true);
        }
        initialAuthCheckDoneRef.current = true;
        return;
      }

      await syncUserProfileFromAuth(user);
      initialAuthCheckDoneRef.current = true;
    });

    return () => unsubscribe();
  }, [syncUserProfileFromAuth]);

  const resetCourtForMatch = (e: EngineState, mode: GameMode) => {
    const balls = createInitialBallsRecord(e.moneyRack);
    const moneyTotal = balls.filter((b) => b.isMoney).length;

    e.mode = mode;
    e.phase = 'COUNTDOWN';
    e.score = 0;
    e.contestCountedInCareer = false;
    e.isNewBest = false;
    e.timeLeft = mode === 'HEAT_CHECK' ? 0 : CONTEST_DURATION_SECONDS;
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
    e.runStepTimer = 0;
    e.isMovingToRack = false;
    e.stamina = 100;
    e.gatherBuffered = false;
    e.gatherAmount = 0;
    e.followThroughAmount = 0;
    e.gatherCooldown = 0;
    e.rackMoveTimer = 0;
    e.isHoldingShot = false;
    e.meterValue = 0;
    e.meterFeedbackTimer = 0;
    e.lastReleaseLabel = null;
    e.hasShotAnyBall = false;
    e.contestShootingClosed = false;
    e.finishGraceTimer = 0;

    e.camera.pos = { ...RACK_CONFIGS[0].camPos };
    e.camera.target = { ...RACK_CONFIGS[0].camTarget };
    e.camera.focalLength = 1.0;
    e.cameraSnapZoom = 0;
    e.netWhip = 0;
    e.rimShake = 0;
    e.screenShake = 0;

    const initAngle = Math.random() * Math.PI * 2;
    e.windAngle = initAngle;
    e.windTargetAngle = initAngle;
    e.windMph = 0.45;
    e.windVec = {
      x: Math.cos(initAngle) * 0.45 * 0.044,
      y: Math.sin(initAngle) * 0.45 * 0.044,
    };
    e.windShiftTimer = 6.5;
  };

  const spawnParticles = (
    e: EngineState,
    origin: Vec3,
    count: number,
    color: string,
    speed = 7.5
  ) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.25 + Math.random() * 0.9;
      const sp = speed * (0.45 + Math.random() * 0.75);
      e.particles.push({
        x: origin.x + (Math.random() - 0.5) * 0.4,
        y: origin.y + (Math.random() - 0.5) * 0.4,
        z: origin.z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * sp * 0.65,
        vy: Math.sin(a) * sp * 0.65,
        vz: up * sp,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: 0.8 + Math.random() * 0.9,
        color,
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

    const palette =
      shotStreak >= 9
        ? ['#FEF08A', '#FDE047', '#F59E0B', '#FB923C']
        : shotStreak >= 6
          ? ['#FDE68A', '#F59E0B', '#FBBF24', '#F9631C']
          : ball.isMoney
            ? ['#FDE68A', '#F59E0B', '#FB923C']
            : ['#FDBA74', '#F9631C', '#FB923C'];

    const glowColor = shotStreak >= 6 || ball.isMoney ? '#F59E0B' : '#F9631C';
    const baseLife = shotStreak >= 9 ? 1.25 : shotStreak >= 6 ? 1.08 : 0.9;
    const count = Math.min(4, Math.max(1, Math.round(dt * (shotStreak >= 6 ? 130 : 95))));

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
      e.particles.push({
        x: prevPos.x + (ball.pos.x - prevPos.x) * t + (Math.random() - 0.5) * 0.1,
        y: prevPos.y + (ball.pos.y - prevPos.y) * t + (Math.random() - 0.5) * 0.1,
        z: prevPos.z + (ball.pos.z - prevPos.z) * t + (Math.random() - 0.5) * 0.09,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        vz: 0.2 + Math.random() * 0.45,
        life,
        maxLife: life,
        size: (shotStreak >= 6 ? 1.05 : 0.85) + Math.random() * 0.6,
        color,
        glowColor,
        gravity: 0.45,
        isTrail: true,
      });
    }
  };

  const addCallout = (
    e: EngineState,
    text: string,
    color: string,
    worldPos: Vec3,
    subText?: string
  ) => {
    e.callouts.push({
      id: e.nextCalloutId++,
      text,
      subText,
      color,
      worldPos: { ...worldPos },
      life: 1.15,
      maxLife: 1.15,
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
          const e = engineRef.current;
          pvpClient.setProfile(playerNameRef.current, e.moneyRack, {
            wins: e.career.pvpWins,
            losses: e.career.pvpLosses,
            draws: e.career.pvpDraws,
          });
        }
      },
      onWelcome: (id, assignedName) => {
        engineRef.current.myPlayerId = id;
        if (!userProfileRef.current && playerNameRef.current === 'Shooter') {
          setPlayerName(assignedName);
        }
        syncHud();
      },
      onLobbyStats: (stats) => {
        setLobbyStats(stats);
      },
      onQueueStatus: (queued) => {
        setInQueue(queued);
      },
      onError: (msg) => {
        setPvpError(msg);
        window.setTimeout(() => setPvpError(null), 4000);
      },
      onOpponentLeft: () => {
        const e = engineRef.current;
        e.pvpMatch = null;
        e.opponentGhost = null;
        e.phase = 'TITLE';
        setPvpError('Opponent left the room.');
        syncHud();
      },
      onMatchState: (match) => {
        const e = engineRef.current;
        const prevStatus = e.pvpMatch?.status;
        e.pvpMatch = match;

        const me = match.players.find((p) => p.id === e.myPlayerId);
        const opp = match.players.find((p) => p.id !== e.myPlayerId);

        if (match.status === 'COUNTDOWN' && prevStatus !== 'COUNTDOWN') {
          setInQueue(false);
          setPvpError(null);
          resetCourtForMatch(e, 'PVP');
          if (opp) {
            e.opponentGhost = {
              active: true,
              name: opp.name,
              pos: { x: RACK_CONFIGS[0].x, y: RACK_CONFIGS[0].y, z: 0 },
              z: 0,
              rackIndex: 0,
              streak: 0,
              followThrough: 0,
            };
          }
          soundEngine.playTick(false);
        } else if (match.status === 'COUNTDOWN') {
          if (prevStatus === 'COUNTDOWN') {
            soundEngine.playTick(false);
          }
        } else if (match.status === 'PLAYING') {
          if (e.phase !== 'PLAYING') {
            e.phase = 'PLAYING';
            soundEngine.playWhistle();
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
          }

          // Reconcile local player score when server has caught up
          if (me && me.attemptsCount >= e.resolvedLocalCount) {
            e.score = me.score;
            e.streak = me.streak;
            e.multiplier = me.multiplier;
          }

          if (opp && e.opponentGhost) {
            e.opponentGhost.streak = opp.streak;
            const oppRack = RACK_CONFIGS[Math.min(opp.currentRack, RACKS_COUNT - 1)];
            e.opponentGhost.rackIndex = opp.currentRack;
            // Offset slightly if sharing exact rack with local shooter so they don't overlap
            const sameRack = opp.currentRack === e.currentRack;
            e.opponentGhost.pos.x = oppRack.x + (sameRack ? 2.2 : 0);
            e.opponentGhost.pos.y = oppRack.y + (sameRack ? 1.4 : 0);
          }
        } else if (match.status === 'FINISHED') {
          if (me) {
            e.score = me.score;
            e.streak = me.streak;
            e.multiplier = me.multiplier;
          }
          if (e.phase !== 'GAME_OVER') {
            e.phase = 'GAME_OVER';
            e.isHoldingShot = false;
            e.gameOverTimestamp = performance.now();
            if (!e.contestCountedInCareer) {
              e.contestCountedInCareer = true;
              e.career.contestsPlayed += 1;
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
              persistCareer(e.career);
              pvpClient.setProfile(playerNameRef.current, e.moneyRack, {
                wins: e.career.pvpWins,
                losses: e.career.pvpLosses,
                draws: e.career.pvpDraws,
              });
            }
          }
        }

        syncHud();
      },
      onOpponentShot: (shot: OpponentShotEvent) => {
        const e = engineRef.current;
        if (e.phase !== 'PLAYING') return;
        if (e.opponentGhost) {
          e.opponentGhost.followThrough = 0.9;
          e.opponentGhost.z = 1.6;
        }
        e.activeBalls.push({
          id: e.nextBallId++,
          rackIndex: shot.rackIndex,
          ballIndex: shot.ballIndex,
          isMoney: shot.isMoney,
          multiplierAtRelease: 1,
          isBuzzerBeater: false,
          isRemote: true,
          skipRimCollision: true,
          pos: { ...shot.releasePos },
          vel: { ...shot.vel },
          spinAngle: 0,
          spinRate: -11,
          intendedOutcome: 'SWISH',
          hasScored: false,
          hasResolved: false,
          hitRimCount: 0,
          hitBackboard: false,
          trail: [{ ...shot.releasePos }],
          age: 0,
        });
      },
    });

    pvpClient.connect();
    return () => {
      pvpClient.disconnect();
    };
  }, [persistCareer, syncHud]);

  const startLocalContest = useCallback(
    (targetMode?: 'SOLO' | 'HEAT_CHECK') => {
      soundEngine.unlock();
      const e = engineRef.current;
      const chosenMode: GameMode =
        targetMode ?? (e.mode === 'HEAT_CHECK' ? 'HEAT_CHECK' : 'SOLO');
      e.pvpMatch = null;
      e.opponentGhost = null;
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
      const e = engineRef.current;
      e.moneyRack = rackIdx;
      e.ballsRecord = createInitialBallsRecord(rackIdx);
      e.moneyTotalCount = e.ballsRecord.filter((b) => b.isMoney).length;
      pvpClient.setProfile(playerName, rackIdx, {
        wins: e.career.pvpWins,
        losses: e.career.pvpLosses,
        draws: e.career.pvpDraws,
      });
      syncHud();
    },
    [playerName, syncHud]
  );

  const handleChangePlayerName = useCallback((name: string) => {
    setPlayerName(name);
    const e = engineRef.current;
    pvpClient.setProfile(name, e.moneyRack, {
      wins: e.career.pvpWins,
      losses: e.career.pvpLosses,
      draws: e.career.pvpDraws,
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = !soundEngine.isMuted();
    if (!nextMuted) {
      soundEngine.unlock();
    }
    soundEngine.setMuted(nextMuted);
    syncHud();
  }, [syncHud]);

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

  const handleQuitToTitle = useCallback(() => {
    const e = engineRef.current;
    if (e.mode === 'PVP') {
      pvpClient.leaveRoom();
      pvpClient.leaveQueue();
      e.pvpMatch = null;
      e.opponentGhost = null;
    }
    e.phase = 'TITLE';
    e.isHoldingShot = false;
    e.gatherBuffered = false;
    e.isMovingToRack = false;
    e.hoopPos = { ...HOOP_POS };
    e.hoopTargetPos = { ...HOOP_POS };
    e.activeBalls = [];
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
    if (e.currentRack >= RACKS_COUNT || e.currentBall >= BALLS_PER_RACK) return;
    if (e.gatherCooldown > 0 || e.rackMoveTimer > 0 || e.isMovingToRack) {
      e.gatherBuffered = true;
      return;
    }

    e.gatherBuffered = false;
    soundEngine.unlock();
    soundEngine.playGather();
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
    if (e.currentRack >= RACKS_COUNT || e.currentBall >= BALLS_PER_RACK) return;

    const slotIdx = e.currentRack * BALLS_PER_RACK + e.currentBall;
    const slot = e.ballsRecord[slotIdx];
    if (!slot || slot.status !== 'PENDING') return;

    const diff = getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
    const releaseVal = e.meterValue;

    const hdx = e.hoopPos.x - e.shooterPos.x;
    const hdy = e.hoopPos.y - e.shooterPos.y;
    const dirLen = Math.hypot(hdx, hdy) || 1;
    const fx = hdx / dirLen;
    const fy = hdy / dirLen;

    const releasePos: Vec3 = {
      x: e.shooterPos.x + fx * 0.75,
      y: e.shooterPos.y + fy * 0.75,
      z: 7.9,
    };

    const launch = computeShotLaunch(releasePos, releaseVal, diff, e.windVec, e.hoopPos);

    e.shooterVelZ = 7.1;
    e.stamina = Math.max(0, e.stamina - 3.5);
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
      e.lastReleaseColor = '#F59E0B';
      e.timingBreakdown.perfect += 1;
      recordedTiming = 'PERFECT';
      // Trigger crisp camera snap zoom on perfect release
      e.cameraSnapZoom = 1.0;
    } else if (launch.timingQuality === 'MAKE') {
      e.lastReleaseLabel = 'GOOD';
      e.lastReleaseColor = '#10B981';
      e.timingBreakdown.good += 1;
      recordedTiming = 'GOOD';
    } else if (launch.timingQuality === 'EARLY') {
      e.lastReleaseLabel = 'EARLY';
      e.lastReleaseColor = '#38BDF8';
      e.timingBreakdown.early += 1;
      recordedTiming = 'EARLY';
    } else {
      e.lastReleaseLabel = 'LATE';
      e.lastReleaseColor = '#EF4444';
      e.timingBreakdown.late += 1;
      recordedTiming = 'LATE';
    }

    slot.status = 'IN_AIR';
    slot.timingQuality = recordedTiming;
    slot.multiplierUsed = e.multiplier;

    const ball: ActiveBall = {
      id: e.nextBallId++,
      rackIndex: e.currentRack,
      ballIndex: e.currentBall,
      isMoney: slot.isMoney,
      multiplierAtRelease: e.multiplier,
      streakAtRelease: e.streak,
      isBuzzerBeater: e.mode !== 'HEAT_CHECK' && e.timeLeft <= 0.35,
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
      trail: [{ ...releasePos }],
      age: 0,
    };
    e.activeBalls.push(ball);
    soundEngine.playRelease();

    if (e.mode === 'PVP') {
      pvpClient.sendShotReleased(
        e.currentRack,
        e.currentBall,
        slot.isMoney,
        releasePos,
        launch.vel
      );
    }

    if (e.currentBall + 1 < BALLS_PER_RACK) {
      e.currentBall += 1;
    } else if (e.currentRack + 1 < RACKS_COUNT) {
      e.currentRack += 1;
      e.currentBall = 0;
      e.isMovingToRack = true;
      e.rackMoveTimer = 0.25;
      e.windTargetAngle += (Math.random() - 0.5) * 0.9;
    } else if (e.mode === 'HEAT_CHECK') {
      // Endless Heat Check rotation: refill next rack and sprint cleanly around/across
      const nextRack = 0;
      const startIdx = nextRack * BALLS_PER_RACK;
      for (let b = 0; b < BALLS_PER_RACK; b++) {
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
      e.isMovingToRack = true;
      e.rackMoveTimer = 0.35;
      e.windTargetAngle += (Math.random() - 0.5) * 0.9;
    } else {
      e.currentBall = BALLS_PER_RACK;
      e.contestShootingClosed = true;
      e.finishGraceTimer = 0.65;
    }

    // In Heat Check, pre-reset the rack we just left when transitioning between racks so HUD stays fresh
    if (e.mode === 'HEAT_CHECK' && e.currentBall === 0 && e.currentRack > 0) {
      const startIdx = e.currentRack * BALLS_PER_RACK;
      for (let b = 0; b < BALLS_PER_RACK; b++) {
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
  }, [syncHud]);

  // Keyboard & window blur bindings
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      const e = engineRef.current;

      // Don't hijack typing inside name/room input fields
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (ev.code === 'KeyM') {
        ev.preventDefault();
        handleToggleMute();
        return;
      }

      const isLocalMode = e.mode === 'SOLO' || e.mode === 'HEAT_CHECK';

      if (ev.code === 'Escape' || ev.code === 'KeyP') {
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
        e.phase === 'TITLE' &&
        isLocalMode &&
        (ev.code === 'Enter' || ev.code === 'Space')
      ) {
        ev.preventDefault();
        startLocalContest(e.mode === 'HEAT_CHECK' ? 'HEAT_CHECK' : 'SOLO');
        return;
      }

      if (e.phase === 'COUNTDOWN' && isLocalMode && ev.code === 'Space') {
        ev.preventDefault();
        e.countdownTimer = 0;
        e.phase = 'PLAYING';
        soundEngine.playWhistle();
        syncHud();
        return;
      }

      if (
        e.phase === 'GAME_OVER' &&
        isLocalMode &&
        (ev.code === 'Enter' || ev.code === 'Space')
      ) {
        if (performance.now() - e.gameOverTimestamp > 450) {
          ev.preventDefault();
          startLocalContest(e.mode === 'HEAT_CHECK' ? 'HEAT_CHECK' : 'SOLO');
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
      e.isHoldingShot = false;
      e.gatherBuffered = false;
      e.gatherAmount = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
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
            const topRack = RACK_CONFIGS[2];
            e.hoopPos = { ...HOOP_POS };
            e.hoopTargetPos = { ...HOOP_POS };
            e.camera.pos.x = topRack.camPos.x + sway * 4.5;
            e.camera.pos.y = topRack.camPos.y + Math.cos(e.clockTime * 0.35) * 1.4;
            e.camera.pos.z = topRack.camPos.z + 0.35;
            e.camera.target = { x: sway * 0.8, y: 0, z: 9.2 };
            e.camera.focalLength = 1.0;
            e.cameraSnapZoom = 0;
            e.shooterPos = { x: topRack.x, y: topRack.y, z: 0 };
            e.shooterFacing = { x: 0, y: -1 };
            e.isMovingToRack = false;
            e.stamina = 100;
          } else if (e.phase !== 'PAUSED') {
            const isLocalContest = e.mode === 'SOLO' || e.mode === 'HEAT_CHECK';

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
                syncHud();
              }
            }

            // Active Play Clock (disabled in Heat Check)
            if (e.phase === 'PLAYING' && !e.contestShootingClosed && e.mode !== 'HEAT_CHECK') {
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
                  '#F59E0B',
                  { x: e.hoopTargetPos.x, y: e.hoopTargetPos.y, z: e.hoopTargetPos.z + 2.1 }
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

            // Shooter jump & follow-through
            if (e.shooterZ > 0 || e.shooterVelZ > 0) {
              e.shooterVelZ -= 32 * dt;
              e.shooterZ += e.shooterVelZ * dt;
              if (e.shooterZ <= 0) {
                e.shooterZ = 0;
                e.shooterVelZ = 0;
              }
            }
            if (e.followThroughAmount > 0) {
              e.followThroughAmount = Math.max(0, e.followThroughAmount - dt * 1.9);
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

            // Opponent Ghost decay
            if (e.opponentGhost) {
              e.opponentGhost.z = Math.max(0, e.opponentGhost.z - dt * 4.5);
              e.opponentGhost.followThrough = Math.max(0, e.opponentGhost.followThrough - dt * 1.9);
            }

            // Stick-figure athletic rack-to-rack running along 3-point perimeter / court chord
            const targetRack = RACK_CONFIGS[Math.min(e.currentRack, RACKS_COUNT - 1)];
            const dxRack = targetRack.x - e.shooterPos.x;
            const dyRack = targetRack.y - e.shooterPos.y;
            const distToRack = Math.hypot(dxRack, dyRack);

            if (distToRack > 0.24) {
              e.isMovingToRack = true;
              e.stamina = Math.max(0, e.stamina - 30 * dt);
              const curAngle = Math.atan2(e.shooterPos.y, e.shooterPos.x);
              const tgtAngle = Math.atan2(targetRack.y, targetRack.x);
              const curRadius = Math.hypot(e.shooterPos.x, e.shooterPos.y);
              const tgtRadius = Math.hypot(targetRack.x, targetRack.y);
              const angleDiff = tgtAngle - curAngle;

              let nextX = e.shooterPos.x;
              let nextY = e.shooterPos.y;

              if (Math.abs(angleDiff) < 1.35 && curRadius > 16 && tgtRadius > 16) {
                // Sprint along the 3-point arc between adjacent racks
                const runSpeedFt = 19.5;
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
                // Sprint directly across court (e.g. Right Corner wrap back to Left Corner in Heat Check)
                const runSpeedFt = 24.5;
                const step = Math.min(distToRack, runSpeedFt * dt);
                nextX = e.shooterPos.x + (dxRack / distToRack) * step;
                nextY = e.shooterPos.y + (dyRack / distToRack) * step;
              }

              const moveDx = nextX - e.shooterPos.x;
              const moveDy = nextY - e.shooterPos.y;
              const stepDist = Math.hypot(moveDx, moveDy);
              e.shooterPos.x = nextX;
              e.shooterPos.y = nextY;
              e.runPhase += stepDist * 1.48;

              if (stepDist > 0.005) {
                const vx = moveDx / stepDist;
                const vy = moveDy / stepDist;
                const turnLerp = 1 - Math.exp(-15 * dt);
                e.shooterFacing.x += (vx - e.shooterFacing.x) * turnLerp;
                e.shooterFacing.y += (vy - e.shooterFacing.y) * turnLerp;
                const fl = Math.hypot(e.shooterFacing.x, e.shooterFacing.y) || 1;
                e.shooterFacing.x /= fl;
                e.shooterFacing.y /= fl;

                // Subtle sneaker court scuff dust while sprinting
                e.runStepTimer -= dt;
                if (e.runStepTimer <= 0) {
                  e.runStepTimer = 0.14;
                  e.particles.push({
                    x: e.shooterPos.x - vx * 0.35 + (Math.random() - 0.5) * 0.25,
                    y: e.shooterPos.y - vy * 0.35 + (Math.random() - 0.5) * 0.25,
                    z: 0.12,
                    vx: -vx * 1.4 + (Math.random() - 0.5) * 0.6,
                    vy: -vy * 1.4 + (Math.random() - 0.5) * 0.6,
                    vz: 0.9 + Math.random() * 0.6,
                    life: 0.28,
                    maxLife: 0.28,
                    size: 0.55,
                    color: 'rgba(244, 239, 230, 0.55)',
                    gravity: 2.5,
                  });
                }
              }
            } else {
              e.shooterPos.x = targetRack.x;
              e.shooterPos.y = targetRack.y;
              e.isMovingToRack = false;
              if (!e.isHoldingShot && e.shooterZ <= 0.05) {
                e.stamina = Math.min(100, e.stamina + 10.5 * dt);
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

              if (e.gatherBuffered && e.rackMoveTimer <= 0 && e.gatherCooldown <= 0) {
                beginShotGather();
              }
            }

            // Dynamic over-the-shoulder camera tracks runner + shifted hoop cleanly
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

            if (e.isHoldingShot && e.phase === 'PLAYING' && !e.contestShootingClosed) {
              const diff = getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina);
              e.meterValue += diff.meterSpeed * dt;
              e.gatherAmount = Math.min(1, e.meterValue / METER_PERFECT_CENTER);
              if (e.meterValue >= 1.07) {
                releaseShot();
              }
            } else if (!e.isHoldingShot) {
              e.gatherAmount = Math.max(0, e.gatherAmount - dt * 6);
            }

            // Update Wind Simulation (intensity climbs smoothly with player streak)
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
                  soundEngine.playRimClank(Math.min(1.4, impact / 10));
                  e.rimShake = Math.min(1, e.rimShake + 0.65);
                  e.screenShake = Math.min(0.45, e.screenShake + 0.14);
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

                  const slotIdx = b.rackIndex * BALLS_PER_RACK + b.ballIndex;
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
                  e.career.totalShotsMade += 1;
                  e.career.totalShotsAttempted += 1;
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

                  if (slot) {
                    slot.status = 'MADE';
                    slot.outcome = isCleanSwish ? 'SWISH' : 'MAKE';
                    slot.pointsAwarded = pointsEarned;
                    slot.multiplierUsed = activeMult;
                  }

                  if (e.mode === 'PVP') {
                    pvpClient.sendShotResolved(b.rackIndex, b.ballIndex, true, isCleanSwish);
                  }

                  e.netWhip = 1.0;
                  e.netWhipPhase = Math.random() * Math.PI * 2;
                  e.screenShake = Math.min(0.5, e.screenShake + (b.isMoney ? 0.25 : 0.12));

                  soundEngine.playSwish(b.isMoney, e.streak, isCleanSwish, b.rackIndex);
                  spawnParticles(
                    e,
                    { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z - 0.5 },
                    b.isMoney ? 22 : 14,
                    b.isMoney ? '#F59E0B' : isCleanSwish ? '#34D399' : '#F9631C',
                    b.isMoney ? 9.2 : 7.0
                  );

                  const label = b.isBuzzerBeater
                    ? `BUZZER BEATER! +${pointsEarned}`
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
                    b.isMoney ? '#F59E0B' : isCleanSwish ? '#34D399' : '#F4EFE6',
                    { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z + 2.1 },
                    sub
                  );

                  const nextDiff = getDifficultyForStreak(e.streak);
                  if (nextDiff.level > prevDiff.level) {
                    soundEngine.playDifficultyUp(nextDiff.level);
                    addCallout(
                      e,
                      `${nextDiff.label.toUpperCase()}!`,
                      '#F9631C',
                      { x: e.shooterPos.x, y: e.shooterPos.y, z: 9.2 },
                      `DIFFICULTY LV.${nextDiff.level} · FASTER METER`
                    );
                  }

                  syncHud();
                },
                onMiss: (b) => {
                  if (b.isRemote) return;
                  const slotIdx = b.rackIndex * BALLS_PER_RACK + b.ballIndex;
                  const slot = e.ballsRecord[slotIdx];
                  if (slot) {
                    slot.status = 'MISSED';
                    slot.outcome = b.intendedOutcome;
                    slot.pointsAwarded = 0;
                  }

                  const prevStreak = e.streak;
                  const hadStreak = prevStreak >= 2;
                  e.streak = 0;
                  e.recordBrokenThisRun = false;
                  e.streakRecordBaseline = Math.max(2, e.career.allTimeBestStreak);
                  e.multiplier = 1;
                  e.resolvedLocalCount += 1;
                  e.career.totalShotsAttempted += 1;
                  persistCareer(e.career);

                  if (e.mode === 'PVP') {
                    pvpClient.sendShotResolved(b.rackIndex, b.ballIndex, false, false);
                  }

                  if (e.mode === 'HEAT_CHECK') {
                    e.contestShootingClosed = true;
                    e.isHoldingShot = false;
                    e.gatherBuffered = false;
                    e.gatherAmount = 0;
                    e.finishGraceTimer = 0.72;
                    soundEngine.playCrowdGroan(b.rackIndex, prevStreak);
                    addCallout(
                      e,
                      'HEAT CHECK ENDED!',
                      '#EF4444',
                      { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z + 1.9 },
                      prevStreak > 0 ? `FINAL STREAK: ${prevStreak}` : 'STREAK ENDED ON MISS'
                    );
                  } else if (hadStreak) {
                    soundEngine.playCrowdGroan(b.rackIndex, prevStreak);
                    addCallout(
                      e,
                      'STREAK BROKEN',
                      '#EF4444',
                      { x: e.hoopPos.x, y: e.hoopPos.y, z: e.hoopPos.z + 1.8 },
                      'MULTIPLIER RESET TO 1x'
                    );
                  }
                  syncHud();
                },
              }, e.windVec, e.hoopPos);

              if (!ball.isRemote && !wasResolved && ball.age < 1.85) {
                const shotStreak =
                  ball.streakAtRelease ?? Math.max(0, ball.multiplierAtRelease - 1);
                if (shotStreak >= 3) {
                  spawnBallTrailParticles(e, ball, prevPos, dt, shotStreak);
                }
              }
            }

            e.activeBalls = e.activeBalls.filter((b) => b.age < 3.2);

            // End-of-contest transition for Solo & Heat Check (PVP ends via server match_state)
            if (
              (e.mode === 'SOLO' || e.mode === 'HEAT_CHECK') &&
              e.phase === 'PLAYING' &&
              e.contestShootingClosed
            ) {
              const unresolved = e.activeBalls.some((b) => !b.isRemote && !b.hasResolved);
              if (!unresolved) {
                e.finishGraceTimer -= dt;
                if (e.finishGraceTimer <= 0) {
                  e.phase = 'GAME_OVER';
                  e.gameOverTimestamp = performance.now();
                  if (!e.contestCountedInCareer) {
                    e.contestCountedInCareer = true;
                    e.career.contestsPlayed += 1;
                    persistCareer(e.career);
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

          // Render frame
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
            isMovingToRack: e.isMovingToRack,
            gatherAmount: e.gatherAmount,
            followThroughAmount: e.followThroughAmount,
            isHoldingShot: e.isHoldingShot,
            meterValue: e.meterValue,
            meterFeedbackTimer: e.meterFeedbackTimer,
            lastReleaseMeter: e.lastReleaseMeter,
            lastReleaseLabel: e.lastReleaseLabel,
            lastReleaseColor: e.lastReleaseColor,
            difficulty: getEffectiveDifficulty(getDifficultyForStreak(e.streak), e.stamina),
            streak: e.streak,
            multiplier: e.multiplier,
            currentRack: e.currentRack,
            currentBall: e.currentBall,
            moneyRack: e.moneyRack,
            ballsRecord: e.ballsRecord,
            activeBalls: e.activeBalls,
            opponentGhost: e.mode === 'PVP' ? e.opponentGhost : null,
            particles: e.particles,
            callouts: e.callouts,
            flashbulbs: e.flashbulbs,
            netWhip: e.netWhip,
            netWhipPhase: e.netWhipPhase,
            rimShake: e.rimShake,
            screenShake: e.screenShake,
            clockTime: e.clockTime,
            timeLeft: e.timeLeft,
            hasShotAnyBall: e.hasShotAnyBall,
            shooterName: playerNameRef.current,
            crowdHypeTimer: e.crowdHypeTimer,
            crowdHypeDuration: e.crowdHypeDuration,
          };
          renderArena(ctx, rect.width, rect.height, renderState);
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [beginShotGather, persistCareer, releaseShot, syncHud]);

  const handleCanvasPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (ev.button !== 0) return;
    const e = engineRef.current;
    if (e.phase === 'COUNTDOWN' && (e.mode === 'SOLO' || e.mode === 'HEAT_CHECK')) {
      e.countdownTimer = 0;
      e.phase = 'PLAYING';
      soundEngine.playWhistle();
      syncHud();
      return;
    }
    if (e.phase === 'PLAYING') {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      beginShotGather();
    }
  };

  const handleCanvasPointerUp = () => {
    releaseShot();
  };

  const waitingRoom =
    hud.pvpMatch && hud.pvpMatch.status === 'WAITING' ? hud.pvpMatch : null;

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0B0E14]">
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full touch-none cursor-pointer"
      />

      {hud.phase === 'TITLE' && (
        <TitleOverlay
          mode={hud.mode}
          moneyRack={hud.moneyRack}
          career={hud.career}
          muted={hud.muted}
          wsConnected={wsConnected}
          lobbyStats={lobbyStats}
          playerName={playerName}
          userProfile={userProfile}
          inQueue={inQueue}
          waitingRoom={waitingRoom}
          pvpError={pvpError}
          onSelectMode={handleSelectMode}
          onSelectMoneyRack={handleSelectMoneyRack}
          onChangePlayerName={handleChangePlayerName}
          onToggleMute={handleToggleMute}
          onOpenAuth={handleOpenAuth}
          onSignOut={handleSignOut}
          onStartSolo={() => startLocalContest('SOLO')}
          onStartHeatCheck={() => startLocalContest('HEAT_CHECK')}
          onJoinQueue={() => {
            if (!userProfile) {
              handleOpenAuth();
              return;
            }
            soundEngine.unlock();
            const c = engineRef.current.career;
            pvpClient.setProfile(userProfile.username, engineRef.current.moneyRack, {
              wins: c.pvpWins,
              losses: c.pvpLosses,
              draws: c.pvpDraws,
            });
            pvpClient.joinQueue();
          }}
          onLeaveQueue={() => pvpClient.leaveQueue()}
          onCreateRoom={() => {
            if (!userProfile) {
              handleOpenAuth();
              return;
            }
            soundEngine.unlock();
            const c = engineRef.current.career;
            pvpClient.setProfile(userProfile.username, engineRef.current.moneyRack, {
              wins: c.pvpWins,
              losses: c.pvpLosses,
              draws: c.pvpDraws,
            });
            pvpClient.createRoom();
          }}
          onJoinRoom={(code) => {
            if (!userProfile) {
              handleOpenAuth();
              return;
            }
            soundEngine.unlock();
            const c = engineRef.current.career;
            pvpClient.setProfile(userProfile.username, engineRef.current.moneyRack, {
              wins: c.pvpWins,
              losses: c.pvpLosses,
              draws: c.pvpDraws,
            });
            pvpClient.joinRoom(code);
          }}
          onLeaveRoom={() => {
            pvpClient.leaveRoom();
            engineRef.current.pvpMatch = null;
            syncHud();
          }}
        />
      )}

      {showAuthOverlay && hud.phase === 'TITLE' && (
        <AuthPage
          mode={firebaseUser && !userProfile ? 'USERNAME_SETUP' : 'AUTH'}
          firebaseUser={firebaseUser}
          career={hud.career}
          onProfileReady={applyAuthenticatedProfile}
          onContinueAsGuest={() => setShowAuthOverlay(false)}
        />
      )}

      {(hud.phase === 'COUNTDOWN' || hud.phase === 'PLAYING') && (
        <CrowdReactionOverlay reaction={hud.crowdReaction} />
      )}

      <AnimatePresence>
        {(hud.phase === 'COUNTDOWN' || hud.phase === 'PLAYING' || hud.phase === 'PAUSED') && (
          <GameHud
            key="game-hud"
            hud={hud}
            onToggleMute={handleToggleMute}
            onPause={handlePause}
          />
        )}
      </AnimatePresence>

      {hud.phase === 'PAUSED' && (
        <PauseModal
          mode={hud.mode}
          muted={hud.muted}
          onToggleMute={handleToggleMute}
          onResume={handlePause}
          onRestart={() => startLocalContest(hud.mode === 'HEAT_CHECK' ? 'HEAT_CHECK' : 'SOLO')}
          onQuitToTitle={handleQuitToTitle}
        />
      )}

      {hud.phase === 'GAME_OVER' && (
        <GameOverModal
          hud={hud}
          onPlayAgain={() =>
            startLocalContest(hud.mode === 'HEAT_CHECK' ? 'HEAT_CHECK' : 'SOLO')
          }
          onRequestRematch={() => pvpClient.requestRematch()}
          onBackToTitle={handleQuitToTitle}
        />
      )}
    </main>
  );
}
