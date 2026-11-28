export type GamePhase = 'TITLE' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameMode = 'SOLO' | 'FAST_BREAK' | 'HEAT_CHECK' | 'PRACTICE' | 'PVP';

export type CameraMode = 'FOLLOW' | 'PRO_STATIC';

export type CourtThemeId =
  | 'wooden_gym'
  | 'street_asphalt'
  | 'neon_arena'
  | 'championship_gold';

export type BallSkinId = 'classic_leather' | 'fireball' | 'electric' | 'championship_gold';

export type ShotOutcome = 'SWISH' | 'MAKE' | 'BANK' | 'RIM_OUT' | 'AIRBALL';

export type BallStatus = 'PENDING' | 'IN_AIR' | 'MADE' | 'MISSED';

export interface CareerStats {
  bestScore: number;
  totalShotsMade: number;
  totalShotsAttempted: number;
  totalCareerScore: number;
  allTimeBestStreak: number;
  contestsPlayed: number;
  totalSwishes: number;
  totalSwishTrackedAttempts: number;
  totalBestStreakSum: number;
  streakTrackedContests: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  bestFastBreakMs: number;
  bestFastBreakSplitsMs: number[];
  fastBreakContests: number;
}

export interface FastBreakSplit {
  rackIndex: number;
  shortLabel: string;
  lapMs: number | null;
  cumulativeMs: number | null;
  deltaMs: number | null;
}

export interface CareerBaseline {
  contestsPlayed: number;
  totalCareerScore: number;
  totalSwishes: number;
  totalSwishTrackedAttempts: number;
  totalBestStreakSum: number;
  streakTrackedContests: number;
  allTimeBestStreak: number;
  bestScore: number;
  bestFastBreakMs: number;
}

export interface RivalryRecord {
  opponentKey: string;
  opponentName: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  lastScoreFor: number;
  lastScoreAgainst: number;
  lastResult: 'WIN' | 'LOSS' | 'DRAW';
  currentStreak: number;
  lastPlayedAt: number;
}

export type TimingQuality = 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE';

export interface TimingBreakdown {
  perfect: number;
  good: number;
  early: number;
  late: number;
}

export interface StaminaEfficiencyStats {
  efficiencyPct: number;
  totalSaved: number;
  timingSaved: number;
  movementRecovered: number;
  endStamina: number;
  minStamina: number;
  rating: 'Elite' | 'Sharp' | 'Steady' | 'Winded';
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
  totalSwishes: number;
  totalSwishTrackedAttempts: number;
  totalBestStreakSum: number;
  streakTrackedContests: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  bestFastBreakMs: number;
  bestFastBreakSplitsMs: number[];
  fastBreakContests: number;
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

export interface ShotChartEntry {
  id: number;
  rackIndex: number;
  ballIndex: number;
  x: number;
  y: number;
  isMoney: boolean;
  timingQuality: TimingQuality;
  status: 'IN_AIR' | 'MADE' | 'MISSED';
  isSwish?: boolean;
  pointsAwarded: number;
}

export interface HighlightFrame {
  t: number;
  x: number;
  y: number;
  z: number;
  spinAngle: number;
}

export interface ContestHighlight {
  id: number;
  mode: GameMode;
  courtTheme: CourtThemeId;
  ballSkin?: BallSkinId;
  rackIndex: number;
  rackLabel: string;
  ballIndex: number;
  isMoney: boolean;
  isSwish: boolean;
  isBuzzerBeater: boolean;
  hadRimHang: boolean;
  timingQuality: TimingQuality;
  pointsAwarded: number;
  multiplier: number;
  streakAtMake: number;
  windMph: number;
  shooterName: string;
  shooterPos: Vec3;
  shooterFacing: { x: number; y: number };
  hoopPos: Vec3;
  frames: HighlightFrame[];
  rimHitsAt: number[];
  scoreAtTime: number;
  duration: number;
  priorityScore: number;
  recordedAt: number;
}

export interface RackConfig {
  id: number;
  label: string;
  shortLabel: string;
  ballsCount: number;
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

export interface RimHangState {
  angle: number;
  angularVel: number;
  duration: number;
  elapsed: number;
  willScore: boolean;
  bounces: number;
  lastBounceStep: number;
}

export interface ActiveBall {
  id: number;
  rackIndex: number;
  ballIndex: number;
  isMoney: boolean;
  multiplierAtRelease: number;
  streakAtRelease?: number;
  difficultyLevelAtRelease?: number;
  timingQualityAtRelease?: TimingQuality;
  isBuzzerBeater: boolean;
  ballSkin?: BallSkinId;
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
  hadRimHang?: boolean;
  rimHangDone?: boolean;
  rimHang?: RimHangState;
  shooterPosAtRelease?: Vec3;
  shooterFacingAtRelease?: { x: number; y: number };
  hoopPosAtRelease?: Vec3;
  windMphAtRelease?: number;
  highlightFrames?: HighlightFrame[];
  rimHitTimes?: number[];
  highlightScoreAtTime?: number;
  highlightMeta?: {
    pointsAwarded: number;
    multiplier: number;
    streakAtMake: number;
    isCleanSwish: boolean;
    priorityScore: number;
  };
  highlightSaved?: boolean;
  instantReplayTriggered?: boolean;
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
  behindBackboard?: boolean;
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

export type ShooterAnimState =
  | 'DRIBBLING'
  | 'GATHER'
  | 'RELEASE'
  | 'FOLLOW_THROUGH'
  | 'LANDING'
  | 'PICKUP'
  | 'RUNNING';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED';

export type FriendPresence = 'ONLINE' | 'IN_MATCH' | 'QUEUED' | 'OFFLINE';

export interface FriendshipRecord {
  pairId: string;
  memberUids: [string, string];
  requesterUid: string;
  requesterName: string;
  recipientUid: string;
  recipientName: string;
  friendUid: string;
  friendUsername: string;
  status: FriendshipStatus;
  isIncoming: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface GlobalRankingEntry {
  uid: string;
  username: string;
  bestScore: number;
  bestCourtId: CourtThemeId;
  bestStreak: number;
  totalSwishes: number;
  pvpMatchesPlayed: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  lastScore: number;
  lastCourtId: CourtThemeId;
  updatedAtMs: number;
}

export interface MatchInvitePayload {
  inviteId: string;
  fromUid: string;
  fromSessionId: string;
  fromName: string;
  toUid: string;
  toName: string;
  isRematch: boolean;
  leagueId: string | null;
  leagueName: string | null;
  expiresAtMs: number;
}

export interface PvpBallRecord {
  status: 'PENDING' | 'MADE' | 'MISSED';
  isMoney: boolean;
  pointsAwarded: number;
}

export interface PvpPlayerSnapshot {
  id: string;
  uid?: string | null;
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
  profileBestScore?: number;
  profileBestStreak?: number;
  profileAccuracyPct?: number;
}

export interface PvpMatchSnapshot {
  roomId: string;
  code: string | null;
  leagueId?: string | null;
  leagueName?: string | null;
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
  countdownLeft: number;
  timeLeft: number;
  winnerId: string | null;
  isTie: boolean;
  forfeitById: string | null;
  players: PvpPlayerSnapshot[];
}

export interface PvpLobbyShooter {
  id: string;
  name: string;
  status: 'LOBBY' | 'QUEUED' | 'IN_MATCH';
  record: PvpRecord;
}

export interface PvpLobbyStats {
  onlinePlayers: number;
  queuedPlayers: number;
  activeMatches: number;
  leagueQueued?: Record<string, number>;
  onlineShooters?: PvpLobbyShooter[];
}

export interface PvpLeague {
  id: string;
  name: string;
  description: string;
  code: string;
  isPublic: boolean;
  ownerUid: string;
  ownerName: string;
  memberUids: string[];
  memberCount: number;
  maxMembers: number;
  createdAtMs: number;
}

export interface PvpLeagueMember {
  uid: string;
  username: string;
  role: 'OWNER' | 'MEMBER';
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  leaguePoints: number;
  bestScore: number;
  joinedAtMs: number;
}

export interface UserLeagueSummary {
  leagueId: string;
  leagueName: string;
  code: string;
  role: 'OWNER' | 'MEMBER';
  joinedAtMs: number;
}

export interface OpponentGhostState {
  active: boolean;
  name: string;
  pos: Vec3;
  targetPos?: Vec3;
  facing?: { x: number; y: number };
  z: number;
  rackIndex: number;
  streak: number;
  followThrough: number;
  runPhase?: number;
  runBlend?: number;
  isMoving?: boolean;
}

export interface HudSnapshot {
  mode: GameMode;
  phase: GamePhase;
  score: number;
  bestScore: number;
  career: CareerStats;
  careerBaseline: CareerBaseline;
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
  lastReleaseMeter: number;
  lastTimingQuality: TimingQuality | null;
  activeBallsInAir: number;
  pvpMatch: PvpMatchSnapshot | null;
  myPlayerId: string | null;
  crowdReaction: CrowdReactionOverlayData | null;
  wind: WindState;
  hoopPos: Vec3;
  heatCheckShiftIn: number;
  isMovingToRack: boolean;
  shooterAnimState: ShooterAnimState;
  stamina: number;
  consecutivePerfectShots: number;
  secondWindCount: number;
  secondWindActive: boolean;
  shotChart: ShotChartEntry[];
  staminaEfficiency: StaminaEfficiencyStats;
  courtTheme: CourtThemeId;
  ballSkin: BallSkinId;
  contestHighlight: ContestHighlight | null;
  lastHighlight: ContestHighlight | null;
  rivalries: RivalryRecord[];
  fastBreakElapsedMs: number;
  fastBreakFinishMs: number | null;
  fastBreakSplits: FastBreakSplit[];
  fastBreakIsNewBest: boolean;
  instantReplayEnabled: boolean;
  instantReplayActive: boolean;
  instantReplayHeadline: string | null;
  instantReplayPoints: number;
  cameraMode: CameraMode;
  shotTrajectoryEnabled: boolean;
  audioVolume: number;
  shotSensitivity: number;
  hapticIntensity: HapticIntensity;
}

export type HapticIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ShotTrajectoryArc {
  ballId: number;
  points: Vec3[];
  hoopPos: Vec3;
  rimCrossPoint?: Vec3;
  timingQuality: TimingQuality;
  isMoney: boolean;
  outcome: 'MADE' | 'MISSED' | null;
  age: number;
  fadeAfter: number;
  frozen: boolean;
}

