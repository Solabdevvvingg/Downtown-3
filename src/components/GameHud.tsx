import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Film,
  Flame,
  GraduationCap,
  Infinity as InfinityIcon,
  Pause,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import {
  getRackBallCount,
  getSlotIndex,
  RACK_CONFIGS,
  RACKS_COUNT,
  STAMINA_LOW_THRESHOLD,
} from '../game/constants';
import { formatFastBreakMs, formatSplitDeltaMs } from '../game/timeFormat';
import { HudSnapshot } from '../game/types';

function formatContestClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  if (clamped >= 60) {
    const mins = Math.floor(clamped / 60);
    const rem = clamped - mins * 60;
    return `${mins}:${rem.toFixed(1).padStart(4, '0')}`;
  }
  return clamped.toFixed(1);
}

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPause: () => void;
  onToggleInstantReplay: () => void;
  onSkipInstantReplay?: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onToggleMute,
  onPause,
  onToggleInstantReplay,
}) => {
  const isHeatCheck = hud.mode === 'HEAT_CHECK';
  const isPractice = hud.mode === 'PRACTICE';
  const isFastBreak = hud.mode === 'FAST_BREAK';
  const isNoClock = isHeatCheck || isPractice || isFastBreak;
  const isUrgent = !isNoClock && hud.timeLeft <= 10.0 && hud.phase === 'PLAYING';
  const activeRack = RACK_CONFIGS[Math.min(hud.currentRack, RACK_CONFIGS.length - 1)];
  const staminaPct = Math.max(0, Math.min(100, Math.round(hud.stamina)));
  const isLowStamina = staminaPct < STAMINA_LOW_THRESHOLD;

  const opponent =
    hud.mode === 'PVP' && hud.pvpMatch
      ? hud.pvpMatch.players.find((p) => p.id !== hud.myPlayerId) ?? null
      : null;

  const prevOppScoreRef = useRef<number>(opponent?.score ?? 0);
  const [oppDeltaBurst, setOppDeltaBurst] = useState<{ key: number; pts: number } | null>(null);

  useEffect(() => {
    if (hud.mode !== 'PVP' || !opponent) {
      prevOppScoreRef.current = 0;
      setOppDeltaBurst(null);
      return;
    }
    const prev = prevOppScoreRef.current;
    if (opponent.score > prev) {
      const gained = opponent.score - prev;
      setOppDeltaBurst({ key: Date.now(), pts: gained });
      prevOppScoreRef.current = opponent.score;
      const timer = window.setTimeout(() => {
        setOppDeltaBurst((cur) => (cur && cur.pts === gained ? null : cur));
      }, 1350);
      return () => window.clearTimeout(timer);
    }
    prevOppScoreRef.current = opponent.score;
  }, [hud.mode, opponent?.score, opponent]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between pt-[max(0.625rem,env(safe-area-inset-top))] pb-[max(0.625rem,env(safe-area-inset-bottom))] pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] sm:p-4 md:p-5"
    >
      {/* Top Broadcast Scoreboard Bar */}
      <div className="flex flex-wrap lg:flex-nowrap items-start justify-between gap-1.5 sm:gap-2">
        {/* Left Column: Top-Left Opponent Points Tally (PVP) + Score / Multiplier / Streak + Stamina Bar */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="flex flex-col gap-1 sm:gap-1.5"
        >
          {hud.mode === 'PVP' && hud.phase === 'PLAYING' && opponent && (
            <div
              className="flex items-center justify-between gap-2.5 bg-[#05070B]/98 border border-[#FDE047]/80 rounded-[4px] px-2.5 sm:px-3.5 py-1.5 shadow-lg backdrop-blur-sm"
              aria-label={`Opponent ${opponent.name} points tally ${opponent.score}`}
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] text-[#FEF08A] shrink-0">
                  Opp
                </span>
                <span className="font-mono text-[10px] sm:text-xs font-bold text-[#FFFFFF] truncate max-w-[82px] sm:max-w-[130px]">
                  {opponent.name}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <AnimatePresence>
                  {oppDeltaBurst && (
                    <motion.span
                      key={oppDeltaBurst.key}
                      initial={{ opacity: 0, y: 4, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="font-mono text-[10px] sm:text-xs font-bold text-[#00ffaa] tabular-nums"
                    >
                      +{oppDeltaBurst.pts}
                    </motion.span>
                  )}
                </AnimatePresence>
                <motion.span
                  key={opponent.score}
                  initial={{ scale: opponent.score > 0 ? 1.2 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 22 }}
                  className="font-mono text-base sm:text-xl font-bold leading-none text-[#FEF08A] tabular-nums"
                >
                  {opponent.score}
                </motion.span>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#F8FAFC] font-semibold">
                  pts
                </span>
              </div>
            </div>
          )}
          <div className="flex items-stretch bg-[#05070B]/98 border border-white/35 rounded-[4px] overflow-hidden shadow-lg backdrop-blur-sm">
            <div className="px-2 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em] text-[#F8FAFC] font-semibold">
                {hud.mode === 'PVP' ? 'You' : 'Score'}
              </span>
              <motion.span
                key={hud.score}
                initial={{ scale: hud.score > 0 ? 1.18 : 1, y: hud.score > 0 ? -2 : 0 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 460, damping: 24 }}
                className="font-mono text-lg sm:text-2xl md:text-3xl font-bold leading-none text-[#FFFFFF] tabular-nums inline-block mt-0.5"
              >
                {hud.score}
              </motion.span>
            </div>

            <div className="w-px bg-white/25" />

            <div className="px-2 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em] text-[#F8FAFC] font-semibold">
                Mult
              </span>
              <motion.span
                key={hud.multiplier}
                initial={{ scale: hud.multiplier > 1 ? 1.24 : 1 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 22 }}
                className={`font-mono text-lg sm:text-2xl md:text-3xl font-bold leading-none tabular-nums inline-block mt-0.5 ${
                  hud.multiplier >= 4
                    ? 'text-[#00ffaa]'
                    : hud.multiplier >= 2
                      ? 'text-[#FEF08A]'
                      : 'text-[#FFFFFF]'
                }`}
              >
                {hud.multiplier}x
              </motion.span>
            </div>

            <div className="w-px bg-white/25" />

            <div className="px-2 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.1em] text-[#F8FAFC] font-semibold whitespace-nowrap">
                {hud.difficulty.label}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <motion.span
                  key={hud.streak}
                  initial={{ scale: hud.streak > 0 ? 1.22 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 22 }}
                  className="font-mono text-base sm:text-xl md:text-2xl font-bold leading-none text-[#FFFFFF] tabular-nums inline-block"
                >
                  {hud.streak}
                </motion.span>
                <span className="font-mono text-[9px] sm:text-[11px] font-bold text-[#00ffaa] tabular-nums">
                  Lv.{hud.difficulty.level}
                </span>
              </div>
            </div>
          </div>

          {/* Stamina Bar + Second Wind Indicator */}
          <div
            className={`bg-[#05070B]/98 border rounded-[4px] px-2 sm:px-3 py-1 sm:py-1.5 transition-colors shadow-lg backdrop-blur-sm ${
              hud.secondWindActive
                ? 'border-[#00ffaa] shadow-[0_0_12px_rgba(0,255,170,0.28)]'
                : isLowStamina
                  ? 'border-[#FCA5A5]'
                  : 'border-white/35'
            }`}
            aria-label={`Stamina ${staminaPct} percent${isLowStamina ? ', low stamina faster meter' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 text-[9px] sm:text-[10px] leading-none mb-1">
              <span className="flex items-center gap-1 font-mono uppercase tracking-[0.1em] text-[#F8FAFC] font-semibold">
                <Zap
                  className={`w-3 h-3 ${
                    hud.secondWindActive
                      ? 'text-[#00ffaa]'
                      : isLowStamina
                        ? 'text-[#FEE2E2]'
                        : staminaPct < 70
                          ? 'text-[#FEF08A]'
                          : 'text-[#00ffaa]'
                  }`}
                />
                <span>Stamina</span>
                {hud.consecutivePerfectShots > 0 && !hud.secondWindActive && (
                  <span
                    className="inline-flex items-center gap-0.5 ml-1"
                    title={`Second Wind: ${hud.consecutivePerfectShots}/3 consecutive perfect shots`}
                  >
                    {[0, 1, 2].map((idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          idx < hud.consecutivePerfectShots
                            ? 'bg-[#00ffaa]'
                            : 'bg-white/30'
                        }`}
                      />
                    ))}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {hud.secondWindActive ? (
                  <span className="font-mono text-[9px] font-bold text-[#00ffaa] tracking-tight uppercase">
                    Second Wind +10%
                  </span>
                ) : (
                  isLowStamina && (
                    <span className="font-mono text-[9px] font-bold text-[#FEE2E2] tracking-tight uppercase">
                      Low · Faster
                    </span>
                  )
                )}
                <span
                  className={`font-mono font-bold tabular-nums ${
                    hud.secondWindActive
                      ? 'text-[#00ffaa]'
                      : isLowStamina
                        ? 'text-[#FECACA]'
                        : staminaPct < 70
                          ? 'text-[#FEF08A]'
                          : 'text-[#00ffaa]'
                  }`}
                >
                  {staminaPct}%
                </span>
              </div>
            </div>
            <div className="relative w-full h-1.5 bg-white/15 rounded-[1px] overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.secondWindActive
                    ? 'bg-[#00ffaa]'
                    : isLowStamina
                      ? 'bg-[#F87171]'
                      : staminaPct < 70
                        ? 'bg-[#FDE047]'
                        : 'bg-[#00ffaa]'
                }`}
                style={{ width: `${staminaPct}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-px bg-white/65"
                style={{ left: `${STAMINA_LOW_THRESHOLD}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Center: Arena Shot Clock / Mode Strip & Wind Indicator */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.05 }}
          className="flex items-stretch gap-1.5 sm:gap-2 order-3 lg:order-none w-full lg:w-auto justify-between lg:justify-center"
        >
          {isHeatCheck ? (
            <div className="flex flex-col items-center justify-center bg-[#05070B]/98 border border-[#FDE047]/80 rounded-[4px] px-3 sm:px-4 py-1 sm:py-1.5 shadow-lg backdrop-blur-sm flex-1 lg:flex-initial">
              <div className="flex items-center gap-1.5 font-sans text-sm sm:text-lg md:text-xl font-extrabold uppercase tracking-wide leading-none text-[#FEF08A] whitespace-nowrap">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-[#FEF08A] shrink-0" />
                <span>Heat Check</span>
                <InfinityIcon className="w-4 h-4 text-[#00ffaa] shrink-0" />
              </div>
              <div className="font-mono text-[10px] font-semibold text-[#FFFFFF] mt-1 whitespace-nowrap tabular-nums">
                R{Math.min(hud.currentRack + 1, RACKS_COUNT)}/{RACKS_COUNT} · {activeRack.shortLabel} · Shift{' '}
                <span className="text-[#00ffaa]">{hud.heatCheckShiftIn.toFixed(1)}s</span>
              </div>
            </div>
          ) : isPractice ? (
            <div className="flex flex-col items-center justify-center bg-[#05070B]/98 border border-[#00ffaa]/80 rounded-[4px] px-3 sm:px-4 py-1 sm:py-1.5 shadow-lg backdrop-blur-sm flex-1 lg:flex-initial">
              <div className="flex items-center gap-1.5 font-sans text-sm sm:text-lg md:text-xl font-extrabold uppercase tracking-wide leading-none text-[#00ffaa] whitespace-nowrap">
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-[#00ffaa] shrink-0" />
                <span>Practice</span>
                <InfinityIcon className="w-4 h-4 text-[#FFFFFF] shrink-0" />
              </div>
              <div className="font-mono text-[10px] font-semibold text-[#FFFFFF] mt-1 whitespace-nowrap tabular-nums">
                No Clock · R{Math.min(hud.currentRack + 1, RACKS_COUNT)}/{RACKS_COUNT} · {activeRack.shortLabel}
                {hud.currentRack === hud.moneyRack
                  ? ' · 2x Rack'
                  : getRackBallCount(hud.currentRack) === 1
                    ? ' · 2x Bonus'
                    : ''}
              </div>
            </div>
          ) : isFastBreak ? (
            <div className="flex flex-col items-center justify-center bg-[#05070B]/98 border border-[#00ffaa]/80 rounded-[4px] px-3 sm:px-5 py-1 sm:py-1.5 shadow-lg backdrop-blur-sm flex-1 lg:flex-initial">
              <div className="flex items-center gap-1.5 font-mono text-xl sm:text-3xl md:text-4xl font-bold leading-none tracking-tight tabular-nums text-[#00ffaa]">
                <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-[#00ffaa] shrink-0" />
                <span>
                  {formatFastBreakMs(hud.fastBreakFinishMs ?? hud.fastBreakElapsedMs)}
                </span>
              </div>
              <div className="font-mono text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#FFFFFF] mt-0.5 whitespace-nowrap tabular-nums">
                {hud.fastBreakFinishMs !== null
                  ? hud.fastBreakIsNewBest
                    ? 'All 6 Spots · New Record!'
                    : 'All 6 Spots Complete'
                  : `Fast-Break · R${Math.min(hud.currentRack + 1, RACKS_COUNT)}/${RACKS_COUNT} · ${activeRack.shortLabel}`}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center bg-[#05070B]/98 border border-white/35 rounded-[4px] px-3 sm:px-5 py-1 sm:py-1.5 shadow-lg backdrop-blur-sm flex-1 lg:flex-initial">
              <div
                className={`font-mono text-xl sm:text-3xl md:text-4xl font-bold leading-none tracking-tight tabular-nums ${
                  isUrgent ? 'text-[#FEE2E2]' : 'text-[#FFFFFF]'
                }`}
              >
                {formatContestClock(hud.timeLeft)}
              </div>
              <div className="font-mono text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#F8FAFC] mt-1 whitespace-nowrap flex items-center gap-1">
                {hud.mode === 'PVP' && hud.pvpMatch?.leagueName && (
                  <span className="inline-flex items-center gap-0.5 text-[#00ffaa] font-bold">
                    <Trophy className="w-2.5 h-2.5" />
                    <span className="max-w-[82px] truncate">{hud.pvpMatch.leagueName}</span>
                    <span>·</span>
                  </span>
                )}
                <span>
                  R{Math.min(hud.currentRack + 1, RACKS_COUNT)}/{RACKS_COUNT} · {activeRack.shortLabel}
                  {hud.currentRack === hud.moneyRack || getRackBallCount(hud.currentRack) === 1
                    ? ' · 2x'
                    : ''}
                </span>
              </div>
            </div>
          )}

          {/* Compact Current Spot Ball Indicator for Mobile/Tablet (< lg) */}
          {hud.mode !== 'PVP' && (
            <div
              className="flex lg:hidden items-center gap-1.5 bg-[#05070B]/98 border border-white/35 rounded-[4px] px-2.5 py-1.5 shadow-lg backdrop-blur-sm shrink-0"
              aria-label={`${activeRack.label} shot tracker`}
            >
              {Array.from({ length: getRackBallCount(hud.currentRack) }).map((_, bIdx) => {
                const slot = hud.balls[getSlotIndex(hud.currentRack, bIdx)];
                if (!slot) return null;
                const isActiveBall = hud.phase === 'PLAYING' && bIdx === hud.currentBall;
                let fillClass = 'bg-white/30';
                if (slot.status === 'MADE') {
                  fillClass = slot.isMoney ? 'bg-[#FDE047]' : 'bg-[#00ffaa]';
                } else if (slot.status === 'MISSED') {
                  fillClass = 'bg-[#F87171]';
                } else if (slot.status === 'IN_AIR') {
                  fillClass = 'bg-[#FFFFFF]';
                } else if (isActiveBall) {
                  fillClass = 'bg-white';
                }
                return (
                  <span
                    key={bIdx}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${fillClass} ${
                      slot.isMoney ? 'ring-1 ring-[#FDE047] ring-offset-1 ring-offset-[#05070B]' : ''
                    }`}
                  />
                );
              })}
            </div>
          )}

          {/* Wind Direction & Intensity Gauge */}
          <div
            className="flex flex-col justify-center bg-[#05070B]/98 border border-white/35 rounded-[4px] px-2.5 sm:px-3 py-1 sm:py-1.5 min-w-[78px] sm:min-w-[96px] shadow-lg backdrop-blur-sm shrink-0"
            aria-label={`Arena draft wind ${hud.wind.mph.toFixed(1)} mph ${hud.wind.dirLabel}`}
          >
            <div className="flex items-center justify-between gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#F8FAFC]">
              <span className="flex items-center gap-1 font-semibold">
                <Wind className="w-3 h-3 text-[#00ffaa]" />
                <span>Wind</span>
              </span>
              <span className="font-bold text-[#FFFFFF]">{hud.wind.dirLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-1">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] bg-[#141824] border border-white/25 shrink-0 transition-transform duration-150"
                style={{
                  transform: `rotate(${(hud.wind.relativeAngleRad * 180) / Math.PI}deg)`,
                }}
              >
                <ArrowRight
                  className={`w-3 h-3 ${
                    hud.wind.intensity >= 0.65
                      ? 'text-[#FEF08A]'
                      : hud.wind.intensity >= 0.32
                        ? 'text-[#00ffaa]'
                        : 'text-[#FFFFFF]'
                  }`}
                />
              </span>
              <span
                className={`font-mono text-xs sm:text-sm font-bold leading-none tabular-nums ${
                  hud.wind.intensity >= 0.65
                    ? 'text-[#FEF08A]'
                    : hud.wind.intensity >= 0.32
                      ? 'text-[#00ffaa]'
                      : 'text-[#FFFFFF]'
                }`}
              >
                {hud.wind.mph.toFixed(1)}
                <span className="text-[9px] font-semibold text-[#F8FAFC] ml-0.5">mph</span>
              </span>
            </div>
            <div className="w-full h-1 bg-white/25 rounded-[1px] overflow-hidden mt-1">
              <div
                className={`h-full transition-all duration-150 ${
                  hud.wind.intensity >= 0.65
                    ? 'bg-[#FDE047]'
                    : hud.wind.intensity >= 0.32
                      ? 'bg-[#00ffaa]'
                      : 'bg-white/80'
                }`}
                style={{ width: `${Math.max(8, Math.round(hud.wind.intensity * 100))}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Right: 26-Ball Tracker + Instant Replay & Audio/Pause Controls */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.1 }}
          className="flex items-center gap-1.5 sm:gap-2 order-2 lg:order-none"
        >
          <div className="hidden lg:flex items-center gap-2 bg-[#05070B]/98 border border-white/35 rounded-[4px] px-3 py-2.5 shadow-lg backdrop-blur-sm">
            {RACK_CONFIGS.map((rack) => {
              const isCurrent = rack.id === hud.currentRack && hud.phase === 'PLAYING';
              const startIdx = getSlotIndex(rack.id, 0);
              const rackCount = getRackBallCount(rack.id);
              return (
                <div
                  key={rack.id}
                  className={`flex items-center gap-1 px-1 py-0.5 rounded-[2px] transition-colors ${
                    isCurrent ? 'bg-white/15' : ''
                  }`}
                  title={rack.label}
                >
                  {Array.from({ length: rackCount }).map((_, bIdx) => {
                    const slot = hud.balls[startIdx + bIdx];
                    if (!slot) return null;
                    const isActiveBall = isCurrent && bIdx === hud.currentBall;
                    let fillClass = 'bg-white/30';
                    if (slot.status === 'MADE') {
                      fillClass = slot.isMoney ? 'bg-[#FDE047]' : 'bg-[#00ffaa]';
                    } else if (slot.status === 'MISSED') {
                      fillClass = 'bg-[#F87171]';
                    } else if (slot.status === 'IN_AIR') {
                      fillClass = 'bg-[#FFFFFF]';
                    } else if (isActiveBall) {
                      fillClass = 'bg-white';
                    }
                    return (
                      <span
                        key={bIdx}
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${fillClass} ${
                          slot.isMoney ? 'ring-1 ring-[#FDE047] ring-offset-1 ring-offset-[#07090E]' : ''
                        }`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={onToggleInstantReplay}
            aria-pressed={hud.instantReplayEnabled}
            aria-label={
              hud.instantReplayEnabled
                ? 'Show Instant Replay enabled — plays slow-mo highlight after the game ends'
                : 'Show Instant Replay disabled — tap to enable post-game slow-mo highlight'
            }
            title="Show Instant Replay (auto slow-mo cinematic replay of your best swish or buzzer-beater after the game)"
            className={`pointer-events-auto flex items-center gap-1.5 h-11 sm:h-10 px-2.5 sm:px-3 rounded-[2px] border font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg shrink-0 ${
              hud.instantReplayEnabled
                ? 'bg-[#05070B]/98 border-[#00ffaa] text-[#00ffaa] hover:bg-[#04241B]'
                : 'bg-[#05070B]/98 border-white/35 text-[#FFFFFF] hover:border-[#00ffaa]'
            }`}
          >
            <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Show Instant Replay</span>
            <span className="sm:hidden whitespace-nowrap">Replay</span>
            <span
              className={`px-1 py-0.5 rounded-[2px] text-[9px] leading-none font-bold ${
                hud.instantReplayEnabled
                  ? 'bg-[#00ffaa] text-[#05070B]'
                  : 'bg-[#141824] border border-white/30 text-[#FFFFFF]'
              }`}
            >
              {hud.instantReplayEnabled ? 'ON' : 'OFF'}
            </span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onToggleMute}
            aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
            className="pointer-events-auto flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-[2px] bg-[#05070B]/98 border border-white/35 text-[#FFFFFF] hover:border-[#00ffaa] transition-colors cursor-pointer shadow-lg shrink-0"
          >
            {hud.muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </motion.button>

          {hud.mode !== 'PVP' && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onPause}
              aria-label="Pause contest"
              className="pointer-events-auto flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-[2px] bg-[#05070B]/98 border border-white/35 text-[#FFFFFF] hover:border-[#00ffaa] transition-colors cursor-pointer shadow-lg shrink-0"
            >
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Post-game-only replay: mid-game interruptions intentionally omitted */}

      {/* Countdown Overlay Numeral (Non-PVP; PVP uses 15s side-by-side PvpIntroOverlay) */}
      <AnimatePresence mode="wait">
        {hud.phase === 'COUNTDOWN' && hud.mode !== 'PVP' && (
          <motion.div
            key={`cd-${hud.countdownValue}`}
            initial={{ opacity: 0, scale: 0.65, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.25 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="my-auto mx-auto flex flex-col items-center text-center px-4"
          >
            <div className="font-display text-7xl sm:text-8xl md:text-9xl font-extrabold uppercase tracking-tight text-[#00ffaa] leading-none drop-shadow-[0_6px_24px_rgba(0,0,0,1)] tabular-nums">
              {hud.countdownValue > 0 ? hud.countdownValue : 'SHOOT!'}
            </div>
            <div className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FFFFFF] mt-3 bg-[#05070B]/98 border border-white/35 px-4 py-2 rounded-[2px] shadow-lg">
              {isFastBreak
                ? 'Fast-Break Time Attack · Clear 5 racks + Half Court fast!'
                : isHeatCheck
                  ? 'No Shot Clock · Moving Hoop · Don’t Miss'
                  : isPractice
                    ? 'Practice Mode · No Clock · Aim for Gold Perfect Zone'
                    : 'Hold & Release in the green/gold zone'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fast-Break Live 6-Spot Split-Timer Strip & Status Bar */}
      <div className="flex flex-col gap-1.5">
        {isFastBreak && hud.phase === 'PLAYING' && (
          <div
            className="mx-auto max-w-2xl w-full bg-[#05070B]/98 border border-[#00ffaa]/80 rounded-[4px] p-1.5 sm:p-2 shadow-lg backdrop-blur-sm"
            aria-label="Fast-Break Live Spot Split Timers"
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-1.5">
              {hud.fastBreakSplits.map((split) => {
                const isCompleted = split.cumulativeMs !== null;
                const isActiveRack =
                  hud.fastBreakFinishMs === null && split.rackIndex === hud.currentRack;
                const prevCumulative =
                  split.rackIndex > 0
                    ? hud.fastBreakSplits[split.rackIndex - 1]?.cumulativeMs ?? 0
                    : 0;
                const liveLapMs = isActiveRack
                  ? Math.max(0, hud.fastBreakElapsedMs - prevCumulative)
                  : null;
                const pbCumulative = hud.careerBaseline.bestFastBreakMs > 0
                  ? hud.career.bestFastBreakSplitsMs[split.rackIndex] || 0
                  : 0;

                return (
                  <div
                    key={split.rackIndex}
                    className={`min-w-0 rounded-[2px] px-1 sm:px-1.5 py-1 border text-center transition-colors ${
                      isCompleted
                        ? 'bg-[#04241B] border-[#00ffaa]'
                        : isActiveRack
                          ? 'bg-[#1F1804] border-[#FDE047]'
                          : 'bg-[#05070B] border-white/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-0.5 font-mono text-[8px] sm:text-[10px] font-bold">
                      <span className={`shrink-0 ${isActiveRack ? 'text-[#FEF08A]' : 'text-[#FFFFFF]'}`}>
                        R{split.rackIndex + 1}
                      </span>
                      {isCompleted && split.deltaMs !== null ? (
                        <span
                          className={`tabular-nums truncate ${
                            split.deltaMs <= 0 ? 'text-[#00ffaa]' : 'text-[#FEE2E2]'
                          }`}
                        >
                          {formatSplitDeltaMs(split.deltaMs)}
                        </span>
                      ) : isActiveRack ? (
                        <span className="text-[#FEF08A] truncate">PACE</span>
                      ) : pbCumulative > 0 ? (
                        <span className="text-[#F8FAFC] tabular-nums truncate">
                          {formatFastBreakMs(pbCumulative)}
                        </span>
                      ) : (
                        <span className="text-[#F8FAFC]">—</span>
                      )}
                    </div>
                    <div
                      className={`font-mono text-[10px] sm:text-xs font-bold tabular-nums mt-0.5 truncate ${
                        isCompleted
                          ? 'text-[#FFFFFF]'
                          : isActiveRack
                            ? 'text-[#00ffaa]'
                            : 'text-[#F8FAFC]'
                      }`}
                    >
                      {isCompleted && split.cumulativeMs !== null
                        ? formatFastBreakMs(split.cumulativeMs)
                        : isActiveRack && liveLapMs !== null
                          ? formatFastBreakMs(liveLapMs)
                          : '--.--'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isPractice && hud.phase === 'PLAYING' && (
          <div className="mx-auto max-w-md w-full bg-[#05070B]/98 border border-[#00ffaa]/80 rounded-[4px] px-3 py-2 flex items-center justify-between gap-2.5 text-xs shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FDE047] ring-2 ring-[#FEF08A]/70 shrink-0" />
              <span className="text-[#FFFFFF] font-medium truncate">
                {hud.lastTimingQuality === 'PERFECT'
                  ? 'Perfect release! Right inside the gold sweet spot.'
                  : hud.lastTimingQuality === 'GOOD'
                    ? 'Good make! Hold a fraction closer to the gold center for Perfect.'
                    : hud.lastTimingQuality === 'EARLY'
                      ? 'Released Early — hold slightly longer until the bar enters Gold.'
                      : hud.lastTimingQuality === 'LATE'
                        ? 'Released Late — let go sooner right inside the Gold bracket.'
                        : 'Hold Space or Touch Court · Release inside the highlighted Gold zone'}
              </span>
            </div>
            <span className="font-mono text-[10px] font-bold text-[#00ffaa] whitespace-nowrap shrink-0">
              {hud.lastTimingQuality ?? 'GUIDE ON'}
            </span>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="flex items-center justify-between gap-2"
        >
          <span className="bg-[#05070B]/98 border border-white/35 backdrop-blur-sm px-2.5 py-1 rounded-[2px] font-mono text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-[#FFFFFF] tabular-nums shadow">
            Made {hud.madeCount}/{hud.attemptsCount} · Swishes {hud.swishCount}
            {hud.isMovingToRack ? ' · Sprinting to next rack' : ''}
          </span>
          <span className="sm:hidden bg-[#05070B]/98 border border-white/35 backdrop-blur-sm px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-wider font-semibold text-[#FFFFFF] shadow">
            Touch &amp; hold court
          </span>
          <span className="hidden sm:inline bg-[#05070B]/98 border border-white/35 backdrop-blur-sm px-2.5 py-1 rounded-[2px] font-mono text-[11px] uppercase tracking-wider font-semibold text-[#FFFFFF] shadow">
            Hold Space or Touch/Click to shoot{hud.mode !== 'PVP' ? ' · Esc Pause' : ''}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
};
