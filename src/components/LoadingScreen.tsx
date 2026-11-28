import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';

export interface LoadingChecklist {
  fontsReady: boolean;
  arenaReady: boolean;
  accountReady: boolean;
  lobbyReady: boolean;
}

interface LoadingScreenProps {
  reason: 'FIRST_VISIT' | 'LONG_AWAY';
  checklist: LoadingChecklist;
  onComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  reason,
  checklist,
  onComplete,
}) => {
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), 1050);
    return () => window.clearTimeout(timer);
  }, []);

  const steps = [
    { key: 'fonts', label: 'Arena typography & HUD', done: checklist.fontsReady },
    { key: 'arena', label: '3D court geometry & camera rig', done: checklist.arenaReady },
    { key: 'account', label: 'Player profile & career stats', done: checklist.accountReady },
    { key: 'lobby', label: 'Online matchmaking server', done: checklist.lobbyReady },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allReady = completedCount === steps.length;
  const targetPct = allReady && minElapsed ? 100 : Math.min(94, 18 + completedCount * 19);

  const [displayPct, setDisplayPct] = useState(12);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setDisplayPct((prev) => {
        if (Math.abs(targetPct - prev) < 0.6) return targetPct;
        return prev + (targetPct - prev) * 0.16;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetPct]);

  useEffect(() => {
    if (!allReady || !minElapsed || exiting) return;
    const finishTimer = window.setTimeout(() => {
      setExiting(true);
    }, 240);
    return () => window.clearTimeout(finishTimer);
  }, [allReady, minElapsed, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, 320);
    return () => window.clearTimeout(doneTimer);
  }, [exiting, onComplete]);

  const activeStep =
    steps.find((s) => !s.done)?.label ?? (minElapsed ? 'Stepping onto the hardwood' : 'Warming up racks');

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070B] px-6 py-8 select-none overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading Downtown 3"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(16, 20, 30, 0.92) 0%, rgba(5, 7, 11, 1) 72%)',
        }}
      />

      <div className="relative w-full max-w-md flex flex-col items-center text-center">
        {/* Animated Court & Basketball Emblem */}
        <div className="mb-6">
          <svg
            viewBox="0 0 120 84"
            className="w-24 h-16 overflow-visible mx-auto mb-3"
            aria-hidden="true"
          >
            <path
              d="M 14 70 A 46 46 0 0 1 106 70"
              fill="none"
              stroke="rgba(0, 255, 170, 0.35)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <motion.path
              d="M 14 70 A 46 46 0 0 1 106 70"
              fill="none"
              stroke="#00ffaa"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0.15 }}
              animate={{ pathLength: displayPct / 100 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
            <motion.g
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
            >
              <circle
                cx="60"
                cy="34"
                r="14"
                fill="#00ffaa"
                stroke="#07090E"
                strokeWidth="2"
              />
              <path
                d="M 47 34 Q 60 26 73 34"
                fill="none"
                stroke="#07090E"
                strokeWidth="1.6"
              />
              <path
                d="M 60 20 Q 54 34 60 48"
                fill="none"
                stroke="#07090E"
                strokeWidth="1.6"
              />
            </motion.g>
          </svg>

          <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-[-0.04em] leading-none text-[#00ffaa]">
            Downtown 3
          </h1>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] mt-2">
            {reason === 'LONG_AWAY'
              ? 'Welcome Back · Refreshing Session'
              : 'Three-Point Shootout'}
          </p>
        </div>

        {/* Real Progress Bar */}
        <div className="w-full max-w-xs mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[#FFFFFF] font-semibold truncate pr-3">{activeStep}</span>
            <span className="font-mono font-bold text-[#00ffaa] tabular-nums shrink-0">
              {Math.round(displayPct)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/25 rounded-[1px] overflow-hidden">
            <div
              className="h-full bg-[#00ffaa] transition-[width] duration-150 ease-out"
              style={{ width: `${Math.max(8, Math.min(100, displayPct))}%` }}
            />
          </div>
        </div>

        {/* Real Readiness Milestones */}
        <div className="w-full max-w-xs border-t border-white/25 pt-4 space-y-2 text-left">
          {steps.map((step) => (
            <div
              key={step.key}
              className="flex items-center justify-between text-xs"
            >
              <span className={step.done ? 'text-[#FFFFFF] font-semibold' : 'text-[#F1F5F9]'}>
                {step.label}
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase font-bold tabular-nums">
                {step.done ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#00ffaa]" />
                    <span className="text-[#00ffaa]">Ready</span>
                  </>
                ) : (
                  <span className="text-[#F1F5F9]">Loading</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
