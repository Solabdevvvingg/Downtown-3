import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  BACKBOARD_TOP_Z,
  BACKBOARD_Y,
  DEFAULT_MONEY_RACK_INDEX,
  DIFFICULTY_TIERS,
  getRackBallCount,
  HOOP_POS,
  RACKS_COUNT,
} from '../game/constants';
import { getCourtThemeConfig } from '../game/courts';
import { triggerRimHitHaptic, triggerSwishHaptic } from '../game/haptics';
import { renderArena, RenderState } from '../game/renderer';
import { computeCinematicReplayCamera, sampleHighlightFrame } from '../game/replayCamera';
import {
  ActiveBall,
  BallSlotRecord,
  ContestHighlight,
  FloatingCallout,
  Particle,
  Vec3,
} from '../game/types';

interface HighlightReplayModalProps {
  highlight: ContestHighlight;
  onClose: () => void;
}

type SpeedMode = 'CINEMATIC' | 'HALF' | 'REAL';

const PRE_ROLL_SEC = 0.44;
const POST_HOLD_SEC = 0.8;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getHighlightHeadline(highlight: ContestHighlight): {
  title: string;
  accent: string;
} {
  if (highlight.isBuzzerBeater) {
    return { title: 'Buzzer Beater', accent: '#FF8A8A' };
  }
  if (highlight.hadRimHang) {
    return { title: "Shooter's Roll", accent: '#FEF08A' };
  }
  if (highlight.isMoney && highlight.isSwish) {
    return { title: 'Money Ball Swish', accent: '#FDE047' };
  }
  if (highlight.isSwish) {
    return { title: 'Pure Swish', accent: '#6EE7B7' };
  }
  if (highlight.isMoney) {
    return { title: 'Money Ball Make', accent: '#FDE047' };
  }
  return { title: 'Contest Highlight', accent: '#FDBA74' };
}

export const HighlightReplayModal: React.FC<HighlightReplayModalProps> = ({
  highlight,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMode, setSpeedMode] = useState<SpeedMode>('CINEMATIC');
  const [uiProgress, setUiProgress] = useState(0);
  const [isSlowMoActive, setIsSlowMoActive] = useState(false);

  const isPlayingRef = useRef(true);
  const speedModeRef = useRef<SpeedMode>('CINEMATIC');
  isPlayingRef.current = isPlaying;
  speedModeRef.current = speedMode;

  const totalSpan = PRE_ROLL_SEC + highlight.duration + POST_HOLD_SEC;
  const maxPlayTime = highlight.duration + POST_HOLD_SEC;

  const simRef = useRef({
    playTime: -PRE_ROLL_SEC,
    clockTime: 0,
    netWhip: 0,
    netWhipPhase: 0.7,
    rimShake: 0,
    screenShake: 0,
    particles: [] as Particle[],
    callouts: [] as FloatingCallout[],
    firedRelease: false,
    firedRimCount: 0,
    firedScore: false,
    nextCalloutId: 1,
  });

  const baseBallsRecord = useMemo<BallSlotRecord[]>(() => {
    const list: BallSlotRecord[] = [];
    for (let r = 0; r < RACKS_COUNT; r++) {
      const count = getRackBallCount(r);
      for (let b = 0; b < count; b++) {
        const isTarget = r === highlight.rackIndex && b === highlight.ballIndex;
        const alreadyShot =
          r < highlight.rackIndex || (r === highlight.rackIndex && b < highlight.ballIndex);
        list.push({
          rackIndex: r,
          ballIndex: b,
          isMoney: isTarget ? highlight.isMoney : b === count - 1,
          status: isTarget ? 'PENDING' : alreadyShot ? 'MADE' : 'PENDING',
          pointsAwarded: 0,
          multiplierUsed: 1,
        });
      }
    }
    return list;
  }, [highlight]);

  const resetPlayback = useCallback((autoPlay = true) => {
    const s = simRef.current;
    s.playTime = -PRE_ROLL_SEC;
    s.netWhip = 0;
    s.rimShake = 0;
    s.screenShake = 0;
    s.particles = [];
    s.callouts = [];
    s.firedRelease = false;
    s.firedRimCount = 0;
    s.firedScore = false;
    setIsPlaying(autoPlay);
    setUiProgress(0);
    setIsSlowMoActive(false);
  }, []);

  useEffect(() => {
    resetPlayback(true);
  }, [highlight.id, resetPlayback]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onClose();
      } else if (ev.code === 'Space') {
        ev.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headline = getHighlightHeadline(highlight);
  const courtCfg = getCourtThemeConfig(highlight.courtTheme);

  // Self-contained 60fps cinematic playback loop
  useEffect(() => {
    let rafId = 0;
    let lastNow = performance.now();
    let uiSyncAccum = 0;

    const triggerScoreVfx = (withAudio: boolean) => {
      const s = simRef.current;
      s.netWhip = 1.0;
      s.netWhipPhase = Math.random() * Math.PI * 2;
      s.screenShake = highlight.isMoney ? 0.28 : 0.16;

      const burstColor = highlight.isMoney
        ? '#F59E0B'
        : highlight.isSwish
          ? '#34D399'
          : '#F9631C';
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 6.5;
        const life = 0.55 + Math.random() * 0.45;
        s.particles.push({
          x: highlight.hoopPos.x + (Math.random() - 0.5) * 0.4,
          y: highlight.hoopPos.y + (Math.random() - 0.5) * 0.4,
          z: highlight.hoopPos.z - 0.45,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          vz: 1.5 + Math.random() * 5.2,
          life,
          maxLife: life,
          size: 0.9 + Math.random() * 0.7,
          color: i % 3 === 0 ? '#FEF08A' : burstColor,
          gravity: 16,
          shape: i % 2 === 0 ? 'spark' : 'confetti',
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          aspect: 0.6,
        });
      }

      const calloutText = highlight.isBuzzerBeater
        ? `BUZZER BEATER! +${highlight.pointsAwarded}`
        : highlight.hadRimHang
          ? `SHOOTER’S ROLL! +${highlight.pointsAwarded}`
          : highlight.isMoney
            ? `MONEY BALL! +${highlight.pointsAwarded}`
            : highlight.isSwish
              ? `SWISH! +${highlight.pointsAwarded}`
              : `GOOD! +${highlight.pointsAwarded}`;
      s.callouts.push({
        id: s.nextCalloutId++,
        text: calloutText,
        subText: `${highlight.multiplier}× MULTIPLIER · STREAK ${highlight.streakAtMake}`,
        color: headline.accent,
        worldPos: {
          x: highlight.hoopPos.x,
          y: highlight.hoopPos.y + (BACKBOARD_Y - HOOP_POS.y) - 0.45,
          z: highlight.hoopPos.z + (BACKBOARD_TOP_Z - HOOP_POS.z) + 0.9,
        },
        life: 1.4,
        maxLife: 1.4,
        behindBackboard: true,
      });

      if (withAudio) {
        soundEngine.playSwish(
          highlight.isMoney,
          highlight.streakAtMake,
          highlight.isSwish,
          highlight.rackIndex
        );
        if (highlight.isSwish || highlight.isMoney || highlight.isBuzzerBeater) {
          triggerSwishHaptic(
            highlight.timingQuality === 'PERFECT',
            highlight.isMoney,
            highlight.isBuzzerBeater
          );
        }
      }
    };

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      const s = simRef.current;
      s.clockTime += rawDt;

      const inSlowMoWindow =
        s.playTime >= highlight.scoreAtTime - 0.22 &&
        s.playTime <= highlight.scoreAtTime + 0.48;
      const timeScale =
        speedModeRef.current === 'REAL'
          ? 1
          : speedModeRef.current === 'HALF'
            ? 0.5
            : inSlowMoWindow
              ? 0.36
              : 1;

      if (isPlayingRef.current) {
        s.playTime += rawDt * timeScale;
        if (s.playTime >= maxPlayTime) {
          // Seamless loop replay
          s.playTime = -PRE_ROLL_SEC;
          s.firedRelease = false;
          s.firedRimCount = 0;
          s.firedScore = false;
          s.particles = [];
          s.callouts = [];
          s.netWhip = 0;
          s.rimShake = 0;
          s.screenShake = 0;
        }
      }

      // Trigger synced audio & rim/swish effects as playhead crosses milestones
      if (isPlayingRef.current) {
        if (!s.firedRelease && s.playTime >= 0) {
          s.firedRelease = true;
          soundEngine.playRelease();
        }
        while (
          s.firedRimCount < highlight.rimHitsAt.length &&
          s.playTime >= highlight.rimHitsAt[s.firedRimCount]
        ) {
          s.firedRimCount += 1;
          s.rimShake = 0.72;
          s.screenShake = Math.max(s.screenShake, 0.14);
          soundEngine.playRimClank(0.95);
          triggerRimHitHaptic(12);
        }
        if (!s.firedScore && s.playTime >= highlight.scoreAtTime) {
          s.firedScore = true;
          triggerScoreVfx(true);
        }
      }

      // Decay VFX & step burst particles
      const fxDt = rawDt * (inSlowMoWindow && speedModeRef.current !== 'REAL' ? 0.55 : 1);
      s.netWhip = Math.max(0, s.netWhip - fxDt * 1.9);
      s.rimShake = Math.max(0, s.rimShake - fxDt * 2.8);
      s.screenShake = Math.max(0, s.screenShake - fxDt * 1.7);

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.life -= fxDt;
        if (pt.life <= 0) {
          s.particles.splice(i, 1);
          continue;
        }
        pt.vz -= (pt.gravity ?? 15) * fxDt;
        pt.x += pt.vx * fxDt;
        pt.y += pt.vy * fxDt;
        pt.z += pt.vz * fxDt;
        if (pt.rot !== undefined && pt.rotSpeed !== undefined) {
          pt.rot += pt.rotSpeed * fxDt;
        }
      }
      for (let i = s.callouts.length - 1; i >= 0; i--) {
        const c = s.callouts[i];
        c.life -= fxDt;
        if (c.life <= 0) {
          s.callouts.splice(i, 1);
        }
      }

      // Sample ball & shooter pose for current playTime
      const isBeforeRelease = s.playTime < 0;
      const sampleT = Math.max(0, s.playTime);
      const currentSample = sampleHighlightFrame(highlight.frames, sampleT);
      const camera = computeCinematicReplayCamera(highlight, s.playTime, currentSample, PRE_ROLL_SEC);

      // Build trail from recorded frames leading up to sampleT
      const trail: Vec3[] = [];
      if (!isBeforeRelease) {
        const trailStart = Math.max(0, sampleT - 0.36);
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
          const ft = lerp(trailStart, sampleT, i / steps);
          const f = sampleHighlightFrame(highlight.frames, ft);
          trail.push({ x: f.x, y: f.y, z: f.z });
        }
      }

      // Shooter jump / gather / follow-through choreography
      let gatherAmount = 0;
      let followThroughAmount = 0;
      let shooterZ = 0;
      let meterValue = 0.74;
      let landingSquat = 0;
      if (isBeforeRelease) {
        const p = clamp((s.playTime + PRE_ROLL_SEC) / PRE_ROLL_SEC, 0, 1);
        gatherAmount = Math.min(1, p / 0.85);
        meterValue = p * 0.74;
        shooterZ = 0;
      } else {
        const airProgress = clamp(sampleT / 0.52, 0, 1);
        shooterZ = sampleT < 0.52 ? Math.sin(airProgress * Math.PI * 0.78 + 0.22 * Math.PI) * 1.12 : 0;
        followThroughAmount = Math.max(0, 1 - sampleT / 0.82);
        if (sampleT >= 0.52 && sampleT < 0.78) {
          landingSquat = 0.78 * (1 - (sampleT - 0.52) / 0.26);
        }
      }

      const activeBalls: ActiveBall[] = isBeforeRelease
        ? []
        : [
            {
              id: highlight.id,
              rackIndex: highlight.rackIndex,
              ballIndex: highlight.ballIndex,
              isMoney: highlight.isMoney,
              multiplierAtRelease: highlight.multiplier,
              streakAtRelease: highlight.streakAtMake,
              isBuzzerBeater: highlight.isBuzzerBeater,
              pos: { x: currentSample.x, y: currentSample.y, z: currentSample.z },
              vel: { x: 0, y: 0, z: 0 },
              spinAngle: currentSample.spinAngle,
              spinRate: -11.5,
              intendedOutcome: highlight.isSwish ? 'SWISH' : 'MAKE',
              hasScored: sampleT >= highlight.scoreAtTime,
              hasResolved: sampleT >= highlight.scoreAtTime,
              hitRimCount: highlight.rimHitsAt.length,
              hitBackboard: false,
              hadRimHang: highlight.hadRimHang,
              trail,
              age: sampleT,
            },
          ];

      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.max(1, Math.round(rect.width * dpr));
        const targetH = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const renderState: RenderState = {
            mode: highlight.mode,
            phase: isBeforeRelease ? 'COUNTDOWN' : 'PLAYING',
            hideShotMeter: true,
            camera,
            hoopPos: highlight.hoopPos,
            shooterPos: highlight.shooterPos,
            shooterZ,
            shooterFacing: highlight.shooterFacing,
            runPhase: 0,
            isMovingToRack: false,
            gatherAmount,
            followThroughAmount,
            landingSquat,
            isHoldingShot: isBeforeRelease,
            meterValue,
            meterFeedbackTimer: 0,
            lastReleaseMeter: 0.74,
            lastReleaseLabel: null,
            lastReleaseColor: '#F59E0B',
            difficulty: DIFFICULTY_TIERS[Math.min(3, Math.floor(highlight.streakAtMake / 3))],
            streak: highlight.streakAtMake,
            multiplier: highlight.multiplier,
            currentRack: highlight.rackIndex,
            currentBall: highlight.ballIndex,
            moneyRack: highlight.isMoney ? highlight.rackIndex : DEFAULT_MONEY_RACK_INDEX,
            ballsRecord: baseBallsRecord,
            activeBalls,
            opponentGhost: null,
            particles: s.particles,
            callouts: s.callouts,
            flashbulbs: [],
            netWhip: s.netWhip,
            netWhipPhase: s.netWhipPhase,
            rimShake: s.rimShake,
            screenShake: s.screenShake,
            clockTime: s.clockTime,
            timeLeft: highlight.isBuzzerBeater ? 0.3 : 32,
            hasShotAnyBall: true,
            shooterName: highlight.shooterName,
            shooterLabelAlpha: isBeforeRelease ? 0 : 0.75,
            crowdHypeTimer: s.firedScore ? 0.8 : 0,
            crowdHypeDuration: 1.6,
            stamina: 100,
            courtTheme: highlight.courtTheme,
            sessionBestScore: highlight.pointsAwarded,
            sessionBestStreak: highlight.streakAtMake,
          };
          renderArena(ctx, rect.width, rect.height, renderState);
          ctx.restore();
        }
      }

      uiSyncAccum += rawDt;
      if (uiSyncAccum >= 0.04) {
        uiSyncAccum = 0;
        const pct = clamp((s.playTime + PRE_ROLL_SEC) / totalSpan, 0, 1);
        setUiProgress(pct);
        setIsSlowMoActive(
          isPlayingRef.current &&
            speedModeRef.current !== 'REAL' &&
            (speedModeRef.current === 'HALF' || inSlowMoWindow)
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [baseBallsRecord, headline.accent, highlight, maxPlayTime, totalSpan]);

  const handleScrub = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const pct = clamp(Number(ev.target.value), 0, 1);
    const targetPlayTime = -PRE_ROLL_SEC + pct * totalSpan;
    const s = simRef.current;
    s.playTime = targetPlayTime;
    s.firedRelease = targetPlayTime >= 0;
    s.firedRimCount = highlight.rimHitsAt.filter((rt) => targetPlayTime >= rt).length;
    s.firedScore = targetPlayTime >= highlight.scoreAtTime;
    s.netWhip =
      targetPlayTime >= highlight.scoreAtTime && targetPlayTime <= highlight.scoreAtTime + 0.5
        ? Math.max(0, 1 - (targetPlayTime - highlight.scoreAtTime) * 2)
        : 0;
    s.particles = [];
    s.callouts = [];
    setUiProgress(pct);
    setIsPlaying(false);
  };

  const swishMarkerPct = clamp(
    ((PRE_ROLL_SEC + highlight.scoreAtTime) / totalSpan) * 100,
    5,
    95
  );

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b0c10]/85 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-6 overflow-y-auto"
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
        aria-labelledby="highlight-replay-title"
        className="w-full max-w-3xl max-h-[94dvh] overflow-y-auto bg-[#0F1117] border border-white/25 rounded-[4px] p-4 sm:p-6 my-auto shadow-2xl"
      >
        {/* Top Broadcast Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/20 pb-3.5 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.12em] font-semibold text-[#E2E8F0]">
              <span>Game Highlights</span>
              <span aria-hidden="true">·</span>
              <span>{highlight.rackLabel}</span>
              <span aria-hidden="true">·</span>
              <span>
                {highlight.mode === 'HEAT_CHECK'
                  ? 'Heat Check'
                  : highlight.mode === 'FAST_BREAK'
                    ? 'Fast-Break'
                    : highlight.mode === 'PVP'
                      ? 'Online PVP'
                      : 'Solo Contest'}
              </span>
            </div>
            <h2
              id="highlight-replay-title"
              className="font-display text-xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-1 flex flex-wrap items-baseline gap-x-2"
            >
              <span style={{ color: headline.accent }}>{headline.title}</span>
              <span className="font-mono text-lg sm:text-2xl text-[#00ffaa] tabular-nums whitespace-nowrap">
                +{highlight.pointsAwarded} PTS
              </span>
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Highlight Replay"
            className="flex items-center justify-center w-10 h-10 rounded-[2px] bg-[#07090E] border border-white/25 text-[#FFFFFF] hover:border-[#00ffaa] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3D Broadcast Replay Viewport */}
        <div className="relative w-full aspect-[16/10] sm:aspect-video rounded-[2px] overflow-hidden bg-[#07090E] border border-white/25 mb-3.5">
          <canvas ref={canvasRef} className="block w-full h-full" />

          {/* Subtle Top-Left Replay Mode Readout */}
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 text-[10px] font-mono font-bold tracking-wider text-[#FFFFFF] bg-[#05070B]/96 px-2.5 py-1 rounded-[2px] border border-white/25 shadow-lg">
            <span>{isSlowMoActive ? 'SLO-MO CAM' : 'REPLAY CAM'}</span>
            <span aria-hidden="true" className="text-[#CBD5E1]">
              /
            </span>
            <span className="text-[#00ffaa]">{courtCfg.name.toUpperCase()}</span>
          </div>

          {/* Lower-Third Shot Info Strip */}
          <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-[11px] text-[#FFFFFF] bg-[#05070B]/96 px-3 py-1.5 rounded-[2px] border border-white/25 shadow-lg">
            <span className="font-bold truncate">
              {highlight.shooterName} · Ball {highlight.ballIndex + 1}/{getRackBallCount(highlight.rackIndex)}
            </span>
            <span className="font-mono font-semibold text-[#E2E8F0] tabular-nums shrink-0">
              {highlight.timingQuality} · {highlight.multiplier}× · Wind{' '}
              {highlight.windMph.toFixed(1)} mph
            </span>
          </div>
        </div>

        {/* Scrubber & Playback Controls */}
        <div className="bg-[#07090E] border border-white/20 rounded-[2px] p-3 mb-4 space-y-2.5">
          <div className="relative flex items-center">
            <div
              aria-hidden="true"
              title="Shot Make Moment"
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#00ffaa]"
              style={{ left: `calc(${swishMarkerPct}% - 4px)` }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={uiProgress}
              onChange={handleScrub}
              aria-label="Scrub highlight replay timeline"
              className="w-full accent-[#00ffaa] cursor-pointer h-2 bg-white/25 rounded-[2px]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="min-h-[40px] px-3.5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={() => resetPlayback(true)}
                className="min-h-[40px] px-3 py-2 rounded-[2px] bg-white/14 hover:bg-white/24 border border-white/20 text-[#FFFFFF] font-mono text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#12151E] border border-white/20 rounded-[2px]">
              {(
                [
                  { id: 'CINEMATIC', label: 'Auto Slo-Mo' },
                  { id: 'HALF', label: '0.5×' },
                  { id: 'REAL', label: '1×' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSpeedMode(opt.id)}
                  className={`px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                    speedMode === opt.id
                      ? 'bg-[#FFFFFF] text-[#05070B]'
                      : 'bg-[#1A1D26] text-[#FFFFFF] hover:bg-white/15'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Highlight Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center bg-[#07090E] border border-white/20 rounded-[2px] p-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#E2E8F0]">
              Points
            </div>
            <div className="font-mono text-base font-bold text-[#00ffaa] tabular-nums mt-0.5">
              +{highlight.pointsAwarded}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#E2E8F0]">
              Streak / Mult
            </div>
            <div className="font-mono text-base font-bold text-[#FEF08A] tabular-nums mt-0.5">
              {highlight.streakAtMake} · {highlight.multiplier}×
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#E2E8F0]">
              Release
            </div>
            <div className="font-mono text-base font-bold text-[#00ffaa] tabular-nums mt-0.5">
              {highlight.timingQuality}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#E2E8F0]">
              Shot Type
            </div>
            <div className="font-mono text-sm sm:text-base font-bold text-[#FFFFFF] truncate mt-0.5">
              {highlight.hadRimHang
                ? 'Rim Hang'
                : highlight.isSwish
                  ? 'Swish'
                  : 'Bank / Iron'}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
