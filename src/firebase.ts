import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { CareerStats, UserProfile } from './game/types';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
  return {
    bestScore: Math.max(local.bestScore, remote.bestScore),
    totalShotsMade: Math.max(local.totalShotsMade, remote.totalShotsMade),
    totalShotsAttempted: Math.max(local.totalShotsAttempted, remote.totalShotsAttempted),
    totalCareerScore: Math.max(local.totalCareerScore, remote.totalCareerScore),
    allTimeBestStreak: Math.max(local.allTimeBestStreak, remote.allTimeBestStreak),
    contestsPlayed: Math.max(local.contestsPlayed, remote.contestsPlayed),
    pvpWins: Math.max(local.pvpWins, remote.pvpWins),
    pvpLosses: Math.max(local.pvpLosses, remote.pvpLosses),
    pvpDraws: Math.max(local.pvpDraws, remote.pvpDraws),
  };
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
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
      pvpWins: Math.max(0, Number(data.pvpWins) || 0),
      pvpLosses: Math.max(0, Number(data.pvpLosses) || 0),
      pvpDraws: Math.max(0, Number(data.pvpDraws) || 0),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
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
      pvpWins: Math.round(Math.max(0, initialCareer.pvpWins)),
      pvpLosses: Math.round(Math.max(0, initialCareer.pvpLosses)),
      pvpDraws: Math.round(Math.max(0, initialCareer.pvpDraws)),
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

export async function syncCareerStatsToFirestore(
  uid: string,
  career: CareerStats
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const made = Math.round(Math.max(0, career.totalShotsMade));
    const attempted = Math.round(Math.max(made, career.totalShotsAttempted));
    await updateDoc(doc(db, 'users', uid), {
      bestScore: Math.round(Math.max(0, career.bestScore)),
      totalShotsMade: made,
      totalShotsAttempted: attempted,
      totalCareerScore: Math.round(Math.max(0, career.totalCareerScore)),
      allTimeBestStreak: Math.round(Math.max(0, career.allTimeBestStreak)),
      contestsPlayed: Math.round(Math.max(0, career.contestsPlayed)),
      pvpWins: Math.round(Math.max(0, career.pvpWins)),
      pvpLosses: Math.round(Math.max(0, career.pvpLosses)),
      pvpDraws: Math.round(Math.max(0, career.pvpDraws)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
