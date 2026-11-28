import React from 'react';
import { motion } from 'motion/react';
import {
  Gauge,
  Pencil,
  RotateCcw,
  TrendingUp,
  Vibrate,
  Video,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CameraMode, GameMode, HapticIntensity } from '../game/types';

interface PauseModalProps {
  mode?: GameMode;
  muted: boolean;
  audioVolume: number;
  shotSensitivity: number;
  hapticIntensity: HapticIntensity;
  cameraMode: CameraMode;
  shotTrajectoryEnabled: boolean;
  displayUsername: string;
  onToggleMute: () => void;
  onChangeAudioVolume: (volume: number) => void;
  onChangeShotSensitivity: (sensitivity: number) => void;
  onChangeHapticIntensity: (intensity: HapticIntensity) => void;
  onToggleCameraMode: () => void;
  onToggleShotTrajectory: () => void;
  onOpenEditUsername: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

const HAPTIC_OPTIONS: { value: HapticIntensity; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

export const PauseModal: React.FC<PauseModalProps> = ({
  mode = 'SOLO',
  muted,
  audioVolume,
  shotSensitivity,
  hapticIntensity,
  cameraMode,
  shotTrajectoryEnabled,
  displayUsername,
  onToggleMute,
  onChangeAudioVolume,
  onChangeShotSensitivity,
  onChangeHapticIntensity,
  onToggleCameraMode,
  onToggleShotTrajectory,
  onOpenEditUsername,
  onResume,
  onRestart,
  onQuitToTitle,
}) => {
  const isHeatCheck = mode === 'HEAT_CHECK';
  const isPractice = mode === 'PRACTICE';
  const isFastBreak = mode === 'FAST_BREAK';

  const effectiveVolume = muted ? 0 : audioVolume;
  const sensitivityPct = Math.round(shotSensitivity * 100);
  const sensitivityDescriptor =
    sensitivityPct < 95 ? 'Slower fill' : sensitivityPct > 105 ? 'Faster fill' : 'Standard';
  const isDefaultSensitivity = Math.abs(shotSensitivity - 1.0) < 0.01;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/92 backdrop-blur-sm p-3 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="w-full max-w-sm max-h-[calc(100vh-1.5rem)] overflow-y-auto bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-6 text-center shadow-2xl"
      >
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#00ffaa] mb-1">
          Contest Timeout
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mb-1">
          {isFastBreak
            ? 'Fast-Break Paused'
            : isHeatCheck
              ? 'Heat Check Paused'
              : isPractice
                ? 'Practice Paused'
                : 'Contest Paused'}
        </h2>
        <p className="text-xs font-medium text-[#F8FAFC] mb-4">
          Press Esc to return to the hardwood.
        </p>

        <div className="space-y-2 mb-4 text-left">
          {/* Audio Volume Slider (0-100%) */}
          <div
            className={`w-full px-3.5 py-2.5 rounded-[2px] border transition-colors ${
              effectiveVolume <= 0
                ? 'bg-[#05070B] border-white/30'
                : 'bg-[#05070B] border-[#00ffaa]/75'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onToggleMute}
                  aria-pressed={effectiveVolume <= 0}
                  aria-label={effectiveVolume <= 0 ? 'Unmute audio' : 'Mute audio'}
                  className="flex items-center justify-center w-8 h-8 -ml-1 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/25 text-[#FFFFFF] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#00ffaa]"
                >
                  {effectiveVolume <= 0 ? (
                    <VolumeX className="w-4 h-4 text-[#FEE2E2]" />
                  ) : effectiveVolume < 50 ? (
                    <Volume1 className="w-4 h-4 text-[#00ffaa]" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-[#00ffaa]" />
                  )}
                </button>
                <label
                  htmlFor="pause-volume-slider"
                  className="text-xs font-bold text-[#FFFFFF] whitespace-nowrap cursor-pointer"
                >
                  Sound Volume
                </label>
              </div>
              <span
                className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] border tabular-nums shrink-0 ${
                  effectiveVolume <= 0
                    ? 'bg-[#240A0E] border-[#FCA5A5]/70 text-[#FEE2E2]'
                    : 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
                }`}
              >
                {effectiveVolume <= 0 ? 'MUTED (0%)' : `${effectiveVolume}%`}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums w-6">
                0%
              </span>
              <input
                id="pause-volume-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={effectiveVolume}
                onChange={(ev) => onChangeAudioVolume(Number(ev.target.value))}
                aria-label="Sound volume percentage"
                aria-valuetext={`${effectiveVolume} percent`}
                className="flex-1 h-2 rounded-full bg-white/25 accent-[#00ffaa] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ffaa]"
              />
              <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums w-9 text-right">
                100%
              </span>
            </div>
          </div>

          {/* Shot Sensitivity Slider */}
          <div className="w-full px-3.5 py-2.5 rounded-[2px] border border-[#00ffaa]/75 bg-[#05070B]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Gauge className="w-4 h-4 text-[#00ffaa] shrink-0" />
                <div className="min-w-0">
                  <label
                    htmlFor="pause-sensitivity-slider"
                    className="block text-xs font-bold text-[#FFFFFF] leading-tight cursor-pointer"
                  >
                    Shot Sensitivity
                  </label>
                  <span className="block font-mono text-[10px] font-medium text-[#F8FAFC] mt-0.5">
                    {sensitivityDescriptor} · meter speed
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isDefaultSensitivity && (
                  <button
                    type="button"
                    onClick={() => onChangeShotSensitivity(1.0)}
                    aria-label="Reset shot sensitivity to 100%"
                    title="Reset to 100%"
                    className="flex items-center justify-center w-7 h-7 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/30 text-[#FFFFFF] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/65 text-[#A7F3D0] tabular-nums">
                  {sensitivityPct}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums shrink-0">
                60%
              </span>
              <input
                id="pause-sensitivity-slider"
                type="range"
                min={0.6}
                max={1.5}
                step={0.05}
                value={shotSensitivity}
                onChange={(ev) => onChangeShotSensitivity(Number(ev.target.value))}
                aria-label="Shot meter sensitivity"
                aria-valuetext={`${sensitivityPct} percent (${sensitivityDescriptor})`}
                className="flex-1 h-2 rounded-full bg-white/25 accent-[#00ffaa] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ffaa]"
              />
              <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums shrink-0">
                150%
              </span>
            </div>
          </div>

          {/* Haptic Feedback Intensity Selector */}
          <div className="w-full px-3.5 py-2.5 rounded-[2px] border border-white/30 bg-[#05070B]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Vibrate className="w-4 h-4 text-[#00ffaa] shrink-0" />
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-[#FFFFFF] leading-tight">
                    Haptic Feedback
                  </span>
                  <span className="block font-mono text-[10px] font-medium text-[#F8FAFC] mt-0.5">
                    Shot release &amp; rim vibration
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase text-[#00ffaa] shrink-0">
                {hapticIntensity}
              </span>
            </div>
            <div
              role="group"
              aria-label="Haptic feedback intensity"
              className="grid grid-cols-3 gap-1.5"
            >
              {HAPTIC_OPTIONS.map((opt) => {
                const active = hapticIntensity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeHapticIntensity(opt.value)}
                    aria-pressed={active}
                    className={`min-h-[40px] px-2 py-1.5 rounded-[2px] border font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                      active
                        ? 'bg-[#00ffaa] border-[#00ffaa] text-[#05070B]'
                        : 'bg-[#141824] border-white/30 text-[#FFFFFF] hover:border-white/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Camera Angle */}
          <button
            type="button"
            onClick={onToggleCameraMode}
            aria-pressed={cameraMode === 'PRO_STATIC'}
            aria-label={`Switch camera angle (current: ${cameraMode === 'PRO_STATIC' ? 'Pro-Static' : 'Follow-Cam'})`}
            className={`w-full min-h-[46px] flex items-center justify-between px-3.5 py-2 rounded-[2px] border text-xs font-bold transition-colors cursor-pointer ${
              cameraMode === 'PRO_STATIC'
                ? 'bg-[#05070B] border-[#FDE047]/80 text-[#FFFFFF] hover:border-[#FDE047]'
                : 'bg-[#05070B] border-[#00ffaa]/75 text-[#FFFFFF] hover:border-[#00ffaa]'
            }`}
          >
            <span className="flex items-center gap-2.5 text-left min-w-0">
              <Video
                className={`w-4 h-4 shrink-0 ${
                  cameraMode === 'PRO_STATIC' ? 'text-[#FEF08A]' : 'text-[#00ffaa]'
                }`}
              />
              <span className="min-w-0">
                <span className="block leading-tight text-[#FFFFFF]">Camera Angle</span>
                <span className="block font-mono text-[10px] font-medium text-[#F8FAFC] mt-0.5 truncate">
                  {cameraMode === 'PRO_STATIC'
                    ? 'Full rack locked in view'
                    : 'Dynamic shooter follow'}
                </span>
              </span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] border shrink-0 ml-2 whitespace-nowrap ${
                cameraMode === 'PRO_STATIC'
                  ? 'bg-[#1F1804] border-[#FDE047]/70 text-[#FEF08A]'
                  : 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
              }`}
            >
              {cameraMode === 'PRO_STATIC' ? 'PRO-STATIC' : 'FOLLOW-CAM'}
            </span>
          </button>

          {/* Shot Trajectory */}
          <button
            type="button"
            onClick={onToggleShotTrajectory}
            aria-pressed={shotTrajectoryEnabled}
            aria-label={
              shotTrajectoryEnabled
                ? 'Disable dotted shot trajectory arc'
                : 'Enable dotted shot trajectory arc'
            }
            className={`w-full min-h-[46px] flex items-center justify-between px-3.5 py-2 rounded-[2px] border text-xs font-bold transition-colors cursor-pointer ${
              shotTrajectoryEnabled
                ? 'bg-[#05070B] border-[#00ffaa]/80 text-[#FFFFFF] hover:border-[#00ffaa]'
                : 'bg-[#05070B] border-white/30 text-[#FFFFFF] hover:border-white/55'
            }`}
          >
            <span className="flex items-center gap-2.5 text-left min-w-0">
              <TrendingUp
                className={`w-4 h-4 shrink-0 ${
                  shotTrajectoryEnabled ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                }`}
              />
              <span className="min-w-0">
                <span className="block leading-tight text-[#FFFFFF]">Shot Trajectory</span>
                <span className="block font-mono text-[10px] font-medium text-[#F8FAFC] mt-0.5 truncate">
                  {shotTrajectoryEnabled
                    ? 'Dotted arc of last shot'
                    : 'Arc path hidden'}
                </span>
              </span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] border shrink-0 ml-2 whitespace-nowrap ${
                shotTrajectoryEnabled
                  ? 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
                  : 'bg-[#141824] border-white/30 text-[#FFFFFF]'
              }`}
            >
              {shotTrajectoryEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Edit Username */}
          <button
            type="button"
            onClick={onOpenEditUsername}
            className="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] text-xs font-bold text-[#FFFFFF] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-[#FFFFFF] min-w-0">
              <Pencil className="w-3.5 h-3.5 text-[#00ffaa] shrink-0" />
              <span className="truncate">Username: {displayUsername}</span>
            </span>
            <span className="font-mono text-[11px] font-bold uppercase text-[#00ffaa] shrink-0 ml-2 whitespace-nowrap">
              Edit
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[44px] py-2.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            {isFastBreak
              ? 'Restart Fast-Break'
              : isHeatCheck
                ? 'Restart Heat Check'
                : isPractice
                  ? 'Restart Practice'
                  : 'Restart Contest'}
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full min-h-[42px] py-2 rounded-[2px] bg-[#05070B] border border-white/25 text-[#FFFFFF] hover:border-[#00ffaa] hover:text-[#00ffaa] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
          >
            Back to Title
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
