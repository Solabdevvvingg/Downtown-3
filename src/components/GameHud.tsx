import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Flame,
  Infinity as InfinityIcon,
  Pause,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { BALLS_PER_RACK, RACK_CONFIGS, STAMINA_LOW_THRESHOLD } from '../game/constants';
import { HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPause: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({ hud, onToggleMute, onPause }) => {
  const isHeatCheck = hud.mode === 'HEAT_CHECK';
  const isUrgent = !isHeatCheck && hud.timeLeft <= 10.0 && hud.phase === 'PLAYING';
  const activeRack = RACK_CONFIGS[Math.min(hud.currentRack, RACK_CONFIGS.length - 1)];
  const staminaPct = Math.max(0, Math.min(100, Math.round(hud.stamina)));
  const isLowStamina = staminaPct < STAMINA_LOW_THRESHOLD;

  const opponent =
    hud.mode === 'PVP' && hud.pvpMatch
      ? hud.pvpMatch.players.find((p) => p.id !== hud.myPlayerId) ?? null
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 md:p-5"
    >
      {/* Top Broadcast Scoreboard Bar — compact and non-overflowing on mobile */}
      <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-2">
        {/* Left Column: Score / Multiplier / Streak + Stamina Bar */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-stretch bg-[#12161F]/92 border border-white/12 rounded-lg overflow-hidden">
            <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="text-[10px] sm:text-[11px] font-medium text-[#94A3B8]">
                {hud.mode === 'PVP' ? 'You' : 'Score'}
              </span>
              <motion.span
                key={hud.score}
                initial={{ scale: hud.score > 0 ? 1.18 : 1, y: hud.score > 0 ? -2 : 0 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 460, damping: 24 }}
                className="font-mono text-xl sm:text-2xl md:text-3xl font-bold leading-none text-[#F4EFE6] tabular-nums inline-block"
              >
                {hud.score}
              </motion.span>
            </div>

            <div className="w-px bg-white/10" />

            <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="text-[10px] sm:text-[11px] font-medium text-[#94A3B8]">Mult</span>
              <motion.span
                key={hud.multiplier}
                initial={{ scale: hud.multiplier > 1 ? 1.24 : 1 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 22 }}
                className={`font-mono text-xl sm:text-2xl md:text-3xl font-bold leading-none tabular-nums inline-block ${
                  hud.multiplier >= 4
                    ? 'text-[#F59E0B]'
                    : hud.multiplier >= 2
                      ? 'text-[#F9631C]'
                      : 'text-[#CBD5E1]'
                }`}
              >
                {hud.multiplier}x
              </motion.span>
            </div>

            <div className="w-px bg-white/10" />

            <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex flex-col justify-center">
              <span className="text-[10px] sm:text-[11px] font-medium text-[#94A3B8] whitespace-nowrap">
                {hud.difficulty.label}
              </span>
              <div className="flex items-baseline gap-1.5">
                <motion.span
                  key={hud.streak}
                  initial={{ scale: hud.streak > 0 ? 1.22 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 22 }}
                  className="font-mono text-lg sm:text-xl md:text-2xl font-bold leading-none text-[#F4EFE6] tabular-nums inline-block"
                >
                  {hud.streak}
                </motion.span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-[#F59E0B] tabular-nums">
                  Lv.{hud.difficulty.level}
                </span>
              </div>
            </div>
          </div>

          {/* Stamina Bar */}
          <div
            className={`bg-[#12161F]/92 border rounded-lg px-2.5 sm:px-3 py-1.5 transition-colors ${
              isLowStamina ? 'border-[#EF4444]/55' : 'border-white/12'
            }`}
            aria-label={`Stamina ${staminaPct} percent${isLowStamina ? ', low stamina faster meter' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] leading-none mb-1">
              <span className="flex items-center gap-1 font-medium text-[#94A3B8]">
                <Zap
                  className={`w-3 h-3 ${
                    isLowStamina
                      ? 'text-[#EF4444]'
                      : staminaPct < 70
                        ? 'text-[#F59E0B]'
                        : 'text-[#10B981]'
                  }`}
                />
                <span>Stamina</span>
              </span>
              <div className="flex items-center gap-1.5">
                {isLowStamina && (
                  <span className="text-[9px] font-semibold text-[#FCA5A5] tracking-tight uppercase">
                    Low · Faster Meter
                  </span>
                )}
                <span
                  className={`font-mono font-bold tabular-nums ${
                    isLowStamina
                      ? 'text-[#EF4444]'
                      : staminaPct < 70
                        ? 'text-[#F59E0B]'
                        : 'text-[#10B981]'
                  }`}
                >
                  {staminaPct}%
                </span>
              </div>
            </div>
            <div className="relative w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  isLowStamina
                    ? 'bg-[#EF4444]'
                    : staminaPct < 70
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#10B981]'
                }`}
                style={{ width: `${staminaPct}%` }}
              />
              {/* Fatigue threshold tick */}
              <span
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-px bg-white/35"
                style={{ left: `${STAMINA_LOW_THRESHOLD}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Center: Arena Shot Clock (or Heat Check No-Clock Moving Hoop Mode), Rack Label & Wind Indicator */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.05 }}
          className="flex items-stretch gap-1.5 sm:gap-2"
        >
          {isHeatCheck ? (
            <div className="flex flex-col items-center justify-center bg-[#12161F]/92 border border-[#F59E0B]/40 rounded-lg px-3 sm:px-4 py-1 sm:py-1.5">
              <div className="flex items-center gap-1.5 font-display text-xl sm:text-2xl md:text-[26px] font-extrabold tracking-wide leading-none text-[#F59E0B]">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-[#F9631C]" />
                <span>HEAT CHECK</span>
                <InfinityIcon className="w-4 h-4 text-[#FDE047]" />
              </div>
              <div className="text-[10px] sm:text-[11px] font-medium text-[#CBD5E1] mt-1 whitespace-nowrap tabular-nums">
                R{Math.min(hud.currentRack + 1, 5)}/5 · {activeRack.shortLabel} · Shift{' '}
                <span className="font-mono text-[#F59E0B]">{hud.heatCheckShiftIn.toFixed(1)}s</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center bg-[#12161F]/92 border border-white/12 rounded-lg px-3 sm:px-5 py-1 sm:py-1.5">
              <div
                className={`font-mono text-2xl sm:text-3xl md:text-4xl font-bold leading-none tracking-tight tabular-nums ${
                  isUrgent ? 'text-[#EF4444]' : 'text-[#F4EFE6]'
                }`}
              >
                {hud.timeLeft.toFixed(1)}
              </div>
              <div className="text-[10px] sm:text-[11px] font-medium text-[#A5B0C2] mt-0.5 whitespace-nowrap">
                R{Math.min(hud.currentRack + 1, 5)}/5 · {activeRack.shortLabel}
                {hud.currentRack === hud.moneyRack ? ' · 2x Rack' : ''}
              </div>
            </div>
          )}

          {/* Wind Direction & Intensity Gauge */}
          <div
            className="flex flex-col justify-center bg-[#12161F]/92 border border-white/12 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 min-w-[78px] sm:min-w-[92px]"
            aria-label={`Arena draft wind ${hud.wind.mph.toFixed(1)} mph ${hud.wind.dirLabel}`}
          >
            <div className="flex items-center justify-between gap-1 text-[10px] text-[#94A3B8]">
              <span className="flex items-center gap-1 font-medium">
                <Wind className="w-3 h-3 text-[#38BDF8]" />
                <span>Wind</span>
              </span>
              <span className="font-mono font-semibold text-[#CBD5E1]">
                {hud.wind.dirLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1.5 mt-0.5">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/6 shrink-0 transition-transform duration-150"
                style={{
                  transform: `rotate(${(hud.wind.relativeAngleRad * 180) / Math.PI}deg)`,
                }}
              >
                <ArrowRight
                  className={`w-3 h-3 ${
                    hud.wind.intensity >= 0.65
                      ? 'text-[#F59E0B]'
                      : hud.wind.intensity >= 0.32
                        ? 'text-[#38BDF8]'
                        : 'text-[#94A3B8]'
                  }`}
                />
              </span>
              <span
                className={`font-mono text-xs sm:text-sm font-bold leading-none tabular-nums ${
                  hud.wind.intensity >= 0.65
                    ? 'text-[#F59E0B]'
                    : hud.wind.intensity >= 0.32
                      ? 'text-[#38BDF8]'
                      : 'text-[#CBD5E1]'
                }`}
              >
                {hud.wind.mph.toFixed(1)}
                <span className="text-[9px] font-normal text-[#94A3B8] ml-0.5">mph</span>
              </span>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  hud.wind.intensity >= 0.65
                    ? 'bg-[#F59E0B]'
                    : hud.wind.intensity >= 0.32
                      ? 'bg-[#38BDF8]'
                      : 'bg-[#64748B]'
                }`}
                style={{ width: `${Math.max(8, Math.round(hud.wind.intensity * 100))}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Right: Opponent Scoreboard (PVP) or 25-Ball Tracker + Audio/Pause Controls */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.1 }}
          className="flex items-center gap-1.5 sm:gap-2"
        >
          {hud.mode === 'PVP' && opponent ? (
            <div className="flex items-stretch bg-[#12161F]/92 border border-[#3B82F6]/40 rounded-lg overflow-hidden">
              <div className="px-2.5 sm:px-3 py-1.5 flex flex-col justify-center text-right">
                <span className="text-[10px] sm:text-[11px] font-medium text-[#93C5FD] truncate max-w-[74px] sm:max-w-[110px]">
                  {opponent.name}
                </span>
                <span className="font-mono text-xl sm:text-2xl font-bold leading-none text-[#F4EFE6] tabular-nums">
                  {opponent.score}
                </span>
                {opponent.record && (
                  <span className="font-mono text-[9px] text-[#94A3B8] tabular-nums mt-0.5">
                    {opponent.record.wins}W-{opponent.record.losses}L-{opponent.record.draws}D
                  </span>
                )}
              </div>
              <div className="w-px bg-white/10" />
              <div className="px-2 sm:px-3 py-1.5 flex flex-col justify-center text-right">
                <span className="text-[10px] sm:text-[11px] font-medium text-[#94A3B8]">Mult</span>
                <span className="font-mono text-lg sm:text-xl font-bold leading-none text-[#60A5FA] tabular-nums">
                  {opponent.multiplier}x
                </span>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-2.5 bg-[#12161F]/92 border border-white/12 rounded-lg px-3.5 py-2.5">
              {RACK_CONFIGS.map((rack) => {
                const isCurrent = rack.id === hud.currentRack && hud.phase === 'PLAYING';
                const startIdx = rack.id * BALLS_PER_RACK;
                return (
                  <div
                    key={rack.id}
                    className={`flex items-center gap-1 px-1 py-0.5 rounded transition-colors ${
                      isCurrent ? 'bg-white/10' : ''
                    }`}
                  >
                    {Array.from({ length: BALLS_PER_RACK }).map((_, bIdx) => {
                      const slot = hud.balls[startIdx + bIdx];
                      if (!slot) return null;
                      const isActiveBall = isCurrent && bIdx === hud.currentBall;
                      let fillClass = 'bg-white/18';
                      if (slot.status === 'MADE') {
                        fillClass = slot.isMoney ? 'bg-[#F59E0B]' : 'bg-[#10B981]';
                      } else if (slot.status === 'MISSED') {
                        fillClass = 'bg-[#EF4444]/65';
                      } else if (slot.status === 'IN_AIR') {
                        fillClass = 'bg-[#F9631C]';
                      } else if (isActiveBall) {
                        fillClass = 'bg-white';
                      }
                      return (
                        <span
                          key={bIdx}
                          className={`w-2.5 h-2.5 rounded-full transition-colors ${fillClass} ${
                            slot.isMoney ? 'ring-1 ring-[#F59E0B] ring-offset-1 ring-offset-[#12161F]' : ''
                          }`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onToggleMute}
            aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
            className="pointer-events-auto flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#12161F]/92 border border-white/12 text-[#F4EFE6] hover:border-white/30 transition-colors cursor-pointer"
          >
            {hud.muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </motion.button>

          {hud.mode !== 'PVP' && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onPause}
              aria-label="Pause contest"
              className="pointer-events-auto flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#12161F]/92 border border-white/12 text-[#F4EFE6] hover:border-white/30 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Countdown Overlay Numeral */}
      <AnimatePresence mode="wait">
        {hud.phase === 'COUNTDOWN' && (
          <motion.div
            key={`cd-${hud.countdownValue}`}
            initial={{ opacity: 0, scale: 0.65, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.25 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="my-auto mx-auto flex flex-col items-center text-center px-4"
          >
            <div className="font-display text-7xl sm:text-8xl md:text-9xl font-extrabold text-[#F9631C] leading-none drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)] tabular-nums">
              {hud.countdownValue > 0 ? hud.countdownValue : 'SHOOT!'}
            </div>
            <div className="text-xs sm:text-sm font-medium text-[#F4EFE6] mt-2 bg-[#12161F]/85 px-3 py-1 rounded">
              {hud.mode === 'PVP' && opponent
                ? `1v1 vs ${opponent.name} · Hold & Release to shoot`
                : isHeatCheck
                  ? 'No Shot Clock · Moving Hoop · Don’t Miss'
                  : 'Hold & Release in the green/gold zone'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle Bottom Feedback Line */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22, delay: 0.1 }}
        className="flex items-center justify-between text-[11px] sm:text-xs text-[#94A3B8]"
      >
        <span>
          Made {hud.madeCount}/{hud.attemptsCount} · Swishes {hud.swishCount}
          {hud.isMovingToRack ? ' · Sprinting to next rack' : ''}
        </span>
        <span className="hidden sm:inline">
          Hold Space or Touch/Click to shoot{hud.mode !== 'PVP' ? ' · Esc Pause' : ''}
        </span>
      </motion.div>
    </motion.div>
  );
};

