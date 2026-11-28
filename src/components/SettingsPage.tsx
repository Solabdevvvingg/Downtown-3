import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Film,
  Flame,
  Gauge,
  Keyboard,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCircle2,
  Vibrate,
  Video,
  Volume1,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { BALL_SKINS, BallSkinConfig, getBallSkinConfig, getUnlockedBallSkinsCount } from '../game/ballSkins';
import { getCourtThemeConfig } from '../game/courts';
import { formatFastBreakMs } from '../game/timeFormat';
import {
  BallSkinId,
  CameraMode,
  CareerStats,
  CourtThemeId,
  HapticIntensity,
  UserProfile,
} from '../game/types';

interface SettingsPageProps {
  muted: boolean;
  audioVolume: number;
  shotSensitivity: number;
  hapticIntensity: HapticIntensity;
  cameraMode: CameraMode;
  shotTrajectoryEnabled: boolean;
  instantReplayEnabled: boolean;
  courtTheme: CourtThemeId;
  ballSkin: BallSkinId;
  career: CareerStats;
  playerName: string;
  userProfile: UserProfile | null;
  rivalriesCount: number;
  onBack: () => void;
  onToggleMute: () => void;
  onChangeAudioVolume: (volume: number) => void;
  onChangeShotSensitivity: (sensitivity: number) => void;
  onChangeHapticIntensity: (intensity: HapticIntensity) => void;
  onSetCameraMode: (mode: CameraMode) => void;
  onToggleShotTrajectory: () => void;
  onToggleInstantReplay: () => void;
  onSelectBallSkin: (skin: BallSkinId) => void;
  onOpenEditUsername: () => void;
  onOpenCourtLocker: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onResetDefaults: () => void;
  onClearLocalProgress: () => void;
}

const HAPTIC_OPTIONS: { value: HapticIntensity; label: string; detail: string }[] = [
  { value: 'LOW', label: 'Low', detail: 'Subtle tap' },
  { value: 'MEDIUM', label: 'Medium', detail: 'Balanced' },
  { value: 'HIGH', label: 'High', detail: 'Strong' },
];

const CAMERA_OPTIONS: { value: CameraMode; label: string; detail: string }[] = [
  { value: 'FOLLOW', label: 'Follow-Cam', detail: 'Dynamic shooter follow' },
  { value: 'PRO_STATIC', label: 'Pro-Static', detail: 'Full rack locked in view' },
];

const CONTROL_BINDINGS: { keys: string; action: string }[] = [
  { keys: 'Hold Space / Touch', action: 'Gather ball & fill shot meter' },
  { keys: 'Release in Green / Gold', action: 'Shoot (Gold = automatic swish)' },
  { keys: 'Esc or P', action: 'Pause local contest / close screen' },
  { keys: 'M', action: 'Quick mute or unmute game audio' },
];

const BallSkinPreview: React.FC<{ skin: BallSkinConfig; locked: boolean }> = ({
  skin,
  locked,
}) => {
  const gradId = `ball-grad-${skin.id}`;
  const trailId = `ball-trail-${skin.id}`;
  const glowId = `ball-glow-${skin.id}`;
  const [s0, s1, s2, s3] = skin.palette.shellStops;

  return (
    <div className="relative w-full h-20 rounded-[2px] overflow-hidden bg-[#05070B] border border-white/25">
      <svg
        viewBox="0 0 160 80"
        className={`w-full h-full ${locked ? 'opacity-65 grayscale-[30%]' : ''}`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={gradId} cx="36%" cy="32%" r="72%">
            <stop offset="0%" stopColor={s0} />
            <stop offset="38%" stopColor={s1} />
            <stop offset="78%" stopColor={s2} />
            <stop offset="100%" stopColor={s3} />
          </radialGradient>
          <linearGradient id={trailId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={skin.palette.glowHex} stopOpacity="0" />
            <stop offset="55%" stopColor={skin.palette.glowHex} stopOpacity="0.45" />
            <stop offset="100%" stopColor={skin.palette.accentHex} stopOpacity="0.92" />
          </linearGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={skin.palette.glowHex} stopOpacity="0.34" />
            <stop offset="100%" stopColor={skin.palette.glowHex} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="160" height="80" fill="#05070B" />
        <line x1="0" y1="68" x2="160" y2="68" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Ambient ball aura */}
        <circle cx="114" cy="40" r="32" fill={`url(#${glowId})`} />

        {/* Skin-specific flight trail preview */}
        {skin.trailStyle === 'flame' && (
          <g>
            <path
              d="M 14 54 Q 56 46 112 24 L 112 56 Q 58 56 14 54 Z"
              fill={`url(#${trailId})`}
            />
            <path
              d="M 28 50 Q 68 44 108 32 L 108 46 Q 68 50 28 50 Z"
              fill="rgba(254, 240, 138, 0.52)"
            />
            <circle cx="42" cy="36" r="2.2" fill="#FEF08A" opacity="0.85" />
            <circle cx="64" cy="27" r="1.8" fill="#FB923C" opacity="0.85" />
            <circle cx="80" cy="57" r="2" fill="#F97316" opacity="0.75" />
          </g>
        )}

        {skin.trailStyle === 'electric' && (
          <g>
            <path
              d="M 14 50 Q 60 44 110 40"
              fill="none"
              stroke={`url(#${trailId})`}
              strokeWidth="12"
              strokeLinecap="round"
            />
            <polyline
              points="16,50 38,42 50,51 70,36 84,45 104,35"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="48" y1="26" x2="58" y2="22" stroke="#67E8F9" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="74" y1="58" x2="86" y2="54" stroke="#67E8F9" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        )}

        {skin.trailStyle === 'gold' && (
          <g>
            <path
              d="M 14 52 Q 62 46 110 38"
              fill="none"
              stroke={`url(#${trailId})`}
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M 28 49 Q 72 44 108 39"
              fill="none"
              stroke="#FEF9C3"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <rect x="44" y="29" width="5" height="3" transform="rotate(24 44 29)" fill="#34D399" />
            <rect x="68" y="54" width="5" height="3" transform="rotate(-18 68 54)" fill="#FACC15" />
            <rect x="82" y="24" width="4" height="2.5" transform="rotate(35 82 24)" fill="#FEF08A" />
          </g>
        )}

        {skin.trailStyle === 'classic' && (
          <g opacity="0.65">
            <path
              d="M 24 48 Q 62 44 96 40"
              fill="none"
              stroke="rgba(251, 146, 60, 0.36)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M 38 56 Q 68 52 94 49"
              fill="none"
              stroke="rgba(253, 186, 116, 0.25)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Basketball Sphere */}
        <circle cx="114" cy="40" r="22" fill={`url(#${gradId})`} />
        <clipPath id={`clip-${skin.id}`}>
          <circle cx="114" cy="40" r="22" />
        </clipPath>
        <g clipPath={`url(#clip-${skin.id})`}>
          <path
            d="M 90 42 Q 114 48 138 38"
            fill="none"
            stroke={skin.palette.seamColor}
            strokeWidth="2"
          />
          <path
            d="M 118 16 Q 108 40 110 64"
            fill="none"
            stroke={skin.palette.seamColor}
            strokeWidth="2"
          />
          <path
            d="M 100 20 Q 112 36 96 58"
            fill="none"
            stroke={skin.palette.seamColor}
            strokeWidth="1.6"
          />
          <path
            d="M 130 20 Q 118 40 132 58"
            fill="none"
            stroke={skin.palette.seamColor}
            strokeWidth="1.6"
          />
          {skin.id === 'electric' && (
            <polyline
              points="98,35 109,30 116,41 129,34"
              fill="none"
              stroke="#E0F2FE"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          )}
        </g>
        <circle cx="114" cy="40" r="22" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      </svg>

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070B]/85">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#05070B] border border-[#FDE047]/65 font-mono text-[11px] font-bold text-[#FEF08A]">
            <Lock className="w-3.5 h-3.5" />
            <span>Locked</span>
          </span>
        </div>
      )}
    </div>
  );
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  muted,
  audioVolume,
  shotSensitivity,
  hapticIntensity,
  cameraMode,
  shotTrajectoryEnabled,
  instantReplayEnabled,
  courtTheme,
  ballSkin,
  career,
  playerName,
  userProfile,
  rivalriesCount,
  onBack,
  onToggleMute,
  onChangeAudioVolume,
  onChangeShotSensitivity,
  onChangeHapticIntensity,
  onSetCameraMode,
  onToggleShotTrajectory,
  onToggleInstantReplay,
  onSelectBallSkin,
  onOpenEditUsername,
  onOpenCourtLocker,
  onOpenAuth,
  onSignOut,
  onResetDefaults,
  onClearLocalProgress,
}) => {
  const [confirmClearData, setConfirmClearData] = useState(false);
  const [defaultsJustReset, setDefaultsJustReset] = useState(false);
  const [dataJustCleared, setDataJustCleared] = useState(false);

  const effectiveVolume = muted ? 0 : audioVolume;
  const sensitivityPct = Math.round(shotSensitivity * 100);
  const sensitivityDescriptor =
    sensitivityPct < 95 ? 'Slower fill' : sensitivityPct > 105 ? 'Faster fill' : 'Standard';
  const isDefaultSensitivity = Math.abs(shotSensitivity - 1.0) < 0.01;
  const activeCourt = getCourtThemeConfig(courtTheme);
  const activeBallSkin = getBallSkinConfig(ballSkin);
  const unlockedBallSkinsCount = getUnlockedBallSkinsCount(career);

  const handleResetDefaultsClick = () => {
    onResetDefaults();
    setDefaultsJustReset(true);
    window.setTimeout(() => setDefaultsJustReset(false), 2200);
  };

  const handleConfirmClearProgress = () => {
    onClearLocalProgress();
    setConfirmClearData(false);
    setDataJustCleared(true);
    window.setTimeout(() => setDataJustCleared(false), 2400);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      role="region"
      aria-label="Game Settings"
      className="fixed inset-0 z-20 flex flex-col bg-[#05070B] text-[#FFFFFF]"
    >
      {/* Sticky Settings Page Header */}
      <header className="shrink-0 border-b border-white/25 bg-[#05070B]/98 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] inline-flex items-center gap-2 px-3 -ml-2 rounded-[2px] font-mono text-xs font-bold uppercase tracking-wider text-[#00ffaa] hover:text-[#FFFFFF] hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#00ffaa]"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to Lobby</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-[#00ffaa] shrink-0" aria-hidden="true" />
            <h1 className="font-display text-lg sm:text-2xl font-extrabold uppercase tracking-tight text-[#FFFFFF] truncate">
              Settings
            </h1>
          </div>

          <button
            type="button"
            onClick={handleResetDefaultsClick}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border font-mono text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
              defaultsJustReset
                ? 'bg-[#00ffaa] border-[#00ffaa] text-[#05070B]'
                : 'bg-[#141824] border-white/35 text-[#FFFFFF] hover:border-[#00ffaa] hover:text-[#00ffaa]'
            }`}
          >
            {defaultsJustReset ? (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Restored</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Reset Defaults</span>
                <span className="sm:hidden">Reset</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Scrollable Settings Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Section 1: Audio & Haptics */}
          <section className="bg-[#0A0D14] border border-white/30 rounded-[4px] p-5 flex flex-col">
            <div className="mb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block">
                Sound &amp; Touch
              </span>
              <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5">
                Audio &amp; Haptics
              </h2>
            </div>

            <div className="divide-y divide-white/25 flex-1">
              {/* Master Volume */}
              <div className="pb-4">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={onToggleMute}
                      aria-pressed={effectiveVolume <= 0}
                      aria-label={effectiveVolume <= 0 ? 'Unmute audio' : 'Mute audio'}
                      className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] text-[#FFFFFF] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#00ffaa]"
                    >
                      {effectiveVolume <= 0 ? (
                        <VolumeX className="w-4 h-4 text-[#FEE2E2]" />
                      ) : effectiveVolume < 50 ? (
                        <Volume1 className="w-4 h-4 text-[#00ffaa]" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-[#00ffaa]" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <label
                        htmlFor="settings-volume-slider"
                        className="block text-sm font-bold text-[#FFFFFF] leading-tight cursor-pointer"
                      >
                        Master Sound Volume
                      </label>
                      <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5">
                        SFX, arena crowd &amp; court chants
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] border tabular-nums shrink-0 ${
                      effectiveVolume <= 0
                        ? 'bg-[#240A0E] border-[#FCA5A5]/70 text-[#FEE2E2]'
                        : 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
                    }`}
                  >
                    {effectiveVolume <= 0 ? 'MUTED (0%)' : `${effectiveVolume}%`}
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="font-mono text-[11px] font-semibold text-[#F8FAFC] tabular-nums w-7">
                    0%
                  </span>
                  <input
                    id="settings-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={effectiveVolume}
                    onChange={(ev) => onChangeAudioVolume(Number(ev.target.value))}
                    aria-label="Master sound volume"
                    aria-valuetext={`${effectiveVolume} percent`}
                    className="flex-1 h-2 rounded-full bg-white/25 accent-[#00ffaa] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ffaa]"
                  />
                  <span className="font-mono text-[11px] font-semibold text-[#F8FAFC] tabular-nums w-10 text-right">
                    100%
                  </span>
                </div>
              </div>

              {/* Haptic Feedback */}
              <div className="pt-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] shrink-0">
                      <Vibrate className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-[#FFFFFF] leading-tight">
                        Haptic Feedback Intensity
                      </span>
                      <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5">
                        Shot release, rim hits &amp; swish vibration
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="Haptic feedback intensity"
                  className="grid grid-cols-3 gap-2"
                >
                  {HAPTIC_OPTIONS.map((opt) => {
                    const active = hapticIntensity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChangeHapticIntensity(opt.value)}
                        aria-pressed={active}
                        className={`min-h-[48px] px-2.5 py-2 rounded-[2px] border text-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                          active
                            ? 'bg-[#00ffaa] border-[#00ffaa] text-[#05070B]'
                            : 'bg-[#05070B] border-white/30 text-[#FFFFFF] hover:border-white/60'
                        }`}
                      >
                        <span className="block font-mono text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                          {opt.label}
                        </span>
                        <span
                          className={`block font-mono text-[10px] mt-0.5 whitespace-nowrap ${
                            active ? 'text-[#05070B] font-bold' : 'text-[#F8FAFC]'
                          }`}
                        >
                          {opt.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Shooting & Camera */}
          <section className="bg-[#0A0D14] border border-white/30 rounded-[4px] p-5 flex flex-col">
            <div className="mb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block">
                Gameplay &amp; Visuals
              </span>
              <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5">
                Shooting &amp; Camera
              </h2>
            </div>

            <div className="divide-y divide-white/25 flex-1">
              {/* Shot Sensitivity */}
              <div className="pb-4">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] shrink-0">
                      <Gauge className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <label
                        htmlFor="settings-sensitivity-slider"
                        className="block text-sm font-bold text-[#FFFFFF] leading-tight cursor-pointer"
                      >
                        Shot Sensitivity
                      </label>
                      <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5">
                        {sensitivityDescriptor} · shot meter fill speed
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
                        className="flex items-center justify-center w-8 h-8 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] text-[#F8FAFC] hover:text-[#FFFFFF] transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/65 text-[#A7F3D0] tabular-nums">
                      {sensitivityPct}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="font-mono text-[11px] font-semibold text-[#F8FAFC] tabular-nums shrink-0">
                    60%
                  </span>
                  <input
                    id="settings-sensitivity-slider"
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
                  <span className="font-mono text-[11px] font-semibold text-[#F8FAFC] tabular-nums shrink-0">
                    150%
                  </span>
                </div>
              </div>

              {/* Camera Angle */}
              <div className="py-4">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] shrink-0">
                    <Video className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-[#FFFFFF] leading-tight">
                      Camera Angle
                    </span>
                    <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5">
                      Choose dynamic follow or locked rack view
                    </span>
                  </div>
                </div>

                <div role="group" aria-label="Camera angle" className="grid grid-cols-2 gap-2">
                  {CAMERA_OPTIONS.map((opt) => {
                    const active = cameraMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onSetCameraMode(opt.value)}
                        aria-pressed={active}
                        className={`min-h-[48px] px-3 py-2 rounded-[2px] border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                          active
                            ? 'bg-[#00ffaa] border-[#00ffaa] text-[#05070B]'
                            : 'bg-[#05070B] border-white/30 text-[#FFFFFF] hover:border-white/60'
                        }`}
                      >
                        <span className="block font-mono text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                          {opt.label}
                        </span>
                        <span
                          className={`block font-mono text-[10px] mt-0.5 truncate ${
                            active ? 'text-[#05070B] font-bold' : 'text-[#F8FAFC]'
                          }`}
                        >
                          {opt.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shot Trajectory & Instant Replay toggles */}
              <div className="pt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={onToggleShotTrajectory}
                  aria-pressed={shotTrajectoryEnabled}
                  className={`w-full min-h-[48px] flex items-center justify-between px-3.5 py-2.5 rounded-[2px] border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                    shotTrajectoryEnabled
                      ? 'bg-[#05070B] border-[#00ffaa]'
                      : 'bg-[#05070B] border-white/30 hover:border-white/55'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <TrendingUp
                      className={`w-4 h-4 shrink-0 ${
                        shotTrajectoryEnabled ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs sm:text-sm font-bold text-[#FFFFFF] leading-tight">
                        Shot Trajectory Arc
                      </span>
                      <span className="block font-mono text-[10px] text-[#F8FAFC] mt-0.5 truncate">
                        Dotted flight arc &amp; rim-crossing marker
                      </span>
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-[2px] border shrink-0 ml-2 whitespace-nowrap ${
                      shotTrajectoryEnabled
                        ? 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
                        : 'bg-[#141824] border-white/30 text-[#FFFFFF]'
                    }`}
                  >
                    {shotTrajectoryEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleInstantReplay}
                  aria-pressed={instantReplayEnabled}
                  className={`w-full min-h-[48px] flex items-center justify-between px-3.5 py-2.5 rounded-[2px] border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                    instantReplayEnabled
                      ? 'bg-[#05070B] border-[#00ffaa]'
                      : 'bg-[#05070B] border-white/30 hover:border-white/55'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Film
                      className={`w-4 h-4 shrink-0 ${
                        instantReplayEnabled ? 'text-[#00ffaa]' : 'text-[#F8FAFC]'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs sm:text-sm font-bold text-[#FFFFFF] leading-tight">
                        Post-Game Instant Replay
                      </span>
                      <span className="block font-mono text-[10px] text-[#F8FAFC] mt-0.5 truncate">
                        Auto-play best shot highlight after contest
                      </span>
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-[2px] border shrink-0 ml-2 whitespace-nowrap ${
                      instantReplayEnabled
                        ? 'bg-[#04241B] border-[#00ffaa]/65 text-[#A7F3D0]'
                        : 'bg-[#141824] border-white/30 text-[#FFFFFF]'
                    }`}
                  >
                    {instantReplayEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Section 3: Equipment (Basketball Visual Skins) */}
          <section
            aria-labelledby="settings-equipment-heading"
            className="md:col-span-2 bg-[#0A0D14] border border-white/30 rounded-[4px] p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block">
                  Court Gear &amp; Visual FX
                </span>
                <h2
                  id="settings-equipment-heading"
                  className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5 flex items-center gap-2"
                >
                  <Sparkles className="w-5 h-5 text-[#00ffaa]" aria-hidden="true" />
                  <span>Equipment</span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#F8FAFC] tabular-nums">
                <span>
                  Equipped:{' '}
                  <strong className="text-[#00ffaa]">{activeBallSkin.name}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {unlockedBallSkinsCount}/{BALL_SKINS.length} Unlocked
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {BALL_SKINS.map((skin) => {
                const unlocked = skin.unlock.isUnlocked(career);
                const selected = ballSkin === skin.id;
                const progress = skin.unlock.getProgress(career);
                const progressWidth = Math.max(4, Math.min(100, Math.round(progress.ratio * 100)));

                return (
                  <div
                    key={skin.id}
                    className={`rounded-[4px] border p-3.5 flex flex-col justify-between transition-colors ${
                      selected
                        ? 'bg-[#121722] border-[#00ffaa]'
                        : unlocked
                          ? 'bg-[#05070B] border-white/30 hover:border-white/55'
                          : 'bg-[#05070B] border-white/25'
                    }`}
                  >
                    <div>
                      <BallSkinPreview skin={skin} locked={!unlocked} />

                      <div className="flex items-start justify-between gap-2 mt-3">
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-extrabold uppercase tracking-tight text-[#FFFFFF] leading-tight">
                            {skin.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ffaa] mt-0.5">
                            {skin.id === 'fireball' && <Flame className="w-3 h-3 text-[#FB923C]" />}
                            {skin.id === 'electric' && <Zap className="w-3 h-3 text-[#22D3EE]" />}
                            <span>{skin.fxSummary}</span>
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[#F8FAFC] leading-relaxed mt-2">
                        {skin.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/25">
                      {unlocked ? (
                        <button
                          type="button"
                          onClick={() => onSelectBallSkin(skin.id)}
                          aria-pressed={selected}
                          className={`w-full min-h-[44px] px-3 py-2 rounded-[2px] font-mono text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#00ffaa] ${
                            selected
                              ? 'bg-[#00ffaa] text-[#05070B]'
                              : 'bg-[#141824] border border-white/30 hover:border-[#00ffaa] text-[#FFFFFF]'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{selected ? 'Equipped' : 'Equip'}</span>
                        </button>
                      ) : (
                        <div>
                          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FEF08A]">
                            Unlock: {skin.unlock.label}
                          </div>
                          <div className="mt-1.5">
                            <svg
                              viewBox="0 0 100 6"
                              preserveAspectRatio="none"
                              className="w-full h-1.5 rounded-[1px] overflow-hidden bg-white/15"
                              aria-hidden="true"
                            >
                              <rect x="0" y="0" width="100" height="6" fill="rgba(255,255,255,0.15)" />
                              <rect x="0" y="0" width={progressWidth} height="6" fill="#00ffaa" />
                            </svg>
                          </div>
                          <div className="font-mono text-[10px] text-[#F8FAFC] tabular-nums mt-1">
                            {progress.text}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 4: Account & Arena */}
          <section className="bg-[#0A0D14] border border-white/30 rounded-[4px] p-5 flex flex-col">
            <div className="mb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block">
                Profile &amp; Venue
              </span>
              <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5">
                Account &amp; Arena
              </h2>
            </div>

            <div className="divide-y divide-white/25 flex-1">
              {/* Profile & Auth */}
              <div className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] shrink-0">
                      <UserCircle2 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-[#FFFFFF] truncate">
                        {userProfile ? `@${userProfile.username}` : playerName}
                      </span>
                      <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5 truncate">
                        {userProfile
                          ? 'Signed in · Cloud stats & PVP synced'
                          : 'Guest session · Sign in for PVP & Global Rankings'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={onOpenEditUsername}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] font-mono text-xs font-bold uppercase tracking-wider text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#00ffaa] shrink-0" />
                    <span>{userProfile ? 'Edit Username' : 'Edit Display Name'}</span>
                  </button>

                  {userProfile ? (
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] bg-[#240A0E] border border-[#FCA5A5]/70 hover:border-[#FCA5A5] font-mono text-xs font-bold uppercase tracking-wider text-[#FEE2E2] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] font-mono text-xs font-bold uppercase tracking-wider text-[#05070B] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <LogIn className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign In</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Active Court Venue */}
              <div className="py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] shrink-0">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-[#FFFFFF] truncate">
                      {activeCourt.name}
                    </span>
                    <span className="block font-mono text-[11px] text-[#F8FAFC] mt-0.5 truncate">
                      {activeCourt.vibeLabel} · Active arena theme
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenCourtLocker}
                  className="min-h-[44px] px-3.5 py-2 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] font-mono text-xs font-bold uppercase tracking-wider text-[#00ffaa] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Change Court
                </button>
              </div>

              {/* Unboxed Career Summary Line */}
              <div className="pt-4">
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] mb-1.5">
                  Career Snapshot
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[#FFFFFF] tabular-nums">
                  <span>
                    Best <strong className="text-[#FFFFFF]">{career.bestScore}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Career <strong className="text-[#00ffaa]">{career.totalCareerScore}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Streak <strong className="text-[#FFFFFF]">{career.allTimeBestStreak}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Fast-Break{' '}
                    <strong className="text-[#FFFFFF]">
                      {career.bestFastBreakMs > 0
                        ? formatFastBreakMs(career.bestFastBreakMs)
                        : '—'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Controls & Shortcuts */}
          <section className="bg-[#0A0D14] border border-white/30 rounded-[4px] p-5 flex flex-col">
            <div className="mb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] block">
                Quick Reference
              </span>
              <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-[#00ffaa]" aria-hidden="true" />
                <span>Controls &amp; Shortcuts</span>
              </h2>
            </div>

            <div className="divide-y divide-white/25">
              {CONTROL_BINDINGS.map((row) => (
                <div
                  key={row.keys}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <span className="text-xs sm:text-sm font-medium text-[#FFFFFF]">
                    {row.action}
                  </span>
                  <kbd className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-[2px] bg-[#05070B] border border-white/30 text-[#00ffaa] whitespace-nowrap shrink-0">
                    {row.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>

          {/* Section 5: Data & Reset */}
          <section className="md:col-span-2 bg-[#0A0D14] border border-white/30 rounded-[4px] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] block">
                  Preferences &amp; Storage
                </span>
                <h2 className="font-display text-lg font-extrabold uppercase tracking-tight text-[#FFFFFF] mt-0.5">
                  Reset Data &amp; Defaults
                </h2>
                <p className="text-xs text-[#F8FAFC] mt-1">
                  Restore default settings or clear locally stored career stats, highlights, and{' '}
                  <span className="tabular-nums">{rivalriesCount}</span> saved rivalry{' '}
                  {rivalriesCount === 1 ? 'record' : 'records'}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleResetDefaultsClick}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-[2px] bg-[#05070B] border border-white/30 hover:border-[#00ffaa] font-mono text-xs font-bold uppercase tracking-wider text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#00ffaa]" />
                  <span>{defaultsJustReset ? 'Defaults Restored' : 'Restore Default Settings'}</span>
                </button>

                {confirmClearData ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmClearProgress}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[2px] bg-[#DC2626] hover:bg-[#EF4444] font-mono text-xs font-bold uppercase tracking-wider text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Clear</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearData(false)}
                      className="min-h-[44px] px-3 py-2 rounded-[2px] bg-[#141824] border border-white/30 hover:border-white/55 font-mono text-xs font-bold uppercase tracking-wider text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearData(true)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-[2px] bg-[#240A0E] border border-[#FCA5A5]/70 hover:border-[#FCA5A5] font-mono text-xs font-bold uppercase tracking-wider text-[#FEE2E2] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{dataJustCleared ? 'Local Stats Cleared' : 'Clear Local Stats'}</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
};
