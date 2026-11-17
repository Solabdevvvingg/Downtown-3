import React from 'react';
import { BALLS_PER_RACK, RACK_CONFIGS } from '../game/constants';
import { HudSnapshot, TimingBreakdown } from '../game/types';

interface GameOverModalProps {
  hud: HudSnapshot;
  onPlayAgain: () => void;
  onRequestRematch: () => void;
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
      color: 'bg-[#F59E0B]',
      textColor: 'text-[#F59E0B]',
    },
    {
      key: 'good',
      label: 'Good',
      count: breakdown.good,
      color: 'bg-[#10B981]',
      textColor: 'text-[#10B981]',
    },
    {
      key: 'early',
      label: 'Early',
      count: breakdown.early,
      color: 'bg-[#38BDF8]',
      textColor: 'text-[#38BDF8]',
    },
    {
      key: 'late',
      label: 'Late',
      count: breakdown.late,
      color: 'bg-[#EF4444]',
      textColor: 'text-[#EF4444]',
    },
  ];

  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <div
      className="bg-white/4 border border-white/8 rounded-lg p-3.5 mb-4"
      aria-label="Shot Accuracy Analysis bar chart"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-semibold text-[#CBD5E1]">Shot Accuracy Analysis</div>
        <div className="text-[11px] text-[#94A3B8] tabular-nums">
          {total > 0 ? `${onTargetPct}% On-Target · ${total} Shots` : 'No releases recorded'}
        </div>
      </div>

      {/* Vertical Bar Chart */}
      <div className="relative bg-[#0B0E14]/65 border border-white/8 rounded-md px-3 pt-4 pb-2.5">
        {/* Horizontal reference lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-4 bottom-12 flex flex-col justify-between"
        >
          <div className="border-t border-dashed border-white/8" />
          <div className="border-t border-dashed border-white/8" />
          <div className="border-t border-white/12" />
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
                      item.count > 0 ? item.textColor : 'text-[#64748B]'
                    }`}
                  >
                    {item.count}
                  </span>
                  <div
                    className={`w-8 sm:w-10 rounded-t-sm transition-all duration-300 ${
                      item.count > 0 ? item.color : 'bg-white/10'
                    }`}
                    style={{ height: `${heightPct}%` }}
                    title={`${item.label}: ${item.count} (${pct}%)`}
                  />
                </div>
                <div className="mt-2 text-center leading-tight">
                  <div className="text-[11px] font-semibold text-[#E2E8F0]">{item.label}</div>
                  <div className="font-mono text-[10px] text-[#94A3B8] tabular-nums">
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

export const GameOverModal: React.FC<GameOverModalProps> = ({
  hud,
  onPlayAgain,
  onRequestRematch,
  onBackToTitle,
}) => {
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
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/82 p-3 sm:p-4">
        <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-xl p-5 sm:p-7">
          <div className="border-b border-white/10 pb-4 mb-4 flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#94A3B8]">
                Online 1v1 Shootout{oppForfeited ? ' · Opponent Disconnected' : ''}
              </div>
              <h2
                className={`font-display text-4xl sm:text-5xl font-extrabold leading-none mt-1 ${
                  iWon ? 'text-[#10B981]' : isTie ? 'text-[#F59E0B]' : 'text-[#EF4444]'
                }`}
              >
                {iWon ? 'Victory' : isTie ? 'Draw Match' : 'Defeat'}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#94A3B8]">Final Margin</div>
              <div className="font-mono text-2xl font-bold text-[#F4EFE6] tabular-nums">
                {myScore} – {oppScore}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/4 border border-[#F9631C]/35 rounded-lg p-3.5 sm:p-4">
              <div className="text-xs text-[#F9631C] font-semibold mb-1 truncate">
                {me?.name ?? 'You'}
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-[#F4EFE6] tabular-nums mb-2">
                {myScore}
              </div>
              <div className="text-xs text-[#94A3B8] space-y-1 tabular-nums">
                <div>Made: {me?.madeCount ?? hud.madeCount}/25</div>
                <div>Swishes: {me?.swishCount ?? hud.swishCount}</div>
                <div>Best Streak: {me?.bestStreak ?? hud.bestStreak}</div>
                <div className="pt-1 border-t border-white/8 text-[11px] font-mono">
                  Record: {hud.career.pvpWins}W-{hud.career.pvpLosses}L-{hud.career.pvpDraws}D
                </div>
              </div>
            </div>

            <div className="bg-white/4 border border-[#3B82F6]/35 rounded-lg p-3.5 sm:p-4">
              <div className="text-xs text-[#60A5FA] font-semibold mb-1 truncate">
                {opp?.name ?? 'Opponent'}
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold text-[#F4EFE6] tabular-nums mb-2">
                {oppScore}
              </div>
              <div className="text-xs text-[#94A3B8] space-y-1 tabular-nums">
                <div>Made: {opp?.madeCount ?? 0}/25</div>
                <div>Swishes: {opp?.swishCount ?? 0}</div>
                <div>Best Streak: {opp?.bestStreak ?? 0}</div>
                {opp?.record && (
                  <div className="pt-1 border-t border-white/8 text-[11px] font-mono text-[#93C5FD]">
                    Record: {opp.record.wins}W-{opp.record.losses}L-{opp.record.draws}D
                  </div>
                )}
              </div>
            </div>
          </div>

          <ShotAccuracyChart breakdown={hud.timingBreakdown} />

          {/* Career Totals Footer Strip */}
          <div className="grid grid-cols-4 gap-2 bg-white/4 rounded-lg p-3 mb-5 text-center">
            <div>
              <div className="text-[11px] text-[#94A3B8]">Career Pts</div>
              <div className="font-mono text-sm font-bold text-[#F59E0B] tabular-nums">
                {hud.career.totalCareerScore}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#94A3B8]">Career Makes</div>
              <div className="font-mono text-sm font-bold text-[#10B981] tabular-nums">
                {hud.career.totalShotsMade}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#94A3B8]">All-Time Streak</div>
              <div className="font-mono text-sm font-bold text-[#F9631C] tabular-nums">
                {hud.career.allTimeBestStreak}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#94A3B8]">W-L-D</div>
              <div className="font-mono text-sm font-bold text-[#F4EFE6] tabular-nums">
                {hud.career.pvpWins}-{hud.career.pvpLosses}-{hud.career.pvpDraws}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!oppForfeited && opp && (
              <button
                type="button"
                disabled={me?.rematchReady}
                onClick={onRequestRematch}
                className="flex-1 py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] disabled:opacity-60 text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-colors cursor-pointer whitespace-nowrap"
              >
                {me?.rematchReady
                  ? 'Waiting for Rival...'
                  : opp.rematchReady
                    ? 'Accept Rematch'
                    : 'Rematch'}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToTitle}
              className="px-5 py-3 rounded-lg bg-white/8 hover:bg-white/14 text-[#F4EFE6] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isHeatCheck = hud.mode === 'HEAT_CHECK';

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/82 p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-xl p-5 sm:p-7">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-4 mb-4">
          <div>
            <div className="text-xs font-medium text-[#94A3B8] mb-0.5">
              {isHeatCheck ? 'Heat Check Run Ended' : 'Final Contest Score'}
              {hud.isNewBest && (
                <span className="text-[#F59E0B] font-semibold"> · New Personal Best</span>
              )}
            </div>
            <div className="font-mono text-4xl sm:text-5xl font-bold text-[#F4EFE6] leading-none tabular-nums">
              {hud.score}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-[#94A3B8]">Personal Best</div>
            <div className="font-mono text-2xl font-bold text-[#CBD5E1] tabular-nums">
              {hud.career.bestScore}
            </div>
          </div>
        </div>

        {/* 4-Column Contest Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
          <div className="bg-white/4 rounded-lg p-2.5 sm:p-3">
            <div className="text-[11px] text-[#94A3B8]">Made</div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#F4EFE6] tabular-nums">
              {isHeatCheck ? `${hud.madeCount}` : `${hud.madeCount}/25`}
            </div>
          </div>
          <div className="bg-white/4 rounded-lg p-2.5 sm:p-3">
            <div className="text-[11px] text-[#94A3B8]">Accuracy</div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#F4EFE6] tabular-nums">
              {fgPct}%
            </div>
          </div>
          <div className="bg-white/4 rounded-lg p-2.5 sm:p-3">
            <div className="text-[11px] text-[#94A3B8]">{isHeatCheck ? 'Heat Streak' : 'Streak'}</div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#F9631C] tabular-nums">
              {hud.bestStreak}
            </div>
          </div>
          <div className="bg-white/4 rounded-lg p-2.5 sm:p-3">
            <div className="text-[11px] text-[#94A3B8]">Money Balls</div>
            <div className="font-mono text-lg sm:text-xl font-bold text-[#F59E0B] tabular-nums">
              {isHeatCheck ? `${hud.moneyMadeCount}` : `${hud.moneyMadeCount}/${hud.moneyTotalCount}`}
            </div>
          </div>
        </div>

        {/* Post-Game Shot Accuracy Analysis Bar Chart */}
        <ShotAccuracyChart breakdown={hud.timingBreakdown} />

        {/* 5-Rack Shot Breakdown */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-2">
            <span>{isHeatCheck ? 'Active Rack Snapshot' : 'Rack Breakdown'}</span>
            <span>
              Swishes: {hud.swishCount} ·{' '}
              {isHeatCheck ? 'No Clock · Moving Hoop' : `Left: ${hud.timeLeft.toFixed(1)}s`}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {RACK_CONFIGS.map((rack) => {
              const startIdx = rack.id * BALLS_PER_RACK;
              const rackBalls = hud.balls.slice(startIdx, startIdx + BALLS_PER_RACK);
              const rackPts = rackBalls.reduce((sum, b) => sum + b.pointsAwarded, 0);
              return (
                <div
                  key={rack.id}
                  className="bg-white/4 rounded-lg p-2 flex flex-col items-center gap-1.5"
                >
                  <span className="text-[10px] sm:text-[11px] font-medium text-[#CBD5E1] whitespace-nowrap">
                    {rack.shortLabel}
                  </span>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {rackBalls.map((b, i) => {
                      let color = 'bg-white/15';
                      if (b.status === 'MADE') {
                        color = b.isMoney ? 'bg-[#F59E0B]' : 'bg-[#10B981]';
                      } else if (b.status === 'MISSED') {
                        color = 'bg-[#EF4444]/70';
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
                  <span className="font-mono text-xs font-bold text-[#F4EFE6] tabular-nums">
                    +{rackPts}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cumulative Career Stats Across All Sessions */}
        <div className="border-t border-white/10 pt-3.5 mb-5">
          <div className="text-[11px] font-medium text-[#94A3B8] mb-2">
            Career Totals ({hud.career.contestsPlayed} Contests)
          </div>
          <div className="grid grid-cols-3 gap-2 text-center bg-white/4 rounded-lg p-2.5">
            <div>
              <div className="text-[10px] text-[#94A3B8]">Career Score</div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#F59E0B] tabular-nums">
                {hud.career.totalCareerScore}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#94A3B8]">Shots Made</div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#10B981] tabular-nums">
                {hud.career.totalShotsMade}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#94A3B8]">All-Time Streak</div>
              <div className="font-mono text-sm sm:text-base font-bold text-[#F9631C] tabular-nums">
                {hud.career.allTimeBestStreak}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-colors cursor-pointer whitespace-nowrap"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="px-4 py-3 rounded-lg bg-white/8 hover:bg-white/14 text-[#F4EFE6] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
