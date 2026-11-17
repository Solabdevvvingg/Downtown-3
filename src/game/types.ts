export type GamePhase = 'TITLE' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameMode = 'SOLO' | 'HEAT_CHECK' | 'PVP';

export type ShotOutcome = 'SWISH' | 'MAKE' | 'BANK' | 'RIM_OUT' | 'AIRBALL';

export type BallStatus = 'PENDING' | 'IN_AIR' | 'MADE' | 'MISSED';

export interface CareerStats {
  bestScore: number;
  totalShotsMade: number;
  totalShotsAttempted: number;
  totalCareerScore: number;
  allTimeBestStreak: number;
  contestsPlayed: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
}

export type TimingQuality = 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE';

export interface TimingBreakdown {
  perfect: number;
  good: number;
  early: number;
  late: number;
}

export interface PvpRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface WindState {
  x: number;
  y: number;
  mph: number;
  relativeAngleRad: number;
  intensity: number;
  dirLabel: string;
}

export interface UserProfile {
  uid: string;
  username: string;
  bestScore: number;
  totalShotsMade: number;
  totalShotsAttempted: number;
  totalCareerScore: number;
  allTimeBestStreak: number;
  contestsPlayed: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BallSlotRecord {
  rackIndex: number;
  ballIndex: number;
  isMoney: boolean;
  status: BallStatus;
  outcome?: ShotOutcome;
  timingQuality?: TimingQuality;
  pointsAwarded: number;
  multiplierUsed: number;
}

export interface RackConfig {
  id: number;
  label: string;
  shortLabel: string;
  /** World coordinates (feet) relative to hoop center (0, 0, 0) */
  x: number;
  y: number;
  /** Rack stand offset relative to shooter position */
  rackOffsetX: number;
  rackOffsetY: number;
  /** Shooter's over-the-shoulder POV camera position & lookAt for this rack */
  camPos: Vec3;
  camTarget: Vec3;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
  depth: number;
  visible: boolean;
}

export interface ActiveBall {
  id: number;
  rackIndex: number;
  ballIndex: number;
  isMoney: boolean;
  multiplierAtRelease: number;
  streakAtRelease?: number;
  isBuzzerBeater: boolean;
  isRemote?: boolean;
  skipRimCollision?: boolean;
  pos: Vec3;
  vel: Vec3;
  spinAngle: number;
  spinRate: number;
  intendedOutcome: ShotOutcome;
  hasScored: boolean;
  hasResolved: boolean;
  hitRimCount: number;
  hitBackboard: boolean;
  trail: Vec3[];
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity?: number;
  isTrail?: boolean;
  glowColor?: string;
  shape?: 'circle' | 'confetti' | 'spark';
  rot?: number;
  rotSpeed?: number;
  drag?: number;
  aspect?: number;
}

export interface CrowdReactionOverlayData {
  id: number;
  streak: number;
  previousRecord: number;
  headline: string;
  chant: string;
  decibels: number;
  accentColor: string;
  bars: number[];
  life: number;
  maxLife: number;
}

export interface FloatingCallout {
  id: number;
  text: string;
  subText?: string;
  color: string;
  worldPos: Vec3;
  life: number;
  maxLife: number;
}

export interface Flashbulb {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface DifficultyTier {
  level: number;
  label: string;
  minStreak: number;
  meterSpeed: number;
  makeHalfWindow: number;
  perfectHalfWindow: number;
  gatherCooldown: number;
}

export interface PvpBallRecord {
  status: 'PENDING' | 'MADE' | 'MISSED';
  isMoney: boolean;
  pointsAwarded: number;
}

export interface PvpPlayerSnapshot {
  id: string;
  name: string;
  isHost: boolean;
  moneyRack: number;
  score: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  madeCount: number;
  attemptsCount: number;
  swishCount: number;
  currentRack: number;
  currentBall: number;
  balls: PvpBallRecord[];
  rematchReady: boolean;
  finishedShooting: boolean;
  record?: PvpRecord;
}

export interface PvpMatchSnapshot {
  roomId: string;
  code: string | null;
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
  countdownLeft: number;
  timeLeft: number;
  winnerId: string | null;
  isTie: boolean;
  forfeitById: string | null;
  players: PvpPlayerSnapshot[];
}

export interface PvpLobbyStats {
  onlinePlayers: number;
  queuedPlayers: number;
  activeMatches: number;
}

export interface OpponentGhostState {
  active: boolean;
  name: string;
  pos: Vec3;
  z: number;
  rackIndex: number;
  streak: number;
  followThrough: number;
}

export interface HudSnapshot {
  mode: GameMode;
  phase: GamePhase;
  score: number;
  bestScore: number;
  career: CareerStats;
  timeLeft: number;
  countdownValue: number;
  currentRack: number;
  currentBall: number;
  moneyRack: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  difficulty: DifficultyTier;
  madeCount: number;
  attemptsCount: number;
  swishCount: number;
  moneyMadeCount: number;
  moneyTotalCount: number;
  balls: BallSlotRecord[];
  timingBreakdown: TimingBreakdown;
  isNewBest: boolean;
  muted: boolean;
  lastFeedback: string | null;
  activeBallsInAir: number;
  pvpMatch: PvpMatchSnapshot | null;
  myPlayerId: string | null;
  crowdReaction: CrowdReactionOverlayData | null;
  wind: WindState;
  hoopPos: Vec3;
  heatCheckShiftIn: number;
  isMovingToRack: boolean;
  stamina: number;
}
