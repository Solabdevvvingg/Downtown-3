import { getRackBallCount, getSlotIndex, RACK_CONFIGS, TOTAL_BALLS } from './constants';
import { getCourtThemeConfig } from './courts';
import { formatFastBreakMs } from './timeFormat';
import { HudSnapshot } from './types';

export interface ShareSnippetResult {
  dataUrl: string;
  blob: Blob | null;
  textSummary: string;
  fileName: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function buildShareTextSummary(hud: HudSnapshot, playerName: string): string {
  const isPvp = hud.mode === 'PVP' && hud.pvpMatch;
  const me = isPvp ? hud.pvpMatch?.players.find((p) => p.id === hud.myPlayerId) : undefined;
  const opp = isPvp ? hud.pvpMatch?.players.find((p) => p.id !== hud.myPlayerId) : undefined;

  const finalScore = me?.score ?? hud.score;
  const finalStreak = me?.bestStreak ?? hud.bestStreak;
  const finalSwishes = me?.swishCount ?? hud.swishCount;
  const finalMade = me?.madeCount ?? hud.madeCount;
  const finalAttempts = me?.attemptsCount ?? hud.attemptsCount;
  const fgPct = finalAttempts > 0 ? Math.round((finalMade / finalAttempts) * 100) : 0;
  const court = getCourtThemeConfig(hud.courtTheme);

  const leagueTag = isPvp && hud.pvpMatch?.leagueName ? ` · ${hud.pvpMatch.leagueName}` : '';
  const modeTag = isPvp
    ? hud.pvpMatch?.winnerId === hud.myPlayerId
      ? `Online 1v1 Win (${finalScore}–${opp?.score ?? 0} vs ${opp?.name ?? 'Opponent'})${leagueTag}`
      : hud.pvpMatch?.isTie
        ? `Online 1v1 Draw (${finalScore}–${opp?.score ?? 0} vs ${opp?.name ?? 'Opponent'})${leagueTag}`
        : `Online 1v1 (${finalScore}–${opp?.score ?? 0} vs ${opp?.name ?? 'Opponent'})${leagueTag}`
    : hud.mode === 'FAST_BREAK'
      ? `Fast-Break (${formatFastBreakMs(hud.fastBreakFinishMs ?? hud.fastBreakElapsedMs)})`
      : hud.mode === 'HEAT_CHECK'
        ? 'Heat Check Run'
        : '3-Point Shootout';

  return [
    `DOWNTOWN 3 · ${modeTag}`,
    `Shooter: ${playerName} · Court: ${court.name}`,
    `Score: ${finalScore} pts | Streak: ${finalStreak} | Swishes: ${finalSwishes} (${finalMade}/${finalAttempts} · ${fgPct}% FG)`,
  ].join('\n');
}

export async function generateShareScorecard(
  hud: HudSnapshot,
  playerName: string
): Promise<ShareSnippetResult> {
  const width = 1080;
  const height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const court = getCourtThemeConfig(hud.courtTheme);
  const accent = '#00ffaa';

  const isPvp = hud.mode === 'PVP' && hud.pvpMatch;
  const me = isPvp ? hud.pvpMatch?.players.find((p) => p.id === hud.myPlayerId) : undefined;
  const opp = isPvp ? hud.pvpMatch?.players.find((p) => p.id !== hud.myPlayerId) : undefined;
  const finalScore = me?.score ?? hud.score;
  const finalStreak = me?.bestStreak ?? hud.bestStreak;
  const finalSwishes = me?.swishCount ?? hud.swishCount;
  const finalMade = me?.madeCount ?? hud.madeCount;
  const finalAttempts = me?.attemptsCount ?? hud.attemptsCount;
  const fgPct = finalAttempts > 0 ? Math.round((finalMade / finalAttempts) * 100) : 0;
  const swishPct = finalAttempts > 0 ? Math.round((finalSwishes / finalAttempts) * 100) : 0;

  if (ctx) {
    // 1. Variation 2 Deep Arena Gradient Backdrop
    const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.45, 40, width * 0.5, height * 0.45, 680);
    bgGrad.addColorStop(0, '#1a1c23');
    bgGrad.addColorStop(0.65, '#111216');
    bgGrad.addColorStop(1, '#0b0c10');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle court spotlight glow top-right & mint arena wash bottom-left
    const glow1 = ctx.createRadialGradient(width * 0.84, 90, 20, width * 0.84, 90, 440);
    glow1.addColorStop(0, 'rgba(0, 255, 170, 0.16)');
    glow1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(180, height * 0.88, 20, 180, height * 0.88, 380);
    glow2.addColorStop(0, `rgba(${court.palette.spotlightPrimary}, 0.14)`);
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    // Subtle 3-point arc watermark on right side
    ctx.save();
    ctx.strokeStyle = 'rgba(241, 241, 241, 0.06)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width - 140, height + 40, 360, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width - 140, height - 120, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Outer frame border & top accent bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 18, 18, width - 36, height - 36, 4);
    ctx.stroke();

    ctx.fillStyle = accent;
    drawRoundedRect(ctx, 48, 44, 8, 66, 2);
    ctx.fill();

    // Header Title + Player + Mode Tag
    ctx.fillStyle = accent;
    ctx.font = '800 40px "Syne", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DOWNTOWN 3', 72, 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 19px "Inter", sans-serif';
    const cleanPlayer = playerName.trim() || 'Shooter';
    ctx.fillText(`${cleanPlayer}  ·  ${court.name}`, 74, 90);

    // Right-side Mode / Result Tag
    const isFastBreak = hud.mode === 'FAST_BREAK';
    const fbFinishMs = hud.fastBreakFinishMs ?? hud.fastBreakElapsedMs;
    const badgeLabel = isPvp
      ? hud.pvpMatch?.winnerId === hud.myPlayerId
        ? `1V1 VICTORY  ·  ${finalScore}–${opp?.score ?? 0}`
        : hud.pvpMatch?.isTie
          ? `1V1 DRAW  ·  ${finalScore}–${opp?.score ?? 0}`
          : `1V1 FINAL  ·  ${finalScore}–${opp?.score ?? 0}`
      : isFastBreak
        ? `FAST-BREAK  ·  ${formatFastBreakMs(fbFinishMs)}`
        : hud.mode === 'HEAT_CHECK'
          ? 'HEAT CHECK RUN'
          : hud.isNewBest
            ? 'NEW PERSONAL BEST'
            : 'CONTEST SCORECARD';
    const badgeFill = isPvp
      ? hud.pvpMatch?.winnerId === hud.myPlayerId
        ? '#00ffaa'
        : hud.pvpMatch?.isTie
          ? '#FDE047'
          : '#FECACA'
      : isFastBreak
        ? '#00ffaa'
        : hud.isNewBest
          ? '#FDE047'
          : accent;

    ctx.font = '700 16px "Space Mono", monospace';
    const badgeTextW = ctx.measureText(badgeLabel).width;
    const badgeW = badgeTextW + 34;
    const badgeH = 38;
    const badgeX = width - 48 - badgeW;
    const badgeY = 52;
    ctx.fillStyle = badgeFill;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 2);
    ctx.fill();

    ctx.fillStyle = '#05070B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeLabel, badgeX + badgeW * 0.5, badgeY + badgeH * 0.5 + 1);

    // Divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, 134);
    ctx.lineTo(width - 48, 134);
    ctx.stroke();

    // 3 Primary Stat Cards: SCORE, BEST STREAK, SWISHES
    const cards = [
      {
        label: 'FINAL SCORE',
        value: `${finalScore}`,
        sub: hud.isNewBest ? 'NEW PERSONAL BEST' : `BEST: ${Math.max(hud.career.bestScore, finalScore)} PTS`,
        accentColor: '#FFFFFF',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        subColor: hud.isNewBest ? '#00ffaa' : '#E2E8F0',
      },
      {
        label: 'BEST STREAK',
        value: `${finalStreak}`,
        sub: finalStreak >= 5 ? 'LIGHTS OUT RUN' : `ALL-TIME: ${Math.max(hud.career.allTimeBestStreak, finalStreak)}`,
        accentColor: '#FDE047',
        borderColor: 'rgba(253, 224, 71, 0.5)',
        subColor: '#FEF08A',
      },
      {
        label: 'SWISH COUNT',
        value: `${finalSwishes}`,
        sub: `${swishPct}% SWISH RATE`,
        accentColor: '#00ffaa',
        borderColor: 'rgba(0, 255, 170, 0.5)',
        subColor: '#00ffaa',
      },
    ];

    const cardGap = 24;
    const cardW = (width - 96 - cardGap * 2) / 3;
    const cardH = 232;
    const cardY = 166;

    cards.forEach((c, idx) => {
      const cx = 48 + idx * (cardW + cardGap);
      ctx.fillStyle = '#07090E';
      drawRoundedRect(ctx, cx, cardY, cardW, cardH, 4);
      ctx.fill();

      ctx.strokeStyle = c.borderColor;
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, cx, cardY, cardW, cardH, 4);
      ctx.stroke();

      // Top inner accent line
      ctx.fillStyle = c.accentColor;
      drawRoundedRect(ctx, cx + 24, cardY + 20, 44, 3, 1);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '700 14px "Space Mono", monospace';
      ctx.fillText(c.label, cx + 24, cardY + 36);

      ctx.fillStyle = c.accentColor;
      ctx.font = '700 88px "Space Mono", monospace';
      ctx.fillText(c.value, cx + 22, cardY + 68);

      ctx.fillStyle = c.subColor;
      ctx.font = '700 14px "Space Mono", monospace';
      ctx.fillText(c.sub, cx + 24, cardY + 188);
    });

    // Bottom Summary Bar: Accuracy, Money Balls, and 5-Rack Shot Dots
    const footY = 432;
    const footH = 114;
    ctx.fillStyle = '#090B10';
    drawRoundedRect(ctx, 48, footY, width - 96, footH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 48, footY, width - 96, footH, 4);
    ctx.stroke();

    // Left bottom metrics
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.fillText('SHOTS MADE', 74, footY + 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 28px "Space Mono", monospace';
    ctx.fillText(
      hud.mode === 'HEAT_CHECK'
        ? `${finalMade}/${finalAttempts} (${fgPct}%)`
        : `${finalMade}/${TOTAL_BALLS} (${fgPct}%)`,
      74,
      footY + 46
    );

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.fillText('MONEY BALLS', 350, footY + 22);
    ctx.fillStyle = '#00ffaa';
    ctx.font = '700 28px "Space Mono", monospace';
    ctx.fillText(
      hud.mode === 'HEAT_CHECK' ? `${hud.moneyMadeCount}` : `${hud.moneyMadeCount}/${hud.moneyTotalCount}`,
      350,
      footY + 46
    );

    // Right bottom 6-spot (5 racks + Half Ct) dot visualizer
    ctx.textAlign = 'right';
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.fillText('RACK + HALF CT TRACKER', width - 74, footY + 22);

    const groupWidth = 82;
    const totalDotsW = (RACK_CONFIGS.length - 1) * groupWidth + 16;
    const rackStartX = width - 74 - totalDotsW;
    RACK_CONFIGS.forEach((rack, rIdx) => {
      const rx = rackStartX + rIdx * groupWidth;
      const ry = footY + 58;
      const startIdx = getSlotIndex(rack.id, 0);
      const count = getRackBallCount(rack.id);
      const rackBalls = hud.balls.slice(startIdx, startIdx + count);
      rackBalls.forEach((b, bIdx) => {
        const dotX = rx + bIdx * 15;
        let fill = 'rgba(255, 255, 255, 0.28)';
        if (b.status === 'MADE') {
          fill = b.isMoney ? '#FDE047' : '#00ffaa';
        } else if (b.status === 'MISSED') {
          fill = '#FCA5A5';
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(dotX, ry, b.isMoney ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  return {
    dataUrl,
    blob,
    textSummary: buildShareTextSummary(hud, playerName),
    fileName: `downtown3-score-${finalScore}-${dateSlug}.png`,
  };
}
