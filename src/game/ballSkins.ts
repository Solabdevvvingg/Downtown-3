import { BallSkinId, CareerStats } from './types';

export interface BallSkinUnlockRequirement {
  label: string;
  isUnlocked: (career: CareerStats) => boolean;
  getProgress: (career: CareerStats) => {
    text: string;
    ratio: number;
  };
}

export type BallTrailStyle = 'classic' | 'flame' | 'electric' | 'gold';

export interface BallSkinConfig {
  id: BallSkinId;
  name: string;
  vibeLabel: string;
  fxSummary: string;
  description: string;
  unlock: BallSkinUnlockRequirement;
  alwaysTrail: boolean;
  trailStyle: BallTrailStyle;
  palette: {
    shellStops: [string, string, string, string];
    seamColor: string;
    seamGlowColor?: string;
    glowHex: string;
    accentHex: string;
    trailOuterRgb: string;
    trailInnerRgb: string;
    trailParticles: string[];
    trailParticleShape: 'circle' | 'spark' | 'confetti';
    releaseBurstColors: string[];
    releaseBurstShape: 'circle' | 'spark' | 'confetti';
    scoreBurstColors: string[];
    rimSparkColors: string[];
  };
}

export const BALL_SKINS: BallSkinConfig[] = [
  {
    id: 'classic_leather',
    name: 'Classic Leather',
    vibeLabel: 'Standard Issue',
    fxSummary: 'Streak Heat Ribbon',
    description:
      'Pebbled full-grain orange leather with classic dark channels, crisp heat streaks on hot runs, and traditional swish sparks.',
    unlock: {
      label: 'Starter Equipment',
      isUnlocked: () => true,
      getProgress: () => ({ text: 'Unlocked', ratio: 1 }),
    },
    alwaysTrail: false,
    trailStyle: 'classic',
    palette: {
      shellStops: ['#FB923C', '#F9631C', '#C2410C', '#7C2D12'],
      seamColor: 'rgba(20, 14, 10, 0.78)',
      glowHex: '#F9631C',
      accentHex: '#FB923C',
      trailOuterRgb: '249, 99, 28',
      trailInnerRgb: '253, 186, 116',
      trailParticles: ['#FDBA74', '#F9631C', '#FB923C'],
      trailParticleShape: 'circle',
      releaseBurstColors: ['#FDBA74', '#F9631C'],
      releaseBurstShape: 'circle',
      scoreBurstColors: ['#34D399', '#F9631C', '#FEF08A'],
      rimSparkColors: ['#FDBA74', '#F9631C'],
    },
  },
  {
    id: 'fireball',
    name: 'Fireball',
    vibeLabel: 'Magma Core',
    fxSummary: 'Blazing Flame & Embers',
    description:
      'Superheated volcanic shell with glowing molten seams, a blazing ember plume on every shot, and scorching flame sparks.',
    unlock: {
      label: 'Reach a 3+ streak or make 10 total threes',
      isUnlocked: (career) => career.allTimeBestStreak >= 3 || career.totalShotsMade >= 10,
      getProgress: (career) => {
        const streakRatio = Math.min(1, career.allTimeBestStreak / 3);
        const makesRatio = Math.min(1, career.totalShotsMade / 10);
        return {
          text: `Streak ${Math.min(career.allTimeBestStreak, 3)}/3 · Makes ${Math.min(career.totalShotsMade, 10)}/10`,
          ratio: Math.max(streakRatio, makesRatio),
        };
      },
    },
    alwaysTrail: true,
    trailStyle: 'flame',
    palette: {
      shellStops: ['#FEF08A', '#F97316', '#B91C1C', '#450A0A'],
      seamColor: 'rgba(254, 240, 138, 0.9)',
      seamGlowColor: '#F59E0B',
      glowHex: '#F97316',
      accentHex: '#FACC15',
      trailOuterRgb: '239, 68, 68',
      trailInnerRgb: '254, 240, 138',
      trailParticles: ['#FEF08A', '#FACC15', '#FB923C', '#EF4444'],
      trailParticleShape: 'circle',
      releaseBurstColors: ['#FEF08A', '#FB923C', '#EF4444'],
      releaseBurstShape: 'spark',
      scoreBurstColors: ['#FEF08A', '#F97316', '#EF4444', '#FDE047'],
      rimSparkColors: ['#FEF08A', '#FB923C', '#EF4444'],
    },
  },
  {
    id: 'electric',
    name: 'Electric',
    vibeLabel: 'High Voltage',
    fxSummary: 'Lightning Arc & Sparks',
    description:
      'Ionized cobalt composite with neon-cyan lightning channels, crackling voltage arcs in flight, and high-energy spark bursts.',
    unlock: {
      label: 'Score 15+ in a contest or hit 8 clean swishes',
      isUnlocked: (career) => career.bestScore >= 15 || career.totalSwishes >= 8,
      getProgress: (career) => {
        const scoreRatio = Math.min(1, career.bestScore / 15);
        const swishRatio = Math.min(1, career.totalSwishes / 8);
        return {
          text: `Best ${Math.min(career.bestScore, 15)}/15 · Swishes ${Math.min(career.totalSwishes, 8)}/8`,
          ratio: Math.max(scoreRatio, swishRatio),
        };
      },
    },
    alwaysTrail: true,
    trailStyle: 'electric',
    palette: {
      shellStops: ['#E0F2FE', '#38BDF8', '#1D4ED8', '#0F172A'],
      seamColor: 'rgba(165, 243, 252, 0.95)',
      seamGlowColor: '#22D3EE',
      glowHex: '#22D3EE',
      accentHex: '#38BDF8',
      trailOuterRgb: '6, 182, 212',
      trailInnerRgb: '224, 242, 254',
      trailParticles: ['#E0F2FE', '#67E8F9', '#22D3EE', '#818CF8'],
      trailParticleShape: 'spark',
      releaseBurstColors: ['#E0F2FE', '#22D3EE', '#38BDF8'],
      releaseBurstShape: 'spark',
      scoreBurstColors: ['#E0F2FE', '#22D3EE', '#38BDF8', '#A5B4FC'],
      rimSparkColors: ['#E0F2FE', '#22D3EE', '#818CF8'],
    },
  },
  {
    id: 'championship_gold',
    name: 'Championship Gold',
    vibeLabel: 'Crown Edition',
    fxSummary: 'Gold Ribbon & Confetti',
    description:
      'Brushed 24-karat trophy gold with obsidian channels, shimmering champagne flight trails, and emerald-gold victory confetti.',
    unlock: {
      label: 'Win 1 PVP match, hit a 6+ streak, or score 28+',
      isUnlocked: (career) =>
        career.pvpWins >= 1 || career.allTimeBestStreak >= 6 || career.bestScore >= 28,
      getProgress: (career) => {
        const pvpRatio = Math.min(1, career.pvpWins);
        const streakRatio = Math.min(1, career.allTimeBestStreak / 6);
        const scoreRatio = Math.min(1, career.bestScore / 28);
        return {
          text: `PVP Wins ${Math.min(career.pvpWins, 1)}/1 · Streak ${Math.min(career.allTimeBestStreak, 6)}/6 · Best ${Math.min(career.bestScore, 28)}/28`,
          ratio: Math.max(pvpRatio, streakRatio, scoreRatio),
        };
      },
    },
    alwaysTrail: true,
    trailStyle: 'gold',
    palette: {
      shellStops: ['#FEF9C3', '#FACC15', '#CA8A04', '#713F12'],
      seamColor: 'rgba(18, 20, 28, 0.86)',
      seamGlowColor: '#FDE047',
      glowHex: '#FACC15',
      accentHex: '#FEF08A',
      trailOuterRgb: '234, 179, 8',
      trailInnerRgb: '254, 249, 195',
      trailParticles: ['#FEF9C3', '#FACC15', '#34D399', '#FDE047'],
      trailParticleShape: 'confetti',
      releaseBurstColors: ['#FEF08A', '#FACC15', '#34D399'],
      releaseBurstShape: 'confetti',
      scoreBurstColors: ['#FEF08A', '#FACC15', '#00ffaa', '#FDE047'],
      rimSparkColors: ['#FEF08A', '#FACC15', '#34D399'],
    },
  },
];

export function getBallSkinConfig(id?: string): BallSkinConfig {
  return BALL_SKINS.find((skin) => skin.id === id) ?? BALL_SKINS[0];
}

export function isBallSkinUnlocked(id: BallSkinId, career: CareerStats): boolean {
  return getBallSkinConfig(id).unlock.isUnlocked(career);
}

export function getUnlockedBallSkinsCount(career: CareerStats): number {
  return BALL_SKINS.filter((skin) => skin.unlock.isUnlocked(career)).length;
}
