import React, { useState } from 'react';
import { Flame, LogOut, UserCircle2, Volume2, VolumeX } from 'lucide-react';
import { RACK_CONFIGS } from '../game/constants';
import {
  CareerStats,
  GameMode,
  PvpLobbyStats,
  PvpMatchSnapshot,
  UserProfile,
} from '../game/types';

interface TitleOverlayProps {
  mode: GameMode;
  moneyRack: number;
  career: CareerStats;
  muted: boolean;
  wsConnected: boolean;
  lobbyStats: PvpLobbyStats;
  playerName: string;
  userProfile: UserProfile | null;
  inQueue: boolean;
  waitingRoom: PvpMatchSnapshot | null;
  pvpError: string | null;
  onSelectMode: (mode: GameMode) => void;
  onSelectMoneyRack: (rackIndex: number) => void;
  onChangePlayerName: (name: string) => void;
  onToggleMute: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onStartSolo: () => void;
  onStartHeatCheck: () => void;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
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
  inQueue,
  waitingRoom,
  pvpError,
  onSelectMode,
  onSelectMoneyRack,
  onChangePlayerName,
  onToggleMute,
  onOpenAuth,
  onSignOut,
  onStartSolo,
  onStartHeatCheck,
  onJoinQueue,
  onLeaveQueue,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}) => {
  const [joinCode, setJoinCode] = useState('');

  const handleJoinSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length >= 4) {
      onJoinRoom(cleaned);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6 md:p-10 overflow-y-auto pointer-events-none">
      {/* Top Bar: Context Metadata, Account & Mute */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#A5B0C2] font-medium">
          <span>{mode === 'HEAT_CHECK' ? 'No Clock · Moving Hoop' : '60s Shootout'}</span>
          <span aria-hidden="true">·</span>
          <span>{mode === 'HEAT_CHECK' ? 'Endless Streak' : '25 Balls'}</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#CBD5E1] tabular-nums">
            {wsConnected ? `${lobbyStats.onlinePlayers} Online` : 'Connecting'}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          {userProfile ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12161F]/90 border border-white/12 text-xs">
              <UserCircle2 className="w-4 h-4 text-[#F9631C] shrink-0" />
              <span className="font-semibold text-[#F4EFE6] max-w-[120px] truncate">
                @{userProfile.username}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-[#CBD5E1] border-l border-white/12 pl-2 tabular-nums">
                <span className="text-[#10B981]">{career.pvpWins}W</span>
                <span className="text-[#64748B]">-</span>
                <span className="text-[#EF4444]">{career.pvpLosses}L</span>
                <span className="text-[#64748B]">-</span>
                <span className="text-[#F59E0B]">{career.pvpDraws}D</span>
              </span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="text-[#94A3B8] hover:text-[#F4EFE6] transition-colors cursor-pointer pl-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-2 rounded-lg bg-[#12161F]/90 border border-white/12 hover:border-[#F9631C]/60 text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap"
            >
              Sign In / Sign Up
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#12161F]/90 border border-white/12 text-[#F4EFE6] hover:border-white/30 transition-colors cursor-pointer shrink-0"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Left-aligned Content */}
      <div className="max-w-xl my-auto py-4">
        <svg
          viewBox="0 0 420 112"
          className="w-full max-w-[280px] sm:max-w-[360px] h-auto mb-2 overflow-visible"
          aria-label="Downtown 3 Three-Point Shootout"
        >
          <path
            d="M 10 88 A 52 52 0 0 1 82 22"
            fill="none"
            stroke="#F9631C"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="52" cy="48" r="14" fill="none" stroke="#F59E0B" strokeWidth="2.5" />
          <path d="M 38 48 Q 52 40 66 48" fill="none" stroke="#F59E0B" strokeWidth="2" />
          <path d="M 52 34 Q 46 48 52 62" fill="none" stroke="#F59E0B" strokeWidth="2" />

          <text
            x="96"
            y="66"
            fill="#F4EFE6"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="64"
            letterSpacing="1"
          >
            DOWNTOWN
          </text>
          <text
            x="362"
            y="66"
            fill="#F9631C"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="68"
          >
            3
          </text>
          <text
            x="98"
            y="96"
            fill="#A5B0C2"
            fontFamily="DM Sans, sans-serif"
            fontWeight="600"
            fontSize="15"
            letterSpacing="2.5"
          >
            THREE-POINT SHOOTOUT CONTEST
          </text>
        </svg>

        <p className="text-sm sm:text-[15px] leading-relaxed text-[#CBD5E1] max-w-md mb-4">
          Drain consecutive threes across 5 racks from shooter&apos;s POV before the clock expires.
          Streaks climb your multiplier (<span className="font-mono text-[#F59E0B]">1x, 2x, 3x...</span>)
          and tighten the shot meter.
        </p>

        {/* Persistent Cumulative Career & Opponents W-L-D Profile Stats */}
        {(career.totalShotsAttempted > 0 ||
          career.pvpWins + career.pvpLosses + career.pvpDraws > 0 ||
          userProfile !== null) && (
          <div className="bg-[#12161F]/88 border border-white/10 rounded-lg p-2.5 sm:p-3 mb-4 max-w-md space-y-2.5">
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <div>
                <div className="text-[10px] sm:text-[11px] text-[#94A3B8]">Best</div>
                <div className="font-mono text-base sm:text-lg font-bold text-[#F4EFE6] tabular-nums">
                  {career.bestScore}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-[11px] text-[#94A3B8]">Career Pts</div>
                <div className="font-mono text-base sm:text-lg font-bold text-[#F59E0B] tabular-nums">
                  {career.totalCareerScore}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-[11px] text-[#94A3B8]">Shots Made</div>
                <div className="font-mono text-base sm:text-lg font-bold text-[#10B981] tabular-nums">
                  {career.totalShotsMade}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-[11px] text-[#94A3B8]">Best Streak</div>
                <div className="font-mono text-base sm:text-lg font-bold text-[#F9631C] tabular-nums">
                  {career.allTimeBestStreak}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
              <span className="text-[11px] font-medium text-[#94A3B8]">
                Record vs Opponents (W-L-D)
              </span>
              <div className="flex items-center gap-2 font-mono font-bold tabular-nums">
                <span className="text-[#10B981]">{career.pvpWins}W</span>
                <span className="text-[#64748B]">·</span>
                <span className="text-[#EF4444]">{career.pvpLosses}L</span>
                <span className="text-[#64748B]">·</span>
                <span className="text-[#F59E0B]">{career.pvpDraws}D</span>
              </div>
            </div>
          </div>
        )}

        {/* Mode Switcher: Solo Contest vs Heat Check vs Online PVP */}
        <div className="pointer-events-auto mb-4">
          <div className="inline-flex flex-wrap gap-1 p-1 bg-[#12161F]/95 border border-white/12 rounded-lg">
            <button
              type="button"
              onClick={() => onSelectMode('SOLO')}
              className={`px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'SOLO'
                  ? 'bg-[#F4EFE6] text-[#0B0E14]'
                  : 'text-[#CBD5E1] hover:text-white'
              }`}
            >
              Solo Contest
            </button>
            <button
              type="button"
              onClick={() => onSelectMode('HEAT_CHECK')}
              className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'HEAT_CHECK'
                  ? 'bg-[#F59E0B] text-[#0B0E14]'
                  : 'text-[#CBD5E1] hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Heat Check</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectMode('PVP')}
              className={`px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'PVP'
                  ? 'bg-[#F9631C] text-[#0B0E14]'
                  : 'text-[#CBD5E1] hover:text-white'
              }`}
            >
              Online PVP (1v1)
            </button>
          </div>
        </div>

        {/* Money Rack Selector */}
        <div className="pointer-events-auto mb-4">
          <div className="text-xs font-medium text-[#A5B0C2] mb-1.5">
            All-Money-Ball Rack (2x Base Points)
          </div>
          <div className="grid grid-cols-5 gap-1 p-1 bg-[#12161F]/95 border border-white/12 rounded-lg max-w-md">
            {RACK_CONFIGS.map((rack) => {
              const active = rack.id === moneyRack;
              return (
                <button
                  key={rack.id}
                  type="button"
                  onClick={() => onSelectMoneyRack(rack.id)}
                  className={`px-1.5 py-2 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center cursor-pointer ${
                    active
                      ? 'bg-[#F59E0B] text-[#0B0E14]'
                      : 'text-[#CBD5E1] hover:text-white hover:bg-white/6'
                  }`}
                >
                  {rack.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'SOLO' ? (
          <div className="pointer-events-auto flex items-center gap-4">
            <button
              type="button"
              onClick={onStartSolo}
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] active:scale-[0.98] text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Start Contest
            </button>
          </div>
        ) : mode === 'HEAT_CHECK' ? (
          <div className="pointer-events-auto flex flex-col items-start gap-3">
            <p className="text-xs text-[#CBD5E1] bg-[#12161F]/90 border border-[#F59E0B]/30 rounded-lg px-3.5 py-2.5 max-w-md leading-relaxed">
              <span className="font-semibold text-[#F59E0B]">Shot Clock Disabled:</span>{' '}
              The hoop periodically shifts position around the lane. Shoot endlessly from rack to rack—one miss ends the run!
            </p>
            <button
              type="button"
              onClick={onStartHeatCheck}
              className="w-full sm:w-auto px-7 py-3.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] active:scale-[0.98] text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Start Heat Check
            </button>
          </div>
        ) : !userProfile ? (
          <div className="pointer-events-auto bg-[#12161F]/95 border border-white/12 rounded-xl p-4 sm:p-5 max-w-md">
            <div className="text-sm font-semibold text-[#F4EFE6] mb-1">
              Account Required for Online PVP
            </div>
            <p className="text-xs text-[#94A3B8] mb-3.5 leading-relaxed">
              Sign in or create an account to claim your unique PVP username before entering 1v1
              live matches.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] text-[#0B0E14] font-display text-xl font-extrabold tracking-wide transition-colors cursor-pointer"
            >
              Sign In / Create Username
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-[#12161F]/95 border border-white/12 rounded-xl p-3.5 sm:p-4 max-w-md">
            {waitingRoom ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#94A3B8]">Private Room Code</div>
                    <div className="font-mono text-3xl font-bold text-[#F59E0B] tracking-widest">
                      {waitingRoom.code}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="px-3.5 py-2 rounded-lg bg-white/8 hover:bg-white/14 text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer"
                  >
                    Leave Room
                  </button>
                </div>
                <div className="text-xs text-[#CBD5E1]">
                  Share this 4-letter code with an opponent. Match starts automatically when they join.
                </div>
              </div>
            ) : inQueue ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F4EFE6]">
                    Searching for opponent...
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-0.5 tabular-nums">
                    {lobbyStats.queuedPlayers} in queue · {lobbyStats.activeMatches} live matches
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onLeaveQueue}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/16 text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2.5 bg-[#0B0E14] border border-white/10 rounded-md px-3 py-2">
                  <div>
                    <span className="text-[11px] font-medium text-[#94A3B8] block">
                      PVP Handle
                    </span>
                    <span className="font-mono text-sm font-bold text-[#F9631C]">
                      @{userProfile.username}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-medium text-[#94A3B8] block">
                      vs Opponents
                    </span>
                    <span className="font-mono text-xs font-bold tabular-nums">
                      <span className="text-[#10B981]">{career.pvpWins}W</span>
                      <span className="text-[#64748B]"> - </span>
                      <span className="text-[#EF4444]">{career.pvpLosses}L</span>
                      <span className="text-[#64748B]"> - </span>
                      <span className="text-[#F59E0B]">{career.pvpDraws}D</span>
                    </span>
                  </div>
                </div>

                {!userProfile && (
                  <div className="flex items-center gap-2.5">
                    <label htmlFor="pvp-name" className="text-xs font-medium text-[#94A3B8] shrink-0">
                      Name
                    </label>
                    <input
                      id="pvp-name"
                      type="text"
                      maxLength={16}
                      value={playerName}
                      onChange={(ev) => onChangePlayerName(ev.target.value)}
                      placeholder="Shooter Name"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-[#0B0E14] border border-white/15 text-sm text-[#F4EFE6] focus:outline-none focus:border-[#F9631C]"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!wsConnected}
                    onClick={onJoinQueue}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] disabled:opacity-45 text-[#0B0E14] font-display text-xl font-extrabold tracking-wide transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Quick Match
                  </button>
                  <button
                    type="button"
                    disabled={!wsConnected}
                    onClick={onCreateRoom}
                    className="py-2.5 px-3.5 rounded-lg bg-white/8 hover:bg-white/14 disabled:opacity-45 text-xs font-semibold text-[#F4EFE6] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Create Room
                  </button>
                </div>

                <form
                  onSubmit={handleJoinSubmit}
                  className="flex items-center gap-2 pt-2 border-t border-white/10"
                >
                  <input
                    type="text"
                    maxLength={4}
                    value={joinCode}
                    onChange={(ev) => setJoinCode(ev.target.value.toUpperCase())}
                    placeholder="Room Code (K7M2)"
                    className="flex-1 min-w-0 px-3 py-2 rounded-md bg-[#0B0E14] border border-white/15 font-mono text-sm uppercase tracking-widest text-[#F4EFE6] focus:outline-none focus:border-[#F59E0B]"
                  />
                  <button
                    type="submit"
                    disabled={!wsConnected || joinCode.trim().length < 4}
                    className="px-4 py-2 rounded-md bg-[#F59E0B] hover:bg-[#FBBF24] disabled:opacity-40 text-[#0B0E14] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Join
                  </button>
                </form>

                {pvpError && (
                  <div className="text-xs text-[#EF4444] font-medium">{pvpError}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Flat Control Hint Line */}
      <div className="text-[11px] sm:text-xs text-[#94A3B8] tracking-wide shrink-0">
        Hold Space or Touch/Click to aim · Release in the green/gold zone to shoot · Esc Pause
      </div>
    </div>
  );
};
