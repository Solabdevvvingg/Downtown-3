import React, { useEffect, useState } from 'react';
import { Flame, Volume2 } from 'lucide-react';
import { CrowdReactionOverlayData } from '../game/types';

interface CrowdReactionOverlayProps {
  reaction: CrowdReactionOverlayData | null;
}

export const CrowdReactionOverlay: React.FC<CrowdReactionOverlayProps> = ({ reaction }) => {
  const [pulseTick, setPulseTick] = useState(0);

  useEffect(() => {
    if (!reaction) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setPulseTick((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reaction?.id]);

  if (!reaction) return null;

  const elapsed = reaction.maxLife - reaction.life;
  const enterAlpha = Math.min(1, elapsed / 0.18);
  const exitAlpha = Math.min(1, reaction.life / 0.42);
  const opacity = Math.max(0, Math.min(enterAlpha, exitAlpha));
  const translateY = (1 - enterAlpha) * -12 + (1 - exitAlpha) * -8;
  const edgeFlare = Math.max(0, Math.sin(Math.min(1, elapsed / 1.1) * Math.PI)) * 0.55;

  return (
    <div className="absolute inset-0 z-[15] pointer-events-none overflow-hidden">
      {/* Subtle perimeter stadium flash flare (keeps court center crisp) */}
      <div
        className="absolute inset-0 transition-none"
        style={{
          opacity: edgeFlare,
          boxShadow: `inset 0 0 110px ${reaction.accentColor}66`,
        }}
      />

      {/* Compact top-center stadium crowd reaction chyron */}
      <div
        className="absolute left-1/2 top-[76px] sm:top-[84px] w-[min(92vw,470px)]"
        style={{
          opacity,
          transform: `translate(-50%, ${translateY}px) scale(${0.96 + enterAlpha * 0.04})`,
        }}
      >
        <div
          className="relative rounded-xl bg-[#0D111A]/92 border backdrop-blur-md px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-2xl overflow-hidden"
          style={{
            borderColor: `${reaction.accentColor}99`,
            boxShadow: `0 12px 38px ${reaction.accentColor}38`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            {/* Left: Procedural Decibel Equalizer */}
            <div className="flex flex-col items-start shrink-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#F4EFE6]/90">
                <Volume2 className="w-3 h-3" style={{ color: reaction.accentColor }} />
                <span className="tabular-nums">{reaction.decibels.toFixed(1)} dB</span>
              </div>
              <div className="flex items-end gap-[2px] h-5 mt-1">
                {reaction.bars.map((seed, idx) => {
                  const wave =
                    0.52 +
                    0.48 * Math.abs(Math.sin(pulseTick * (9 + (idx % 4) * 2.1) + idx * 0.65));
                  const hPct = Math.max(22, Math.min(100, Math.round(seed * wave * 100)));
                  return (
                    <span
                      key={idx}
                      className="w-[3px] rounded-t-sm"
                      style={{
                        height: `${hPct}%`,
                        backgroundColor:
                          hPct > 78 ? '#FEF08A' : hPct > 52 ? reaction.accentColor : '#F9631C',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Center/Right: Record Streak Call & Crowd Chant */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider">
                <Flame className="w-3.5 h-3.5 shrink-0" style={{ color: reaction.accentColor }} />
                <span style={{ color: reaction.accentColor }} className="truncate">
                  {reaction.previousRecord > 0
                    ? `Broke ${reaction.previousRecord}-Streak Record`
                    : 'New Record Streak'}
                </span>
              </div>

              <div className="font-display text-xl sm:text-2xl font-extrabold tracking-wide leading-tight text-[#F4EFE6] uppercase truncate mt-0.5">
                {reaction.headline}{' '}
                <span style={{ color: reaction.accentColor }} className="tabular-nums">
                  · {reaction.streak} Straight
                </span>
              </div>

              <div className="text-[11px] sm:text-xs font-medium text-[#CBD5E1] truncate">
                Crowd Reaction: <span className="text-[#F4EFE6] font-semibold">“{reaction.chant}”</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
