import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { normalizeOpponentKey, normalizeSplitsArray } from './game/storage';
import {
  CareerStats,
  CourtRankingEntry,
  CourtThemeId,
  FriendshipRecord,
  FriendshipStatus,
  GlobalRankingEntry,
  PvpLeague,
  PvpLeagueMember,
  RivalryRecord,
  UserProfile,
} from './game/types';

const useSameOriginAuthProxy =
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:' &&
  window.location.hostname.endsWith('.run.app');

const runtimeFirebaseConfig = useSameOriginAuthProxy
  ? { ...firebaseConfig, authDomain: window.location.host }
  : firebaseConfig;

export const app = initializeApp(runtimeFirebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const firebaseOAuthClientId: string =
  typeof (firebaseConfig as { oAuthClientId?: unknown }).oAuthClientId === 'string'
    ? (firebaseConfig as { oAuthClientId: string }).oAuthClientId
    : '';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function validateUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 16) {
    return 'Username must be 3 to 16 characters.';
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return 'Use only letters, numbers, and underscores.';
  }
  return null;
}

export function suggestUsernameFromDisplayName(displayName: string | null | undefined): string {
  if (!displayName) return '';
  const cleaned = displayName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14);
  if (cleaned.length >= 3) return cleaned;
  return '';
}

export function mergeCareerStats(local: CareerStats, remote: CareerStats): CareerStats {
  const localFb = local.bestFastBreakMs > 0 ? local.bestFastBreakMs : 0;
  const remoteFb = remote.bestFastBreakMs > 0 ? remote.bestFastBreakMs : 0;
  let bestFastBreakMs = 0;
  let bestFastBreakSplitsMs = [0, 0, 0, 0, 0];
  if (localFb > 0 && remoteFb > 0) {
    if (localFb <= remoteFb) {
      bestFastBreakMs = localFb;
      bestFastBreakSplitsMs = normalizeSplitsArray(local.bestFastBreakSplitsMs);
    } else {
      bestFastBreakMs = remoteFb;
      bestFastBreakSplitsMs = normalizeSplitsArray(remote.bestFastBreakSplitsMs);
    }
  } else if (localFb > 0) {
    bestFastBreakMs = localFb;
    bestFastBreakSplitsMs = normalizeSplitsArray(local.bestFastBreakSplitsMs);
  } else if (remoteFb > 0) {
    bestFastBreakMs = remoteFb;
    bestFastBreakSplitsMs = normalizeSplitsArray(remote.bestFastBreakSplitsMs);
  }

  return {
    bestScore: Math.max(local.bestScore, remote.bestScore),
    totalShotsMade: Math.max(local.totalShotsMade, remote.totalShotsMade),
    totalShotsAttempted: Math.max(local.totalShotsAttempted, remote.totalShotsAttempted),
    totalCareerScore: Math.max(local.totalCareerScore, remote.totalCareerScore),
    allTimeBestStreak: Math.max(local.allTimeBestStreak, remote.allTimeBestStreak),
    contestsPlayed: Math.max(local.contestsPlayed, remote.contestsPlayed),
    totalSwishes: Math.max(local.totalSwishes, remote.totalSwishes),
    totalSwishTrackedAttempts: Math.max(
      local.totalSwishTrackedAttempts,
      remote.totalSwishTrackedAttempts
    ),
    totalBestStreakSum: Math.max(local.totalBestStreakSum, remote.totalBestStreakSum),
    streakTrackedContests: Math.max(
      local.streakTrackedContests,
      remote.streakTrackedContests
    ),
    pvpWins: Math.max(local.pvpWins, remote.pvpWins),
    pvpLosses: Math.max(local.pvpLosses, remote.pvpLosses),
    pvpDraws: Math.max(local.pvpDraws, remote.pvpDraws),
    bestFastBreakMs,
    bestFastBreakSplitsMs,
    fastBreakContests: Math.max(local.fastBreakContests, remote.fastBreakContests),
  };
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const snap = attempt === 0 ? await getDoc(docRef) : await getDocFromServer(docRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        uid: String(data.uid ?? uid),
        username: String(data.username ?? ''),
        bestScore: Math.max(0, Number(data.bestScore) || 0),
        totalShotsMade: Math.max(0, Number(data.totalShotsMade) || 0),
        totalShotsAttempted: Math.max(0, Number(data.totalShotsAttempted) || 0),
        totalCareerScore: Math.max(0, Number(data.totalCareerScore) || 0),
        allTimeBestStreak: Math.max(0, Number(data.allTimeBestStreak) || 0),
        contestsPlayed: Math.max(0, Number(data.contestsPlayed) || 0),
        totalSwishes: Math.max(0, Number(data.totalSwishes) || 0),
        totalSwishTrackedAttempts: Math.max(0, Number(data.totalSwishTrackedAttempts) || 0),
        totalBestStreakSum: Math.max(0, Number(data.totalBestStreakSum) || 0),
        streakTrackedContests: Math.max(0, Number(data.streakTrackedContests) || 0),
        pvpWins: Math.max(0, Number(data.pvpWins) || 0),
        pvpLosses: Math.max(0, Number(data.pvpLosses) || 0),
        pvpDraws: Math.max(0, Number(data.pvpDraws) || 0),
        bestFastBreakMs: Math.max(0, Math.min(3600000, Math.round(Number(data.bestFastBreakMs) || 0))),
        bestFastBreakSplitsMs: normalizeSplitsArray(data.bestFastBreakSplitsMs),
        fastBreakContests: Math.max(0, Math.round(Number(data.fastBreakContests) || 0)),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      const msg = error instanceof Error ? error.message : String(error);
      const isTransientOffline =
        attempt === 0 &&
        (code === 'unavailable' ||
          msg.includes('client is offline') ||
          msg.includes('Failed to get document'));
      if (isTransientOffline) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
  return null;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  const path = `usernames/${lower}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', lower));
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserProfileAtomic(
  uid: string,
  username: string,
  initialCareer: CareerStats
): Promise<UserProfile> {
  const cleanUsername = username.trim();
  const lower = cleanUsername.toLowerCase();
  const userPath = `users/${uid}`;

  try {
    const batch = writeBatch(db);
    const usernameRef = doc(db, 'usernames', lower);
    const userRef = doc(db, 'users', uid);

    batch.set(usernameRef, {
      uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });

    const made = Math.round(Math.max(0, initialCareer.totalShotsMade));
    const attempted = Math.round(Math.max(made, initialCareer.totalShotsAttempted));
    const swishes = Math.round(Math.max(0, initialCareer.totalSwishes));
    const swishAttempts = Math.round(
      Math.max(swishes, initialCareer.totalSwishTrackedAttempts)
    );

    const profileData = {
      uid,
      username: cleanUsername,
      usernameLower: lower,
      bestScore: Math.round(Math.max(0, initialCareer.bestScore)),
      totalShotsMade: made,
      totalShotsAttempted: attempted,
      totalCareerScore: Math.round(Math.max(0, initialCareer.totalCareerScore)),
      allTimeBestStreak: Math.round(Math.max(0, initialCareer.allTimeBestStreak)),
      contestsPlayed: Math.round(Math.max(0, initialCareer.contestsPlayed)),
      totalSwishes: swishes,
      totalSwishTrackedAttempts: swishAttempts,
      totalBestStreakSum: Math.round(Math.max(0, initialCareer.totalBestStreakSum)),
      streakTrackedContests: Math.round(Math.max(0, initialCareer.streakTrackedContests)),
      pvpWins: Math.round(Math.max(0, initialCareer.pvpWins)),
      pvpLosses: Math.round(Math.max(0, initialCareer.pvpLosses)),
      pvpDraws: Math.round(Math.max(0, initialCareer.pvpDraws)),
      bestFastBreakMs: Math.round(Math.max(0, Math.min(3600000, initialCareer.bestFastBreakMs))),
      bestFastBreakSplitsMs: normalizeSplitsArray(initialCareer.bestFastBreakSplitsMs),
      fastBreakContests: Math.round(Math.max(0, initialCareer.fastBreakContests)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(userRef, profileData);
    await batch.commit();

    const fresh = await fetchUserProfile(uid);
    return fresh ?? profileData;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserUsernameAtomic(
  uid: string,
  oldUsername: string,
  newUsername: string
): Promise<UserProfile> {
  const validationErr = validateUsername(newUsername);
  if (validationErr) {
    throw new Error(validationErr);
  }

  const cleanNew = newUsername.trim();
  const newLower = cleanNew.toLowerCase();
  const cleanOld = oldUsername.trim();
  const oldLower = cleanOld.toLowerCase();
  const userPath = `users/${uid}`;

  if (cleanNew === cleanOld) {
    const existingProfile = await fetchUserProfile(uid);
    if (existingProfile) return existingProfile;
  }

  try {
    const userRef = doc(db, 'users', uid);

    if (oldLower === newLower) {
      const claimRef = doc(db, 'usernames', newLower);
      const claimSnap = await getDoc(claimRef);
      if (!claimSnap.exists()) {
        const batch = writeBatch(db);
        batch.set(claimRef, {
          uid,
          username: cleanNew,
          createdAt: serverTimestamp(),
        });
        batch.update(userRef, {
          username: cleanNew,
          usernameLower: newLower,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      } else {
        await updateDoc(userRef, {
          username: cleanNew,
          usernameLower: newLower,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      const available = await isUsernameAvailable(cleanNew);
      if (!available) {
        throw new Error('That username is already taken.');
      }

      const batch = writeBatch(db);
      if (oldLower) {
        const oldClaimRef = doc(db, 'usernames', oldLower);
        const oldClaimSnap = await getDoc(oldClaimRef);
        if (oldClaimSnap.exists() && oldClaimSnap.data()?.uid === uid) {
          batch.delete(oldClaimRef);
        }
      }

      batch.set(doc(db, 'usernames', newLower), {
        uid,
        username: cleanNew,
        createdAt: serverTimestamp(),
      });
      batch.update(userRef, {
        username: cleanNew,
        usernameLower: newLower,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }

    const fresh = await fetchUserProfile(uid);
    if (!fresh) {
      throw new Error('Could not reload updated profile.');
    }
    void refreshCourtRankingUsernames(uid, cleanNew);
    return fresh;
  } catch (error) {
    if (error instanceof Error && error.message === 'That username is already taken.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncCareerStatsToFirestore(
  uid: string,
  career: CareerStats
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const made = Math.round(Math.max(0, career.totalShotsMade));
    const attempted = Math.round(Math.max(made, career.totalShotsAttempted));
    const swishes = Math.round(Math.max(0, career.totalSwishes));
    const swishAttempts = Math.round(Math.max(swishes, career.totalSwishTrackedAttempts));
    await updateDoc(doc(db, 'users', uid), {
      bestScore: Math.round(Math.max(0, career.bestScore)),
      totalShotsMade: made,
      totalShotsAttempted: attempted,
      totalCareerScore: Math.round(Math.max(0, career.totalCareerScore)),
      allTimeBestStreak: Math.round(Math.max(0, career.allTimeBestStreak)),
      contestsPlayed: Math.round(Math.max(0, career.contestsPlayed)),
      totalSwishes: swishes,
      totalSwishTrackedAttempts: swishAttempts,
      totalBestStreakSum: Math.round(Math.max(0, career.totalBestStreakSum)),
      streakTrackedContests: Math.round(Math.max(0, career.streakTrackedContests)),
      pvpWins: Math.round(Math.max(0, career.pvpWins)),
      pvpLosses: Math.round(Math.max(0, career.pvpLosses)),
      pvpDraws: Math.round(Math.max(0, career.pvpDraws)),
      bestFastBreakMs: Math.round(Math.max(0, Math.min(3600000, career.bestFastBreakMs))),
      bestFastBreakSplitsMs: normalizeSplitsArray(career.bestFastBreakSplitsMs),
      fastBreakContests: Math.round(Math.max(0, career.fastBreakContests)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function mergeRivalries(
  local: Record<string, RivalryRecord>,
  remote: Record<string, RivalryRecord>
): Record<string, RivalryRecord> {
  const merged: Record<string, RivalryRecord> = {};
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of allKeys) {
    const l = local[key];
    const r = remote[key];
    if (l && !r) {
      merged[key] = { ...l };
    } else if (r && !l) {
      merged[key] = { ...r };
    } else if (l && r) {
      const lTotal = l.wins + l.losses + l.draws;
      const rTotal = r.wins + r.losses + r.draws;
      if (rTotal > lTotal || (rTotal === lTotal && r.lastPlayedAt >= l.lastPlayedAt)) {
        merged[key] = { ...r };
      } else {
        merged[key] = { ...l };
      }
    }
  }
  return merged;
}

export async function fetchUserRivalries(
  uid: string
): Promise<Record<string, RivalryRecord>> {
  const path = `users/${uid}/rivalries`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'rivalries'));
    const map: Record<string, RivalryRecord> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const opponentName = String(data.opponentName ?? docSnap.id).trim().slice(0, 24);
      if (!opponentName) return;
      const opponentKey = normalizeOpponentKey(String(data.opponentKey ?? docSnap.id));
      const lastResult =
        data.lastResult === 'WIN' || data.lastResult === 'LOSS' || data.lastResult === 'DRAW'
          ? data.lastResult
          : 'DRAW';
      map[opponentKey] = {
        opponentKey,
        opponentName,
        wins: Math.max(0, Math.round(Number(data.wins) || 0)),
        losses: Math.max(0, Math.round(Number(data.losses) || 0)),
        draws: Math.max(0, Math.round(Number(data.draws) || 0)),
        pointsFor: Math.max(0, Math.round(Number(data.pointsFor) || 0)),
        pointsAgainst: Math.max(0, Math.round(Number(data.pointsAgainst) || 0)),
        lastScoreFor: Math.max(0, Math.round(Number(data.lastScoreFor) || 0)),
        lastScoreAgainst: Math.max(0, Math.round(Number(data.lastScoreAgainst) || 0)),
        lastResult,
        currentStreak: Math.round(Number(data.currentStreak) || 0),
        lastPlayedAt: Math.max(0, Math.round(Number(data.lastPlayedAt) || 0)),
      };
    });
    return map;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncRivalryToFirestore(
  uid: string,
  rivalry: RivalryRecord
): Promise<void> {
  const key = normalizeOpponentKey(rivalry.opponentKey || rivalry.opponentName);
  const path = `users/${uid}/rivalries/${key}`;
  try {
    await setDoc(doc(db, 'users', uid, 'rivalries', key), {
      opponentKey: key,
      opponentName: rivalry.opponentName.trim().slice(0, 24) || key,
      wins: Math.round(Math.max(0, rivalry.wins)),
      losses: Math.round(Math.max(0, rivalry.losses)),
      draws: Math.round(Math.max(0, rivalry.draws)),
      pointsFor: Math.round(Math.max(0, rivalry.pointsFor)),
      pointsAgainst: Math.round(Math.max(0, rivalry.pointsAgainst)),
      lastScoreFor: Math.round(Math.max(0, rivalry.lastScoreFor)),
      lastScoreAgainst: Math.round(Math.max(0, rivalry.lastScoreAgainst)),
      lastResult: rivalry.lastResult,
      currentStreak: Math.round(rivalry.currentStreak),
      lastPlayedAt: Math.round(Math.max(0, rivalry.lastPlayedAt)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Number(val) || 0;
}

function mapLeagueDoc(id: string, data: Record<string, unknown>): PvpLeague {
  return {
    id: String(data.id ?? id),
    name: String(data.name ?? 'League'),
    description: String(data.description ?? ''),
    code: String(data.code ?? ''),
    isPublic: Boolean(data.isPublic),
    ownerUid: String(data.ownerUid ?? ''),
    ownerName: String(data.ownerName ?? 'Commissioner'),
    memberUids: Array.isArray(data.memberUids)
      ? data.memberUids.filter((u): u is string => typeof u === 'string')
      : [],
    memberCount: Math.max(1, Number(data.memberCount) || 1),
    maxMembers: Math.max(2, Math.min(25, Number(data.maxMembers) || 16)),
    createdAtMs: toMillis(data.createdAt),
  };
}

function generateLeagueCodeCandidate(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createLeagueAtomic(
  uid: string,
  username: string,
  rawName: string,
  rawDescription: string,
  isPublic: boolean,
  maxMembers: number = 16
): Promise<PvpLeague> {
  const name = rawName.trim().slice(0, 28);
  if (name.length < 3) {
    throw new Error('League name must be at least 3 characters.');
  }
  const description = rawDescription.trim().slice(0, 120);
  const clampedMax = Math.max(2, Math.min(25, Math.round(maxMembers)));
  const cleanUsername = sanitizeBlueprintUsername(username);

  let chosenCode = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateLeagueCodeCandidate();
    const snap = await getDoc(doc(db, 'leagueCodes', candidate));
    if (!snap.exists()) {
      chosenCode = candidate;
      break;
    }
  }
  if (!chosenCode) {
    throw new Error('Could not reserve a unique league code. Please try again.');
  }

  const leagueId = `lg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `leagues/${leagueId}`;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'leagueCodes', chosenCode), {
      code: chosenCode,
      leagueId,
      leagueName: name,
      ownerUid: uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'leagues', leagueId), {
      id: leagueId,
      name,
      description,
      code: chosenCode,
      isPublic,
      ownerUid: uid,
      ownerName: cleanUsername,
      memberUids: [uid],
      memberCount: 1,
      maxMembers: clampedMax,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'leagues', leagueId, 'members', uid), {
      uid,
      username: cleanUsername,
      role: 'OWNER',
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      leaguePoints: 0,
      bestScore: 0,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid, 'leagues', leagueId), {
      leagueId,
      leagueName: name,
      code: chosenCode,
      role: 'OWNER',
      joinedAt: serverTimestamp(),
    });

    await batch.commit();
    const createdSnap = await getDoc(doc(db, 'leagues', leagueId));
    if (createdSnap.exists()) {
      return mapLeagueDoc(leagueId, createdSnap.data());
    }
    return {
      id: leagueId,
      name,
      description,
      code: chosenCode,
      isPublic,
      ownerUid: uid,
      ownerName: cleanUsername,
      memberUids: [uid],
      memberCount: 1,
      maxMembers: clampedMax,
      createdAtMs: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function joinLeagueByCode(
  rawCode: string,
  uid: string,
  username: string
): Promise<PvpLeague> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error('Enter a valid 6-character league invite code.');
  }
  const cleanUsername = sanitizeBlueprintUsername(username);

  const codeSnap = await getDoc(doc(db, 'leagueCodes', code));
  if (!codeSnap.exists()) {
    throw new Error('No league found with that invite code.');
  }

  const codeData = codeSnap.data();
  const leagueId = String(codeData.leagueId ?? '');
  const leagueName = String(codeData.leagueName ?? 'League');
  if (!leagueId) {
    throw new Error('Invalid league code record.');
  }

  // Check if user is already a member via their own member doc
  const existingMember = await getDoc(doc(db, 'leagues', leagueId, 'members', uid));
  if (existingMember.exists()) {
    const existingLeague = await getDoc(doc(db, 'leagues', leagueId));
    if (existingLeague.exists()) {
      return mapLeagueDoc(leagueId, existingLeague.data());
    }
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leagues', leagueId), {
      memberUids: arrayUnion(uid),
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'leagues', leagueId, 'members', uid), {
      uid,
      username: cleanUsername,
      role: 'MEMBER',
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      leaguePoints: 0,
      bestScore: 0,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid, 'leagues', leagueId), {
      leagueId,
      leagueName,
      code,
      role: 'MEMBER',
      joinedAt: serverTimestamp(),
    });
    await batch.commit();

    const joinedSnap = await getDoc(doc(db, 'leagues', leagueId));
    if (!joinedSnap.exists()) {
      throw new Error('Joined league, but failed to load details.');
    }
    return mapLeagueDoc(leagueId, joinedSnap.data());
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Missing or insufficient permissions')) {
      throw new Error('League is full or unavailable to join.');
    }
    handleFirestoreError(error, OperationType.WRITE, `leagues/${leagueId}`);
  }
}

export async function joinPublicLeague(
  league: PvpLeague,
  uid: string,
  username: string
): Promise<PvpLeague> {
  if (league.memberUids.includes(uid)) {
    return league;
  }
  if (league.memberCount >= league.maxMembers) {
    throw new Error('This league has reached its maximum capacity.');
  }
  const cleanUsername = sanitizeBlueprintUsername(username);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leagues', league.id), {
      memberUids: arrayUnion(uid),
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'leagues', league.id, 'members', uid), {
      uid,
      username: cleanUsername,
      role: 'MEMBER',
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      leaguePoints: 0,
      bestScore: 0,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid, 'leagues', league.id), {
      leagueId: league.id,
      leagueName: league.name,
      code: league.code,
      role: 'MEMBER',
      joinedAt: serverTimestamp(),
    });
    await batch.commit();

    const freshSnap = await getDoc(doc(db, 'leagues', league.id));
    return freshSnap.exists() ? mapLeagueDoc(league.id, freshSnap.data()) : league;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `leagues/${league.id}`);
  }
}

export async function leaveOrDisbandLeague(league: PvpLeague, uid: string): Promise<void> {
  const path = `leagues/${league.id}`;
  try {
    const batch = writeBatch(db);
    if (league.ownerUid === uid) {
      if (league.memberCount > 1) {
        throw new Error('Owners can only disband a league after all other members leave.');
      }
      batch.delete(doc(db, 'leagues', league.id, 'members', uid));
      batch.delete(doc(db, 'leagueCodes', league.code));
      batch.delete(doc(db, 'leagues', league.id));
      batch.delete(doc(db, 'users', uid, 'leagues', league.id));
    } else {
      batch.update(doc(db, 'leagues', league.id), {
        memberUids: arrayRemove(uid),
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'leagues', league.id, 'members', uid));
      batch.delete(doc(db, 'users', uid, 'leagues', league.id));
    }
    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Owners can only disband a league')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchMyLeagues(uid: string): Promise<PvpLeague[]> {
  const path = `users/${uid}/leagues`;
  try {
    const refSnap = await getDocs(collection(db, 'users', uid, 'leagues'));
    const leagueIds = refSnap.docs.map((d) => d.id);
    if (leagueIds.length === 0) return [];

    const snaps = await Promise.all(
      leagueIds.map(async (leagueId) => {
        try {
          return await getDoc(doc(db, 'leagues', leagueId));
        } catch {
          return null;
        }
      })
    );

    const results: PvpLeague[] = [];
    snaps.forEach((snap) => {
      if (snap && snap.exists()) {
        results.push(mapLeagueDoc(snap.id, snap.data()));
      }
    });
    results.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPublicLeagues(): Promise<PvpLeague[]> {
  const path = 'leagues';
  try {
    const q = query(collection(db, 'leagues'), where('isPublic', '==', true), limit(24));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => mapLeagueDoc(d.id, d.data()));
    list.sort((a, b) => {
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return b.createdAtMs - a.createdAtMs;
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchLeagueMembers(
  leagueId: string,
  memberUids: string[]
): Promise<PvpLeagueMember[]> {
  const path = `leagues/${leagueId}/members`;
  try {
    const snaps = await Promise.all(
      memberUids.map(async (mUid) => {
        try {
          return await getDoc(doc(db, 'leagues', leagueId, 'members', mUid));
        } catch {
          return null;
        }
      })
    );
    const list: PvpLeagueMember[] = [];
    snaps.forEach((snap) => {
      if (!snap || !snap.exists()) return;
      const d = snap.data();
      list.push({
        uid: String(d.uid ?? snap.id),
        username: String(d.username ?? 'Shooter'),
        role: d.role === 'OWNER' ? 'OWNER' : 'MEMBER',
        wins: Math.max(0, Number(d.wins) || 0),
        losses: Math.max(0, Number(d.losses) || 0),
        draws: Math.max(0, Number(d.draws) || 0),
        matchesPlayed: Math.max(0, Number(d.matchesPlayed) || 0),
        pointsFor: Math.max(0, Number(d.pointsFor) || 0),
        pointsAgainst: Math.max(0, Number(d.pointsAgainst) || 0),
        leaguePoints: Math.max(0, Number(d.leaguePoints) || 0),
        bestScore: Math.max(0, Number(d.bestScore) || 0),
        joinedAtMs: toMillis(d.joinedAt),
      });
    });

    list.sort((a, b) => {
      if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
      const diffA = a.pointsFor - a.pointsAgainst;
      const diffB = b.pointsFor - b.pointsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.bestScore - a.bestScore;
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function recordLeagueMatchResult(
  leagueId: string,
  uid: string,
  username: string,
  result: 'WIN' | 'LOSS' | 'DRAW',
  myScore: number,
  oppScore: number
): Promise<void> {
  const path = `leagues/${leagueId}/members/${uid}`;
  try {
    const memberRef = doc(db, 'leagues', leagueId, 'members', uid);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) return;
    const d = snap.data();

    const wins = Math.max(0, Number(d.wins) || 0) + (result === 'WIN' ? 1 : 0);
    const losses = Math.max(0, Number(d.losses) || 0) + (result === 'LOSS' ? 1 : 0);
    const draws = Math.max(0, Number(d.draws) || 0) + (result === 'DRAW' ? 1 : 0);
    const matchesPlayed = wins + losses + draws;
    const pointsFor = Math.max(0, Number(d.pointsFor) || 0) + Math.max(0, Math.round(myScore));
    const pointsAgainst =
      Math.max(0, Number(d.pointsAgainst) || 0) + Math.max(0, Math.round(oppScore));
    const leaguePoints = wins * 3 + draws;
    const bestScore = Math.max(Math.max(0, Number(d.bestScore) || 0), Math.max(0, Math.round(myScore)));
    const cleanName = username.trim()
      ? sanitizeBlueprintUsername(username)
      : sanitizeBlueprintUsername(String(d.username ?? 'Shooter'));

    await updateDoc(memberRef, {
      username: cleanName,
      wins,
      losses,
      draws,
      matchesPlayed,
      pointsFor,
      pointsAgainst,
      leaguePoints,
      bestScore,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function buildFriendshipPairId(uidA: string, uidB: string): {
  pairId: string;
  memberUids: [string, string];
} {
  const sorted = uidA < uidB ? ([uidA, uidB] as [string, string]) : ([uidB, uidA] as [string, string]);
  return {
    pairId: `${sorted[0]}_${sorted[1]}`,
    memberUids: sorted,
  };
}

function sanitizeBlueprintUsername(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
  if (cleaned.length >= 3) return cleaned;
  return `${cleaned}Shooter`.slice(0, 16);
}

function mapFriendshipDoc(
  id: string,
  data: Record<string, unknown>,
  viewerUid: string
): FriendshipRecord {
  const requesterUid = String(data.requesterUid ?? '');
  const requesterName = String(data.requesterName ?? 'Shooter');
  const recipientUid = String(data.recipientUid ?? '');
  const recipientName = String(data.recipientName ?? 'Shooter');
  const rawMembers = Array.isArray(data.memberUids)
    ? data.memberUids.filter((u): u is string => typeof u === 'string')
    : [requesterUid, recipientUid];
  const memberUids: [string, string] =
    rawMembers.length === 2
      ? [rawMembers[0], rawMembers[1]]
      : [requesterUid, recipientUid];
  const status: FriendshipStatus = data.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING';
  const isIncoming = recipientUid === viewerUid;
  const friendUid = requesterUid === viewerUid ? recipientUid : requesterUid;
  const friendUsername = requesterUid === viewerUid ? recipientName : requesterName;

  return {
    pairId: String(data.pairId ?? id),
    memberUids,
    requesterUid,
    requesterName,
    recipientUid,
    recipientName,
    friendUid,
    friendUsername,
    status,
    isIncoming,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function lookupUserByUsername(
  rawUsername: string
): Promise<{ uid: string; username: string } | null> {
  const cleaned = rawUsername.trim().replace(/^@+/, '');
  const err = validateUsername(cleaned);
  if (err) {
    throw new Error(err);
  }
  const lower = cleaned.toLowerCase();
  const path = `usernames/${lower}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', lower));
    if (!snap.exists()) return null;
    const d = snap.data();
    const uid = String(d.uid ?? '');
    const username = String(d.username ?? cleaned);
    if (!uid) return null;
    return { uid, username };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function sendFriendRequest(
  myUid: string,
  myUsername: string,
  targetUid: string,
  targetUsername: string
): Promise<'SENT' | 'ACCEPTED' | 'ALREADY_PENDING' | 'ALREADY_FRIENDS'> {
  if (!myUid || !targetUid) {
    throw new Error('Both players must be signed in to connect as friends.');
  }
  if (myUid === targetUid) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const { pairId, memberUids } = buildFriendshipPairId(myUid, targetUid);
  const path = `friendships/${pairId}`;
  const cleanMyName = sanitizeBlueprintUsername(myUsername);
  const cleanTargetName = sanitizeBlueprintUsername(targetUsername);

  try {
    const ref = doc(db, 'friendships', pairId);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      if (data.status === 'ACCEPTED') {
        return 'ALREADY_FRIENDS';
      }
      if (data.recipientUid === myUid) {
        await updateDoc(ref, {
          status: 'ACCEPTED',
          recipientName: cleanMyName,
          updatedAt: serverTimestamp(),
        });
        return 'ACCEPTED';
      }
      return 'ALREADY_PENDING';
    }

    await setDoc(ref, {
      pairId,
      memberUids,
      requesterUid: myUid,
      requesterName: cleanMyName,
      recipientUid: targetUid,
      recipientName: cleanTargetName,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'SENT';
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function sendFriendRequestByUsername(
  myUid: string,
  myUsername: string,
  rawTargetUsername: string
): Promise<{
  outcome: 'SENT' | 'ACCEPTED' | 'ALREADY_PENDING' | 'ALREADY_FRIENDS';
  targetUsername: string;
}> {
  const target = await lookupUserByUsername(rawTargetUsername);
  if (!target) {
    throw new Error('No shooter found with that @username.');
  }
  const outcome = await sendFriendRequest(myUid, myUsername, target.uid, target.username);
  return { outcome, targetUsername: target.username };
}

export async function acceptFriendRequest(
  pairId: string,
  myUsername: string
): Promise<void> {
  const path = `friendships/${pairId}`;
  try {
    await updateDoc(doc(db, 'friendships', pairId), {
      status: 'ACCEPTED',
      recipientName: sanitizeBlueprintUsername(myUsername),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function declineOrRemoveFriendship(pairId: string): Promise<void> {
  const path = `friendships/${pairId}`;
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToFriendships(
  uid: string,
  onUpdate: (friendships: FriendshipRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'friendships';
  const q = query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => mapFriendshipDoc(d.id, d.data(), uid));
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1;
        if (a.status === 'PENDING' && a.isIncoming !== b.isIncoming) {
          return a.isIncoming ? -1 : 1;
        }
        return b.updatedAtMs - a.updatedAtMs;
      });
      onUpdate(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

const VALID_COURT_IDS: CourtThemeId[] = [
  'wooden_gym',
  'street_asphalt',
  'neon_arena',
  'championship_gold',
];

function mapCourtRankingDoc(
  courtId: CourtThemeId,
  docId: string,
  data: Record<string, unknown>
): CourtRankingEntry {
  const bestScore = Math.max(0, Math.min(50000, Math.round(Number(data.bestScore) || 0)));
  const lastScore = Math.max(0, Math.min(bestScore, Math.round(Number(data.lastScore) || 0)));
  return {
    uid: String(data.uid ?? docId),
    courtId,
    username: String(data.username ?? 'Shooter'),
    bestScore,
    bestStreak: Math.max(0, Math.min(500, Math.round(Number(data.bestStreak) || 0))),
    totalSwishes: Math.max(0, Math.min(10000000, Math.round(Number(data.totalSwishes) || 0))),
    contestsPlayed: Math.max(1, Math.min(1000000, Math.round(Number(data.contestsPlayed) || 1))),
    lastScore,
    updatedAtMs: toMillis(data.updatedAt),
  };
}

async function refreshCourtRankingUsernames(uid: string, cleanUsername: string): Promise<void> {
  const safeName = sanitizeBlueprintUsername(cleanUsername);
  await Promise.all(
    VALID_COURT_IDS.map(async (courtId) => {
      try {
        const entryRef = doc(db, 'courtRankings', courtId, 'entries', uid);
        const snap = await getDoc(entryRef);
        if (snap.exists()) {
          await updateDoc(entryRef, {
            username: safeName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-fatal: court entry username also refreshes on next completed contest
      }
    }),
    (async () => {
      try {
        const globalRef = doc(db, 'pvpGlobalRankings', uid);
        const globalSnap = await getDoc(globalRef);
        if (globalSnap.exists()) {
          await updateDoc(globalRef, {
            username: safeName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-fatal: global PVP ranking username also refreshes on next PVP match
      }
    })(),
  );
}

export async function syncCourtRankingToFirestore(
  uid: string,
  username: string,
  courtId: CourtThemeId,
  contestScore: number,
  contestBestStreak: number,
  contestSwishes: number
): Promise<void> {
  const path = `courtRankings/${courtId}/entries/${uid}`;
  const cleanName = sanitizeBlueprintUsername(username);
  const clampedScore = Math.max(0, Math.min(50000, Math.round(contestScore)));
  const clampedStreak = Math.max(0, Math.min(500, Math.round(contestBestStreak)));
  const clampedSwishes = Math.max(0, Math.min(10000000, Math.round(contestSwishes)));

  try {
    const entryRef = doc(db, 'courtRankings', courtId, 'entries', uid);
    const existingSnap = await getDoc(entryRef);
    if (!existingSnap.exists()) {
      await setDoc(entryRef, {
        uid,
        courtId,
        username: cleanName,
        bestScore: clampedScore,
        bestStreak: clampedStreak,
        totalSwishes: clampedSwishes,
        contestsPlayed: 1,
        lastScore: clampedScore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existingSnap.data();
      const prevBestScore = Math.max(0, Math.min(50000, Math.round(Number(prev.bestScore) || 0)));
      const prevBestStreak = Math.max(0, Math.min(500, Math.round(Number(prev.bestStreak) || 0)));
      const prevSwishes = Math.max(
        0,
        Math.min(10000000, Math.round(Number(prev.totalSwishes) || 0))
      );
      const prevContests = Math.max(
        0,
        Math.min(1000000, Math.round(Number(prev.contestsPlayed) || 0))
      );
      await updateDoc(entryRef, {
        username: cleanName,
        bestScore: Math.max(prevBestScore, clampedScore),
        bestStreak: Math.max(prevBestStreak, clampedStreak),
        totalSwishes: Math.min(10000000, prevSwishes + clampedSwishes),
        contestsPlayed: Math.min(1000000, Math.max(1, prevContests + 1)),
        lastScore: clampedScore,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCourtRankings(
  courtId: CourtThemeId,
  currentUid?: string | null,
  topLimit = 25
): Promise<{
  entries: CourtRankingEntry[];
  myEntry: CourtRankingEntry | null;
  myRank: number | null;
}> {
  const path = `courtRankings/${courtId}/entries`;
  try {
    const q = query(
      collection(db, 'courtRankings', courtId, 'entries'),
      where('bestScore', '>=', 0),
      orderBy('bestScore', 'desc'),
      limit(topLimit)
    );
    const snap = await getDocs(q);
    const entries = snap.docs.map((d) => mapCourtRankingDoc(courtId, d.id, d.data()));
    entries.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      if (b.totalSwishes !== a.totalSwishes) return b.totalSwishes - a.totalSwishes;
      return a.updatedAtMs - b.updatedAtMs;
    });

    let myRank: number | null = null;
    let myEntry: CourtRankingEntry | null = null;
    if (currentUid) {
      const idx = entries.findIndex((entry) => entry.uid === currentUid);
      if (idx >= 0) {
        myRank = idx + 1;
        myEntry = entries[idx];
      } else {
        const mySnap = await getDoc(doc(db, 'courtRankings', courtId, 'entries', currentUid));
        if (mySnap.exists()) {
          myEntry = mapCourtRankingDoc(courtId, mySnap.id, mySnap.data());
        }
      }
    }

    return { entries, myEntry, myRank };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function normalizeCourtIdValue(raw: unknown): CourtThemeId {
  return VALID_COURT_IDS.includes(raw as CourtThemeId)
    ? (raw as CourtThemeId)
    : 'wooden_gym';
}

function mapGlobalRankingDoc(
  docId: string,
  data: Record<string, unknown>
): GlobalRankingEntry {
  const bestScore = Math.max(0, Math.min(50000, Math.round(Number(data.bestScore) || 0)));
  const lastScore = Math.max(0, Math.min(bestScore, Math.round(Number(data.lastScore) || 0)));
  const pvpWins = Math.max(0, Math.min(1000000, Math.round(Number(data.pvpWins) || 0)));
  const pvpLosses = Math.max(0, Math.min(1000000, Math.round(Number(data.pvpLosses) || 0)));
  const pvpDraws = Math.max(0, Math.min(1000000, Math.round(Number(data.pvpDraws) || 0)));
  const pvpMatchesPlayed = Math.max(
    1,
    Math.min(1000000, Math.round(Number(data.pvpMatchesPlayed) || pvpWins + pvpLosses + pvpDraws || 1))
  );
  return {
    uid: String(data.uid ?? docId),
    username: String(data.username ?? 'Shooter'),
    bestScore,
    bestCourtId: normalizeCourtIdValue(data.bestCourtId),
    bestStreak: Math.max(0, Math.min(500, Math.round(Number(data.bestStreak) || 0))),
    totalSwishes: Math.max(0, Math.min(10000000, Math.round(Number(data.totalSwishes) || 0))),
    pvpMatchesPlayed,
    pvpWins,
    pvpLosses,
    pvpDraws,
    lastScore,
    lastCourtId: normalizeCourtIdValue(data.lastCourtId),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function syncPvpGlobalRankingToFirestore(
  uid: string,
  username: string,
  courtId: CourtThemeId,
  matchScore: number,
  matchBestStreak: number,
  matchSwishes: number,
  result: 'WIN' | 'LOSS' | 'DRAW'
): Promise<void> {
  const path = `pvpGlobalRankings/${uid}`;
  const cleanName = sanitizeBlueprintUsername(username);
  const safeCourtId = normalizeCourtIdValue(courtId);
  const clampedScore = Math.max(0, Math.min(50000, Math.round(matchScore)));
  const clampedStreak = Math.max(0, Math.min(500, Math.round(matchBestStreak)));
  const clampedSwishes = Math.max(0, Math.min(10000000, Math.round(matchSwishes)));

  try {
    const entryRef = doc(db, 'pvpGlobalRankings', uid);
    const existingSnap = await getDoc(entryRef);
    if (!existingSnap.exists()) {
      const pvpWins = result === 'WIN' ? 1 : 0;
      const pvpLosses = result === 'LOSS' ? 1 : 0;
      const pvpDraws = result === 'DRAW' ? 1 : 0;
      await setDoc(entryRef, {
        uid,
        username: cleanName,
        bestScore: clampedScore,
        bestCourtId: safeCourtId,
        bestStreak: clampedStreak,
        totalSwishes: clampedSwishes,
        pvpMatchesPlayed: 1,
        pvpWins,
        pvpLosses,
        pvpDraws,
        lastScore: clampedScore,
        lastCourtId: safeCourtId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prev = existingSnap.data();
      const prevBestScore = Math.max(0, Math.min(50000, Math.round(Number(prev.bestScore) || 0)));
      const prevBestCourtId = normalizeCourtIdValue(prev.bestCourtId);
      const prevBestStreak = Math.max(0, Math.min(500, Math.round(Number(prev.bestStreak) || 0)));
      const prevSwishes = Math.max(
        0,
        Math.min(10000000, Math.round(Number(prev.totalSwishes) || 0))
      );
      const prevWins = Math.max(0, Math.min(1000000, Math.round(Number(prev.pvpWins) || 0)));
      const prevLosses = Math.max(0, Math.min(1000000, Math.round(Number(prev.pvpLosses) || 0)));
      const prevDraws = Math.max(0, Math.min(1000000, Math.round(Number(prev.pvpDraws) || 0)));

      const nextWins = Math.min(1000000, prevWins + (result === 'WIN' ? 1 : 0));
      const nextLosses = Math.min(1000000, prevLosses + (result === 'LOSS' ? 1 : 0));
      const nextDraws = Math.min(1000000, prevDraws + (result === 'DRAW' ? 1 : 0));
      const nextMatches = Math.min(1000000, Math.max(1, nextWins + nextLosses + nextDraws));

      await updateDoc(entryRef, {
        username: cleanName,
        bestScore: Math.max(prevBestScore, clampedScore),
        bestCourtId: clampedScore >= prevBestScore ? safeCourtId : prevBestCourtId,
        bestStreak: Math.max(prevBestStreak, clampedStreak),
        totalSwishes: Math.min(10000000, prevSwishes + clampedSwishes),
        pvpMatchesPlayed: nextMatches,
        pvpWins: nextWins,
        pvpLosses: nextLosses,
        pvpDraws: nextDraws,
        lastScore: clampedScore,
        lastCourtId: safeCourtId,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchGlobalRankings(
  currentUid?: string | null,
  topLimit = 100
): Promise<{
  entries: GlobalRankingEntry[];
  myEntry: GlobalRankingEntry | null;
  myRank: number | null;
}> {
  const path = 'pvpGlobalRankings';
  try {
    const q = query(
      collection(db, 'pvpGlobalRankings'),
      where('bestScore', '>=', 0),
      orderBy('bestScore', 'desc'),
      limit(topLimit)
    );
    const snap = await getDocs(q);
    const entries = snap.docs.map((d) => mapGlobalRankingDoc(d.id, d.data()));
    entries.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (b.pvpWins !== a.pvpWins) return b.pvpWins - a.pvpWins;
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      if (b.totalSwishes !== a.totalSwishes) return b.totalSwishes - a.totalSwishes;
      return a.updatedAtMs - b.updatedAtMs;
    });

    let myRank: number | null = null;
    let myEntry: GlobalRankingEntry | null = null;
    if (currentUid) {
      const idx = entries.findIndex((entry) => entry.uid === currentUid);
      if (idx >= 0) {
        myRank = idx + 1;
        myEntry = entries[idx];
      } else {
        const mySnap = await getDoc(doc(db, 'pvpGlobalRankings', currentUid));
        if (mySnap.exists()) {
          myEntry = mapGlobalRankingDoc(mySnap.id, mySnap.data());
        }
      }
    }

    return { entries, myEntry, myRank };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

