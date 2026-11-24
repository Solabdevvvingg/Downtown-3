import React from 'react';
import { motion } from 'motion/react';
import { Pencil, Video, Volume2, VolumeX } from 'lucide-react';
import { CameraMode, GameMode } from '../game/types';

interface PauseModalProps {
  mode?: GameMode;
  muted: boolean;
  cameraMode: CameraMode;
  displayUsername: string;
  onToggleMute: () => void;
  onToggleCameraMode: () => void;
  onOpenEditUsername: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  mode = 'SOLO',
  muted,
  cameraMode,
  displayUsername,
  onToggleMute,
  onToggleCameraMode,
  onOpenEditUsername,
  onResume,
  onRestart,
  onQuitToTitle,
}) => {
  const isHeatCheck = mode === 'HEAT_CHECK';
  const isPractice = mode === 'PRACTICE';
  const isFastBreak = mode === 'FAST_BREAK';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/92 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="w-full max-w-sm bg-[#0F1117] border border-white/25 rounded-[4px] p-6 text-center shadow-2xl"
      >
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#6EE7B7] mb-1">
          Contest Timeout
        </div>
        <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-white mb-1">
          {isFastBreak
            ? 'Fast-Break Paused'
            : isHeatCheck
              ? 'Heat Check Paused'
              : isPractice
                ? 'Practice Paused'
                : 'Contest Paused'}
        </h2>
        <p className="text-xs font-medium text-[#CBD5E1] mb-5">
          Press Esc to return to the hardwood.
        </p>

        <div className="space-y-2 mb-4">
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
            className={`w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 rounded-[2px] border text-xs font-bold transition-colors cursor-pointer ${
              muted
                ? 'bg-[#07090E] border-white/25 text-white hover:border-white/50'
                : 'bg-[#07090E] border-[#00ffaa]/70 text-white hover:border-[#00ffaa]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#FECACA]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#6EE7B7]" />
              )}
              <span>Sound Effects</span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] ${
                muted
                  ? 'bg-white/15 text-white'
                  : 'bg-[#00ffaa]/20 text-[#6EE7B7]'
              }`}
            >
              {muted ? 'MUTED' : 'ON'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleCameraMode}
            aria-pressed={cameraMode === 'PRO_STATIC'}
            aria-label={`Switch camera angle (current: ${cameraMode === 'PRO_STATIC' ? 'Pro-Static' : 'Follow-Cam'})`}
            className={`w-full min-h-[48px] flex items-center justify-between px-4 py-2.5 rounded-[2px] border text-xs font-bold transition-colors cursor-pointer ${
              cameraMode === 'PRO_STATIC'
                ? 'bg-[#07090E] border-[#FDE047]/75 text-white hover:border-[#FDE047]'
                : 'bg-[#07090E] border-[#00ffaa]/70 text-white hover:border-[#00ffaa]'
            }`}
          >
            <span className="flex items-center gap-2.5 text-left min-w-0">
              <Video
                className={`w-4 h-4 shrink-0 ${
                  cameraMode === 'PRO_STATIC' ? 'text-[#FEF08A]' : 'text-[#6EE7B7]'
                }`}
              />
              <span className="min-w-0">
                <span className="block leading-tight text-white">Camera Angle</span>
                <span className="block font-mono text-[10px] font-medium text-[#CBD5E1] mt-0.5 truncate">
                  {cameraMode === 'PRO_STATIC'
                    ? 'Full rack locked in view'
                    : 'Dynamic shooter follow'}
                </span>
              </span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[2px] shrink-0 ml-2 ${
                cameraMode === 'PRO_STATIC'
                  ? 'bg-[#FDE047]/20 text-[#FEF08A]'
                  : 'bg-[#00ffaa]/20 text-[#6EE7B7]'
              }`}
            >
              {cameraMode === 'PRO_STATIC' ? 'PRO-STATIC' : 'FOLLOW-CAM'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenEditUsername}
            className="w-full min-h-[44px] flex items-center justify-between px-4 py-2.5 rounded-[2px] bg-[#07090E] border border-white/25 hover:border-[#00ffaa] text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-white min-w-0">
              <Pencil className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
              <span className="truncate">Username: {displayUsername}</span>
            </span>
            <span className="font-mono text-[11px] font-bold uppercase text-[#6EE7B7] shrink-0 ml-2">
              Edit
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] py-3 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[44px] py-2.5 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 text-white font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
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
            className="w-full min-h-[42px] py-2 rounded-[2px] text-[#E2E8F0] hover:text-white hover:bg-white/10 font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Back to Title
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
