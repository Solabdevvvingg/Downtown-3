import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { GameMode } from '../game/types';

interface PauseModalProps {
  mode?: GameMode;
  muted: boolean;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  mode = 'SOLO',
  muted,
  onToggleMute,
  onResume,
  onRestart,
  onQuitToTitle,
}) => {
  const isHeatCheck = mode === 'HEAT_CHECK';

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/75 p-4">
      <div className="w-full max-w-sm bg-[#12161F] border border-white/15 rounded-xl p-6 text-center">
        <h2 className="font-display text-4xl font-extrabold text-[#F4EFE6] tracking-wide mb-1">
          {isHeatCheck ? 'Heat Check Paused' : 'Contest Paused'}
        </h2>
        <p className="text-sm text-[#94A3B8] mb-5">
          Press Esc to return to the hardwood.
        </p>

        {/* Dedicated Pause Menu Audio Control */}
        <div className="mb-4">
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${
              muted
                ? 'bg-[#0B0E14] border-white/12 text-[#94A3B8] hover:border-white/25 hover:text-[#F4EFE6]'
                : 'bg-[#182131] border-[#F9631C]/35 text-[#F4EFE6] hover:border-[#F9631C]/60'
            }`}
          >
            <span className="flex items-center gap-2.5">
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#EF4444]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#10B981]" />
              )}
              <span>Sound Effects</span>
            </span>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded ${
                muted
                  ? 'bg-white/6 text-[#94A3B8]'
                  : 'bg-[#10B981]/15 text-[#34D399]'
              }`}
            >
              {muted ? 'MUTED' : 'ON'}
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] text-[#0B0E14] font-display text-xl font-extrabold tracking-wide transition-colors cursor-pointer"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 rounded-lg bg-white/8 hover:bg-white/14 text-[#F4EFE6] text-sm font-semibold transition-colors cursor-pointer"
          >
            {isHeatCheck ? 'Restart Heat Check' : 'Restart Contest'}
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 rounded-lg text-[#94A3B8] hover:text-[#F4EFE6] text-sm font-medium transition-colors cursor-pointer"
          >
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
};
