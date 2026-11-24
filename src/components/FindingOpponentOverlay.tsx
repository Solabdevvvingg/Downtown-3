import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Radar, Shield, Trophy, Users, X } from 'lucide-react';
import { RACK_CONFIGS } from '../game/constants';
import { CareerStats, PvpLobbyStats } from '../game/types';

interface FindingOpponentOverlayProps {
  playerName: string;
  moneyRack: number;
  career: CareerStats;
  lobbyStats: PvpLobbyStats;
  leagueName: string | null;
  leagueId: string | null;
  onCancel: () => void;
}

const STATUS_STAGES = [
  'Connecting to live arena matchmaking...',
  'Scanning online shooters for 1v1 contest...',
  'Synchronizing 1:10 (70s) shot clocks & courts...',
  'Holding court lane — next available rival...',
];

export const FindingOpponentOverlay: React.FC<FindingOpponentOverlayProps> = ({
  playerName,
  moneyRack,
  career,
  lobbyStats,
  leagueName,
  leagueId,
  onCancel,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const timerLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const stageText = STATUS_STAGES[Math.min(STATUS_STAGES.length - 1, Math.floor(elapsedSec / 4))];
  const moneyLabel = RACK_CONFIGS[moneyRack]?.shortLabel ?? 'R Corner';
  const leagueQueuedCount = leagueId ? (lobbyStats.leagueQueued?.[leagueId] ?? 1) : lobbyStats.queuedPlayers;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090E]/92 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Finding PVP Opponent"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="w-full max-w-md bg-[#0F1117] border border-white/25 rounded-[4px] p-5 sm:p-6 shadow-2xl relative overflow-hidden"
      >
        {/* Subtle animated top sweep */}
        <motion.div
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#00ffaa] to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6EE7B7]">
              <Radar className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3.2s' }} />
              <span>{leagueName ? 'League Matchmaking' : 'Ranked 1v1 Matchmaking'}</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-white leading-none mt-1.5">
              Finding Opponent
            </h2>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] font-semibold text-[#CBD5E1] uppercase tracking-[0.12em]">
              Wait Time
            </div>
            <div className="font-mono text-xl font-bold text-[#6EE7B7] tabular-nums mt-0.5">
              {timerLabel}
            </div>
          </div>
        </div>

        {leagueName && (
          <div className="mb-4 px-3 py-2 rounded-[2px] bg-[#00ffaa]/15 border border-[#00ffaa]/60 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-bold text-[#6EE7B7] truncate">
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{leagueName}</span>
            </span>
            <span className="font-mono text-[11px] font-bold text-white shrink-0 tabular-nums">
              {leagueQueuedCount} Searching
            </span>
          </div>
        )}

        {/* Pulsing Radar Beacon */}
        <div className="flex flex-col items-center justify-center py-4 mb-4">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-[#00ffaa]/70"
              animate={{ scale: [0.65, 1.45], opacity: [0.85, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-white/45"
              animate={{ scale: [0.65, 1.45], opacity: [0.85, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.9 }}
            />
            <div className="relative w-16 h-16 rounded-full bg-[#07090E] border-2 border-[#00ffaa] flex items-center justify-center shadow-[0_0_24px_rgba(0,255,170,0.3)]">
              <svg viewBox="0 0 40 40" className="w-8 h-8" aria-hidden="true">
                <circle cx="20" cy="20" r="15" fill="none" stroke="#00ffaa" strokeWidth="2.4" />
                <path d="M 6 20 Q 20 12 34 20" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
                <path d="M 20 5 Q 14 20 20 35" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
              </svg>
            </div>
          </div>

          <p className="text-xs sm:text-sm font-semibold text-white text-center mt-3">
            {stageText}
          </p>
          <p className="font-mono text-[11px] font-medium text-[#CBD5E1] mt-1 tabular-nums">
            {lobbyStats.onlinePlayers} online · {lobbyStats.queuedPlayers} in queue ·{' '}
            {lobbyStats.activeMatches} live matches
          </p>
        </div>

        {/* Side-by-Side Locked vs Scanning Matchup */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-[#07090E] border border-[#00ffaa]/70 rounded-[2px] p-3">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="font-mono text-[10px] font-bold uppercase text-[#6EE7B7]">
                You · Ready
              </span>
              <Shield className="w-3 h-3 text-[#6EE7B7]" />
            </div>
            <div className="text-sm font-bold text-white truncate">{playerName}</div>
            <div className="font-mono text-[11px] font-semibold text-[#E2E8F0] mt-1 tabular-nums">
              {career.pvpWins}W-{career.pvpLosses}L-{career.pvpDraws}D · MR {moneyLabel}
            </div>
          </div>

          <div className="bg-[#07090E] border border-white/25 rounded-[2px] p-3 relative overflow-hidden">
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="font-mono text-[10px] font-bold uppercase text-[#E2E8F0]">
                Challenger
              </span>
              <Users className="w-3 h-3 text-[#E2E8F0]" />
            </div>
            <div className="text-sm font-bold text-white">Searching...</div>
            <div className="font-mono text-[11px] font-medium text-[#CBD5E1] mt-1">
              Waiting for lock-in
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Cancel Search</span>
        </button>
      </motion.div>
    </motion.div>
  );
};
