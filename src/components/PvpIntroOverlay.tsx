import React from 'react';
import { motion } from 'motion/react';
import { RACK_CONFIGS } from '../game/constants';
import { PvpMatchSnapshot, PvpPlayerSnapshot, RivalryRecord } from '../game/types';
import { RivalBadgeIcon } from './RivalBadgeIcon';

interface PvpIntroOverlayProps {
  match: PvpMatchSnapshot;
  myPlayerId: string | null;
  countdownSeconds: number;
  rivalry?: RivalryRecord | null;
}

function getInitials(name: string): string {
  const cleaned = name.replace(/^@/, '').trim();
  if (!cleaned) return 'SH';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

interface ProfileCardProps {
  player: PvpPlayerSnapshot;
  isMe: boolean;
  delay: number;
  rivalry?: RivalryRecord | null;
}

const MatchupProfileCard: React.FC<ProfileCardProps> = ({ player, isMe, delay, rivalry }) => {
  const moneyLabel = RACK_CONFIGS[player.moneyRack]?.shortLabel ?? `R${player.moneyRack + 1}`;
  const wins = player.record?.wins ?? 0;
  const losses = player.record?.losses ?? 0;
  const draws = player.record?.draws ?? 0;
  const bestScore = player.profileBestScore ?? 0;
  const bestStreak = player.profileBestStreak ?? 0;
  const accuracyPct = player.profileAccuracyPct ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? -22 : 22, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay }}
      className={`bg-[#05070B]/98 backdrop-blur-md border rounded-[4px] p-3 sm:p-4 shadow-2xl min-w-0 ${
        isMe
          ? 'border-[#00ffaa] shadow-[0_0_24px_rgba(0,255,170,0.18)]'
          : 'border-white/35'
      }`}
    >
      {/* Top identity row */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-[2px] flex items-center justify-center font-display text-base sm:text-xl font-extrabold uppercase shrink-0 border ${
            isMe
              ? 'bg-[#04241B] border-[#00ffaa] text-[#00ffaa]'
              : 'bg-[#141824] border-white/40 text-[#FFFFFF]'
          }`}
          aria-hidden="true"
        >
          {getInitials(player.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF] flex items-center gap-1.5">
            <span className={isMe ? 'text-[#00ffaa]' : 'text-[#FEF08A]'}>
              {isMe ? 'You' : 'Opponent'}
            </span>
            {player.isHost && (
              <>
                <span aria-hidden="true">·</span>
                <span>Host</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="font-display text-base sm:text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] truncate leading-tight">
              {player.name}
            </span>
            {!isMe && <RivalBadgeIcon rivalry={rivalry} />}
          </div>
        </div>
      </div>

      {/* Clean hairline stats grid */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 mt-3 pt-2.5 border-t border-white/25">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F8FAFC]">
            PVP Record
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#FFFFFF] tabular-nums mt-0.5">
            {wins}W-{losses}L-{draws}D
          </div>
        </div>

        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F8FAFC]">
            Best Score
          </div>
          <div
            className={`font-mono text-xs sm:text-sm font-bold tabular-nums mt-0.5 ${
              isMe ? 'text-[#00ffaa]' : 'text-[#FFFFFF]'
            }`}
          >
            {bestScore > 0 ? bestScore : '—'}
          </div>
        </div>

        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F8FAFC]">
            Best Streak
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#FFFFFF] tabular-nums mt-0.5">
            {bestStreak > 0 ? `${bestStreak} · ${accuracyPct}%` : accuracyPct > 0 ? `${accuracyPct}%` : '—'}
          </div>
        </div>

        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F8FAFC]">
            Money Rack
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#FEF08A] tabular-nums mt-0.5">
            2x {moneyLabel}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const PvpIntroOverlay: React.FC<PvpIntroOverlayProps> = ({
  match,
  myPlayerId,
  countdownSeconds,
  rivalry,
}) => {
  const me = match.players.find((p) => p.id === myPlayerId) ?? match.players[0] ?? null;
  const opponent = match.players.find((p) => p.id !== me?.id) ?? match.players[1] ?? null;
  const clampedSec = Math.max(0, Math.min(15, Math.ceil(countdownSeconds)));
  const progressPct = Math.max(0, Math.min(100, ((15 - clampedSec) / 15) * 100));
  const isFinalCountdown = clampedSec > 0 && clampedSec <= 3;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-6 md:px-8"
      aria-label="Pre-Match Player Profiles & Court Preview"
    >
      {/* Top Match Intro Banner — leaves middle viewport open for cinematic court & ball rack tour */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="mx-auto w-full max-w-2xl bg-[#05070B]/98 backdrop-blur-md border border-white/35 rounded-[4px] px-3.5 sm:px-5 py-2.5 sm:py-3 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] truncate">
              {match.leagueName ? `${match.leagueName} · 1v1 Shootout` : '1v1 Arena Shootout'}
              {rivalry && rivalry.wins + rivalry.losses + rivalry.draws > 0
                ? ` · H2H ${rivalry.wins}-${rivalry.losses}-${rivalry.draws}`
                : ''}
            </div>
            <div className="font-display text-base sm:text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] leading-tight mt-0.5">
              {isFinalCountdown ? 'Shooters Set — Tip-Off' : 'Court & Ball Racks Preview'}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F8FAFC]">
              Match Starts
            </div>
            <motion.div
              key={clampedSec}
              initial={{ scale: isFinalCountdown ? 1.28 : 1.06 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className={`font-mono text-xl sm:text-2xl font-bold leading-none tabular-nums mt-0.5 ${
                isFinalCountdown ? 'text-[#FEF08A]' : 'text-[#00ffaa]'
              }`}
            >
              {clampedSec > 0 ? `${clampedSec}s` : 'LIVE'}
            </motion.div>
          </div>
        </div>

        <div className="w-full h-1.5 bg-white/20 rounded-[1px] overflow-hidden mt-2">
          <div
            className={`h-full transition-all duration-300 ${
              isFinalCountdown ? 'bg-[#FDE047]' : 'bg-[#00ffaa]'
            }`}
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>
      </motion.div>

      {/* Final 3-2-1 Center Readiness Callout without blocking the sweeping court */}
      {isFinalCountdown && (
        <motion.div
          key={`pvp-cd-${clampedSec}`}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          className="my-auto mx-auto text-center"
        >
          <div className="font-display text-7xl sm:text-8xl font-extrabold text-[#00ffaa] leading-none drop-shadow-[0_6px_22px_rgba(0,0,0,0.98)] tabular-nums">
            {clampedSec}
          </div>
        </motion.div>
      )}

      {/* Bottom Side-by-Side Player Profiles */}
      <div className="mx-auto w-full max-w-3xl mt-auto">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-5 items-stretch relative">
          {me && <MatchupProfileCard player={me} isMe delay={0.04} />}

          {/* Center VS marker */}
          <div
            aria-hidden="true"
            className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-[2px] bg-[#05070B] border-2 border-[#00ffaa] items-center justify-center font-display text-sm font-extrabold text-[#00ffaa] shadow-lg"
          >
            VS
          </div>

          {opponent ? (
            <MatchupProfileCard player={opponent} isMe={false} delay={0.1} rivalry={rivalry} />
          ) : (
            <div className="bg-[#05070B]/98 border border-white/35 rounded-[4px] p-4 flex items-center justify-center font-mono text-xs font-semibold text-[#FFFFFF]">
              Connecting rival...
            </div>
          )}
        </div>

        <div className="mt-2 text-center">
          <span className="inline-block bg-[#05070B]/98 border border-white/35 px-3 py-1 rounded-[2px] font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-[#FFFFFF]">
            1:10 (70s) · 5 Racks + Half-Court Moneyball · Rival tally top-left
          </span>
        </div>
      </div>
    </motion.div>
  );
};
