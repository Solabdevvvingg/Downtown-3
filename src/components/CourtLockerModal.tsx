import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, Lock, Volume2, X } from 'lucide-react';
import { COURT_THEMES, CourtThemeConfig, getUnlockedCourtsCount } from '../game/courts';
import { CareerStats, CourtThemeId } from '../game/types';

interface CourtLockerModalProps {
  selectedCourt: CourtThemeId;
  career: CareerStats;
  onSelectCourt: (theme: CourtThemeId) => void;
  onPreviewChant: (theme: CourtThemeId) => void;
  onClose: () => void;
}

const CourtMiniPreview: React.FC<{ theme: CourtThemeConfig; locked: boolean }> = ({
  theme,
  locked,
}) => {
  const { palette } = theme;
  return (
    <div
      className="relative w-full h-28 rounded-lg overflow-hidden border border-white/30"
      style={{ backgroundColor: palette.bgStops[1] }}
    >
      <svg
        viewBox="0 0 240 112"
        className={`w-full h-full ${locked ? 'opacity-50 grayscale-[35%]' : ''}`}
        aria-hidden="true"
      >
        {/* Backdrop */}
        <rect width="240" height="112" fill={palette.bgStops[0]} />
        <rect y="18" width="240" height="32" fill={palette.standBg} />
        {palette.isOutdoorFence && (
          <path
            d="M0 18 L24 50 M24 18 L0 50 M32 18 L56 50 M56 18 L32 50 M64 18 L88 50 M88 18 L64 50 M96 18 L120 50 M120 18 L96 50 M128 18 L152 50 M152 18 L128 50 M160 18 L184 50 M184 18 L160 50 M192 18 L216 50 M216 18 L192 50"
            stroke="rgba(148,163,184,0.22)"
            strokeWidth="1"
          />
        )}

        {/* Spotlight beams */}
        <polygon
          points="54,0 74,0 105,112 24,112"
          fill={`rgba(${palette.spotlightSecondary}, 0.14)`}
        />
        <polygon
          points="108,0 132,0 156,112 84,112"
          fill={`rgba(${palette.spotlightPrimary}, 0.16)`}
        />
        <polygon
          points="166,0 186,0 216,112 135,112"
          fill={`rgba(${palette.spotlightSecondary}, 0.14)`}
        />

        {/* Court Apron & Planks */}
        <polygon points="0,48 240,48 240,112 0,112" fill={palette.apron} />
        <polygon points="24,52 216,52 232,112 8,112" fill={palette.plankColors[0]} />
        <polygon points="48,52 72,52 60,112 34,112" fill={palette.plankColors[1]} />
        <polygon points="96,52 120,52 120,112 92,112" fill={palette.plankColors[2]} />
        <polygon points="144,52 168,52 182,112 154,112" fill={palette.plankColors[3]} />
        <polygon points="192,52 216,52 230,112 204,112" fill={palette.plankColors[1]} />

        {/* Key Paint */}
        <polygon points="94,52 146,52 154,94 86,94" fill={palette.paint} />
        <polygon
          points="94,52 146,52 154,94 86,94"
          fill="none"
          stroke={palette.lineColor}
          strokeWidth="1.4"
        />

        {/* 3-Point Arc */}
        <path
          d="M 38 52 L 38 72 A 84 48 0 0 0 202 72 L 202 52"
          fill="none"
          stroke={palette.threeArcColor}
          strokeWidth="2"
        />

        {/* Stanchion, Backboard & Rim */}
        <line x1="120" y1="54" x2="120" y2="30" stroke={palette.stanchionColor} strokeWidth="4" />
        <rect
          x="104"
          y="22"
          width="32"
          height="18"
          rx="1.5"
          fill={palette.backboardGlass}
          stroke={palette.threeArcColor}
          strokeWidth="1.4"
        />
        <rect
          x="114"
          y="29"
          width="12"
          height="8"
          fill="none"
          stroke={palette.threeArcColor}
          strokeWidth="1"
        />
        <ellipse
          cx="120"
          cy="39"
          rx="6.5"
          ry="2.2"
          fill="none"
          stroke={palette.rimColor}
          strokeWidth="2"
        />
      </svg>

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070B]/85">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#05070B] border border-[#FDE047]/65 text-xs font-bold text-[#FEF08A]">
            <Lock className="w-3.5 h-3.5 text-[#FEF08A]" />
            <span>Locked</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const CourtLockerModal: React.FC<CourtLockerModalProps> = ({
  selectedCourt,
  career,
  onSelectCourt,
  onPreviewChant,
  onClose,
}) => {
  const unlockedCount = getUnlockedCourtsCount(career);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-6 overflow-y-auto"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="court-locker-title"
        className="w-full max-w-3xl max-h-[92dvh] overflow-y-auto bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-7 my-auto shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/25 pb-4 mb-5">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#00ffaa] block mb-1">
              Arena Environments
            </span>
            <h2
              id="court-locker-title"
              className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#FFFFFF]"
            >
              Court Locker
            </h2>
            <p className="text-xs sm:text-sm text-[#F8FAFC] mt-1 tabular-nums">
              {unlockedCount} / {COURT_THEMES.length} Courts Unlocked · Changes court visuals and crowd chant audio
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Court Locker"
            className="flex items-center justify-center w-10 h-10 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] hover:border-[#00ffaa] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Court Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COURT_THEMES.map((theme) => {
            const unlocked = theme.unlock.isUnlocked(career);
            const active = selectedCourt === theme.id;
            const progress = theme.unlock.getProgress(career);

            return (
              <div
                key={theme.id}
                className={`flex flex-col justify-between gap-3 rounded-[4px] p-4 border transition-colors ${
                  active
                    ? 'bg-[#121722] border-[#00ffaa]'
                    : 'bg-[#05070B] border-white/25'
                }`}
              >
                <div className="space-y-3">
                  <CourtMiniPreview theme={theme} locked={!unlocked} />

                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF]">
                        {theme.name}
                      </h3>
                      {active && (
                        <span className="font-mono text-[10px] font-bold uppercase text-[#00ffaa] whitespace-nowrap">
                          Equipped
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#F8FAFC] mt-1">
                      <span>{theme.vibeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{theme.chantLabel}</span>
                    </div>

                    <p className="text-xs leading-relaxed text-[#F8FAFC] mt-2">
                      {theme.description}
                    </p>
                  </div>
                </div>

                {/* Footer Controls / Unlock Progress */}
                <div className="pt-2.5 border-t border-white/25">
                  {unlocked ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCourt(theme.id)}
                        className={`flex-1 min-h-[42px] px-4 py-2 rounded-[2px] font-mono text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#00ffaa] text-[#05070B]'
                            : 'bg-[#FFFFFF] hover:bg-[#00ffaa] text-[#05070B]'
                        }`}
                      >
                        {active && <Check className="w-4 h-4 shrink-0" />}
                        <span>{active ? 'Equipped' : 'Select Court'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onPreviewChant(theme.id)}
                        title={`Hear ${theme.name} crowd chant`}
                        className="min-h-[42px] px-3.5 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-xs font-bold uppercase text-[#FFFFFF] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-[#00ffaa]" />
                        <span>Chant</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[#FFFFFF] font-semibold">{theme.unlock.label}</span>
                        <span className="font-mono font-bold text-[#00ffaa] tabular-nums shrink-0">
                          {Math.round(progress.ratio * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-[1px] bg-white/25 overflow-hidden">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, Math.round(progress.ratio * 100))}%`,
                            backgroundColor: theme.palette.accentHex,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-medium text-[#F8FAFC] tabular-nums">
                          {progress.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPreviewChant(theme.id)}
                          className="font-mono text-[11px] font-bold uppercase text-[#FFFFFF] hover:text-[#00ffaa] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Volume2 className="w-3 h-3 text-[#00ffaa]" />
                          <span>Preview Chant</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
