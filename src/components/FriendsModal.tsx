import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Clock,
  Swords,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  FriendPresence,
  FriendshipRecord,
  MatchInvitePayload,
  PvpLeague,
  RivalryRecord,
  UserProfile,
} from '../game/types';
import { findRivalryForUsername, RivalBadgeIcon } from './RivalBadgeIcon';

interface FriendsModalProps {
  userProfile: UserProfile | null;
  wsConnected: boolean;
  friendships: FriendshipRecord[];
  friendStatuses: Record<string, FriendPresence>;
  rivalries?: RivalryRecord[];
  activeLeague: PvpLeague | null;
  outgoingInvite: MatchInvitePayload | null;
  onAddFriendByUsername: (username: string) => Promise<{
    outcome: 'SENT' | 'ACCEPTED' | 'ALREADY_PENDING' | 'ALREADY_FRIENDS';
    targetUsername: string;
  }>;
  onAcceptFriendRequest: (pairId: string) => Promise<void>;
  onRemoveFriendship: (pairId: string) => Promise<void>;
  onSendMatchInvite: (targetUid: string, targetName: string, isRematch: boolean) => void;
  onCancelMatchInvite: (inviteId: string) => void;
  onCreatePrivateRoom: () => void;
  onOpenAuth: () => void;
  onClose: () => void;
}

const PRESENCE_META: Record<
  FriendPresence,
  { label: string; dotClass: string; textClass: string }
> = {
  ONLINE: {
    label: 'Online',
    dotClass: 'bg-[#00ffaa] shadow-[0_0_8px_rgba(0,255,170,0.85)]',
    textClass: 'text-[#00ffaa]',
  },
  QUEUED: {
    label: 'In Queue',
    dotClass: 'bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.75)]',
    textClass: 'text-[#7DD3FC]',
  },
  IN_MATCH: {
    label: 'In Match',
    dotClass: 'bg-[#FDE047] shadow-[0_0_8px_rgba(253,224,71,0.75)]',
    textClass: 'text-[#FEF08A]',
  },
  OFFLINE: {
    label: 'Offline',
    dotClass: 'bg-[#E2E8F0]',
    textClass: 'text-[#F1F5F9]',
  },
};

export const FriendsModal: React.FC<FriendsModalProps> = ({
  userProfile,
  wsConnected,
  friendships,
  friendStatuses,
  rivalries = [],
  activeLeague,
  outgoingInvite,
  onAddFriendByUsername,
  onAcceptFriendRequest,
  onRemoveFriendship,
  onSendMatchInvite,
  onCancelMatchInvite,
  onCreatePrivateRoom,
  onOpenAuth,
  onClose,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [busyAdd, setBusyAdd] = useState(false);
  const [busyPairId, setBusyPairId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const incomingRequests = useMemo(
    () => friendships.filter((f) => f.status === 'PENDING' && f.isIncoming),
    [friendships]
  );
  const sentRequests = useMemo(
    () => friendships.filter((f) => f.status === 'PENDING' && !f.isIncoming),
    [friendships]
  );
  const acceptedFriends = useMemo(() => {
    const rank: Record<FriendPresence, number> = {
      ONLINE: 0,
      QUEUED: 1,
      IN_MATCH: 2,
      OFFLINE: 3,
    };
    return friendships
      .filter((f) => f.status === 'ACCEPTED')
      .sort((a, b) => {
        const pa = friendStatuses[a.friendUid] ?? 'OFFLINE';
        const pb = friendStatuses[b.friendUid] ?? 'OFFLINE';
        if (rank[pa] !== rank[pb]) return rank[pa] - rank[pb];
        return a.friendUsername.localeCompare(b.friendUsername);
      });
  }, [friendStatuses, friendships]);

  const handleAddSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!userProfile || !searchInput.trim() || busyAdd) return;
    setFeedback(null);
    setBusyAdd(true);
    try {
      const res = await onAddFriendByUsername(searchInput.trim());
      setSearchInput('');
      if (res.outcome === 'SENT') {
        setFeedback({ type: 'ok', text: `Friend request sent to @${res.targetUsername}.` });
      } else if (res.outcome === 'ACCEPTED') {
        setFeedback({ type: 'ok', text: `@${res.targetUsername} had already requested you — now Friends!` });
      } else if (res.outcome === 'ALREADY_FRIENDS') {
        setFeedback({ type: 'ok', text: `You are already friends with @${res.targetUsername}.` });
      } else {
        setFeedback({ type: 'ok', text: `Friend request to @${res.targetUsername} is already pending.` });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not send friend request.',
      });
    } finally {
      setBusyAdd(false);
    }
  };

  const handleAccept = async (f: FriendshipRecord) => {
    setFeedback(null);
    setBusyPairId(f.pairId);
    try {
      await onAcceptFriendRequest(f.pairId);
      setFeedback({ type: 'ok', text: `Added @${f.friendUsername} to your Friends roster.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not accept friend request.',
      });
    } finally {
      setBusyPairId(null);
    }
  };

  const handleRemove = async (f: FriendshipRecord, label: string) => {
    setFeedback(null);
    setBusyPairId(f.pairId);
    try {
      await onRemoveFriendship(f.pairId);
      setFeedback({ type: 'ok', text: label });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setBusyPairId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#05070B]/90 backdrop-blur-sm p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Friends & Match Requests"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="w-full max-w-xl max-h-[90dvh] flex flex-col bg-[#0A0D14] border border-white/35 rounded-[4px] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#05070B] border-b border-white/25 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#00ffaa]">
              Social &amp; Direct Challenges
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#FFFFFF] leading-none mt-1 truncate">
              Friends Roster
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Friends Roster"
            className="min-w-[44px] min-h-[44px] rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          {!userProfile ? (
            <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-5 text-center space-y-3">
              <div className="w-11 h-11 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/75 text-[#00ffaa] flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <div className="font-display text-xl font-extrabold uppercase tracking-tight text-[#FFFFFF]">
                Sign In to Connect with Rivals
              </div>
              <p className="text-xs text-[#F8FAFC] leading-relaxed max-w-sm mx-auto">
                Claim your persistent @username to add PVP opponents as friends, track live online status, and send instant 1v1 match requests.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="min-h-[48px] px-6 py-3 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Sign In / Create Handle
              </button>
            </div>
          ) : (
            <>
              {/* Add Friend by Username */}
              <form
                onSubmit={handleAddSubmit}
                className="bg-[#05070B] border border-white/30 rounded-[4px] p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="add-friend-username"
                    className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF]"
                  >
                    Add Shooter by @Username
                  </label>
                  <span className="font-mono text-[10px] font-semibold text-[#00ffaa]">
                    You: @{userProfile.username}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="add-friend-username"
                    type="text"
                    value={searchInput}
                    onChange={(ev) => setSearchInput(ev.target.value)}
                    placeholder="@shooter_handle"
                    maxLength={20}
                    className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-[2px] bg-[#0B0F17] border border-white/40 font-mono text-sm text-[#FFFFFF] placeholder:text-[#E2E8F0] focus:outline-none focus:border-[#00ffaa]"
                  />
                  <button
                    type="submit"
                    disabled={busyAdd || searchInput.trim().length < 3}
                    className="min-h-[44px] px-4 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{busyAdd ? 'Sending...' : 'Add'}</span>
                  </button>
                </div>
              </form>

              {feedback && (
                <div
                  className={`px-3.5 py-2.5 rounded-[2px] border font-mono text-xs font-semibold ${
                    feedback.type === 'err'
                      ? 'bg-[#240A0E] border-[#FCA5A5]/80 text-[#FEE2E2]'
                      : 'bg-[#04241B] border-[#00ffaa]/75 text-[#A7F3D0]'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              {activeLeague && (
                <div className="px-3.5 py-2 rounded-[2px] bg-[#04241B] border border-[#00ffaa]/70 flex items-center justify-between gap-2 font-mono text-[11px] text-[#A7F3D0]">
                  <span>League Mode Active: Match requests count toward</span>
                  <strong className="truncate max-w-[160px] text-[#FFFFFF]">{activeLeague.name}</strong>
                </div>
              )}

              {/* Incoming Friend Requests */}
              {incomingRequests.length > 0 && (
                <div className="space-y-2">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FEF08A]">
                    Incoming Friend Requests ({incomingRequests.length})
                  </div>
                  {incomingRequests.map((req) => (
                    <div
                      key={req.pairId}
                      className="bg-[#05070B] border border-[#FEF08A]/75 rounded-[4px] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-bold text-[#FFFFFF] truncate">
                            @{req.friendUsername}
                          </span>
                          <RivalBadgeIcon
                            rivalry={findRivalryForUsername(
                              rivalries,
                              req.friendUsername,
                              userProfile.username
                            )}
                          />
                        </div>
                        <div className="font-mono text-[10px] text-[#F8FAFC]">
                          Wants to add you as a rival &amp; friend
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyPairId === req.pairId}
                          onClick={() => void handleAccept(req)}
                          className="min-h-[44px] px-3.5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-bold uppercase inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyPairId === req.pairId}
                          onClick={() =>
                            void handleRemove(req, `Declined request from @${req.friendUsername}.`)
                          }
                          aria-label={`Decline friend request from ${req.friendUsername}`}
                          className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-[2px] bg-[#141824] hover:bg-[#240A0E] border border-white/35 text-[#FFFFFF] font-mono text-xs font-bold uppercase flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Accepted Friends Roster */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF]">
                    Friends ({acceptedFriends.length})
                  </span>
                  <span className="font-mono text-[10px] text-[#F8FAFC]">
                    {wsConnected ? 'Live Presence Active' : 'Connecting Arena...'}
                  </span>
                </div>

                {acceptedFriends.length === 0 ? (
                  <div className="bg-[#05070B] border border-white/30 rounded-[4px] p-4 text-xs text-[#F8FAFC] leading-relaxed">
                    No friends added yet. Search a shooter’s @username above or tap <strong className="text-[#FFFFFF]">Add Friend</strong> on any PVP post-game summary card.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {acceptedFriends.map((f) => {
                      const presence: FriendPresence = friendStatuses[f.friendUid] ?? 'OFFLINE';
                      const meta = PRESENCE_META[presence];
                      const isInvited = outgoingInvite?.toUid === f.friendUid;
                      const canChallenge = wsConnected && presence === 'ONLINE';

                      return (
                        <div
                          key={f.pairId}
                          className="bg-[#05070B] border border-white/30 rounded-[4px] p-3 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dotClass}`}
                                aria-hidden="true"
                              />
                              <span className="font-mono text-sm font-bold text-[#FFFFFF] truncate">
                                @{f.friendUsername}
                              </span>
                              <RivalBadgeIcon
                                rivalry={findRivalryForUsername(
                                  rivalries,
                                  f.friendUsername,
                                  userProfile.username
                                )}
                              />
                            </div>
                            <div className={`font-mono text-[10px] font-semibold uppercase tracking-wider mt-1 ${meta.textClass}`}>
                              {meta.label}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isInvited && outgoingInvite ? (
                              <button
                                type="button"
                                onClick={() => onCancelMatchInvite(outgoingInvite.inviteId)}
                                className="min-h-[44px] px-3 py-2 rounded-[2px] bg-[#1F1804] border border-[#FEF08A]/80 text-[#FEF08A] hover:bg-[#332707] font-mono text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Cancel Request</span>
                              </button>
                            ) : presence === 'OFFLINE' ? (
                              <button
                                type="button"
                                disabled={!wsConnected}
                                onClick={() => {
                                  onCreatePrivateRoom();
                                  onClose();
                                }}
                                title="Friend is offline — open a Private Room code to share"
                                className="min-h-[44px] px-3 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 disabled:bg-[#1A202C] disabled:text-[#F1F5F9] disabled:border-white/20 text-[#FFFFFF] font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                              >
                                Private Room
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canChallenge || Boolean(outgoingInvite)}
                                onClick={() => onSendMatchInvite(f.friendUid, f.friendUsername, false)}
                                title={
                                  presence !== 'ONLINE'
                                    ? `Cannot challenge while ${meta.label}`
                                    : outgoingInvite
                                      ? 'Finish or cancel your active request first'
                                      : 'Send 1v1 Match Request'
                                }
                                className="min-h-[44px] px-3.5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              >
                                <Swords className="w-3.5 h-3.5" />
                                <span>Match Request</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={busyPairId === f.pairId}
                              onClick={() =>
                                void handleRemove(f, `Removed @${f.friendUsername} from friends.`)
                              }
                              title={`Unfriend @${f.friendUsername}`}
                              aria-label={`Remove @${f.friendUsername} from friends`}
                              className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-[2px] bg-[#141824] hover:bg-[#240A0E] border border-white/30 text-[#FFFFFF] hover:text-[#FEE2E2] flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sent Pending Requests */}
              {sentRequests.length > 0 && (
                <div className="space-y-2">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF]">
                    Sent Requests ({sentRequests.length})
                  </div>
                  {sentRequests.map((req) => (
                    <div
                      key={req.pairId}
                      className="bg-[#05070B] border border-white/30 rounded-[4px] px-3.5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-[#FFFFFF] truncate">
                            @{req.friendUsername}
                          </span>
                          <RivalBadgeIcon
                            rivalry={findRivalryForUsername(
                              rivalries,
                              req.friendUsername,
                              userProfile.username
                            )}
                          />
                        </div>
                        <div className="font-mono text-[10px] text-[#F8FAFC]">
                          Awaiting response
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busyPairId === req.pairId}
                        onClick={() =>
                          void handleRemove(req, `Cancelled request to @${req.friendUsername}.`)
                        }
                        className="min-h-[44px] px-3 py-1.5 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-[10px] font-bold uppercase text-[#FFFFFF] cursor-pointer shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
