import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Globe,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  createLeagueAtomic,
  fetchLeagueMembers,
  fetchMyLeagues,
  fetchPublicLeagues,
  joinLeagueByCode,
  joinPublicLeague,
  leaveOrDisbandLeague,
} from '../firebase';
import { PvpLeague, PvpLeagueMember, RivalryRecord, UserProfile } from '../game/types';
import { findRivalryForUsername, RivalBadgeIcon } from './RivalBadgeIcon';

interface LeaguesModalProps {
  userProfile: UserProfile | null;
  activeLeague: PvpLeague | null;
  rivalries?: RivalryRecord[];
  onSelectActiveLeague: (league: PvpLeague | null) => void;
  onOpenAuth: () => void;
  onClose: () => void;
}

type LeagueTab = 'MY' | 'DISCOVER' | 'CREATE';

export const LeaguesModal: React.FC<LeaguesModalProps> = ({
  userProfile,
  activeLeague,
  rivalries = [],
  onSelectActiveLeague,
  onOpenAuth,
  onClose,
}) => {
  const [tab, setTab] = useState<LeagueTab>('MY');
  const [myLeagues, setMyLeagues] = useState<PvpLeague[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<PvpLeague[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<PvpLeague | null>(activeLeague);
  const [members, setMembers] = useState<PvpLeagueMember[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Join by code form
  const [inviteCode, setInviteCode] = useState('');

  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPublic, setNewPublic] = useState(true);
  const [newMaxMembers, setNewMaxMembers] = useState(16);

  const loadLeagues = useCallback(async () => {
    if (!userProfile) return;
    setLoadingList(true);
    setErrorMsg(null);
    try {
      const [mine, pub] = await Promise.all([
        fetchMyLeagues(userProfile.uid),
        fetchPublicLeagues(),
      ]);
      setMyLeagues(mine);
      setPublicLeagues(pub);

      setSelectedLeague((prev) => {
        if (prev) {
          const fresh = mine.find((l) => l.id === prev.id) ?? pub.find((l) => l.id === prev.id);
          if (fresh) return fresh;
        }
        if (activeLeague) {
          const freshActive = mine.find((l) => l.id === activeLeague.id);
          if (freshActive) return freshActive;
        }
        return mine[0] ?? null;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load leagues.');
    } finally {
      setLoadingList(false);
    }
  }, [activeLeague, userProfile]);

  useEffect(() => {
    void loadLeagues();
  }, [loadLeagues]);

  useEffect(() => {
    if (!selectedLeague || !userProfile) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    void fetchLeagueMembers(selectedLeague.id, selectedLeague.memberUids)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLeague, userProfile]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleJoinCodeSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!userProfile) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyAction(true);
    try {
      const joined = await joinLeagueByCode(
        inviteCode,
        userProfile.uid,
        userProfile.username
      );
      setInviteCode('');
      setSelectedLeague(joined);
      onSelectActiveLeague(joined);
      setTab('MY');
      setSuccessMsg(`Joined "${joined.name}" and set as active PVP league!`);
      await loadLeagues();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join league.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleJoinPublic = async (league: PvpLeague) => {
    if (!userProfile) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyAction(true);
    try {
      const joined = await joinPublicLeague(
        league,
        userProfile.uid,
        userProfile.username
      );
      setSelectedLeague(joined);
      onSelectActiveLeague(joined);
      setTab('MY');
      setSuccessMsg(`Joined "${joined.name}"!`);
      await loadLeagues();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join league.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!userProfile) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyAction(true);
    try {
      const created = await createLeagueAtomic(
        userProfile.uid,
        userProfile.username,
        newName,
        newDesc,
        newPublic,
        newMaxMembers
      );
      setNewName('');
      setNewDesc('');
      setSelectedLeague(created);
      onSelectActiveLeague(created);
      setTab('MY');
      setSuccessMsg(`League "${created.name}" created! Invite Code: ${created.code}`);
      await loadLeagues();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create league.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLeaveLeague = async (league: PvpLeague) => {
    if (!userProfile) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyAction(true);
    try {
      await leaveOrDisbandLeague(league, userProfile.uid);
      if (activeLeague?.id === league.id) {
        onSelectActiveLeague(null);
      }
      if (selectedLeague?.id === league.id) {
        setSelectedLeague(null);
      }
      setSuccessMsg(
        league.ownerUid === userProfile.uid
          ? `Disbanded "${league.name}".`
          : `Left "${league.name}".`
      );
      await loadLeagues();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not leave league.');
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#07090E]/92 backdrop-blur-sm p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="PVP Leagues"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="w-full max-w-3xl max-h-[90dvh] flex flex-col bg-[#0F1117] border border-white/25 rounded-[4px] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/20 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6EE7B7]">
              <Trophy className="w-3.5 h-3.5" />
              <span>Competitive PVP</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-white leading-none mt-1">
              PVP Leagues
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {userProfile && (
              <button
                type="button"
                onClick={() => void loadLeagues()}
                disabled={loadingList}
                title="Refresh leagues"
                className="w-9 h-9 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-65"
              >
                <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Leagues Modal"
              className="w-9 h-9 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!userProfile ? (
          <div className="p-6 text-center space-y-4">
            <Trophy className="w-10 h-10 text-[#6EE7B7] mx-auto" />
            <div>
              <h3 className="text-lg font-bold text-white">Sign In to Join PVP Leagues</h3>
              <p className="text-xs sm:text-sm text-[#E2E8F0] mt-1 max-w-md mx-auto">
                Create private or public leagues, track seasonal standings with friends, and queue directly against league rivals.
              </p>
            </div>
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#07090E] border border-white/25 rounded-[2px]">
              <button
                type="button"
                onClick={() => {
                  setTab('MY');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-[2px] font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  tab === 'MY'
                    ? 'bg-white text-[#05070B]'
                    : 'text-[#E2E8F0] hover:text-white hover:bg-white/10'
                }`}
              >
                My Leagues ({myLeagues.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('DISCOVER');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-[2px] font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  tab === 'DISCOVER'
                    ? 'bg-[#00ffaa] text-[#05070B]'
                    : 'text-[#E2E8F0] hover:text-white hover:bg-white/10'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Join League</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('CREATE');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-[2px] font-mono text-[11px] font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  tab === 'CREATE'
                    ? 'bg-[#00ffaa] text-[#05070B]'
                    : 'text-[#E2E8F0] hover:text-white hover:bg-white/10'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-[2px] bg-[#EF4444]/18 border border-[#FECACA]/60 text-xs font-semibold text-[#FECACA]">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="px-3.5 py-2.5 rounded-[2px] bg-[#00ffaa]/15 border border-[#00ffaa]/65 text-xs font-semibold text-[#6EE7B7]">
                {successMsg}
              </div>
            )}

            {tab === 'MY' && (
              <div className="space-y-4">
                {/* Active Queue Scope Banner */}
                <div className="bg-[#07090E] border border-white/25 rounded-[2px] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1] mr-1.5">
                      PVP Queue:
                    </span>
                    <span className="font-bold text-white">
                      {activeLeague ? `${activeLeague.name} (${activeLeague.code})` : 'Open Global Arena'}
                    </span>
                  </div>
                  {activeLeague && (
                    <button
                      type="button"
                      onClick={() => onSelectActiveLeague(null)}
                      className="px-2.5 py-1 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 font-mono text-[10px] font-bold uppercase text-white transition-colors cursor-pointer"
                    >
                      Switch to Global
                    </button>
                  )}
                </div>

                {myLeagues.length === 0 ? (
                  <div className="bg-[#07090E] border border-white/25 rounded-[2px] p-6 text-center space-y-3">
                    <p className="text-sm font-semibold text-white">
                      You aren’t in any PVP leagues yet.
                    </p>
                    <p className="text-xs text-[#CBD5E1]">
                      Join an open league, enter a 6-character invite code, or create your own league to start tracking standings.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setTab('DISCOVER')}
                        className="px-4 py-2 rounded-[2px] bg-white hover:bg-[#E2E8F0] text-[#05070B] font-mono text-xs font-extrabold uppercase cursor-pointer"
                      >
                        Browse / Join
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('CREATE')}
                        className="px-4 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-mono text-xs font-extrabold uppercase cursor-pointer"
                      >
                        Create League
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                    {/* Left League Selector List */}
                    <div className="md:col-span-2 space-y-2">
                      {myLeagues.map((league) => {
                        const isSelected = selectedLeague?.id === league.id;
                        const isActiveQueue = activeLeague?.id === league.id;
                        return (
                          <button
                            key={league.id}
                            type="button"
                            onClick={() => setSelectedLeague(league)}
                            className={`w-full text-left p-3 rounded-[2px] border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#161922] border-[#00ffaa]'
                                : 'bg-[#07090E] border-white/25 hover:border-white/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-white truncate">
                                {league.name}
                              </span>
                              {league.isPublic ? (
                                <Globe className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-[#FEF08A] shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1 font-mono text-[11px] font-medium text-[#E2E8F0] tabular-nums">
                              <span>
                                {league.memberCount}/{league.maxMembers} Members
                              </span>
                              <span className="text-[#6EE7B7] font-bold">
                                {league.code}
                              </span>
                            </div>
                            {isActiveQueue && (
                              <div className="mt-1.5 inline-block px-1.5 py-0.5 rounded-[2px] bg-[#00ffaa]/18 border border-[#00ffaa]/45 font-mono text-[10px] font-bold uppercase text-[#6EE7B7]">
                                Active PVP Queue
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right Selected League Standings */}
                    <div className="md:col-span-3 bg-[#07090E] border border-white/25 rounded-[2px] p-4 space-y-3.5">
                      {selectedLeague ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/20 pb-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold text-white truncate">
                                  {selectedLeague.name}
                                </h3>
                                <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[2px] bg-[#161922] border border-white/20 text-white">
                                  {selectedLeague.isPublic ? 'Public' : 'Private'}
                                </span>
                              </div>
                              {selectedLeague.description && (
                                <p className="text-xs text-[#E2E8F0] mt-1">
                                  {selectedLeague.description}
                                </p>
                              )}
                              <div className="font-mono text-[10px] font-medium text-[#CBD5E1] mt-1 flex items-center gap-1.5">
                                <span>Commissioner: @{selectedLeague.ownerName}</span>
                                <RivalBadgeIcon
                                  rivalry={findRivalryForUsername(
                                    rivalries,
                                    selectedLeague.ownerName,
                                    userProfile.username
                                  )}
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleCopyCode(selectedLeague.code)}
                              className="px-2.5 py-1.5 rounded-[2px] bg-[#161922] hover:bg-[#1E2330] border border-white/25 flex items-center gap-1.5 text-xs font-mono font-bold text-[#6EE7B7] cursor-pointer shrink-0"
                              title="Copy 6-character invite code"
                            >
                              {copiedCode === selectedLeague.code ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#6EE7B7]" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>{selectedLeague.code}</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Standings Table */}
                          <div>
                            <div className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                              <span>League Standings</span>
                              <span className="font-mono text-[10px] font-semibold text-[#CBD5E1]">
                                3 pts Win · 1 pt Draw
                              </span>
                            </div>

                            {loadingMembers ? (
                              <div className="py-6 text-center text-xs text-[#CBD5E1]">
                                Loading standings...
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                {members.map((m, idx) => {
                                  const diff = m.pointsFor - m.pointsAgainst;
                                  const isMe = m.uid === userProfile.uid;
                                  return (
                                    <div
                                      key={m.uid}
                                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-[2px] border text-xs ${
                                        isMe
                                          ? 'bg-[#161922] border-[#00ffaa]'
                                          : 'bg-[#0F1117] border-white/20'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`font-mono font-extrabold w-6 text-center shrink-0 ${
                                            idx === 0
                                              ? 'text-[#6EE7B7]'
                                              : idx === 1
                                                ? 'text-white'
                                                : idx === 2
                                                  ? 'text-[#FEF08A]'
                                                  : 'text-[#CBD5E1]'
                                          }`}
                                        >
                                          #{idx + 1}
                                        </span>
                                        <span className="font-bold text-white truncate">
                                          @{m.username}
                                        </span>
                                        {!isMe && (
                                          <RivalBadgeIcon
                                            rivalry={findRivalryForUsername(
                                              rivalries,
                                              m.username,
                                              userProfile.username
                                            )}
                                          />
                                        )}
                                        {m.role === 'OWNER' && (
                                          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] bg-[#00ffaa]/18 border border-[#00ffaa]/45 text-[#6EE7B7] shrink-0">
                                            COMMISH
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                                        <span className="text-[11px] font-semibold text-[#E2E8F0]">
                                          {m.wins}-{m.losses}
                                          {m.draws > 0 ? `-${m.draws}` : ''}
                                        </span>
                                        <span
                                          className={`text-[11px] font-semibold hidden sm:inline ${
                                            diff > 0
                                              ? 'text-[#6EE7B7]'
                                              : diff < 0
                                                ? 'text-[#FECACA]'
                                                : 'text-[#CBD5E1]'
                                          }`}
                                        >
                                          {diff >= 0 ? '+' : ''}
                                          {diff}
                                        </span>
                                        <span className="font-bold text-[#6EE7B7] min-w-[42px] text-right">
                                          {m.leaguePoints} pt
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* League Actions */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/20">
                            {activeLeague?.id === selectedLeague.id ? (
                              <button
                                type="button"
                                onClick={() => onSelectActiveLeague(null)}
                                className="flex-1 min-w-[180px] min-h-[44px] py-2.5 px-3 rounded-[2px] bg-[#00ffaa]/18 border border-[#00ffaa] text-[#6EE7B7] font-mono text-xs font-bold uppercase text-center cursor-pointer"
                              >
                                Active for PVP · Clear
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectActiveLeague(selectedLeague);
                                  onClose();
                                }}
                                className="flex-1 min-w-[180px] min-h-[44px] py-2.5 px-3 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-mono text-xs font-extrabold uppercase text-center cursor-pointer"
                              >
                                Play PVP in This League
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleLeaveLeague(selectedLeague)}
                              className="min-h-[44px] py-2.5 px-3 rounded-[2px] bg-[#161922] hover:bg-[#EF4444]/20 border border-white/25 hover:border-[#FECACA]/65 font-mono text-xs font-bold uppercase text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-65"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>
                                {selectedLeague.ownerUid === userProfile.uid ? 'Disband' : 'Leave'}
                              </span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-8 text-center text-xs text-[#CBD5E1]">
                          Select a league on the left to view standings.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'DISCOVER' && (
              <div className="space-y-4">
                {/* Join via 6-character invite code */}
                <form
                  onSubmit={handleJoinCodeSubmit}
                  className="bg-[#07090E] border border-white/25 rounded-[2px] p-4 space-y-2.5"
                >
                  <label
                    htmlFor="league-invite-code"
                    className="block font-mono text-[11px] uppercase tracking-wider font-bold text-white"
                  >
                    Join by 6-Character Invite Code
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="league-invite-code"
                      type="text"
                      maxLength={6}
                      value={inviteCode}
                      onChange={(ev) => setInviteCode(ev.target.value.toUpperCase())}
                      placeholder="e.g. HOOP42"
                      className="flex-1 px-3 py-2 rounded-[2px] bg-[#0F1117] border border-white/30 font-mono text-sm uppercase tracking-widest text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#00ffaa]"
                    />
                    <button
                      type="submit"
                      disabled={busyAction || inviteCode.trim().length < 6}
                      className="px-4 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:opacity-65 text-[#05070B] font-mono text-xs font-extrabold uppercase cursor-pointer whitespace-nowrap"
                    >
                      {busyAction ? 'Joining...' : 'Join Code'}
                    </button>
                  </div>
                </form>

                {/* Public League Directory */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider font-bold text-white">
                    <span>Public PVP Leagues</span>
                    <span className="text-[#CBD5E1]">{publicLeagues.length} Listed</span>
                  </div>

                  {publicLeagues.length === 0 ? (
                    <div className="bg-[#07090E] border border-white/25 rounded-[2px] p-5 text-center text-xs text-[#CBD5E1]">
                      No public leagues yet. Create one in the Create tab to kick off the season!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {publicLeagues.map((league) => {
                        const alreadyMember = league.memberUids.includes(userProfile.uid);
                        const isFull = league.memberCount >= league.maxMembers;
                        return (
                          <div
                            key={league.id}
                            className="bg-[#07090E] border border-white/25 rounded-[2px] p-3.5 flex flex-col justify-between gap-2.5"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-white truncate">
                                  {league.name}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-[#6EE7B7] shrink-0">
                                  {league.code}
                                </span>
                              </div>
                              {league.description && (
                                <p className="text-xs text-[#E2E8F0] mt-1 line-clamp-2">
                                  {league.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-2 font-mono text-[11px] text-[#E2E8F0] tabular-nums">
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3 h-3 text-[#6EE7B7]" />
                                  {league.memberCount}/{league.maxMembers}
                                </span>
                                <span className="truncate text-[#CBD5E1] inline-flex items-center gap-1.5">
                                  <span className="truncate">by @{league.ownerName}</span>
                                  <RivalBadgeIcon
                                    rivalry={findRivalryForUsername(
                                      rivalries,
                                      league.ownerName,
                                      userProfile.username
                                    )}
                                  />
                                </span>
                              </div>
                            </div>

                            {alreadyMember ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLeague(league);
                                  onSelectActiveLeague(league);
                                  setTab('MY');
                                }}
                                className="w-full py-2 rounded-[2px] bg-[#00ffaa]/18 border border-[#00ffaa] text-[#6EE7B7] font-mono text-[11px] font-bold uppercase cursor-pointer"
                              >
                                Member · View Standings
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyAction || isFull}
                                onClick={() => void handleJoinPublic(league)}
                                className="w-full py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:opacity-65 text-[#05070B] font-mono text-[11px] font-extrabold uppercase cursor-pointer"
                              >
                                {isFull ? 'League Full' : 'Join League'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'CREATE' && (
              <form
                onSubmit={handleCreateSubmit}
                className="bg-[#07090E] border border-white/25 rounded-[2px] p-4 sm:p-5 space-y-4"
              >
                <div>
                  <label htmlFor="new-league-name" className="block font-mono text-[11px] uppercase tracking-wider font-bold text-white mb-1.5">
                    League Name
                  </label>
                  <input
                    id="new-league-name"
                    type="text"
                    required
                    minLength={3}
                    maxLength={28}
                    value={newName}
                    onChange={(ev) => setNewName(ev.target.value)}
                    placeholder="e.g. Rucker Park Shooters"
                    className="w-full px-3.5 py-2.5 rounded-[2px] bg-[#0F1117] border border-white/30 text-sm text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#00ffaa]"
                  />
                </div>

                <div>
                  <label htmlFor="new-league-desc" className="block font-mono text-[11px] uppercase tracking-wider font-bold text-white mb-1.5">
                    Description (Optional)
                  </label>
                  <input
                    id="new-league-desc"
                    type="text"
                    maxLength={120}
                    value={newDesc}
                    onChange={(ev) => setNewDesc(ev.target.value)}
                    placeholder="Weekly 3-point crown · Best shooter wins"
                    className="w-full px-3.5 py-2.5 rounded-[2px] bg-[#0F1117] border border-white/30 text-sm text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#00ffaa]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-wider font-bold text-white mb-1.5">
                      Visibility
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#0F1117] border border-white/25 rounded-[2px]">
                      <button
                        type="button"
                        onClick={() => setNewPublic(true)}
                        className={`py-2 rounded-[2px] font-mono text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          newPublic ? 'bg-[#00ffaa] text-[#05070B]' : 'text-[#E2E8F0] hover:text-white'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Public</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPublic(false)}
                        className={`py-2 rounded-[2px] font-mono text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          !newPublic ? 'bg-white text-[#05070B]' : 'text-[#E2E8F0] hover:text-white'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Invite Only</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-league-cap" className="block font-mono text-[11px] uppercase tracking-wider font-bold text-white mb-1.5">
                      Max Shooters
                    </label>
                    <select
                      id="new-league-cap"
                      value={newMaxMembers}
                      onChange={(ev) => setNewMaxMembers(Number(ev.target.value))}
                      className="w-full px-3 py-2.5 rounded-[2px] bg-[#0F1117] border border-white/30 font-mono text-sm font-bold text-white focus:outline-none focus:border-[#00ffaa]"
                    >
                      <option value={4}>4 Shooters</option>
                      <option value={8}>8 Shooters</option>
                      <option value={12}>12 Shooters</option>
                      <option value={16}>16 Shooters</option>
                      <option value={25}>25 Shooters</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busyAction || newName.trim().length < 3}
                  className="w-full min-h-[48px] py-3.5 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:opacity-65 text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {busyAction ? 'Creating League...' : 'Create League'}
                </button>
              </form>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
