import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ChevronRight,
  Flame,
  Globe,
  GraduationCap,
  LogOut,
  Pencil,
  Play,
  RefreshCw,
  Settings,
  Swords,
  Timer,
  Trophy,
  UserCircle2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { fetchGlobalRankings } from '../firebase';
import { HALF_COURT_RACK_INDEX, RACK_CONFIGS } from '../game/constants';
import { COURT_THEMES, getCourtThemeConfig, getUnlockedCourtsCount } from '../game/courts';
import { formatFastBreakMs } from '../game/timeFormat';
import {
  CareerStats,
  ContestHighlight,
  CourtThemeId,
  GameMode,
  GlobalRankingEntry,
  PvpLeague,
  PvpLobbyStats,
  PvpMatchSnapshot,
  RivalryRecord,
  UserProfile,
} from '../game/types';
import { findRivalryForUsername, RivalBadgeIcon } from './RivalBadgeIcon';

interface TitleOverlayProps {
  mode: GameMode;
  moneyRack: number;
  career: CareerStats;
  muted: boolean;
  wsConnected: boolean;
  lobbyStats: PvpLobbyStats;
  playerName: string;
  userProfile: UserProfile | null;
  myPlayerId?: string | null;
  rivalries?: RivalryRecord[];
  inQueue: boolean;
  waitingRoom: PvpMatchSnapshot | null;
  pvpError: string | null;
  courtTheme: CourtThemeId;
  lastHighlight: ContestHighlight | null;
  activeLeague: PvpLeague | null;
  globalRankingsRefreshNonce?: number;
  friendsCount?: number;
  onlineFriendsCount?: number;
  incomingFriendRequestsCount?: number;
  hasModalOpen?: boolean;
  onSelectMode: (mode: GameMode) => void;
  onSelectMoneyRack: (rackIndex: number) => void;
  onChangePlayerName: (name: string) => void;
  onToggleMute: () => void;
  onOpenAuth: () => void;
  onOpenEditUsername: () => void;
  onOpenCourtLocker: () => void;
  onOpenSettings: () => void;
  onOpenHighlightReplay: () => void;
  onOpenLeagues: () => void;
  onOpenFriends: () => void;
  onClearActiveLeague: () => void;
  onSignOut: () => void;
  onStartSolo: () => void;
  onStartFastBreak: () => void;
  onStartHeatCheck: () => void;
  onStartPractice: () => void;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
}

interface ModeMetaInfo {
  id: GameMode;
  name: string;
  shortName: string;
  tagline: string;
  badge: string;
  accentHex: string;
  description: string;
  rules: string[];
  ctaLabel: string;
}

const MODE_CATALOG: ModeMetaInfo[] = [
  {
    id: 'SOLO',
    name: 'Solo Shootout',
    shortName: 'Solo',
    tagline: '1:10 · 5 Racks + Half Ct · Classic Contest',
    badge: '1:10',
    accentHex: '#00ffaa',
    description:
      'Drain consecutive threes across all 5 perimeter racks plus a bonus Half-Court Moneyball before the 1:10 clock hits zero.',
    rules: [
      '26 total shots (5 racks of 5 + 1 Half-Court Moneyball)',
      'Streaks scale multiplier up to 4x & speed the meter',
      'Money Ball rack & Half-Court shot double points & swish bonus',
    ],
    ctaLabel: 'Start Contest',
  },
  {
    id: 'FAST_BREAK',
    name: 'Fast-Break',
    shortName: 'Fast',
    tagline: 'Time Attack · Live Split Timers',
    badge: 'RACE',
    accentHex: '#00ffaa',
    description:
      'Sprint rack-to-rack and drain the Half-Court Moneyball across all 26 shots as fast as possible while chasing split PBs.',
    rules: [
      'Stopwatch tracks live pace across all 5 racks & Half Court',
      'Split deltas compare live against your fastest finish',
      'Clean releases save stamina so sprint speed stays crisp',
    ],
    ctaLabel: 'Start Fast-Break',
  },
  {
    id: 'HEAT_CHECK',
    name: 'Heat Check',
    shortName: 'Heat',
    tagline: 'No Clock · Moving Hoop · Survival',
    badge: 'ENDLESS',
    accentHex: '#FDE047',
    description:
      'Pure survival shootout with no shot clock — adjust your timing as the basket shifts every few seconds.',
    rules: [
      'Endless racks + Half Court — one miss ends the run',
      'Hoop relocates periodically and sways on hot streaks',
      'Rack up all-time streak records & court unlocks',
    ],
    ctaLabel: 'Start Heat Check',
  },
  {
    id: 'PRACTICE',
    name: 'Practice Guide',
    shortName: 'Guide',
    tagline: 'No Clock · Always-On Timing Window',
    badge: 'GUIDE',
    accentHex: '#00ffaa',
    description:
      'Dial in your jump-shot rhythm with unlimited stamina and bright visual cues over the Gold sweet spot.',
    rules: [
      'On-screen guide highlights Early, Good, Gold Perfect & Late',
      'No countdown pressure or stamina drain between racks',
      'Ideal for mastering 3pt racks & the Half-Court Moneyball',
    ],
    ctaLabel: 'Start Practice',
  },
  {
    id: 'PVP',
    name: 'Online 1v1 PVP',
    shortName: 'PVP',
    tagline: 'Head-to-Head · Custom Leagues & Rooms',
    badge: '1V1',
    accentHex: '#00ffaa',
    description:
      'Go head-to-head in real-time 1:10 (70-second) 26-ball shootouts with live rival tally and league standings.',
    rules: [
      'Same wind & 1:10 (70s) arena clock for both shooters',
      '5 perimeter racks + 1 Half-Court Moneyball (26 balls)',
      'Every contest updates head-to-head Rivalry records',
    ],
    ctaLabel: 'Find Opponent',
  },
];

const screenVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? 28 : -28,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? -28 : 28,
  }),
};

function renderModeIcon(modeId: GameMode, className = 'w-4 h-4') {
  switch (modeId) {
    case 'FAST_BREAK':
      return <Timer className={className} />;
    case 'HEAT_CHECK':
      return <Flame className={className} />;
    case 'PRACTICE':
      return <GraduationCap className={className} />;
    case 'PVP':
      return <Swords className={className} />;
    default:
      return <Trophy className={className} />;
  }
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  mode,
  moneyRack,
  career,
  muted,
  wsConnected,
  lobbyStats,
  playerName,
  userProfile,
  myPlayerId = null,
  rivalries = [],
  inQueue,
  waitingRoom,
  pvpError,
  courtTheme,
  lastHighlight,
  activeLeague,
  globalRankingsRefreshNonce = 0,
  friendsCount = 0,
  onlineFriendsCount = 0,
  incomingFriendRequestsCount = 0,
  hasModalOpen = false,
  onSelectMode,
  onSelectMoneyRack,
  onToggleMute,
  onOpenAuth,
  onOpenEditUsername,
  onOpenCourtLocker,
  onOpenSettings,
  onOpenHighlightReplay,
  onOpenLeagues,
  onOpenFriends,
  onClearActiveLeague,
  onSignOut,
  onStartSolo,
  onStartFastBreak,
  onStartHeatCheck,
  onStartPractice,
  onJoinQueue,
  onLeaveQueue,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}) => {
  const [screen, setScreen] = useState<'LOBBY' | 'MODE'>(() =>
    waitingRoom || inQueue ? 'MODE' : 'LOBBY'
  );
  const [lobbyTab, setLobbyTab] = useState<'PLAY' | 'GLOBAL'>('PLAY');
  const [navDir, setNavDir] = useState<number>(1);
  const [joinCode, setJoinCode] = useState('');
  const [globalRankings, setGlobalRankings] = useState<GlobalRankingEntry[]>([]);
  const [myGlobalEntry, setMyGlobalEntry] = useState<GlobalRankingEntry | null>(null);
  const [myGlobalRank, setMyGlobalRank] = useState<number | null>(null);
  const [globalRankingsLoading, setGlobalRankingsLoading] = useState(false);
  const [globalRankingsError, setGlobalRankingsError] = useState<string | null>(null);
  const [manualGlobalRankingsReload, setManualGlobalRankingsReload] = useState(0);
  const prevWaitingOrQueueRef = useRef(Boolean(waitingRoom || inQueue));

  useEffect(() => {
    if (screen !== 'LOBBY' || lobbyTab !== 'GLOBAL') return;
    if (!userProfile) {
      setGlobalRankings([]);
      setMyGlobalEntry(null);
      setMyGlobalRank(null);
      setGlobalRankingsLoading(false);
      setGlobalRankingsError(null);
      return;
    }

    let cancelled = false;
    setGlobalRankingsLoading(true);
    setGlobalRankingsError(null);

    void fetchGlobalRankings(userProfile.uid, 100)
      .then((res) => {
        if (cancelled) return;
        setGlobalRankings(res.entries);
        setMyGlobalEntry(res.myEntry);
        setMyGlobalRank(res.myRank);
      })
      .catch(() => {
        if (cancelled) return;
        setGlobalRankingsError('Could not load global PVP rankings. Tap refresh to try again.');
      })
      .finally(() => {
        if (!cancelled) setGlobalRankingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    screen,
    lobbyTab,
    userProfile?.uid,
    globalRankingsRefreshNonce,
    manualGlobalRankingsReload,
  ]);

  // Auto-transition into Mode screen whenever matchmaking queue or private room activates
  useEffect(() => {
    const active = Boolean(waitingRoom || inQueue);
    if (active && !prevWaitingOrQueueRef.current) {
      setNavDir(1);
      setScreen('MODE');
    }
    prevWaitingOrQueueRef.current = active;
  }, [waitingRoom, inQueue]);

  // Allow Escape key to return cleanly from Mode screen back to Lobby when no modal is open
  useEffect(() => {
    if (screen !== 'MODE' || hasModalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== 'Escape') return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      ev.preventDefault();
      setNavDir(-1);
      setScreen('LOBBY');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, hasModalOpen]);

  const activeModeInfo =
    MODE_CATALOG.find((m) => m.id === mode) ?? MODE_CATALOG[0];
  const activeCourt = getCourtThemeConfig(courtTheme);
  const unlockedCourts = getUnlockedCourtsCount(career);
  const showMoneyRack = mode !== 'PVP' || (!waitingRoom && !inQueue && userProfile !== null);
  const hasPvpRecord = career.pvpWins + career.pvpLosses + career.pvpDraws > 0;
  const careerAvgScore =
    career.contestsPlayed > 0
      ? (career.totalCareerScore / career.contestsPlayed).toFixed(1)
      : '—';
  const careerSwishPct =
    career.totalSwishTrackedAttempts > 0
      ? `${Math.round((career.totalSwishes / career.totalSwishTrackedAttempts) * 100)}%`
      : '—';

  const handleOpenModeScreen = (nextMode: GameMode) => {
    onSelectMode(nextMode);
    setNavDir(1);
    setScreen('MODE');
  };

  const handleBackToLobby = () => {
    setNavDir(-1);
    setScreen('LOBBY');
  };

  const handleJoinSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length >= 4) {
      onJoinRoom(cleaned);
    }
  };

  const handlePrimaryModeLaunch = () => {
    if (mode === 'SOLO') onStartSolo();
    else if (mode === 'FAST_BREAK') onStartFastBreak();
    else if (mode === 'HEAT_CHECK') onStartHeatCheck();
    else if (mode === 'PRACTICE') onStartPractice();
    else if (mode === 'PVP') {
      if (!userProfile) onOpenAuth();
      else if (inQueue) onLeaveQueue();
      else onJoinQueue();
    }
  };

  const renderUserAccountChip = (compact = false) => (
    <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-[#05070B]/96 border border-white/35 backdrop-blur-md px-2.5 sm:px-3 py-1 rounded-full shrink-0 shadow-lg">
      {userProfile ? (
        <>
          <button
            type="button"
            onClick={onOpenEditUsername}
            title="Edit username"
            aria-label={`Edit username @${userProfile.username}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer min-h-[36px] px-0.5"
          >
            <UserCircle2 className="w-3.5 h-3.5 text-[#00ffaa] shrink-0" />
            <span className={compact ? 'max-w-[66px] truncate' : 'max-w-[116px] truncate'}>
              @{userProfile.username}
            </span>
            <Pencil className="w-3 h-3 text-[#F8FAFC] shrink-0" />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex items-center justify-center gap-1 min-w-[34px] min-h-[34px] px-2 rounded-full bg-[#141824] hover:bg-[#1E2434] border border-white/25 font-mono text-[10px] font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!compact && <span className="hidden sm:inline">Out</span>}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenEditUsername}
            title="Edit display name"
            aria-label={`Edit display name ${playerName}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer min-h-[36px] px-0.5"
          >
            <UserCircle2 className="w-3.5 h-3.5 text-[#00ffaa] shrink-0" />
            <span className={compact ? 'max-w-[64px] truncate' : 'max-w-[104px] truncate'}>
              {playerName}
            </span>
            <Pencil className="w-3 h-3 text-[#F8FAFC] shrink-0" />
          </button>
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-[32px] px-2.5 py-1 rounded-full bg-[#141824] hover:bg-[#00ffaa] border border-white/30 hover:border-[#00ffaa] hover:text-[#05070B] font-mono text-[10px] font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
          >
            Sign In
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        title={muted ? 'Unmute audio' : 'Mute audio'}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-[#141824] hover:bg-[#1E2434] border border-white/25 text-[#FFFFFF] transition-colors cursor-pointer shrink-0"
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open Settings"
        title="Settings"
        className="flex items-center justify-center w-9 h-9 rounded-full bg-[#141824] hover:bg-[#00ffaa] hover:text-[#05070B] border border-white/25 hover:border-[#00ffaa] text-[#FFFFFF] transition-colors cursor-pointer shrink-0"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderMoneyRackSelector = () => {
    if (!showMoneyRack) return null;
    const perimeterRacks = RACK_CONFIGS.filter((r) => r.id !== HALF_COURT_RACK_INDEX);
    const selectedRack =
      perimeterRacks.find((r) => r.id === moneyRack) ??
      perimeterRacks[perimeterRacks.length - 1];
    return (
      <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] mb-2.5">
          <span className="text-[#F8FAFC] font-semibold">
            Money Ball Rack · <span className="text-[#FFFFFF] font-bold">{selectedRack.label}</span>
          </span>
          <span className="text-[#00ffaa] font-bold">2X + HALF CT</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {perimeterRacks.map((rack) => {
            const active = rack.id === moneyRack;
            return (
              <button
                key={rack.id}
                type="button"
                onClick={() => onSelectMoneyRack(rack.id)}
                className={`min-h-[44px] px-1 py-2 rounded-[2px] font-mono text-[11px] font-bold uppercase border transition-colors cursor-pointer text-center ${
                  active
                    ? 'bg-[#00ffaa] text-[#05070B] border-[#00ffaa]'
                    : 'bg-[#141824] text-[#FFFFFF] border-white/30 hover:border-white/70 hover:bg-[#1E2434]'
                }`}
              >
                {rack.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCourtPickerCard = () => (
    <button
      type="button"
      onClick={onOpenCourtLocker}
      className="w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 bg-[#101520] hover:bg-[#182030] border border-white/30 hover:border-[#00ffaa]/85 rounded-[4px] transition-colors cursor-pointer text-left"
      title="Open Court Locker"
    >
      <span
        className="w-6 h-6 rounded-[2px] border border-white/45 shrink-0 grid grid-cols-2 overflow-hidden"
        aria-hidden="true"
      >
        <span style={{ backgroundColor: activeCourt.palette.plankColors[0] }} />
        <span style={{ backgroundColor: activeCourt.palette.paint }} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] block leading-none">
          Arena Hardwood
        </span>
        <span className="text-xs font-semibold text-[#FFFFFF] truncate block mt-1">
          {activeCourt.name}
        </span>
      </div>
      <span className="font-mono text-[11px] font-bold text-[#00ffaa] tabular-nums shrink-0">
        {unlockedCourts}/{COURT_THEMES.length}
      </span>
      <ChevronRight className="w-4 h-4 text-[#F8FAFC] shrink-0" />
    </button>
  );

  const renderFriendsButtonCard = () => {
    const hasIncoming = incomingFriendRequestsCount > 0;
    const statusLabel = hasIncoming
      ? `${incomingFriendRequestsCount} Request${incomingFriendRequestsCount === 1 ? '' : 's'}`
      : onlineFriendsCount > 0
        ? `${onlineFriendsCount} Online`
        : friendsCount > 0
          ? `${friendsCount} Total`
          : 'Add Rivals';
    return (
      <button
        type="button"
        onClick={onOpenFriends}
        className={`w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-[4px] border transition-colors cursor-pointer text-left ${
          hasIncoming
            ? 'bg-[#1F1804] border-[#FDE047]/80 hover:border-[#FDE047]'
            : 'bg-[#101520] hover:bg-[#182030] border-white/30 hover:border-[#00ffaa]/85'
        }`}
        title="Open Friends Roster & Match Requests"
      >
        <span className="w-6 h-6 rounded-[2px] border border-white/35 bg-[#05070B] text-[#00ffaa] shrink-0 flex items-center justify-center">
          <Users className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] block leading-none">
            Social &amp; Rematch
          </span>
          <span className="text-xs font-semibold text-[#FFFFFF] truncate block mt-1">
            Friends &amp; Challenges
          </span>
        </div>
        <span
          className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
            hasIncoming ? 'text-[#FEF08A]' : 'text-[#00ffaa]'
          }`}
        >
          {statusLabel}
        </span>
        <ChevronRight className="w-4 h-4 text-[#F8FAFC] shrink-0" />
      </button>
    );
  };

  const renderLobbyTabBar = () => (
    <div
      role="tablist"
      aria-label="Lobby sections"
      className="grid grid-cols-2 gap-1 bg-[#05070B] p-1 rounded-[4px] border border-white/30"
    >
      <button
        type="button"
        role="tab"
        aria-selected={lobbyTab === 'PLAY'}
        onClick={() => setLobbyTab('PLAY')}
        className={`min-h-[38px] px-2.5 py-1.5 rounded-[2px] font-sans text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer ${
          lobbyTab === 'PLAY'
            ? 'bg-[#00ffaa] text-[#05070B]'
            : 'bg-[#141824] text-[#FFFFFF] hover:bg-[#1E2434]'
        }`}
      >
        Play Modes
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={lobbyTab === 'GLOBAL'}
        onClick={() => setLobbyTab('GLOBAL')}
        className={`min-h-[38px] px-2.5 py-1.5 rounded-[2px] font-sans text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${
          lobbyTab === 'GLOBAL'
            ? 'bg-[#00ffaa] text-[#05070B]'
            : 'bg-[#141824] text-[#FFFFFF] hover:bg-[#1E2434]'
        }`}
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span>Global Rankings</span>
      </button>
    </div>
  );

  const renderGlobalRankingsTab = () => (
    <div className="space-y-3">
      {/* Global PVP Top 100 Header Banner */}
      <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-[2px] border border-[#00ffaa]/75 bg-[#04241B] text-[#00ffaa] shrink-0 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block leading-none">
                Global Top 100 · PVP Only
              </span>
              <span className="text-sm font-bold text-[#FFFFFF] truncate block mt-1">
                Worldwide 1v1 Shooters
              </span>
            </div>
          </div>

          {userProfile && (
            <button
              type="button"
              onClick={() => setManualGlobalRankingsReload((n) => n + 1)}
              disabled={globalRankingsLoading}
              aria-label="Refresh global PVP rankings"
              title="Refresh global PVP rankings"
              className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#00ffaa] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${globalRankingsLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <p className="font-mono text-[10px] text-[#F8FAFC] mt-2 leading-snug">
          Top single-match Online 1v1 PVP scores across all four courts.
        </p>
      </div>

      {!userProfile ? (
        <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-4 space-y-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
            Firebase Worldwide PVP Leaderboard
          </div>
          <p className="text-xs text-[#F8FAFC] leading-relaxed">
            Sign in with your shooter handle to view the{' '}
            <strong className="text-[#FFFFFF]">Top 100 PVP Players Worldwide</strong> across all
            courts and post verified 1v1 PVP scores.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Sign In / Create Handle
          </button>
        </div>
      ) : (
        <>
          {/* Current User Worldwide Standing Card */}
          <div className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[4px] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] truncate">
                Worldwide Standing · @{userProfile.username}
              </span>
              <span className="font-mono text-xs font-bold text-[#FEF08A] tabular-nums shrink-0">
                {myGlobalRank
                  ? `Global #${myGlobalRank}`
                  : myGlobalEntry
                    ? 'Outside Top 100'
                    : 'Unranked'}
              </span>
            </div>
            {myGlobalEntry ? (
              <div className="space-y-2 pt-2 border-t border-white/25">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="font-mono text-[9px] font-bold uppercase text-[#F8FAFC] block">
                      PVP Best
                    </span>
                    <span className="font-mono text-sm font-bold text-[#00ffaa] tabular-nums">
                      {myGlobalEntry.bestScore} PTS
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[9px] font-bold uppercase text-[#F8FAFC] block">
                      PVP Record
                    </span>
                    <span className="font-mono text-sm font-bold text-[#FFFFFF] tabular-nums">
                      {myGlobalEntry.pvpWins}W-{myGlobalEntry.pvpLosses}L
                      {myGlobalEntry.pvpDraws > 0 ? `-${myGlobalEntry.pvpDraws}D` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[9px] font-bold uppercase text-[#F8FAFC] block">
                      Best Streak
                    </span>
                    <span className="font-mono text-sm font-bold text-[#FFFFFF] tabular-nums">
                      {myGlobalEntry.bestStreak}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-[#F8FAFC] pt-1.5 border-t border-white/20">
                  <span>Top Court</span>
                  <span className="text-[#FFFFFF] font-semibold">
                    {getCourtThemeConfig(myGlobalEntry.bestCourtId).name}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#F8FAFC] leading-snug">
                No Online 1v1 PVP match completed yet. Play any PVP match on any court to enter
                the Global Top 100.
              </p>
            )}
          </div>

          {/* Global Top 100 Leaderboard Rows */}
          <div className="bg-[#05070B] border border-white/30 rounded-[4px] overflow-hidden">
            <div className="px-3 py-2 border-b border-white/25 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF]">
                Top 100 PVP Shooters
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase text-[#F8FAFC] tabular-nums">
                {globalRankings.length} / 100
              </span>
            </div>

            {globalRankingsLoading && globalRankings.length === 0 ? (
              <div className="p-4 text-center font-mono text-xs text-[#F8FAFC]">
                Loading worldwide PVP rankings...
              </div>
            ) : globalRankingsError ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs font-medium text-[#FEE2E2]">{globalRankingsError}</p>
                <button
                  type="button"
                  onClick={() => setManualGlobalRankingsReload((n) => n + 1)}
                  className="min-h-[34px] px-3 py-1 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-[10px] font-bold uppercase text-[#FFFFFF] cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : globalRankings.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#F8FAFC] leading-relaxed">
                No Online 1v1 PVP scores posted yet. Enter a PVP shootout to claim Global #1!
              </div>
            ) : (
              <div className="divide-y divide-white/20 max-h-[310px] overflow-y-auto">
                {globalRankings.map((entry, idx) => {
                  const rank = idx + 1;
                  const isMe = entry.uid === userProfile.uid;
                  const courtName = getCourtThemeConfig(entry.bestCourtId).name;
                  const rankColor =
                    rank === 1
                      ? 'text-[#FEF08A] border-[#FDE047]/80 bg-[#1F1804]'
                      : rank === 2
                        ? 'text-[#FFFFFF] border-white/60 bg-[#1E2434]'
                        : rank === 3
                          ? 'text-[#FED7AA] border-[#FB923C]/80 bg-[#231407]'
                          : 'text-[#F8FAFC] border-white/30 bg-[#141824]';
                  return (
                    <div
                      key={entry.uid}
                      className={`px-3 py-2.5 flex items-center gap-2.5 ${
                        isMe ? 'bg-[#04241B]' : ''
                      }`}
                    >
                      <span
                        className={`min-w-[2.15rem] h-7 px-1 rounded-[2px] border font-mono text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums ${rankColor}`}
                      >
                        #{rank}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-xs font-bold truncate ${
                              isMe ? 'text-[#00ffaa]' : 'text-[#FFFFFF]'
                            }`}
                          >
                            @{entry.username}
                          </span>
                          {!isMe && (
                            <RivalBadgeIcon
                              rivalry={findRivalryForUsername(
                                rivalries,
                                entry.username,
                                userProfile.username
                              )}
                            />
                          )}
                          {isMe && (
                            <span className="font-mono text-[9px] font-bold uppercase text-[#A7F3D0] shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-[#F8FAFC] truncate tabular-nums">
                          {courtName} · {entry.pvpWins}W-{entry.pvpLosses}L · {entry.bestStreak} strk
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-sm font-bold text-[#FFFFFF] tabular-nums block leading-none">
                          {entry.bestScore}
                        </span>
                        <span className="font-mono text-[9px] font-bold uppercase text-[#00ffaa] block mt-0.5">
                          PTS
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderModeSpecificContent = () => {
    if (mode === 'SOLO') {
      return (
        <div className="space-y-3">
          <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                Contest Format
              </span>
              <span className="font-mono text-[10px] font-bold uppercase text-[#F8FAFC]">
                1:10 · 26 Balls
              </span>
            </div>
            <p className="text-[13px] text-[#FFFFFF] leading-relaxed">
              {activeModeInfo.description}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/25">
              <div>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                  Best Score
                </span>
                <span className="font-mono text-base font-bold text-[#00ffaa] tabular-nums">
                  {career.bestScore}
                </span>
              </div>
              <div>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                  Career Avg
                </span>
                <span className="font-mono text-base font-bold text-[#FFFFFF] tabular-nums">
                  {careerAvgScore}
                </span>
              </div>
              <div>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                  Swish %
                </span>
                <span className="font-mono text-base font-bold text-[#FFFFFF] tabular-nums">
                  {careerSwishPct}
                </span>
              </div>
            </div>
          </div>

          <ul className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 space-y-1.5 text-xs text-[#F8FAFC]">
            {activeModeInfo.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ffaa] mt-1.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (mode === 'FAST_BREAK') {
      return (
        <div className="space-y-3">
          <div className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[4px] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                Time Attack Splits
              </span>
              <span className="font-mono text-xs font-bold text-[#00ffaa] tabular-nums">
                {career.bestFastBreakMs > 0
                  ? `PB ${formatFastBreakMs(career.bestFastBreakMs)}`
                  : 'No PB Yet'}
              </span>
            </div>
            <p className="text-[13px] text-[#FFFFFF] leading-relaxed">
              {activeModeInfo.description}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-2 border-t border-white/25">
              {RACK_CONFIGS.map((rack, idx) => {
                const splitMs = career.bestFastBreakSplitsMs[idx] ?? 0;
                return (
                  <div
                    key={rack.id}
                    className="bg-[#141824] border border-white/30 rounded-[2px] px-1.5 py-1.5 text-center"
                  >
                    <span className="font-mono text-[9px] font-bold uppercase text-[#F8FAFC] block">
                      R{idx + 1} · {rack.shortLabel}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#FFFFFF] tabular-nums block mt-0.5">
                      {splitMs > 0 ? formatFastBreakMs(splitMs) : '--.--'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 space-y-1.5 text-xs text-[#F8FAFC]">
            {activeModeInfo.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ffaa] mt-1.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (mode === 'HEAT_CHECK') {
      return (
        <div className="space-y-3">
          <div className="bg-[#05070B] border border-[#FDE047]/75 rounded-[4px] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FEF08A]">
                Endless Sudden Death
              </span>
              <span className="font-mono text-xs font-bold text-[#FEF08A] tabular-nums">
                Record: {career.allTimeBestStreak} Streak
              </span>
            </div>
            <p className="text-[13px] text-[#FFFFFF] leading-relaxed">
              {activeModeInfo.description}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/25">
              <div>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                  Shot Clock
                </span>
                <span className="font-mono text-sm font-bold text-[#FFFFFF]">Unlimited</span>
              </div>
              <div>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                  Basket Behavior
                </span>
                <span className="font-mono text-sm font-bold text-[#FEF08A]">Dynamic Shift</span>
              </div>
            </div>
          </div>

          <ul className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 space-y-1.5 text-xs text-[#F8FAFC]">
            {activeModeInfo.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FDE047] mt-1.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (mode === 'PRACTICE') {
      return (
        <div className="space-y-3">
          <div className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[4px] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                Release Timing Blueprint
              </span>
              <span className="font-mono text-[10px] font-bold uppercase text-[#F8FAFC]">
                No Clock · Guide On
              </span>
            </div>
            <p className="text-[13px] text-[#FFFFFF] leading-relaxed">
              {activeModeInfo.description}
            </p>

            {/* Visual Meter Guide Bar */}
            <div className="bg-[#101520] border border-white/30 rounded-[2px] p-2.5 space-y-2">
              <div className="flex items-center justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-[#FFFFFF]">
                <span>Early</span>
                <span className="text-[#A7F3D0]">Good</span>
                <span className="text-[#FEF08A] font-bold">Gold Perfect</span>
                <span className="text-[#FEE2E2]">Late</span>
              </div>
              <div className="relative h-3.5 w-full rounded-[2px] bg-[#05070B] overflow-hidden flex border border-white/35">
                <div className="h-full bg-[#7DD3FC]/65" style={{ width: '50%' }} />
                <div className="h-full bg-[#34D399]/85" style={{ width: '16%' }} />
                <div
                  className="h-full bg-[#FDE047] shadow-[0_0_10px_rgba(253,224,71,0.8)]"
                  style={{ width: '16%' }}
                />
                <div className="h-full bg-[#34D399]/85" style={{ width: '12%' }} />
                <div className="h-full bg-[#FCA5A5]/80" style={{ width: '6%' }} />
              </div>
              <p className="font-mono text-[10px] text-[#F8FAFC] leading-snug">
                Hold touch or Space until the bar enters the <strong className="text-[#FEF08A]">Gold bracket</strong>, then lift to swish.
              </p>
            </div>
          </div>

          <ul className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 space-y-1.5 text-xs text-[#F8FAFC]">
            {activeModeInfo.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ffaa] mt-1.5 shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // PVP Mode Screen Content
    return (
      <div className="space-y-3">
        {!userProfile ? (
          <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                Online 1v1 Shootout
              </span>
              <span className="font-mono text-[10px] font-bold text-[#F8FAFC] tabular-nums">
                {wsConnected ? `${lobbyStats.onlinePlayers} Online` : 'Connecting'}
              </span>
            </div>
            <div className="text-sm font-bold text-[#FFFFFF]">
              Sign In for Online PVP &amp; Leagues
            </div>
            <p className="text-xs text-[#F8FAFC] leading-relaxed">
              Claim a persistent shooter handle to match opponents worldwide, create private 4-letter rooms, and climb league tables.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full min-h-[48px] py-3 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Sign In / Create Handle
            </button>
          </div>
        ) : waitingRoom ? (
          <div className="bg-[#05070B] border border-[#00ffaa]/80 rounded-[4px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] truncate">
                  {waitingRoom.leagueName
                    ? `${waitingRoom.leagueName} · Private Code`
                    : 'Private Room Code'}
                </div>
                <div className="font-mono text-3xl font-bold text-[#00ffaa] tracking-[0.22em] mt-1">
                  {waitingRoom.code}
                </div>
              </div>
              <button
                type="button"
                onClick={onLeaveRoom}
                className="min-h-[44px] px-4 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-xs font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer shrink-0"
              >
                Leave
              </button>
            </div>
            <p className="text-xs text-[#F8FAFC] leading-relaxed">
              Share this 4-character room code with a friend. The contest starts automatically once both players are ready.
            </p>
          </div>
        ) : (
          <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3.5 space-y-3">
            {/* League Scope Row */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/25">
              <div className="min-w-0 flex items-center gap-2 text-xs">
                <Trophy
                  className={`w-4 h-4 shrink-0 ${
                    activeLeague ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                  }`}
                />
                <div className="min-w-0">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block leading-none">
                    Matchmaking Pool
                  </span>
                  <span className="font-semibold text-[#FFFFFF] truncate block mt-0.5">
                    {activeLeague ? activeLeague.name : 'Global Arena'}
                  </span>
                </div>
                {activeLeague && (
                  <button
                    type="button"
                    onClick={onClearActiveLeague}
                    title="Switch back to Global Arena"
                    aria-label="Clear active league"
                    className="p-1.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/30 text-[#FFFFFF] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onOpenFriends}
                  className={`min-h-[40px] px-2.5 py-1.5 rounded-[2px] border font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                    incomingFriendRequestsCount > 0
                      ? 'border-[#FDE047] bg-[#1F1804] text-[#FEF08A]'
                      : 'border-white/40 bg-[#141824] text-[#FFFFFF] hover:border-[#00ffaa] hover:text-[#00ffaa]'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>
                    {incomingFriendRequestsCount > 0
                      ? `Friends (${incomingFriendRequestsCount})`
                      : onlineFriendsCount > 0
                        ? `Friends (${onlineFriendsCount})`
                        : 'Friends'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLeagues}
                  className="min-h-[40px] px-3 py-1.5 rounded-[2px] border border-[#00ffaa]/85 bg-[#04241B] text-[#A7F3D0] hover:bg-[#00ffaa] hover:text-[#05070B] font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer whitespace-nowrap"
                >
                  {activeLeague ? 'League' : 'Leagues'}
                </button>
              </div>
            </div>

            {inQueue ? (
              <div className="bg-[#04241B] border border-[#00ffaa]/75 rounded-[2px] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                    Finding Opponent...
                  </div>
                  <p className="text-xs text-[#F8FAFC] mt-0.5 truncate">
                    {activeLeague
                      ? `Matching inside ${activeLeague.name}`
                      : `Searching Global Arena (${lobbyStats.queuedPlayers} queued)`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLeaveQueue}
                  className="min-h-[40px] px-3 py-1.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-[10px] font-bold uppercase cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[#F8FAFC] uppercase tracking-wider">
                  <span>Private Match</span>
                  <span>
                    Record: {career.pvpWins}W-{career.pvpLosses}L-{career.pvpDraws}D
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!wsConnected}
                  onClick={onCreateRoom}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 disabled:bg-[#1A202C] disabled:text-[#F1F5F9] disabled:border-white/20 font-mono text-xs font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer"
                >
                  Create Private Room
                </button>

                <form onSubmit={handleJoinSubmit} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    maxLength={4}
                    value={joinCode}
                    onChange={(ev) => setJoinCode(ev.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    aria-label="Room Code"
                    className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-[2px] bg-[#0B0F17] border border-white/40 font-mono text-sm uppercase tracking-widest text-[#FFFFFF] placeholder:text-[#E2E8F0] focus:outline-none focus:border-[#00ffaa]"
                  />
                  <button
                    type="submit"
                    disabled={!wsConnected || joinCode.trim().length < 4}
                    className="min-h-[44px] px-4 py-2 rounded-[2px] bg-[#FFFFFF] hover:bg-[#00ffaa] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-bold uppercase transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Join
                  </button>
                </form>
              </div>
            )}

            {pvpError && <div className="text-xs text-[#FEE2E2] font-semibold">{pvpError}</div>}
          </div>
        )}

        {(() => {
          const meName = userProfile?.username ?? playerName;
          const onlineOpponents = (lobbyStats.onlineShooters ?? []).filter(
            (s) => s.id !== myPlayerId
          );
          const recordedRivals = rivalries.filter(
            (r) => r.wins + r.losses + r.draws > 0
          );
          if (onlineOpponents.length === 0 && recordedRivals.length === 0) {
            return null;
          }
          const onlineKeys = new Set(
            onlineOpponents.map((o) => o.name.replace(/^@/, '').trim().toLowerCase())
          );
          const offlineRivals = recordedRivals
            .filter(
              (r) =>
                !onlineKeys.has(r.opponentName.replace(/^@/, '').trim().toLowerCase())
            )
            .slice(0, 5);

          return (
            <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
                  {onlineOpponents.length > 0 ? 'PVP Lobby Shooters' : 'Known Rivals'}
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums">
                  {onlineOpponents.length > 0
                    ? `${onlineOpponents.length} Active`
                    : `${recordedRivals.length} H2H`}
                </span>
              </div>

              <div className="divide-y divide-white/20 max-h-[144px] overflow-y-auto">
                {onlineOpponents.map((opp) => {
                  const rival = findRivalryForUsername(rivalries, opp.name, meName);
                  const oppDisplay = opp.name.startsWith('@') ? opp.name : `@${opp.name}`;
                  const statusColor =
                    opp.status === 'QUEUED'
                      ? 'text-[#00ffaa]'
                      : opp.status === 'IN_MATCH'
                        ? 'text-[#FEF08A]'
                        : 'text-[#F8FAFC]';
                  const statusText =
                    opp.status === 'QUEUED'
                      ? 'Queue'
                      : opp.status === 'IN_MATCH'
                        ? 'In Game'
                        : 'Lobby';
                  return (
                    <div
                      key={opp.id}
                      className="py-1.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-[#FFFFFF] truncate">
                          {oppDisplay}
                        </span>
                        <RivalBadgeIcon rivalry={rival} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] tabular-nums">
                        {rival ? (
                          <span
                            className={
                              rival.losses > rival.wins
                                ? 'text-[#FEE2E2] font-bold'
                                : rival.wins > rival.losses
                                  ? 'text-[#00ffaa] font-bold'
                                  : 'text-[#FEF08A] font-bold'
                            }
                          >
                            {rival.wins}-{rival.losses}
                          </span>
                        ) : (
                          <span className="text-[#F8FAFC]">
                            {opp.record.wins}W-{opp.record.losses}L
                          </span>
                        )}
                        <span className={`uppercase font-semibold ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {offlineRivals.map((r) => (
                  <div
                    key={r.opponentKey}
                    className="py-1.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-[#FFFFFF] truncate">
                        {r.opponentName.startsWith('@') ? r.opponentName : `@${r.opponentName}`}
                      </span>
                      <RivalBadgeIcon rivalry={r} />
                    </div>
                    <span
                      className={`font-mono text-[10px] font-bold tabular-nums shrink-0 ${
                        r.losses > r.wins
                          ? 'text-[#FEE2E2]'
                          : r.wins > r.losses
                            ? 'text-[#00ffaa]'
                            : 'text-[#FEF08A]'
                      }`}
                    >
                      H2H {r.wins}-{r.losses}
                      {r.draws > 0 ? `-${r.draws}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderPrimaryCtaButton = (isMobileFooter = false) => {
    if (mode === 'PVP') {
      if (!userProfile) {
        return (
          <button
            type="button"
            onClick={onOpenAuth}
            className="w-full min-h-[52px] py-3.5 px-5 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] active:scale-[0.99] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-all cursor-pointer"
          >
            Sign In to Play PVP
          </button>
        );
      }
      if (waitingRoom) {
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-h-[52px] px-4 py-2.5 rounded-[2px] bg-[#05070B] border border-[#00ffaa]/80 flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#FFFFFF]">
                Room Ready
              </span>
              <span className="font-mono text-base font-bold text-[#00ffaa] tracking-widest">
                {waitingRoom.code}
              </span>
            </div>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="min-h-[52px] px-4 py-2.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase cursor-pointer"
            >
              Leave
            </button>
          </div>
        );
      }
      return (
        <button
          type="button"
          disabled={!wsConnected}
          onClick={inQueue ? onLeaveQueue : onJoinQueue}
          className={`w-full min-h-[52px] py-3.5 px-5 rounded-[2px] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-all cursor-pointer disabled:bg-[#1A202C] disabled:text-[#F1F5F9] ${
            inQueue
              ? 'bg-[#FFFFFF] text-[#05070B] hover:bg-[#FECACA]'
              : 'bg-[#00ffaa] text-[#05070B] hover:bg-[#33ffbb] active:scale-[0.99]'
          }`}
        >
          {inQueue
            ? isMobileFooter
              ? 'Cancel Search'
              : 'Searching Opponent...'
            : activeLeague
              ? 'League Match'
              : 'Quick Match'}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handlePrimaryModeLaunch}
        className="w-full min-h-[52px] py-3.5 px-5 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] active:scale-[0.99] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-all cursor-pointer"
      >
        {activeModeInfo.ctaLabel}
      </button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="absolute inset-0 z-10 flex flex-col md:flex-row overflow-hidden pointer-events-auto md:pointer-events-none"
    >
      {/* ===================================================================== */}
      {/* MOBILE TWO-SCREEN GAME SHELL (< md): LOBBY <-> DEDICATED MODE SCREEN  */}
      {/* ===================================================================== */}
      <div className="md:hidden fixed inset-0 flex flex-col overflow-hidden pointer-events-auto">
        <AnimatePresence mode="wait" custom={navDir}>
          {screen === 'LOBBY' ? (
            <motion.section
              key="mobile-lobby-screen"
              custom={navDir}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="flex-1 flex flex-col min-h-0"
              aria-label="Game Lobby"
            >
              {/* Top Arena Status + Account Pill */}
              <header className="shrink-0 min-h-[56px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-2 bg-[#05070B]/96 border-b border-white/30 backdrop-blur-md">
                <span
                  className={`font-mono text-[11px] font-bold uppercase tracking-[0.12em] tabular-nums truncate ${
                    wsConnected ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                  }`}
                >
                  {wsConnected ? `● ${lobbyStats.onlinePlayers} Online` : '● Offline Ready'}
                </span>
                {renderUserAccountChip(true)}
              </header>

              {/* Open Top Live-Arena Court Showcase Window */}
              <div className="shrink-0 px-4 py-4 bg-gradient-to-b from-[#05070B]/92 via-[#05070B]/78 to-[#0A0D14]/98 flex flex-col justify-end min-h-[126px]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h1 className="font-display text-3xl sm:text-[2.25rem] font-extrabold leading-[0.88] tracking-[-0.04em] text-[#00ffaa] uppercase drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]">
                      Downtown 3
                    </h1>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFFFFF] block mt-1.5 drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
                      Three-Point Shootout
                    </span>
                  </div>

                  {lastHighlight && (
                    <button
                      type="button"
                      onClick={onOpenHighlightReplay}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#05070B]/98 border border-[#00ffaa] text-[#00ffaa] hover:bg-[#00ffaa] hover:text-[#05070B] font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer tabular-nums shrink-0 shadow-lg"
                    >
                      <Play className="w-3 h-3 fill-current shrink-0" />
                      <span>+{lastHighlight.pointsAwarded} Replay</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Lobby Mode Selection Deck */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-[#0A0D14]/98 border-t border-white/30 px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
                {renderLobbyTabBar()}

                {lobbyTab === 'GLOBAL' ? (
                  renderGlobalRankingsTab()
                ) : (
                  <>
                    {/* Compact 4-Stat Career Strip */}
                    <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-3">
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                            Best
                          </span>
                          <span className="font-mono text-base font-bold text-[#FFFFFF] tabular-nums">
                            {career.bestScore}
                          </span>
                        </div>
                        <div>
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                            Career
                          </span>
                          <span className="font-mono text-base font-bold text-[#00ffaa] tabular-nums">
                            {career.totalCareerScore}
                          </span>
                        </div>
                        <div>
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                            Streak
                          </span>
                          <span className="font-mono text-base font-bold text-[#FFFFFF] tabular-nums">
                            {career.allTimeBestStreak}
                          </span>
                        </div>
                        <div>
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] block">
                            Fast PB
                          </span>
                          <span className="font-mono text-sm font-bold text-[#FFFFFF] tabular-nums">
                            {career.bestFastBreakMs > 0
                              ? formatFastBreakMs(career.bestFastBreakMs)
                              : '—'}
                          </span>
                        </div>
                      </div>
                      {hasPvpRecord && (
                        <div className="mt-2 pt-2 border-t border-white/25 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
                          <span className="text-[#F8FAFC]">PVP Record</span>
                          <span className="font-bold tabular-nums">
                            <span className="text-[#00ffaa]">{career.pvpWins}W</span>
                            <span className="text-[#F8FAFC]">-</span>
                            <span className="text-[#FEE2E2]">{career.pvpLosses}L</span>
                            {career.pvpDraws > 0 && (
                              <>
                                <span className="text-[#F8FAFC]">-</span>
                                <span className="text-[#FEF08A]">{career.pvpDraws}D</span>
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Full-Width Mode Selection Cards */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-0.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC]">
                          Choose Game Mode
                        </span>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#00ffaa]">
                          Tap to Enter
                        </span>
                      </div>

                      {MODE_CATALOG.map((item) => {
                        const isLastSelected = item.id === mode;
                        const modeStat =
                          item.id === 'FAST_BREAK' && career.bestFastBreakMs > 0
                            ? formatFastBreakMs(career.bestFastBreakMs)
                            : item.id === 'HEAT_CHECK' && career.allTimeBestStreak > 0
                              ? `${career.allTimeBestStreak} STRK`
                              : item.id === 'SOLO' && career.bestScore > 0
                                ? `${career.bestScore} PTS`
                                : item.id === 'PVP' && activeLeague
                                  ? activeLeague.name
                                  : item.badge;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleOpenModeScreen(item.id)}
                            className={`w-full min-h-[60px] flex items-center gap-3 px-3.5 py-3 rounded-[4px] border text-left transition-all active:scale-[0.99] cursor-pointer ${
                              isLastSelected
                                ? 'bg-[#05070B] border-[#00ffaa]/85 shadow-[0_0_0_1px_rgba(0,255,170,0.25)]'
                                : 'bg-[#05070B]/96 border-white/30 hover:border-white/60'
                            }`}
                          >
                            <span
                              className="w-10 h-10 rounded-[2px] flex items-center justify-center shrink-0 border border-white/30 bg-[#141824]"
                              style={{ color: item.accentHex }}
                            >
                              {renderModeIcon(item.id, 'w-5 h-5')}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-sans text-sm sm:text-base font-extrabold uppercase tracking-wide text-[#FFFFFF] truncate">
                                  {item.name}
                                </span>
                              </div>
                              <span className="text-xs text-[#F8FAFC] block truncate mt-0.5">
                                {item.tagline}
                              </span>
                            </div>

                            <span
                              className="font-mono text-[10px] font-bold uppercase px-2 py-1 rounded-[2px] bg-[#141824] border border-white/30 shrink-0 max-w-[116px] truncate tabular-nums"
                              style={{ color: item.accentHex }}
                            >
                              {modeStat}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#F8FAFC] shrink-0" />
                          </button>
                        );
                      })}
                    </div>

                    {/* Friends & Court Locker Entries */}
                    <div className="space-y-2">
                      {renderFriendsButtonCard()}
                      {renderCourtPickerCard()}
                    </div>
                  </>
                )}
              </div>
            </motion.section>
          ) : (
            <motion.section
              key={`mobile-mode-screen-${mode}`}
              custom={navDir}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="flex-1 flex flex-col min-h-0 bg-[#0A0D14]/98 backdrop-blur-md"
              aria-label={`${activeModeInfo.name} Mode Setup`}
            >
              {/* Sticky Mode Screen Top Bar (Back / Title / Mute & Account) */}
              <header className="shrink-0 min-h-[56px] px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 bg-[#05070B]/98 border-b border-white/30 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleBackToLobby}
                  className="min-h-[44px] px-2.5 -ml-1 rounded-[2px] inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#00ffaa] hover:bg-[#141824] transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Lobby</span>
                </button>

                <div className="min-w-0 flex-1 text-center px-1">
                  <div className="font-sans text-sm sm:text-base font-extrabold uppercase tracking-wide text-[#FFFFFF] truncate leading-none">
                    {activeModeInfo.name}
                  </div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] truncate mt-1">
                    {mode === 'PVP'
                      ? activeLeague
                        ? activeLeague.name
                        : wsConnected
                          ? `${lobbyStats.onlinePlayers} Online`
                          : 'Connecting'
                      : activeModeInfo.tagline}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {userProfile ? (
                    <button
                      type="button"
                      onClick={onOpenEditUsername}
                      aria-label="Account profile"
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/25 text-[#00ffaa] cursor-pointer"
                    >
                      <UserCircle2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-[2px] bg-[#141824] hover:bg-[#00ffaa] border border-white/30 hover:border-[#00ffaa] hover:text-[#05070B] font-mono text-[10px] font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Sign In
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onToggleMute}
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/25 text-[#FFFFFF] cursor-pointer"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label="Open Settings"
                    title="Settings"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-[2px] bg-[#141824] hover:bg-[#00ffaa] border border-white/25 hover:border-[#00ffaa] hover:text-[#05070B] text-[#FFFFFF] transition-colors cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* Scrollable Dedicated Mode Screen Content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5">
                {renderModeSpecificContent()}
                {renderMoneyRackSelector()}
                {renderCourtPickerCard()}

                {lastHighlight && (
                  <button
                    type="button"
                    onClick={onOpenHighlightReplay}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-[4px] border border-[#00ffaa]/80 bg-[#05070B] text-[#00ffaa] hover:bg-[#00ffaa] hover:text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer tabular-nums"
                  >
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span>Watch Last Highlight (+{lastHighlight.pointsAwarded} pts)</span>
                  </button>
                )}
              </div>

              {/* Sticky Thumb-Zone Bottom CTA Bar */}
              <footer className="shrink-0 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-[#05070B]/98 border-t border-white/30 backdrop-blur-md">
                {renderPrimaryCtaButton(true)}
              </footer>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ===================================================================== */}
      {/* DESKTOP SIDEBAR + LIVE ARENA STAGE (md:+)                             */}
      {/* ===================================================================== */}
      <aside className="hidden md:flex pointer-events-auto w-[356px] lg:w-[368px] shrink-0 h-full bg-[#0A0D14] border-r border-white/30 p-6 flex-col overflow-hidden">
        <AnimatePresence mode="wait" custom={navDir}>
          {screen === 'LOBBY' ? (
            <motion.div
              key="desktop-lobby-panel"
              custom={navDir}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
            >
              {/* Brand Logo */}
              <div className="mb-4">
                <h1 className="font-display text-[2.1rem] lg:text-[2.35rem] font-extrabold leading-[0.88] tracking-[-0.04em] text-[#00ffaa] uppercase">
                  Downtown 3
                </h1>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] block mt-1.5">
                  Three-Point Shootout
                </span>
              </div>

              <div className="mb-4">{renderLobbyTabBar()}</div>

              {lobbyTab === 'GLOBAL' ? (
                <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                  {renderGlobalRankingsTab()}
                </div>
              ) : (
                <>
                  {/* 2x2 Career Stats Grid */}
                  <div className="border-t border-white/30 pt-4 mb-5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC] block mb-0.5">
                          Best
                        </span>
                        <span className="font-mono text-lg font-bold text-[#FFFFFF] tabular-nums leading-none">
                          {career.bestScore}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC] block mb-0.5">
                          Career
                        </span>
                        <span className="font-mono text-lg font-bold text-[#00ffaa] tabular-nums leading-none">
                          {career.totalCareerScore}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC] block mb-0.5">
                          Streak
                        </span>
                        <span className="font-mono text-lg font-bold text-[#FFFFFF] tabular-nums leading-none">
                          {career.allTimeBestStreak}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC] block mb-0.5">
                          Fast-Break
                        </span>
                        <span className="font-mono text-lg font-bold text-[#FFFFFF] tabular-nums leading-none">
                          {career.bestFastBreakMs > 0
                            ? formatFastBreakMs(career.bestFastBreakMs)
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {hasPvpRecord && (
                      <div className="mt-3 pt-2 border-t border-white/25 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
                        <span className="text-[#F8FAFC]">PVP Record</span>
                        <span className="font-bold tabular-nums">
                          <span className="text-[#00ffaa]">{career.pvpWins}W</span>
                          <span className="text-[#F8FAFC]">-</span>
                          <span className="text-[#FEE2E2]">{career.pvpLosses}L</span>
                          {career.pvpDraws > 0 && (
                            <>
                              <span className="text-[#F8FAFC]">-</span>
                              <span className="text-[#FEF08A]">{career.pvpDraws}D</span>
                            </>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Lobby Mode Cards */}
                  <div className="mb-4 space-y-2 flex-1">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#F8FAFC] block">
                      Select Mode
                    </span>
                    {MODE_CATALOG.map((item) => {
                      const selected = item.id === mode;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleOpenModeScreen(item.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[4px] border text-left transition-all cursor-pointer ${
                            selected
                              ? 'bg-[#05070B] border-[#00ffaa]/85'
                              : 'bg-[#141824] border-white/30 hover:border-white/65 hover:bg-[#1E2434]'
                          }`}
                        >
                          <span style={{ color: item.accentHex }} className="shrink-0">
                            {renderModeIcon(item.id, 'w-4 h-4')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-xs font-bold uppercase text-[#FFFFFF] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-[#F8FAFC] truncate">
                              {item.tagline}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#F8FAFC] shrink-0" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-auto pt-2 space-y-2">
                    {renderFriendsButtonCard()}
                    {renderCourtPickerCard()}
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`desktop-mode-panel-${mode}`}
              custom={navDir}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Back to Lobby + Mode Heading */}
              <div className="shrink-0 pb-4 border-b border-white/30 mb-4">
                <button
                  type="button"
                  onClick={handleBackToLobby}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] hover:text-[#FFFFFF] transition-colors cursor-pointer mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Lobby</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-[2px] flex items-center justify-center bg-[#05070B] border border-white/35 shrink-0"
                    style={{ color: activeModeInfo.accentHex }}
                  >
                    {renderModeIcon(mode, 'w-4 h-4')}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-sans text-lg sm:text-xl font-extrabold uppercase tracking-wide text-[#FFFFFF] leading-none truncate">
                      {activeModeInfo.name}
                    </h2>
                    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#F8FAFC] block mt-1 truncate">
                      {activeModeInfo.tagline}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable Middle Controls */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
                {renderModeSpecificContent()}
                {renderMoneyRackSelector()}
                {renderCourtPickerCard()}
              </div>

              {/* Pinned Bottom Primary CTA */}
              <div className="shrink-0 pt-4 mt-2 border-t border-white/30">
                {renderPrimaryCtaButton(false)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Desktop Right Stage Chrome */}
      <div className="hidden md:flex flex-1 min-w-0 h-full flex-col justify-between pointer-events-none">
        <nav className="px-6 py-5 flex items-center justify-between gap-3 z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={`top-meta-${screen}-${mode}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col gap-1 min-w-0 bg-[#05070B]/96 border border-white/35 rounded-[4px] px-3.5 py-2 backdrop-blur-md shadow-lg"
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#FFFFFF] truncate">
                {screen === 'LOBBY'
                  ? 'Select a mode from the lobby to customize & tip off'
                  : mode === 'PVP' && activeLeague
                    ? `1v1 League · ${activeLeague.name}`
                    : `${activeModeInfo.name} · ${activeModeInfo.tagline}`}
              </span>
              <span
                className={`font-mono text-[11px] font-bold uppercase tracking-[0.12em] tabular-nums ${
                  wsConnected ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                }`}
              >
                {wsConnected ? `● ${lobbyStats.onlinePlayers} Online` : '● Offline Ready'}
              </span>
            </motion.div>
          </AnimatePresence>

          {renderUserAccountChip(false)}
        </nav>

        <footer className="px-6 py-3.5 border-t border-white/30 bg-[#05070B]/98 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#FFFFFF]">
            <span>Hold Space/Touch to Aim</span>
            <span>Release in Green/Gold to Shoot</span>
            <span>Esc to Pause</span>
          </div>

          {lastHighlight && (
            <button
              type="button"
              onClick={onOpenHighlightReplay}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border border-[#00ffaa] bg-[#05070B] text-[#00ffaa] hover:bg-[#00ffaa] hover:text-[#05070B] font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer tabular-nums shrink-0"
              title={`Watch best shot replay: ${lastHighlight.rackLabel} (+${lastHighlight.pointsAwarded} pts)`}
            >
              <Play className="w-3 h-3 fill-current shrink-0" />
              <span>Highlight +{lastHighlight.pointsAwarded} Replay</span>
            </button>
          )}
        </footer>
      </div>
    </motion.div>
  );
};
