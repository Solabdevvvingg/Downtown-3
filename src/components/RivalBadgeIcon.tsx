import React from 'react';
import { Crown, Swords } from 'lucide-react';
import { normalizeOpponentKey } from '../game/storage';
import { RivalryRecord } from '../game/types';

export function findRivalryForUsername(
  rivalries: RivalryRecord[] | undefined,
  username: string | null | undefined,
  currentUsername?: string | null
): RivalryRecord | null {
  if (!rivalries || rivalries.length === 0 || !username) return null;
  const cleaned = username.replace(/^@/, '').trim();
  if (!cleaned) return null;
  const targetKey = normalizeOpponentKey(cleaned);

  if (currentUsername) {
    const meKey = normalizeOpponentKey(currentUsername.replace(/^@/, '').trim());
    if (meKey && meKey === targetKey) return null;
  }

  for (const r of rivalries) {
    if (r.wins + r.losses + r.draws <= 0) continue;
    const recKey = normalizeOpponentKey(r.opponentName);
    if (r.opponentKey === targetKey || recKey === targetKey) {
      return r;
    }
  }
  return null;
}

interface RivalBadgeIconProps {
  rivalry: RivalryRecord | null | undefined;
  className?: string;
}

export const RivalBadgeIcon: React.FC<RivalBadgeIconProps> = ({
  rivalry,
  className = '',
}) => {
  if (!rivalry || rivalry.wins + rivalry.losses + rivalry.draws <= 0) {
    return null;
  }

  const drawsSuffix = rivalry.draws > 0 ? `-${rivalry.draws}` : '';
  const diff = rivalry.pointsFor - rivalry.pointsAgainst;
  const diffLabel = `${diff >= 0 ? '+' : ''}${diff} pts`;

  const opponentDominates = rivalry.losses > rivalry.wins;
  const isTied = rivalry.wins === rivalry.losses;

  const tooltip = opponentDominates
    ? `Dominant Rival · Leads H2H ${rivalry.losses}-${rivalry.wins}${drawsSuffix} (${diffLabel})`
    : isTied
      ? `Rival · H2H Tied ${rivalry.wins}-${rivalry.losses}${drawsSuffix} (${diffLabel})`
      : `Rival · You Lead ${rivalry.wins}-${rivalry.losses}${drawsSuffix} (${diffLabel})`;

  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {opponentDominates ? (
        <Crown
          className="w-3.5 h-3.5 text-[#FCA5A5] drop-shadow-[0_0_5px_rgba(248,113,113,0.55)]"
          aria-hidden="true"
        />
      ) : (
        <Swords
          className={`w-3.5 h-3.5 ${
            isTied
              ? 'text-[#FEF08A] drop-shadow-[0_0_5px_rgba(253,224,71,0.45)]'
              : 'text-[#00ffaa] drop-shadow-[0_0_5px_rgba(0,255,170,0.45)]'
          }`}
          aria-hidden="true"
        />
      )}
    </span>
  );
};
