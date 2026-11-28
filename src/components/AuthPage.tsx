import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { RefreshCw } from 'lucide-react';
import {
  auth,
  createUserProfileAtomic,
  firebaseOAuthClientId,
  googleProvider,
  isUsernameAvailable,
  suggestUsernameFromDisplayName,
  validateUsername,
} from '../firebase';
import { CareerStats, UserProfile } from '../game/types';

interface AuthPageProps {
  mode: 'AUTH' | 'USERNAME_SETUP' | 'PROFILE_ERROR';
  firebaseUser: User | null;
  career: CareerStats;
  profileSyncing?: boolean;
  profileLoadError?: string | null;
  onRetryProfileLoad?: () => void;
  onProfileReady: (profile: UserProfile) => void;
  onContinueAsGuest: () => void;
}

interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GisPopupError {
  type?: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
  message?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleIdentityApi {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: GisTokenResponse) => void;
        error_callback?: (err: GisPopupError) => void;
      }) => GisTokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

function mapAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';

  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In is disabled in Firebase Console. Enable Google under Authentication → Sign-in method.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Domain ${window.location.hostname} is not authorized in Firebase Auth Settings → Authorized domains.`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before finishing. Try again when ready.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Allow popups for this site and tap Continue with Google again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to Firebase Auth. Check your connection or Brave Shields and retry.';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Authentication failed. Please try again.';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  mode,
  firebaseUser,
  career,
  profileSyncing = false,
  profileLoadError = null,
  onRetryProfileLoad,
  onProfileReady,
  onContinueAsGuest,
}) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const tokenClientRef = useRef<GisTokenClient | null>(null);

  const initGisClient = useCallback(() => {
    if (!firebaseOAuthClientId) return false;
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return false;
    if (tokenClientRef.current) {
      setGisReady(true);
      return true;
    }

    tokenClientRef.current = oauth2.initTokenClient({
      client_id: firebaseOAuthClientId,
      scope: 'openid email profile',
      callback: async (resp: GisTokenResponse) => {
        if (resp.error || !resp.access_token) {
          setSubmitting(false);
          if (resp.error === 'access_denied') {
            setError('Google sign-in permission was cancelled. Please try again.');
          } else if (resp.error === 'origin_mismatch') {
            setError('Use the primary Continue with Google button above for this preview URL.');
          } else {
            setError(resp.error_description || resp.error || 'Google sign-in did not complete.');
          }
          return;
        }

        try {
          const cred = GoogleAuthProvider.credential(null, resp.access_token);
          await signInWithCredential(auth, cred);
        } catch (err) {
          setError(mapAuthError(err));
        } finally {
          setSubmitting(false);
        }
      },
      error_callback: (err: GisPopupError) => {
        setSubmitting(false);
        if (err.type === 'popup_closed') {
          setError('Google sign-in popup was closed before finishing. Try again when ready.');
        } else if (err.type === 'popup_failed_to_open') {
          setError('Popup was blocked by your browser. Allow popups for this site and retry.');
        } else {
          setError('Could not complete Google OAuth popup. Try the primary Continue with Google button.');
        }
      },
    });
    setGisReady(true);
    return true;
  }, []);

  useEffect(() => {
    if (mode !== 'AUTH') return;
    if (initGisClient()) return;

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    const onLoad = () => {
      initGisClient();
    };
    if (existing) {
      existing.addEventListener('load', onLoad);
    }

    const poll = window.setInterval(() => {
      if (initGisClient()) {
        window.clearInterval(poll);
      }
    }, 300);

    return () => {
      window.clearInterval(poll);
      if (existing) existing.removeEventListener('load', onLoad);
    };
  }, [mode, initGisClient]);

  useEffect(() => {
    if (mode === 'USERNAME_SETUP' && firebaseUser) {
      setError(null);
      setUsername((prev) =>
        prev.trim() ? prev : suggestUsernameFromDisplayName(firebaseUser.displayName)
      );
    }
  }, [mode, firebaseUser]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged in App.tsx will load profile or transition to USERNAME_SETUP
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      // If popup failed due to network/authDomain issue and GIS token client is ready, try GIS seamlessly
      if (
        (code === 'auth/network-request-failed' || code === 'auth/internal-error') &&
        (tokenClientRef.current || initGisClient()) &&
        tokenClientRef.current
      ) {
        try {
          tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
          return;
        } catch {
          // Fall through to mapped Firebase popup error
        }
      }
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGisFallbackSignIn = () => {
    setError(null);
    if (!tokenClientRef.current && !initGisClient()) {
      setError('Google direct OAuth script is unavailable. Use Continue with Google above.');
      return;
    }
    if (!tokenClientRef.current) return;
    setSubmitting(true);
    try {
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      setSubmitting(false);
      setError(mapAuthError(err));
    }
  };

  const handleUsernameSetupSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!firebaseUser) return;
    setError(null);

    const validationErr = validateUsername(username);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    const cleanUsername = username.trim();
    setSubmitting(true);
    try {
      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setError('That username is already claimed. Choose another.');
        setSubmitting(false);
        return;
      }
      const profile = await createUserProfileAtomic(firebaseUser.uid, cleanUsername, career);
      onProfileReady(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Quota exceeded')) {
        setError('Daily Firebase database quota exceeded. Quota resets tomorrow.');
      } else if (msg.includes('Missing or insufficient permissions')) {
        setError('Could not claim username — it may already be taken.');
      } else {
        setError('Failed to save your shooter profile. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError(null);
    await signOut(auth);
  };

  const headerSubtitle = profileSyncing
    ? 'Restoring your shooter profile and career stats from the cloud...'
    : mode === 'PROFILE_ERROR'
      ? 'Signed into Google, but we hit a snag loading your saved shooter profile.'
      : mode === 'USERNAME_SETUP'
        ? 'Claim your unique handle for Online 1v1 PVP, Friends, Leagues, and cloud career stats.'
        : 'Sign in with Google to save your career stats, join PVP Leagues, and challenge friends online.';

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md max-h-[94dvh] overflow-y-auto bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-7 my-auto shadow-2xl">
        {/* Brand Header */}
        <div className="border-b border-white/25 pb-4 mb-5">
          <div className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-[-0.04em] leading-none text-[#00ffaa]">
            Downtown 3
          </div>
          <p className="text-xs sm:text-sm text-[#F8FAFC] mt-2 leading-relaxed">
            {headerSubtitle}
          </p>
        </div>

        {profileSyncing && firebaseUser ? (
          <div className="space-y-4">
            <div className="bg-[#05070B] border border-white/30 rounded-[2px] px-3.5 py-2.5 text-xs text-[#F8FAFC]">
              Signed in as{' '}
              <span className="font-bold text-[#FFFFFF]">
                {firebaseUser.email || firebaseUser.displayName || 'Player'}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2.5 py-6 font-mono text-xs font-bold uppercase tracking-wider text-[#00ffaa]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Syncing Shooter Profile...</span>
            </div>
          </div>
        ) : mode === 'PROFILE_ERROR' && firebaseUser ? (
          <div className="space-y-4">
            <div className="bg-[#05070B] border border-white/30 rounded-[2px] px-3.5 py-2.5 text-xs text-[#F8FAFC]">
              Signed in as{' '}
              <span className="font-bold text-[#FFFFFF]">
                {firebaseUser.email || firebaseUser.displayName || 'Player'}
              </span>
            </div>

            <div className="text-xs font-semibold text-[#FEE2E2] bg-[#240A0E] border border-[#FCA5A5]/80 rounded-[2px] px-3.5 py-3 leading-relaxed">
              {profileLoadError || 'Could not load your saved profile from Firestore.'}
            </div>

            <button
              type="button"
              onClick={onRetryProfileLoad}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Loading Profile</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full py-2 text-xs font-semibold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer"
            >
              Sign out &amp; use a different Google account
            </button>

            <div className="pt-2 border-t border-white/25 text-center">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer py-2 px-3"
              >
                Continue as Guest (Solo Practice)
              </button>
            </div>
          </div>
        ) : mode === 'USERNAME_SETUP' && firebaseUser ? (
          <form onSubmit={handleUsernameSetupSubmit} className="space-y-4">
            <div className="bg-[#05070B] border border-white/30 rounded-[2px] px-3.5 py-2.5 text-xs text-[#F8FAFC]">
              Signed in as{' '}
              <span className="font-bold text-[#FFFFFF]">
                {firebaseUser.email || firebaseUser.displayName || 'Player'}
              </span>
            </div>

            <div>
              <label
                htmlFor="setup-username"
                className="block font-mono text-[10px] uppercase tracking-[0.14em] font-bold text-[#FFFFFF] mb-1.5"
              >
                Online PVP Username
              </label>
              <input
                id="setup-username"
                type="text"
                maxLength={16}
                autoFocus
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                placeholder="e.g. CurryRange30"
                className="w-full px-3.5 py-2.5 rounded-[2px] bg-[#05070B] border border-white/40 text-base sm:text-sm text-[#FFFFFF] placeholder:text-[#E2E8F0] focus:outline-none focus:border-[#00ffaa]"
              />
              <div className="text-[11px] font-medium text-[#F8FAFC] mt-1.5">
                3–16 characters · letters, numbers, and underscores only
              </div>
            </div>

            {error && (
              <div className="text-xs font-semibold text-[#FEE2E2] bg-[#240A0E] border border-[#FCA5A5]/80 rounded-[2px] px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] py-3.5 px-4 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-sans text-sm sm:text-base font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              {submitting ? 'Claiming Username...' : 'Enter Arena'}
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full py-2 text-xs font-semibold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer"
            >
              Sign out &amp; use a different Google account
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#05070B] border border-white/30 rounded-[2px] p-3.5 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#00ffaa] font-bold">
                Cloud Profile Perks
              </div>
              <ul className="text-xs text-[#F8FAFC] space-y-1 leading-relaxed">
                <li>• Sync Career Highs, Streaks &amp; Fast-Break Splits across devices</li>
                <li>• Add PVP Opponents as Friends &amp; send live Rematch invites</li>
                <li>• Create &amp; compete in Online PVP Leagues</li>
              </ul>
            </div>

            {error && (
              <div className="text-xs font-semibold text-[#FEE2E2] bg-[#240A0E] border border-[#FCA5A5]/80 rounded-[2px] px-3 py-2.5 leading-relaxed">
                {error}
              </div>
            )}

            {/* Primary Google Sign-In via same-origin Firebase popup */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleGoogleSignIn()}
              className="w-full flex items-center justify-center gap-3 min-h-[48px] py-3 px-4 rounded-[2px] bg-[#FFFFFF] hover:bg-[#E2E8F0] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] text-sm font-extrabold uppercase tracking-wide transition-colors cursor-pointer shadow-lg"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>{submitting ? 'Connecting Google...' : 'Continue with Google'}</span>
            </button>

            {gisReady && (
              <div className="text-center">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGisFallbackSignIn}
                  className="font-mono text-[10px] uppercase tracking-wider text-[#FFFFFF] hover:text-[#00ffaa] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Or try direct Google OAuth sign-in
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-white/25 text-center">
              <button
                type="button"
                disabled={submitting}
                onClick={onContinueAsGuest}
                className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#FFFFFF] hover:text-[#00ffaa] transition-colors cursor-pointer py-2 px-3"
              >
                Continue as Guest (Solo Practice)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
