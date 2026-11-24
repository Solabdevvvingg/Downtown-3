import { CareerStats, CourtThemeId } from './types';

export interface CourtUnlockRequirement {
  label: string;
  isUnlocked: (career: CareerStats) => boolean;
  getProgress: (career: CareerStats) => {
    text: string;
    ratio: number;
  };
}

export interface CourtThemeConfig {
  id: CourtThemeId;
  name: string;
  vibeLabel: string;
  chantLabel: string;
  description: string;
  unlock: CourtUnlockRequirement;
  palette: {
    bgStops: [string, string, string];
    spotlightPrimary: string; // RGB triplet e.g. '255, 224, 178'
    spotlightSecondary: string; // RGB triplet
    standBg: string;
    standRowLine: string;
    apron: string;
    plankColors: [string, string, string, string];
    paint: string;
    lineColor: string;
    threeArcColor: string;
    rimColor: string;
    rimBraceColor: string;
    netFront: string;
    netBack: string;
    rackColor: string;
    rackActiveColor: string;
    stanchionColor: string;
    backboardGlass: string;
    accentHex: string;
    lineGlow?: boolean;
    isOutdoorFence?: boolean;
  };
}

export const COURT_THEMES: CourtThemeConfig[] = [
  {
    id: 'wooden_gym',
    name: 'Wooden Gym',
    vibeLabel: 'Indoor Hardwood',
    chantLabel: 'Arena Organ & Claps',
    description:
      'Classic varnished maple planks, deep navy lane, warm rafters lighting, and traditional arena organ & rhythmic clap chants.',
    unlock: {
      label: 'Starter Court',
      isUnlocked: () => true,
      getProgress: () => ({ text: 'Unlocked', ratio: 1 }),
    },
    palette: {
      bgStops: ['#07090E', '#0F1522', '#121824'],
      spotlightPrimary: '255, 224, 178',
      spotlightSecondary: '255, 210, 150',
      standBg: '#0D111A',
      standRowLine: 'rgba(255, 255, 255, 0.035)',
      apron: '#141C2B',
      plankColors: ['#C88A4E', '#BC7B3F', '#CE9156', '#C08044'],
      paint: '#182741',
      lineColor: 'rgba(244, 239, 230, 0.9)',
      threeArcColor: '#F8F4EC',
      rimColor: '#F9631C',
      rimBraceColor: '#E04E0D',
      netFront: 'rgba(248, 244, 236, 0.88)',
      netBack: 'rgba(248, 244, 236, 0.5)',
      rackColor: '#353E50',
      rackActiveColor: '#5B677D',
      stanchionColor: '#181D29',
      backboardGlass: 'rgba(210, 232, 255, 0.16)',
      accentHex: '#F9631C',
      lineGlow: false,
      isOutdoorFence: false,
    },
  },
  {
    id: 'street_asphalt',
    name: 'Street Asphalt',
    vibeLabel: 'Outdoor Blacktop',
    chantLabel: 'Chain Net & Park Hype',
    description:
      'Weathered dark asphalt under twilight floodlights, terracotta key, chain-link perimeter fence, metallic net rattle, and raw park crowd chants.',
    unlock: {
      label: 'Open Blacktop',
      isUnlocked: () => true,
      getProgress: () => ({ text: 'Unlocked', ratio: 1 }),
    },
    palette: {
      bgStops: ['#0A101D', '#182236', '#222A39'],
      spotlightPrimary: '255, 214, 150',
      spotlightSecondary: '253, 186, 116',
      standBg: '#101520',
      standRowLine: 'rgba(203, 213, 225, 0.075)',
      apron: '#1A1F28',
      plankColors: ['#282D37', '#232831', '#2C323D', '#252A34'],
      paint: '#9A3412',
      lineColor: 'rgba(241, 245, 249, 0.88)',
      threeArcColor: '#F1F5F9',
      rimColor: '#EA580C',
      rimBraceColor: '#C2410C',
      netFront: 'rgba(203, 213, 225, 0.8)',
      netBack: 'rgba(148, 163, 184, 0.48)',
      rackColor: '#475569',
      rackActiveColor: '#94A3B8',
      stanchionColor: '#252E3D',
      backboardGlass: 'rgba(226, 232, 240, 0.2)',
      accentHex: '#FB923C',
      lineGlow: false,
      isOutdoorFence: true,
    },
  },
  {
    id: 'neon_arena',
    name: 'Neon Arena',
    vibeLabel: 'Synth Dome',
    chantLabel: 'Cyber Chant & Sub-Bass',
    description:
      'Midnight composite floor, electric cyan 3-point arc with subtle perimeter glow, twin violet-cyan spotlights, and booming synth-dome chants.',
    unlock: {
      label: 'Reach a 3+ streak or make 15 total threes',
      isUnlocked: (career) => career.allTimeBestStreak >= 3 || career.totalShotsMade >= 15,
      getProgress: (career) => {
        const streakRatio = Math.min(1, career.allTimeBestStreak / 3);
        const makesRatio = Math.min(1, career.totalShotsMade / 15);
        return {
          text: `Streak ${Math.min(career.allTimeBestStreak, 3)}/3 · Makes ${Math.min(career.totalShotsMade, 15)}/15`,
          ratio: Math.max(streakRatio, makesRatio),
        };
      },
    },
    palette: {
      bgStops: ['#03050C', '#080D1F', '#0D132A'],
      spotlightPrimary: '56, 189, 248',
      spotlightSecondary: '168, 85, 247',
      standBg: '#070B16',
      standRowLine: 'rgba(34, 211, 238, 0.14)',
      apron: '#070B17',
      plankColors: ['#0D1426', '#10182E', '#0B1120', '#111A33'],
      paint: '#1E1B4B',
      lineColor: 'rgba(34, 211, 238, 0.9)',
      threeArcColor: '#22D3EE',
      rimColor: '#06B6D4',
      rimBraceColor: '#0891B2',
      netFront: 'rgba(165, 243, 252, 0.88)',
      netBack: 'rgba(56, 189, 248, 0.48)',
      rackColor: '#1E293B',
      rackActiveColor: '#22D3EE',
      stanchionColor: '#0F172A',
      backboardGlass: 'rgba(34, 211, 238, 0.15)',
      accentHex: '#22D3EE',
      lineGlow: true,
      isOutdoorFence: false,
    },
  },
  {
    id: 'championship_gold',
    name: 'Championship Apex',
    vibeLabel: 'Finals Bowl',
    chantLabel: 'MVP Chant & Brass',
    description:
      'Dark espresso championship parquet, obsidian key, burnished gold markings, and roaring Finals MVP chants.',
    unlock: {
      label: 'Score 25+ in a contest or make 40 total threes',
      isUnlocked: (career) => career.bestScore >= 25 || career.totalShotsMade >= 40,
      getProgress: (career) => {
        const scoreRatio = Math.min(1, career.bestScore / 25);
        const makesRatio = Math.min(1, career.totalShotsMade / 40);
        return {
          text: `Best ${Math.min(career.bestScore, 25)}/25 pts · Makes ${Math.min(career.totalShotsMade, 40)}/40`,
          ratio: Math.max(scoreRatio, makesRatio),
        };
      },
    },
    palette: {
      bgStops: ['#090705', '#15110B', '#1C160E'],
      spotlightPrimary: '253, 224, 71',
      spotlightSecondary: '245, 158, 11',
      standBg: '#100D08',
      standRowLine: 'rgba(251, 191, 36, 0.11)',
      apron: '#14110C',
      plankColors: ['#422C19', '#382414', '#4B321C', '#3C2716'],
      paint: '#111111',
      lineColor: 'rgba(251, 191, 36, 0.88)',
      threeArcColor: '#FDE047',
      rimColor: '#F59E0B',
      rimBraceColor: '#D97706',
      netFront: 'rgba(254, 243, 199, 0.9)',
      netBack: 'rgba(251, 191, 36, 0.48)',
      rackColor: '#443627',
      rackActiveColor: '#F59E0B',
      stanchionColor: '#1C1710',
      backboardGlass: 'rgba(253, 224, 71, 0.13)',
      accentHex: '#FBBF24',
      lineGlow: false,
      isOutdoorFence: false,
    },
  },
];

export function getCourtThemeConfig(id: CourtThemeId | string | undefined): CourtThemeConfig {
  return COURT_THEMES.find((t) => t.id === id) ?? COURT_THEMES[0];
}

export function isCourtUnlocked(id: CourtThemeId, career: CareerStats): boolean {
  const cfg = getCourtThemeConfig(id);
  return cfg.unlock.isUnlocked(career);
}

export function getUnlockedCourtsCount(career: CareerStats): number {
  return COURT_THEMES.filter((t) => t.unlock.isUnlocked(career)).length;
}
