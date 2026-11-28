import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Clock,
  Copy,
  Download,
  Play,
  Share2,
  Swords,
  Timer,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import {
  getRackBallCount,
  getSlotIndex,
  HALF_COURT_RACK_INDEX,
  RACK_CONFIGS,
  TOTAL_BALLS,
} from '../game/constants';
import { generateShareScorecard, ShareSnippetResult } from '../game/shareCard';
import { normalizeOpponentKey } from '../game/storage';
import { formatFastBreakMs, formatSplitDeltaMs } from '../game/timeFormat';
import { RivalBadgeIcon } from './RivalBadgeIcon';
import {
  CareerBaseline,
  ContestHighlight,
  FriendPresence,
  FriendshipRecord,
  HudSnapshot,
  MatchInvitePayload,
  RivalryRecord,
  ShotChartEntry,
  StaminaEfficiencyStats,
  TimingBreakdown,
} from '../game/types';

interface GameOverModalProps {
  hud: HudSnapshot;
  playerName: string;
  myUid?: string | null;
  friendships?: FriendshipRecord[];
  friendStatuses?: Record<string, FriendPresence>;
  outgoingInvite?: MatchInvitePayload | null;
  onPlayAgain: () => void;
  onRequestRematch: () => void;
  onAddFriend?: (targetUid: string, targetName: string) => Promise<void> | void;
  onAcceptFriend?: (pairId: string, friendName: string) => Promise<void> | void;
  onSendMatchInvite?: (targetUid: string, targetName: string, isRematch: boolean) => void;
  onCancelMatchInvite?: (inviteId: string) => void;
  onOpenHighlightReplay?: () => void;
  onBackToTitle: () => void;
}

interface AccuracyBarItem {
  key: keyof TimingBreakdown;
  label: string;
  count: number;
  color: string;
  textColor: string;
}

const ShotAccuracyChart: React.FC<{ breakdown: TimingBreakdown }> = ({ breakdown }) => {
  const total =
    breakdown.perfect + breakdown.good + breakdown.early + breakdown.late;
  const onTarget = breakdown.perfect + breakdown.good;
  const onTargetPct = total > 0 ? Math.round((onTarget / total) * 100) : 0;

  const items: AccuracyBarItem[] = [
    {
      key: 'perfect',
      label: 'Perfect',
      count: breakdown.perfect,
      color: 'bg-[#00ffaa]',
      textColor: 'text-[#00ffaa]',
    },
    {
      key: 'good',
      label: 'Good',
      count: breakdown.good,
      color: 'bg-[#6EE7B7]',
      textColor: 'text-[#6EE7B7]',
    },
    {
      key: 'early',
      label: 'Early',
      count: breakdown.early,
      color: 'bg-[#FBBF24]',
      textColor: 'text-[#FEF08A]',
    },
    {
      key: 'late',
      label: 'Late',
      count: breakdown.late,
      color: 'bg-[#F87171]',
      textColor: 'text-[#FECACA]',
    },
  ];

  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <div
      className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 mb-4"
      aria-label="Shot Accuracy Analysis bar chart"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
          Shot Accuracy Analysis
        </div>
        <div className="font-mono text-[11px] font-medium text-[#F8FAFC] tabular-nums">
          {total > 0 ? `${onTargetPct}% On-Target · ${total} Shots` : 'No releases recorded'}
        </div>
      </div>

      {/* Vertical Bar Chart */}
      <div className="relative bg-[#101520] border border-white/25 rounded-[2px] px-3 pt-4 pb-2.5">
        {/* Horizontal reference lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-4 bottom-12 flex flex-col justify-between"
        >
          <div className="border-t border-dashed border-white/20" />
          <div className="border-t border-dashed border-white/20" />
          <div className="border-t border-white/30" />
        </div>

        <div className="relative grid grid-cols-4 gap-2.5 sm:gap-4 items-end">
          {items.map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const heightPct = item.count > 0 ? Math.max(10, Math.round((item.count / maxCount) * 100)) : 4;

            return (
              <div key={item.key} className="flex flex-col items-center">
                <div className="h-24 w-full flex flex-col justify-end items-center">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums mb-1 ${
                      item.count > 0 ? item.textColor : 'text-[#F8FAFC]'
                    }`}
                  >
                    {item.count}
                  </span>
                  <div
                    className={`w-8 sm:w-10 rounded-t-[2px] transition-all duration-300 ${
                      item.count > 0 ? item.color : 'bg-white/25'
                    }`}
                    style={{ height: `${heightPct}%` }}
                    title={`${item.label}: ${item.count} (${pct}%)`}
                  />
                </div>
                <div className="mt-2 text-center leading-tight">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#FFFFFF]">
                    {item.label}
                  </div>
                  <div className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
                    {pct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const StaminaEfficiencyCard: React.FC<{ stats: StaminaEfficiencyStats }> = ({ stats }) => {
  const barColor =
    stats.efficiencyPct >= 82
      ? 'bg-[#00ffaa]'
      : stats.efficiencyPct >= 62
        ? 'bg-[#6EE7B7]'
        : stats.efficiencyPct >= 40
          ? 'bg-[#FBBF24]'
          : 'bg-[#F87171]';
  const textColor =
    stats.efficiencyPct >= 82
      ? 'text-[#00ffaa]'
      : stats.efficiencyPct >= 62
        ? 'text-[#6EE7B7]'
        : stats.efficiencyPct >= 40
          ? 'text-[#FEF08A]'
          : 'text-[#FEE2E2]';

  return (
    <div
      className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 mb-4"
      aria-label="Stamina Efficiency Summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Zap className={`w-3.5 h-3.5 ${textColor}`} />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
            Stamina Efficiency
          </span>
          <span
            className={`font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[2px] bg-[#141824] border border-white/30 ${textColor}`}
          >
            {stats.rating}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
            +{stats.totalSaved}% Saved
          </span>
          <span className={`font-mono text-base font-bold tabular-nums ${textColor}`}>
            {stats.efficiencyPct}%
          </span>
        </div>
      </div>

      <div className="w-full h-1.5 bg-white/25 rounded-[2px] overflow-hidden mb-3">
        <div
          className={`h-full rounded-[2px] transition-all duration-300 ${barColor}`}
          style={{ width: `${stats.efficiencyPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center bg-[#101520] border border-white/25 rounded-[2px] p-2">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            Timing Saved
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#00ffaa] tabular-nums">
            +{stats.timingSaved}%
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            Rack Recovery
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#6EE7B7] tabular-nums">
            +{stats.movementRecovered}%
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            End / Low
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-[#FFFFFF] tabular-nums">
            {stats.endStamina}%{' '}
            <span className="text-[10px] font-medium text-[#F8FAFC]">
              ({stats.minStamina}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const BestShotHighlightCard: React.FC<{
  highlight: ContestHighlight;
  onWatch: () => void;
}> = ({ highlight, onWatch }) => {
  const shotBadge = highlight.isBuzzerBeater
    ? 'Buzzer Beater'
    : highlight.hadRimHang
      ? 'Shooter’s Roll'
      : highlight.isMoney && highlight.isSwish
        ? 'Money Swish'
        : highlight.isMoney
          ? 'Money Ball'
          : highlight.isSwish
            ? 'Clean Swish'
            : 'Made Three';

  return (
    <div
      className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[2px] p-3.5 mb-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
      aria-label="Best Shot Highlight"
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa]">
          Game Highlights · Best Shot
        </div>
        <div className="font-sans text-sm sm:text-base font-extrabold uppercase tracking-wide text-[#FFFFFF] mt-0.5 tabular-nums">
          {shotBadge} (+{highlight.pointsAwarded} pts)
        </div>
        <div className="font-mono text-[11px] font-medium text-[#F8FAFC] truncate tabular-nums">
          {highlight.rackLabel} · {highlight.timingQuality} · {highlight.multiplier}× Mult
        </div>
      </div>

      <button
        type="button"
        onClick={onWatch}
        className="min-h-[44px] px-3.5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] active:scale-[0.98] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>Watch Replay</span>
      </button>
    </div>
  );
};

interface ComparisonMetric {
  label: string;
  currentDisplay: string;
  avgDisplay: string;
  deltaText: string;
  toneColor: string;
  barColor: string;
  currentBarPct: number;
  avgBarPct: number;
  hasBaseline: boolean;
  subDetail?: string;
}

const CareerComparisonCard: React.FC<{
  baseline: CareerBaseline;
  currentScore: number;
  currentBestStreak: number;
  swishCount: number;
  attemptsCount: number;
}> = ({ baseline, currentScore, currentBestStreak, swishCount, attemptsCount }) => {
  const currentSwishPct = attemptsCount > 0 ? (swishCount / attemptsCount) * 100 : 0;

  const hasScoreBaseline = baseline.contestsPlayed > 0;
  const avgScore = hasScoreBaseline ? baseline.totalCareerScore / baseline.contestsPlayed : currentScore;

  const hasStreakBaseline = baseline.streakTrackedContests > 0;
  const avgStreak = hasStreakBaseline
    ? baseline.totalBestStreakSum / baseline.streakTrackedContests
    : currentBestStreak;

  const hasSwishBaseline = baseline.totalSwishTrackedAttempts > 0;
  const avgSwishPct = hasSwishBaseline
    ? (baseline.totalSwishes / baseline.totalSwishTrackedAttempts) * 100
    : currentSwishPct;

  const buildMetric = (
    label: string,
    currentVal: number,
    avgVal: number,
    hasBaseline: boolean,
    isPercent: boolean,
    subDetail?: string
  ): ComparisonMetric => {
    const currentDisplay = isPercent ? `${currentVal.toFixed(1)}%` : `${currentVal}`;
    const avgDisplay = hasBaseline
      ? isPercent
        ? `${avgVal.toFixed(1)}%`
        : avgVal.toFixed(1)
      : '—';

    const maxScale = Math.max(currentVal, hasBaseline ? avgVal : currentVal, isPercent ? 20 : 5, 1);
    const currentBarPct = Math.max(currentVal > 0 ? 8 : 0, Math.min(100, (currentVal / maxScale) * 100));
    const avgBarPct = hasBaseline
      ? Math.max(avgVal > 0 ? 8 : 0, Math.min(100, (avgVal / maxScale) * 100))
      : currentBarPct;

    if (!hasBaseline) {
      return {
        label,
        currentDisplay,
        avgDisplay,
        deltaText: 'Baseline',
        toneColor: 'text-[#00ffaa]',
        barColor: 'bg-[#00ffaa]',
        currentBarPct,
        avgBarPct,
        hasBaseline,
        subDetail,
      };
    }

    const diff = currentVal - avgVal;
    const isTie = Math.abs(diff) < 0.05;
    const isAbove = diff >= 0.05;
    const deltaText = isTie
      ? 'On Avg'
      : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${isPercent ? '%' : ''}`;

    return {
      label,
      currentDisplay,
      avgDisplay,
      deltaText,
      toneColor: isTie ? 'text-[#FEF08A]' : isAbove ? 'text-[#00ffaa]' : 'text-[#FECACA]',
      barColor: isTie ? 'bg-[#FBBF24]' : isAbove ? 'bg-[#00ffaa]' : 'bg-[#F87171]',
      currentBarPct,
      avgBarPct,
      hasBaseline,
      subDetail,
    };
  };

  const metrics: ComparisonMetric[] = [
    buildMetric('Score', currentScore, avgScore, hasScoreBaseline, false),
    buildMetric('Best Streak', currentBestStreak, avgStreak, hasStreakBaseline, false),
    buildMetric(
      'Swish %',
      currentSwishPct,
      avgSwishPct,
      hasSwishBaseline,
      true,
      `${swishCount}/${attemptsCount}`
    ),
  ];

  return (
    <div
      className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 mb-4"
      aria-label="Career Comparison"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#00ffaa]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
            Career Comparison
          </span>
        </div>
        <span className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
          {hasScoreBaseline
            ? `vs Avg of ${baseline.contestsPlayed} ${baseline.contestsPlayed === 1 ? 'Contest' : 'Contests'}`
            : '1st Contest · Baseline Set'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-[#101520] border border-white/25 rounded-[2px] p-2.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[#F8FAFC]">
                  {m.label}
                </span>
                <span className={`font-mono text-[11px] font-bold tabular-nums ${m.toneColor}`}>
                  {m.deltaText}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="font-mono text-lg font-bold text-[#FFFFFF] tabular-nums leading-none">
                  {m.currentDisplay}
                </span>
                <span className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
                  {m.hasBaseline ? `Avg ${m.avgDisplay}` : m.subDetail ?? 'New baseline'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] font-bold uppercase text-[#FFFFFF] w-7 shrink-0">
                  Now
                </span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-[2px] overflow-hidden">
                  <div
                    className={`h-full rounded-[2px] transition-all duration-300 ${m.barColor}`}
                    style={{ width: `${m.currentBarPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] font-semibold uppercase text-[#F8FAFC] w-7 shrink-0">
                  Avg
                </span>
                <div className="flex-1 h-1.5 bg-white/20 rounded-[2px] overflow-hidden">
                  <div
                    className={`h-full rounded-[2px] transition-all duration-300 ${
                      m.hasBaseline ? 'bg-[#E2E8F0]' : 'bg-white/40'
                    }`}
                    style={{ width: `${m.avgBarPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RivalryUpdatePanel: React.FC<{
  rivalry: RivalryRecord | null;
  opponentName: string;
  myScore: number;
  oppScore: number;
  iWon: boolean;
  isTie: boolean;
}> = ({ rivalry, opponentName, myScore, oppScore, iWon, isTie }) => {
  const wins = rivalry?.wins ?? (iWon ? 1 : 0);
  const losses = rivalry?.losses ?? (!iWon && !isTie ? 1 : 0);
  const draws = rivalry?.draws ?? (isTie ? 1 : 0);
  const totalMatches = Math.max(1, wins + losses + draws);
  const pointsFor = rivalry?.pointsFor ?? myScore;
  const pointsAgainst = rivalry?.pointsAgainst ?? oppScore;

  const myAvg = pointsFor / totalMatches;
  const oppAvg = pointsAgainst / totalMatches;
  const avgDiff = myAvg - oppAvg;
  const winPct = Math.round((wins / totalMatches) * 100);
  const avgSum = Math.max(1, myAvg + oppAvg);
  const mySharePct = (myAvg / avgSum) * 100;

  const seriesStatus =
    wins > losses
      ? { label: 'Series Lead', color: 'text-[#00ffaa]' }
      : losses > wins
        ? { label: 'Trailing Series', color: 'text-[#FECACA]' }
        : { label: 'Series Tied', color: 'text-[#FEF08A]' };

  const matchDeltaLabel = iWon ? '+1 Win' : isTie ? '+1 Draw' : '+1 Loss';
  const matchDeltaColor = iWon
    ? 'text-[#00ffaa]'
    : isTie
      ? 'text-[#FEF08A]'
      : 'text-[#FECACA]';

  const winBarPct = (wins / totalMatches) * 100;
  const drawBarPct = (draws / totalMatches) * 100;
  const lossBarPct = (losses / totalMatches) * 100;

  const streakNote =
    rivalry && rivalry.currentStreak >= 2
      ? `${rivalry.currentStreak}W Streak`
      : rivalry && rivalry.currentStreak <= -2
        ? `${Math.abs(rivalry.currentStreak)}L Skid`
        : `${winPct}% Win Rate`;

  return (
    <div
      className="bg-[#05070B] border border-[#00ffaa]/70 rounded-[2px] p-3.5 mb-4"
      aria-label="Rivalry Update"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0 flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-[#00ffaa] shrink-0" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
            Rivalry Update
          </span>
          <span className="font-mono text-[10px] font-medium text-[#F8FAFC] truncate">
            vs {rivalry?.opponentName ?? opponentName}
          </span>
          <RivalBadgeIcon rivalry={rivalry} />
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase shrink-0 tabular-nums">
          <span className={matchDeltaColor}>{matchDeltaLabel}</span>
          <span className="text-[#FFFFFF]/70">·</span>
          <span className={seriesStatus.color}>{seriesStatus.label}</span>
        </div>
      </div>

      {/* Total Wins, Losses & Draws Summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-[#101520] border border-white/25 rounded-[2px] p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            Total Wins
          </div>
          <div className="font-mono text-lg sm:text-xl font-extrabold text-[#00ffaa] tabular-nums leading-tight mt-0.5">
            {wins}
          </div>
        </div>
        <div className="bg-[#101520] border border-white/25 rounded-[2px] p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            Total Losses
          </div>
          <div className="font-mono text-lg sm:text-xl font-extrabold text-[#FEE2E2] tabular-nums leading-tight mt-0.5">
            {losses}
          </div>
        </div>
        <div className="bg-[#101520] border border-white/25 rounded-[2px] p-2">
          <div className="font-mono text-[9px] uppercase tracking-wider text-[#F8FAFC]">
            {draws > 0 ? 'Draws · Matches' : 'Matches Played'}
          </div>
          <div className="font-mono text-lg sm:text-xl font-extrabold text-[#FFFFFF] tabular-nums leading-tight mt-0.5">
            {draws > 0 ? `${draws} · ${totalMatches}` : totalMatches}
          </div>
        </div>
      </div>

      {/* W-L-D Ratio Bar */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between font-mono text-[10px] text-[#F8FAFC] mb-1 tabular-nums">
          <span>
            Series Record: <strong className="text-[#FFFFFF]">{wins}W–{losses}L{draws > 0 ? `–${draws}D` : ''}</strong>
          </span>
          <span className="font-semibold text-[#FFFFFF]">{streakNote}</span>
        </div>
        <div className="w-full h-1.5 bg-white/15 rounded-[2px] overflow-hidden flex">
          {winBarPct > 0 && <div className="h-full bg-[#00ffaa]" style={{ width: `${winBarPct}%` }} />}
          {drawBarPct > 0 && <div className="h-full bg-[#FBBF24]" style={{ width: `${drawBarPct}%` }} />}
          {lossBarPct > 0 && <div className="h-full bg-[#EF4444]" style={{ width: `${lossBarPct}%` }} />}
        </div>
      </div>

      {/* Scoring Averages Head-to-Head Comparison */}
      <div className="bg-[#101520] border border-white/25 rounded-[2px] p-3">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider mb-2">
          <span className="text-[#F8FAFC] font-semibold">Scoring Averages</span>
          <span
            className={`font-bold tabular-nums ${
              avgDiff > 0.05 ? 'text-[#00ffaa]' : avgDiff < -0.05 ? 'text-[#FEE2E2]' : 'text-[#FEF08A]'
            }`}
          >
            Avg Margin {avgDiff >= 0 ? '+' : ''}
            {avgDiff.toFixed(1)} pts
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <div className="font-mono text-[10px] text-[#00ffaa] uppercase font-semibold truncate">
              Your Avg
            </div>
            <div className="font-mono text-lg sm:text-xl font-extrabold text-[#FFFFFF] tabular-nums leading-tight">
              {myAvg.toFixed(1)}{' '}
              <span className="text-[10px] font-medium text-[#F8FAFC] uppercase">pts/g</span>
            </div>
            <div className="font-mono text-[10px] text-[#F8FAFC] tabular-nums">
              {pointsFor} total · today {myScore}
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-[10px] text-[#FFFFFF] uppercase font-semibold truncate">
              {rivalry?.opponentName ?? opponentName} Avg
            </div>
            <div className="font-mono text-lg sm:text-xl font-extrabold text-[#FFFFFF] tabular-nums leading-tight">
              {oppAvg.toFixed(1)}{' '}
              <span className="text-[10px] font-medium text-[#F8FAFC] uppercase">pts/g</span>
            </div>
            <div className="font-mono text-[10px] text-[#F8FAFC] tabular-nums">
              {pointsAgainst} total · today {oppScore}
            </div>
          </div>
        </div>

        <div className="w-full h-1.5 bg-white/15 rounded-[2px] overflow-hidden flex">
          <div className="h-full bg-[#00ffaa]" style={{ width: `${mySharePct}%` }} />
          <div className="h-full bg-[#CBD5E1]" style={{ width: `${100 - mySharePct}%` }} />
        </div>
      </div>
    </div>
  );
};

const RivalriesCard: React.FC<{
  rivalries: RivalryRecord[];
  activeOpponentName?: string;
  hideActiveRival?: boolean;
  friendships?: FriendshipRecord[];
  friendStatuses?: Record<string, FriendPresence>;
  outgoingInvite?: MatchInvitePayload | null;
  onSendMatchInvite?: (targetUid: string, targetName: string, isRematch: boolean) => void;
}> = ({
  rivalries,
  activeOpponentName,
  hideActiveRival = false,
  friendships = [],
  friendStatuses = {},
  outgoingInvite = null,
  onSendMatchInvite,
}) => {
  const [showAll, setShowAll] = useState(false);

  const findOnlineFriendForRival = (opponentName: string) => {
    const clean = opponentName.trim().replace(/^@+/, '').toLowerCase();
    const match = friendships.find(
      (f) => f.status === 'ACCEPTED' && f.friendUsername.toLowerCase() === clean
    );
    if (!match) return null;
    const status = friendStatuses[match.friendUid] ?? 'OFFLINE';
    return { friend: match, isOnline: status === 'ONLINE' };
  };

  const activeKey = activeOpponentName ? normalizeOpponentKey(activeOpponentName) : null;
  const activeRival = activeKey
    ? rivalries.find((r) => r.opponentKey === activeKey) ?? null
    : null;

  const listedRivals = useMemo(() => {
    const rest = activeRival
      ? rivalries.filter((r) => r.opponentKey !== activeRival.opponentKey)
      : rivalries;
    return [...rest].sort((a, b) => {
      const aMatches = a.wins + a.losses + a.draws;
      const bMatches = b.wins + b.losses + b.draws;
      if (bMatches !== aMatches) return bMatches - aMatches;
      return b.lastPlayedAt - a.lastPlayedAt;
    });
  }, [activeRival, rivalries]);

  const visibleRivals = showAll ? listedRivals : listedRivals.slice(0, 4);

  if (hideActiveRival && listedRivals.length === 0) {
    return null;
  }

  const renderH2HBar = (r: RivalryRecord) => {
    const total = Math.max(1, r.wins + r.losses + r.draws);
    const winPct = (r.wins / total) * 100;
    const drawPct = (r.draws / total) * 100;
    const lossPct = (r.losses / total) * 100;
    return (
      <div className="w-full h-1.5 bg-[rgba(241,241,241,0.08)] rounded-[2px] overflow-hidden flex">
        {winPct > 0 && <div className="h-full bg-[#00ffaa]" style={{ width: `${winPct}%` }} />}
        {drawPct > 0 && <div className="h-full bg-[#FBBF24]" style={{ width: `${drawPct}%` }} />}
        {lossPct > 0 && <div className="h-full bg-[#EF4444]" style={{ width: `${lossPct}%` }} />}
      </div>
    );
  };

  const getSeriesStatus = (r: RivalryRecord) => {
    if (r.wins > r.losses) return { label: 'Series Lead', color: 'text-[#00ffaa]' };
    if (r.losses > r.wins) return { label: 'Trailing Series', color: 'text-[#FECACA]' };
    return { label: 'Series Tied', color: 'text-[#FEF08A]' };
  };

  return (
    <div
      className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 mb-4"
      aria-label="PVP Rivalries"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5 text-[#00ffaa]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
            {hideActiveRival ? 'Other PVP Rivals' : 'Rivalries'}
          </span>
        </div>
        <span className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
          {hideActiveRival
            ? `${listedRivals.length} ${listedRivals.length === 1 ? 'Other Rival' : 'Other Rivals'}`
            : rivalries.length > 0
              ? `${rivalries.length} ${rivalries.length === 1 ? 'Opponent' : 'Opponents'} Faced`
              : 'PVP Head-to-Head'}
        </span>
      </div>

      {rivalries.length === 0 ? (
        <div className="bg-[#101520] border border-white/25 rounded-[2px] px-3 py-2.5 text-xs font-medium text-[#F8FAFC]">
          No PVP rivalries recorded yet. Play Online 1v1 to track head-to-head series against specific opponents.
        </div>
      ) : (
        <div className="space-y-2">
          {!hideActiveRival && activeRival && (() => {
            const total = Math.max(1, activeRival.wins + activeRival.losses + activeRival.draws);
            const avgMargin = (activeRival.pointsFor - activeRival.pointsAgainst) / total;
            const status = getSeriesStatus(activeRival);
            const streakText =
              activeRival.currentStreak >= 2
                ? `${activeRival.currentStreak}W Streak`
                : activeRival.currentStreak <= -2
                  ? `${Math.abs(activeRival.currentStreak)}L Skid`
                  : null;
            return (
              <div className="bg-[#101520] border border-[#00ffaa]/70 rounded-[2px] p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs font-bold text-[#FFFFFF] truncate">
                      vs {activeRival.opponentName}
                    </span>
                    <span className={`font-mono text-[10px] font-bold uppercase ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="font-mono text-xs font-bold tabular-nums shrink-0">
                    <span className="text-[#00ffaa]">{activeRival.wins}W</span>
                    <span className="text-[#F8FAFC]">–</span>
                    <span className="text-[#FEE2E2]">{activeRival.losses}L</span>
                    <span className="text-[#F8FAFC]">–</span>
                    <span className="text-[#FEF08A]">{activeRival.draws}D</span>
                  </div>
                </div>

                {renderH2HBar(activeRival)}

                <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] font-medium text-[#F8FAFC] tabular-nums">
                  <span>
                    Total Pts: {activeRival.pointsFor}–{activeRival.pointsAgainst} (Avg{' '}
                    {avgMargin >= 0 ? '+' : ''}
                    {avgMargin.toFixed(1)})
                  </span>
                  <span className="font-mono font-bold text-[#FFFFFF]">
                    {streakText ?? `Last: ${activeRival.lastScoreFor}–${activeRival.lastScoreAgainst}`}
                  </span>
                </div>
              </div>
            );
          })()}

          {visibleRivals.length > 0 && (
            <div className="space-y-1.5">
              {!hideActiveRival && activeRival && (
                <div className="font-mono text-[10px] uppercase tracking-wider font-bold text-[#F8FAFC] pt-1">
                  Other PVP Rivals
                </div>
              )}
              {visibleRivals.map((r) => {
                const total = Math.max(1, r.wins + r.losses + r.draws);
                const winRate = Math.round((r.wins / total) * 100);
                const lastBadgeColor =
                  r.lastResult === 'WIN'
                    ? 'text-[#00ffaa]'
                    : r.lastResult === 'LOSS'
                      ? 'text-[#FEE2E2]'
                      : 'text-[#FEF08A]';
                return (
                  <div
                    key={r.opponentKey}
                    className="bg-[#101520] border border-white/25 rounded-[2px] px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-[#FFFFFF] truncate">
                          {r.opponentName}
                        </span>
                        <RivalBadgeIcon rivalry={r} />
                        <span className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums shrink-0">
                          {total} {total === 1 ? 'Match' : 'Matches'}
                        </span>
                      </div>
                      <div className="text-[10px] font-medium text-[#F8FAFC] tabular-nums mt-0.5">
                        Last:{' '}
                        <span className={`font-mono font-bold ${lastBadgeColor}`}>
                          {r.lastResult} {r.lastScoreFor}–{r.lastScoreAgainst}
                        </span>
                        {Math.abs(r.currentStreak) >= 2 && (
                          <span className="text-[#FFFFFF]">
                            {' '}
                            · {r.currentStreak > 0 ? `${r.currentStreak}W` : `${Math.abs(r.currentStreak)}L`} streak
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {(() => {
                        const info = findOnlineFriendForRival(r.opponentName);
                        if (!info || !info.isOnline || !onSendMatchInvite) return null;
                        const alreadySent = outgoingInvite?.toUid === info.friend.friendUid;
                        return (
                          <button
                            type="button"
                            disabled={Boolean(outgoingInvite)}
                            onClick={() =>
                              onSendMatchInvite(
                                info.friend.friendUid,
                                info.friend.friendUsername,
                                false
                              )
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-[2px] bg-[#04241B] hover:bg-[#00ffaa] border border-[#00ffaa]/75 text-[#A7F3D0] hover:text-[#05070B] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] font-mono text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {alreadySent ? 'Sent' : 'Challenge'}
                          </button>
                        );
                      })()}
                      <div className="text-right">
                        <div className="font-mono text-xs font-bold tabular-nums">
                          <span className="text-[#00ffaa]">{r.wins}W</span>
                          <span className="text-[#F8FAFC]">–</span>
                          <span className="text-[#FEE2E2]">{r.losses}L</span>
                          {r.draws > 0 && (
                            <>
                              <span className="text-[#F8FAFC]">–</span>
                              <span className="text-[#FEF08A]">{r.draws}D</span>
                            </>
                          )}
                        </div>
                        <div className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums">
                          {winRate}% Win
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {listedRivals.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="w-full py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold text-[#FFFFFF] bg-[#141824] hover:bg-[#1E2434] border border-white/30 rounded-[2px] transition-colors cursor-pointer"
            >
              {showAll ? 'Show Fewer Rivals' : `Show All Rivals (${listedRivals.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface ZoneSummary {
  rackIndex: number;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  attempts: number;
  made: number;
  pct: number;
  shots: ShotChartEntry[];
}

const CourtShotHeatMap: React.FC<{
  shots: ShotChartEntry[];
  secondWindCount: number;
}> = ({ shots, secondWindCount }) => {
  const [selectedRack, setSelectedRack] = useState<number | null>(null);

  const resolvedShots = useMemo(
    () => shots.filter((s) => s.status === 'MADE' || s.status === 'MISSED'),
    [shots]
  );

  const zones = useMemo<ZoneSummary[]>(() => {
    return RACK_CONFIGS.map((rack) => {
      const rackShots = resolvedShots.filter((s) => s.rackIndex === rack.id);
      const made = rackShots.filter((s) => s.status === 'MADE').length;
      const attempts = rackShots.length;
      const pct = attempts > 0 ? Math.round((made / attempts) * 100) : 0;
      return {
        rackIndex: rack.id,
        label: rack.label,
        shortLabel: rack.shortLabel,
        x: rack.x,
        y: rack.y,
        attempts,
        made,
        pct,
        shots: rackShots,
      };
    });
  }, [resolvedShots]);

  const activeZone =
    selectedRack !== null ? zones.find((z) => z.rackIndex === selectedRack) ?? null : null;

  // Fan multiple shots from the same rack spot cleanly along a tight arc so every shot is visible
  const plottedShots = useMemo(() => {
    const countsByRack = new Map<number, number>();
    const totalsByRack = new Map<number, number>();
    for (const s of resolvedShots) {
      totalsByRack.set(s.rackIndex, (totalsByRack.get(s.rackIndex) ?? 0) + 1);
    }

    return resolvedShots.map((s) => {
      const idx = countsByRack.get(s.rackIndex) ?? 0;
      countsByRack.set(s.rackIndex, idx + 1);
      const totalAtRack = totalsByRack.get(s.rackIndex) ?? 1;

      const dist = Math.hypot(s.x, s.y) || 1;
      const radX = s.x / dist;
      const radY = s.y / dist;
      const tanX = -radY;
      const tanY = radX;

      const row = Math.floor(idx / 5);
      const col = idx % 5;
      const rowCount = Math.min(5, totalAtRack - row * 5);
      const centeredCol = col - (rowCount - 1) / 2;
      const spreadT = centeredCol * 1.32;
      const spreadR = row * 1.45 - (totalAtRack > 5 ? 0.65 : 0);

      return {
        ...s,
        plotX: s.x + tanX * spreadT + radX * spreadR,
        plotY: s.y + tanY * spreadT + radY * spreadR,
      };
    });
  }, [resolvedShots]);

  const getHeatColor = (pct: number) => {
    if (pct >= 75) return '#6EE7B7';
    if (pct >= 45) return '#FEF08A';
    return '#FECACA';
  };

  return (
    <div
      className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 mb-4"
      aria-label="Court Floor Shot Heat Map"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
            Court Shot Heat Map
          </span>
          {secondWindCount > 0 && (
            <span className="font-mono text-[10px] font-bold text-[#A7F3D0] bg-[#04241B] border border-[#00ffaa]/70 px-1.5 py-0.5 rounded-[2px]">
              Second Wind ×{secondWindCount}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
          {activeZone
            ? `${activeZone.label}: ${activeZone.made}/${activeZone.attempts} (${activeZone.pct}%)`
            : `${resolvedShots.filter((s) => s.status === 'MADE').length}/${resolvedShots.length} Made · Tap spot to inspect`}
        </div>
      </div>

      {/* Half-Court Hardwood SVG Floor */}
      <div className="relative bg-[#0A0D14] border border-white/25 rounded-[2px] overflow-hidden">
        <svg
          viewBox="-26.5 -5.4 53 49.8"
          className="w-full h-auto block select-none"
          role="img"
          aria-label="Basketball half-court floor showing heat zones and made or missed shot markers"
        >
          <defs>
            <linearGradient id="courtWoodGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#261D15" />
              <stop offset="55%" stopColor="#211811" />
              <stop offset="100%" stopColor="#19130E" />
            </linearGradient>
            <radialGradient id="heatHot" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.62" />
              <stop offset="52%" stopColor="#34D399" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="heatWarm" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.58" />
              <stop offset="52%" stopColor="#F9631C" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="heatCold" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.56" />
              <stop offset="52%" stopColor="#DC2626" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Court Hardwood Floor */}
          <rect x="-25" y="-4.2" width="50" height="47" rx="0.6" fill="url(#courtWoodGrad)" />

          {/* Subtle Hardwood Plank Lines */}
          {[-20, -15, -10, -5, 0, 5, 10, 15, 20].map((px) => (
            <line
              key={px}
              x1={px}
              y1={-4.2}
              x2={px}
              y2={42.8}
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="0.14"
            />
          ))}

          {/* Paint / Key Area */}
          <rect
            x="-8"
            y="-4.2"
            width="16"
            height="19"
            fill="rgba(249, 99, 28, 0.08)"
            stroke="rgba(244, 239, 230, 0.24)"
            strokeWidth="0.24"
          />

          {/* Free-Throw Circle */}
          <circle
            cx="0"
            cy="14.8"
            r="6"
            fill="none"
            stroke="rgba(244, 239, 230, 0.22)"
            strokeWidth="0.22"
          />

          {/* Restricted Area Arc */}
          <path
            d="M -4 -1.25 A 4 4 0 0 0 4 -1.25"
            fill="none"
            stroke="rgba(244, 239, 230, 0.22)"
            strokeWidth="0.2"
          />

          {/* 3-Point Arc + Corner Lines */}
          <path
            d="M -22 -4.2 L -22 8.9 A 23.75 23.75 0 0 0 22 8.9 L 22 -4.2"
            fill="none"
            stroke="rgba(244, 239, 230, 0.34)"
            strokeWidth="0.28"
          />

          {/* Half-Court Center Circle Arc */}
          <path
            d="M -6 42.8 A 6 6 0 0 1 6 42.8"
            fill="none"
            stroke="rgba(244, 239, 230, 0.26)"
            strokeWidth="0.24"
          />

          {/* Outer Court Boundary */}
          <rect
            x="-25"
            y="-4.2"
            width="50"
            height="47"
            fill="none"
            stroke="rgba(244, 239, 230, 0.28)"
            strokeWidth="0.28"
          />

          {/* Backboard & Rim */}
          <line
            x1="-3"
            y1="-1.25"
            x2="3"
            y2="-1.25"
            stroke="#E2E8F0"
            strokeWidth="0.35"
            strokeLinecap="round"
          />
          <circle
            cx="0"
            cy="0"
            r="0.88"
            fill="none"
            stroke="#F9631C"
            strokeWidth="0.34"
          />

          {/* Radial Heat Zones on Court Floor */}
          {zones.map((z) => {
            if (z.attempts === 0) return null;
            const heatId =
              z.pct >= 75 ? 'url(#heatHot)' : z.pct >= 45 ? 'url(#heatWarm)' : 'url(#heatCold)';
            const radius = Math.min(7.8, 4.8 + z.attempts * 0.42);
            const isSelected = selectedRack === z.rackIndex;
            return (
              <g
                key={`zone-${z.rackIndex}`}
                className="cursor-pointer"
                onClick={() =>
                  setSelectedRack((prev) => (prev === z.rackIndex ? null : z.rackIndex))
                }
              >
                <circle cx={z.x} cy={z.y} r={radius} fill={heatId} />
                {isSelected && (
                  <circle
                    cx={z.x}
                    cy={z.y}
                    r={radius * 0.72}
                    fill="none"
                    stroke={getHeatColor(z.pct)}
                    strokeWidth="0.28"
                    strokeDasharray="0.8 0.5"
                  />
                )}
                <title>{`${z.label}: ${z.made}/${z.attempts} (${z.pct}%)`}</title>
              </g>
            );
          })}

          {/* Individual Shot Markers */}
          {plottedShots.map((s) => {
            const dimmed = selectedRack !== null && selectedRack !== s.rackIndex;
            const opacity = dimmed ? 0.28 : 0.96;
            if (s.status === 'MADE') {
              return (
                <g key={s.id} opacity={opacity}>
                  <circle
                    cx={s.plotX}
                    cy={s.plotY}
                    r={s.isMoney ? 0.78 : 0.66}
                    fill={s.isMoney ? '#F59E0B' : '#10B981'}
                    stroke="#0B0E14"
                    strokeWidth="0.22"
                  />
                  {s.isMoney && (
                    <circle
                      cx={s.plotX}
                      cy={s.plotY}
                      r={1.06}
                      fill="none"
                      stroke="#FDE047"
                      strokeWidth="0.16"
                    />
                  )}
                  <title>
                    {`${RACK_CONFIGS[s.rackIndex]?.label ?? 'Spot'} · ${s.isMoney ? 'Money Ball ' : ''}${s.isSwish ? 'Swish' : 'Made'} (+${s.pointsAwarded}) · ${s.timingQuality}`}
                  </title>
                </g>
              );
            }
            const r = 0.54;
            return (
              <g key={s.id} opacity={opacity}>
                <line
                  x1={s.plotX - r}
                  y1={s.plotY - r}
                  x2={s.plotX + r}
                  y2={s.plotY + r}
                  stroke="#EF4444"
                  strokeWidth="0.34"
                  strokeLinecap="round"
                />
                <line
                  x1={s.plotX + r}
                  y1={s.plotY - r}
                  x2={s.plotX - r}
                  y2={s.plotY + r}
                  stroke="#EF4444"
                  strokeWidth="0.34"
                  strokeLinecap="round"
                />
                <title>
                  {`${RACK_CONFIGS[s.rackIndex]?.label ?? 'Spot'} · Missed · ${s.timingQuality}`}
                </title>
              </g>
            );
          })}

          {/* Zone Percentage Labels */}
          {zones.map((z) => {
            if (z.attempts === 0) return null;
            const labelOffsetY =
              z.rackIndex === HALF_COURT_RACK_INDEX
                ? -2.9
                : z.rackIndex === 2
                  ? 3.2
                  : z.rackIndex === 0 || z.rackIndex === 5
                    ? 3.1
                    : 3.2;
            const labelX = z.rackIndex === 0 ? z.x + 2.4 : z.rackIndex === 5 ? z.x - 2.4 : z.x;
            const color = getHeatColor(z.pct);
            return (
              <g
                key={`lbl-${z.rackIndex}`}
                className="cursor-pointer"
                onClick={() =>
                  setSelectedRack((prev) => (prev === z.rackIndex ? null : z.rackIndex))
                }
              >
                <rect
                  x={labelX - 3.9}
                  y={z.y + labelOffsetY - 1.35}
                  width="7.8"
                  height="2.2"
                  rx="0.6"
                  fill="rgba(3, 5, 9, 0.98)"
                  stroke={selectedRack === z.rackIndex ? color : 'rgba(255,255,255,0.48)'}
                  strokeWidth="0.22"
                />
                <text
                  x={labelX}
                  y={z.y + labelOffsetY + 0.12}
                  textAnchor="middle"
                  fill={color}
                  fontSize="1.35"
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {`${z.made}/${z.attempts} ${z.pct}%`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Compact Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 font-mono text-[10px] font-medium text-[#F8FAFC]">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#6EE7B7]" />
            <span>Make</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24] ring-1 ring-[#FEF08A]" />
            <span>Money</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-mono font-bold text-[#FEE2E2] leading-none">×</span>
            <span>Miss</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#6EE7B7]" />
            <span>Hot ≥75%</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
            <span>Warm</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#FEE2E2]" />
            <span>Cold &lt;45%</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export const GameOverModal: React.FC<GameOverModalProps> = ({
  hud,
  playerName,
  myUid = null,
  friendships = [],
  friendStatuses = {},
  outgoingInvite = null,
  onPlayAgain,
  onRequestRematch,
  onAddFriend,
  onAcceptFriend,
  onSendMatchInvite,
  onCancelMatchInvite,
  onOpenHighlightReplay,
  onBackToTitle,
}) => {
  const [shareSnippet, setShareSnippet] = useState<ShareSnippetResult | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'IDLE' | 'IMAGE_COPIED' | 'TEXT_COPIED' | 'ERROR'>('IDLE');
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendStatusMsg, setFriendStatusMsg] = useState<string | null>(null);

  const handleOpenShare = async () => {
    setIsGeneratingShare(true);
    setCopyStatus('IDLE');
    setCopyNote(null);
    try {
      const snippet = await generateShareScorecard(hud, playerName);
      setShareSnippet(snippet);
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleCopyImage = async () => {
    if (!shareSnippet) return;
    setCopyNote(null);
    try {
      if (
        shareSnippet.blob &&
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': shareSnippet.blob }),
        ]);
        setCopyStatus('IMAGE_COPIED');
        setCopyNote('Visual scorecard copied to clipboard!');
        return;
      }
      throw new Error('Image clipboard unsupported');
    } catch {
      try {
        await navigator.clipboard.writeText(shareSnippet.textSummary);
        setCopyStatus('TEXT_COPIED');
        setCopyNote('Image clipboard blocked here — stats text copied! Use Download PNG to save the card.');
      } catch {
        setCopyStatus('ERROR');
        setCopyNote('Clipboard unavailable in this view — use Download PNG below.');
      }
    }
  };

  const handleCopyText = async () => {
    if (!shareSnippet) return;
    setCopyNote(null);
    try {
      await navigator.clipboard.writeText(shareSnippet.textSummary);
      setCopyStatus('TEXT_COPIED');
      setCopyNote('Stats summary copied to clipboard!');
    } catch {
      setCopyStatus('ERROR');
      setCopyNote('Clipboard blocked — use Download PNG below.');
    }
  };

  const handleNativeShare = async () => {
    if (!shareSnippet || typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return;
    }
    try {
      const file = shareSnippet.blob
        ? new File([shareSnippet.blob], shareSnippet.fileName, { type: 'image/png' })
        : null;
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Downtown 3 Scorecard',
          text: shareSnippet.textSummary,
          files: [file],
        });
      } else {
        await navigator.share({
          title: 'Downtown 3 Scorecard',
          text: shareSnippet.textSummary,
        });
      }
    } catch {
      // User dismissed share sheet
    }
  };

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const renderShareModal = () => {
    if (!shareSnippet) return null;
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Share Contest Scorecard"
      >
        <div className="w-full max-w-xl bg-[#0A0D14] border border-white/35 rounded-[4px] p-4 sm:p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00ffaa] mb-0.5">
                Scorecard Export
              </div>
              <h3 className="font-display text-2xl font-extrabold uppercase tracking-tight text-[#FFFFFF] leading-none">
                Share Scorecard
              </h3>
              <p className="text-xs text-[#F8FAFC] mt-1">
                Copy your visual scorecard snippet or save as PNG
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShareSnippet(null)}
              aria-label="Close Share Scorecard"
              className="w-9 h-9 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-[2px] overflow-hidden border border-white/30 bg-[#05070B] mb-3.5">
            <img
              src={shareSnippet.dataUrl}
              alt="Downtown 3 visual scorecard showing score, best streak, and swish count"
              className="w-full h-auto block select-all"
            />
          </div>

          {copyNote && (
            <div
              className={`mb-3 px-3 py-2 rounded-[2px] font-mono text-[11px] font-semibold border ${
                copyStatus === 'ERROR'
                  ? 'bg-[#240A0E] border-[#FCA5A5]/75 text-[#FEE2E2]'
                  : 'bg-[#04241B] border-[#00ffaa]/75 text-[#A7F3D0]'
              }`}
            >
              {copyNote}
            </div>
          )}

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyImage}
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copyStatus === 'IMAGE_COPIED' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Image Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Image</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="min-h-[42px] px-3.5 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copyStatus === 'TEXT_COPIED' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#00ffaa]" />
                  <span>Text Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <a
              href={shareSnippet.dataUrl}
              download={shareSnippet.fileName}
              className="min-h-[42px] px-3.5 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </a>

            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="min-h-[42px] px-3.5 py-2 rounded-[2px] bg-[#FFFFFF] hover:bg-[#E2E8F0] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share...</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const fgPct =
    hud.attemptsCount > 0 ? Math.round((hud.madeCount / hud.attemptsCount) * 100) : 0;

  if (hud.mode === 'PVP' && hud.pvpMatch) {
    const me = hud.pvpMatch.players.find((p) => p.id === hud.myPlayerId);
    const opp = hud.pvpMatch.players.find((p) => p.id !== hud.myPlayerId);
    const iWon = hud.pvpMatch.winnerId === hud.myPlayerId;
    const isTie = hud.pvpMatch.isTie;
    const oppForfeited = hud.pvpMatch.forfeitById && hud.pvpMatch.forfeitById !== hud.myPlayerId;

    const myScore = me?.score ?? hud.score;
    const oppScore = opp?.score ?? 0;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="absolute inset-0 z-20 flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm p-3 sm:p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-7 shadow-2xl"
        >
          <div className="border-b border-white/30 pb-4 mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              {hud.pvpMatch.leagueName && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/75 font-mono text-[10px] font-bold uppercase tracking-wider text-[#A7F3D0] mb-1.5 max-w-full">
                  <Trophy className="w-3 h-3 shrink-0 text-[#00ffaa]" />
                  <span className="truncate">{hud.pvpMatch.leagueName} · Standings Updated</span>
                </div>
              )}
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC]">
                Online 1v1 Shootout{oppForfeited ? ' · Opponent Disconnected' : ''}
              </div>
              <h2
                className={`font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-none mt-1 whitespace-nowrap ${
                  iWon ? 'text-[#00ffaa]' : isTie ? 'text-[#FEF08A]' : 'text-[#FEE2E2]'
                }`}
              >
                {iWon ? 'Victory' : isTie ? 'Draw Match' : 'Defeat'}
              </h2>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC] whitespace-nowrap">
                Final Margin
              </div>
              <div className="font-mono text-lg sm:text-2xl font-bold text-[#FFFFFF] tabular-nums whitespace-nowrap mt-0.5">
                {myScore} – {oppScore}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[2px] p-3.5 sm:p-4">
              <div className="font-mono text-[11px] text-[#00ffaa] font-bold uppercase tracking-wider mb-1 truncate">
                {me?.name ?? 'You'}
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-[#FFFFFF] tabular-nums mb-2">
                {myScore}
              </div>
              <div className="font-mono text-[11px] font-medium text-[#F8FAFC] space-y-1 tabular-nums">
                <div>Made: {me?.madeCount ?? hud.madeCount}/{TOTAL_BALLS}</div>
                <div>Swishes: {me?.swishCount ?? hud.swishCount}</div>
                <div>Best Streak: {me?.bestStreak ?? hud.bestStreak}</div>
                <div className="pt-1 border-t border-white/25 text-[10px] text-[#FFFFFF]">
                  Record: {hud.career.pvpWins}W-{hud.career.pvpLosses}L-{hud.career.pvpDraws}D
                </div>
              </div>
            </div>

            <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 sm:p-4 flex flex-col justify-between">
              <div>
                <div className="font-mono text-[11px] text-[#FFFFFF] font-bold uppercase tracking-wider mb-1 truncate">
                  {opp?.name ?? 'Opponent'}
                </div>
                <div className="font-mono text-3xl sm:text-4xl font-bold text-[#FFFFFF] tabular-nums mb-2">
                  {oppScore}
                </div>
                <div className="font-mono text-[11px] font-medium text-[#F8FAFC] space-y-1 tabular-nums">
                  <div>Made: {opp?.madeCount ?? 0}/{TOTAL_BALLS}</div>
                  <div>Swishes: {opp?.swishCount ?? 0}</div>
                  <div>Best Streak: {opp?.bestStreak ?? 0}</div>
                  {opp?.record && (
                    <div className="pt-1 border-t border-white/25 text-[10px] text-[#FFFFFF]">
                      Record: {opp.record.wins}W-{opp.record.losses}L-{opp.record.draws}D
                    </div>
                  )}
                </div>
              </div>

              {myUid && opp?.uid && opp.uid !== myUid && (() => {
                const existing = friendships.find((f) => f.friendUid === opp.uid);
                if (existing?.status === 'ACCEPTED') {
                  return (
                    <div className="mt-2.5 pt-2 border-t border-white/25 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-[#00ffaa]">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Friends</span>
                    </div>
                  );
                }
                if (existing?.status === 'PENDING' && existing.isIncoming && onAcceptFriend) {
                  return (
                    <button
                      type="button"
                      disabled={friendBusy}
                      onClick={async () => {
                        setFriendBusy(true);
                        try {
                          await onAcceptFriend(existing.pairId, opp.name);
                          setFriendStatusMsg(`Added ${opp.name} as a friend.`);
                        } finally {
                          setFriendBusy(false);
                        }
                      }}
                      className="mt-2.5 w-full min-h-[38px] px-2.5 py-1.5 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-[10px] font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept Friend</span>
                    </button>
                  );
                }
                if (existing?.status === 'PENDING') {
                  return (
                    <div className="mt-2.5 pt-2 border-t border-white/25 font-mono text-[10px] font-semibold uppercase text-[#FEF08A]">
                      Friend Request Sent
                    </div>
                  );
                }
                if (!onAddFriend) return null;
                return (
                  <button
                    type="button"
                    disabled={friendBusy}
                    onClick={async () => {
                      if (!opp.uid) return;
                      setFriendBusy(true);
                      try {
                        await onAddFriend(opp.uid, opp.name);
                        setFriendStatusMsg(`Friend request sent to ${opp.name}.`);
                      } catch (err) {
                        setFriendStatusMsg(
                          err instanceof Error ? err.message : 'Could not send friend request.'
                        );
                      } finally {
                        setFriendBusy(false);
                      }
                    }}
                    className="mt-2.5 w-full min-h-[38px] px-2.5 py-1.5 rounded-[2px] bg-[#141824] hover:bg-[#00ffaa] border border-white/35 hover:border-[#00ffaa] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] disabled:border-white/20 text-[#FFFFFF] hover:text-[#05070B] font-mono text-[10px] font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{friendBusy ? 'Sending...' : 'Add Friend'}</span>
                  </button>
                );
              })()}
            </div>
          </div>

          {friendStatusMsg && (
            <div className="mb-3 px-3 py-2 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/75 font-mono text-[11px] font-semibold text-[#A7F3D0]">
              {friendStatusMsg}
            </div>
          )}

          {opp && (
            <RivalryUpdatePanel
              rivalry={
                hud.rivalries.find(
                  (r) => r.opponentKey === normalizeOpponentKey(opp.name)
                ) ?? null
              }
              opponentName={opp.name}
              myScore={myScore}
              oppScore={oppScore}
              iWon={iWon}
              isTie={isTie}
            />
          )}

          {hud.contestHighlight && onOpenHighlightReplay && (
            <BestShotHighlightCard
              highlight={hud.contestHighlight}
              onWatch={onOpenHighlightReplay}
            />
          )}

          <CourtShotHeatMap shots={hud.shotChart} secondWindCount={hud.secondWindCount} />

          <StaminaEfficiencyCard stats={hud.staminaEfficiency} />

          <ShotAccuracyChart breakdown={hud.timingBreakdown} />

          <CareerComparisonCard
            baseline={hud.careerBaseline}
            currentScore={myScore}
            currentBestStreak={me?.bestStreak ?? hud.bestStreak}
            swishCount={me?.swishCount ?? hud.swishCount}
            attemptsCount={me?.attemptsCount ?? hud.attemptsCount}
          />

          <RivalriesCard
            rivalries={hud.rivalries}
            activeOpponentName={opp?.name}
            hideActiveRival={Boolean(opp)}
            friendships={friendships}
            friendStatuses={friendStatuses}
            outgoingInvite={outgoingInvite}
            onSendMatchInvite={onSendMatchInvite}
          />

          {/* Career Totals Footer Strip */}
          <div className="grid grid-cols-4 gap-2 bg-[#05070B] border border-white/30 rounded-[2px] p-3 mb-5 text-center">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                Career Pts
              </div>
              <div className="font-mono text-sm font-bold text-[#00ffaa] tabular-nums">
                {hud.career.totalCareerScore}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                Career Makes
              </div>
              <div className="font-mono text-sm font-bold text-[#A7F3D0] tabular-nums">
                {hud.career.totalShotsMade}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                Best Streak
              </div>
              <div className="font-mono text-sm font-bold text-[#FEF08A] tabular-nums">
                {hud.career.allTimeBestStreak}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                W-L-D
              </div>
              <div className="font-mono text-sm font-bold text-[#FFFFFF] tabular-nums">
                {hud.career.pvpWins}-{hud.career.pvpLosses}-{hud.career.pvpDraws}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            {!oppForfeited && opp ? (
              <button
                type="button"
                disabled={me?.rematchReady}
                onClick={onRequestRematch}
                className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[48px] px-3 py-3 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-extrabold uppercase tracking-wide transition-colors cursor-pointer whitespace-nowrap text-center"
              >
                {me?.rematchReady
                  ? 'Waiting for Rival...'
                  : opp.rematchReady
                    ? 'Accept Rematch'
                    : 'Rematch'}
              </button>
            ) : opp?.uid && myUid && onSendMatchInvite ? (
              outgoingInvite?.toUid === opp.uid && onCancelMatchInvite ? (
                <button
                  type="button"
                  onClick={() => onCancelMatchInvite(outgoingInvite.inviteId)}
                  className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[48px] py-3 px-3.5 rounded-[2px] bg-[#1F1804] border border-[#FDE047]/80 text-[#FEF08A] hover:bg-[#2E2306] font-mono text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Rematch Sent · Cancel</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(outgoingInvite)}
                  onClick={() => onSendMatchInvite(opp.uid!, opp.name, true)}
                  className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[48px] py-3 px-3.5 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap text-center"
                >
                  Send Rematch Request
                </button>
              )
            ) : null}
            <div className="flex items-center gap-2.5 sm:contents">
              <button
                type="button"
                onClick={handleOpenShare}
                disabled={isGeneratingShare}
                className="flex-1 sm:flex-initial min-h-[48px] px-4 py-3 rounded-[2px] bg-[#FFFFFF] hover:bg-[#E2E8F0] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>{isGeneratingShare ? 'Creating...' : 'Share'}</span>
              </button>
              <button
                type="button"
                onClick={onBackToTitle}
                className="flex-1 sm:flex-initial min-h-[48px] px-4 py-3 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
              >
                Lobby
              </button>
            </div>
          </div>
        </motion.div>
        {renderShareModal()}
      </motion.div>
    );
  }

  const isHeatCheck = hud.mode === 'HEAT_CHECK';
  const isFastBreak = hud.mode === 'FAST_BREAK';
  const fastBreakFinalMs = hud.fastBreakFinishMs ?? hud.fastBreakElapsedMs;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm p-3 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-7 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-end justify-between gap-4 border-b border-white/30 pb-4 mb-4">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] mb-1">
              {isFastBreak
                ? 'Fast-Break Complete'
                : isHeatCheck
                  ? 'Heat Check Run Ended'
                  : 'Final Contest Score'}
              {isFastBreak && hud.fastBreakIsNewBest && (
                <span className="text-[#00ffaa] font-bold"> · New Record Time!</span>
              )}
              {!isFastBreak && hud.isNewBest && (
                <span className="text-[#00ffaa] font-bold"> · New Personal Best</span>
              )}
            </div>
            {isFastBreak ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <div className="font-mono text-3xl sm:text-5xl font-bold text-[#00ffaa] leading-none tabular-nums">
                  {formatFastBreakMs(fastBreakFinalMs)}
                </div>
                <div className="font-mono text-base sm:text-lg font-bold text-[#FFFFFF] tabular-nums whitespace-nowrap">
                  {hud.score} pts
                </div>
              </div>
            ) : (
              <div className="font-mono text-4xl sm:text-5xl font-bold text-[#FFFFFF] leading-none tabular-nums">
                {hud.score}
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F8FAFC] whitespace-nowrap">
              {isFastBreak ? 'Best Time' : 'Personal Best'}
            </div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-[#00ffaa] tabular-nums whitespace-nowrap mt-0.5">
              {isFastBreak
                ? hud.career.bestFastBreakMs > 0
                  ? formatFastBreakMs(hud.career.bestFastBreakMs)
                  : formatFastBreakMs(fastBreakFinalMs)
                : hud.career.bestScore}
            </div>
          </div>
        </div>

        {/* 4-Column Contest Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
          <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-2.5 sm:p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F8FAFC]">
              Made
            </div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#FFFFFF] tabular-nums">
              {isHeatCheck ? `${hud.madeCount}` : `${hud.madeCount}/${TOTAL_BALLS}`}
            </div>
          </div>
          <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-2.5 sm:p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F8FAFC]">
              Accuracy
            </div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#FFFFFF] tabular-nums">
              {fgPct}%
            </div>
          </div>
          <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-2.5 sm:p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F8FAFC]">
              {isHeatCheck ? 'Heat Streak' : 'Streak'}
            </div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#00ffaa] tabular-nums">
              {hud.bestStreak}
            </div>
          </div>
          <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-2.5 sm:p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#F8FAFC]">
              Money Balls
            </div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#FEF08A] tabular-nums">
              {isHeatCheck ? `${hud.moneyMadeCount}` : `${hud.moneyMadeCount}/${hud.moneyTotalCount}`}
            </div>
          </div>
        </div>

        {/* Fast-Break 5-Rack Split Breakdown */}
        {isFastBreak && (
          <div
            className="bg-[#05070B] border border-[#00ffaa]/75 rounded-[2px] p-3.5 mb-4"
            aria-label="Fast-Break Split Breakdown"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-[#00ffaa]" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFFFFF]">
                  6-Spot Split Breakdown
                </span>
              </div>
              <span className="font-mono text-[10px] font-semibold text-[#F8FAFC] tabular-nums">
                {hud.careerBaseline.bestFastBreakMs > 0
                  ? `vs PB ${formatFastBreakMs(hud.careerBaseline.bestFastBreakMs)}`
                  : '1st Time-Attack Run'}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {hud.fastBreakSplits.map((sp) => (
                <div
                  key={sp.rackIndex}
                  className="bg-[#101520] border border-white/30 rounded-[2px] p-2 text-center"
                >
                  <div className="font-mono text-[10px] font-bold text-[#00ffaa]">
                    {sp.shortLabel}
                  </div>
                  <div className="font-mono text-xs font-extrabold text-[#FFFFFF] tabular-nums mt-0.5">
                    {sp.lapMs !== null ? formatFastBreakMs(sp.lapMs) : '—'}
                  </div>
                  <div className="font-mono text-[10px] font-medium text-[#F8FAFC] tabular-nums">
                    {sp.cumulativeMs !== null ? `@${formatFastBreakMs(sp.cumulativeMs)}` : '—'}
                  </div>
                  {sp.deltaMs !== null && (
                    <div
                      className={`font-mono text-[10px] font-bold tabular-nums mt-0.5 ${
                        sp.deltaMs <= 0 ? 'text-[#00ffaa]' : 'text-[#FEE2E2]'
                      }`}
                    >
                      {formatSplitDeltaMs(sp.deltaMs)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best Shot Highlight Replay */}
        {hud.contestHighlight && onOpenHighlightReplay && (
          <BestShotHighlightCard
            highlight={hud.contestHighlight}
            onWatch={onOpenHighlightReplay}
          />
        )}

        {/* Court Floor Shot Heat Map */}
        <CourtShotHeatMap shots={hud.shotChart} secondWindCount={hud.secondWindCount} />

        {/* Stamina Efficiency Breakdown */}
        <StaminaEfficiencyCard stats={hud.staminaEfficiency} />

        {/* Post-Game Shot Accuracy Analysis Bar Chart */}
        <ShotAccuracyChart breakdown={hud.timingBreakdown} />

        {/* Historical Career Comparison */}
        <CareerComparisonCard
          baseline={hud.careerBaseline}
          currentScore={hud.score}
          currentBestStreak={hud.bestStreak}
          swishCount={hud.swishCount}
          attemptsCount={hud.attemptsCount}
        />

        {/* PVP Head-to-Head Rivalries */}
        <RivalriesCard
          rivalries={hud.rivalries}
          friendships={friendships}
          friendStatuses={friendStatuses}
          outgoingInvite={outgoingInvite}
          onSendMatchInvite={onSendMatchInvite}
        />

        {/* 6-Spot Shot Breakdown */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#F8FAFC] mb-2">
            <span>{isHeatCheck ? 'Active Rack Snapshot' : 'Rack + Half-Court Breakdown'}</span>
            <span>
              Swishes: {hud.swishCount} ·{' '}
              {isFastBreak
                ? `Finish: ${formatFastBreakMs(fastBreakFinalMs)}`
                : isHeatCheck
                  ? 'No Clock · Moving Hoop'
                  : `Left: ${hud.timeLeft.toFixed(1)}s`}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
            {RACK_CONFIGS.map((rack) => {
              const startIdx = getSlotIndex(rack.id, 0);
              const count = getRackBallCount(rack.id);
              const rackBalls = hud.balls.slice(startIdx, startIdx + count);
              const rackPts = rackBalls.reduce((sum, b) => sum + b.pointsAwarded, 0);
              return (
                <div
                  key={rack.id}
                  className="bg-[#05070B] border border-white/30 rounded-[2px] p-2 flex flex-col items-center gap-1.5"
                >
                  <span className="font-mono text-[10px] sm:text-[11px] font-bold text-[#FFFFFF] whitespace-nowrap">
                    {rack.shortLabel}
                  </span>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {rackBalls.map((b, i) => {
                      let color = 'bg-white/30';
                      if (b.status === 'MADE') {
                        color = b.isMoney ? 'bg-[#FBBF24]' : 'bg-[#00ffaa]';
                      } else if (b.status === 'MISSED') {
                        color = 'bg-[#F87171]';
                      }
                      return (
                        <span
                          key={i}
                          className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${color}`}
                          title={
                            b.status === 'MADE'
                              ? `+${b.pointsAwarded} (${b.multiplierUsed}x)`
                              : b.status
                          }
                        />
                      );
                    })}
                  </div>
                  <span className="font-mono text-xs font-bold text-[#FFFFFF] tabular-nums">
                    +{rackPts}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cumulative Career Stats Across All Sessions */}
        <div className="border-t border-white/30 pt-3.5 mb-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] font-bold text-[#F8FAFC] mb-2">
            Career Totals ({hud.career.contestsPlayed} Contests)
          </div>
          <div className="grid grid-cols-3 gap-2 text-center bg-[#05070B] border border-white/30 rounded-[2px] p-2.5">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                Career Score
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#00ffaa] tabular-nums">
                {hud.career.totalCareerScore}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                Shots Made
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#A7F3D0] tabular-nums">
                {hud.career.totalShotsMade}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#F8FAFC]">
                All-Time Streak
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#FEF08A] tabular-nums">
                {hud.career.allTimeBestStreak}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full sm:w-auto sm:flex-1 min-h-[48px] px-4 py-3 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap text-center"
          >
            Play Again
          </button>
          <div className="flex items-center gap-2.5 sm:contents">
            <button
              type="button"
              onClick={handleOpenShare}
              disabled={isGeneratingShare}
              className="flex-1 sm:flex-initial min-h-[48px] px-4 py-3 rounded-[2px] bg-[#FFFFFF] hover:bg-[#E2E8F0] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>{isGeneratingShare ? 'Creating...' : 'Share'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToTitle}
              className="flex-1 sm:flex-initial min-h-[48px] px-4 py-3 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
            >
              Lobby
            </button>
          </div>
        </div>
      </motion.div>
      {renderShareModal()}
    </motion.div>
  );
};
