import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  auth,
  createUserProfileAtomic,
  googleProvider,
  isUsernameAvailable,
  suggestUsernameFromDisplayName,
  validateUsername,
} from '../firebase';
import { CareerStats, UserProfile } from '../game/types';

interface AuthPageProps {
  mode: 'AUTH' | 'USERNAME_SETUP';
  firebaseUser: User | null;
  career: CareerStats;
  onProfileReady: (profile: UserProfile) => void;
  onContinueAsGuest: () => void;
}

type AuthTab = 'SIGN_IN' | 'SIGN_UP';

function mapAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';

  if (code === 'auth/operation-not-allowed') {
    return 'Email/password sign-in is disabled in Firebase Console. Use Continue with Google above.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Sign In.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email or password.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before finishing.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by the browser. Allow popups and try again.';
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
  onProfileReady,
  onContinueAsGuest,
}) => {
  const [tab, setTab] = useState<AuthTab>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      // onAuthStateChanged in App.tsx will fetch profile or advance to USERNAME_SETUP
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Enter both email and password.');
      return;
    }

    if (tab === 'SIGN_UP') {
      const usernameErr = validateUsername(username);
      if (usernameErr) {
        setError(usernameErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (tab === 'SIGN_IN') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        const cleanUsername = username.trim();
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const available = await isUsernameAvailable(cleanUsername);
        if (!available) {
          setError('That PVP username is taken. Pick another below.');
          return;
        }
        const profile = await createUserProfileAtomic(cred.user.uid, cleanUsername, career);
        onProfileReady(profile);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
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
      setError(
        err instanceof Error && err.message.includes('Missing or insufficient permissions')
          ? 'Could not claim username — it may already be taken.'
          : 'Failed to save your shooter profile. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError(null);
    await signOut(auth);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090E]/82 p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md max-h-[94dvh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-xl p-5 sm:p-7 my-auto">
        {/* Brand Header */}
        <div className="border-b border-white/10 pb-4 mb-5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl sm:text-4xl font-extrabold tracking-wide text-[#F4EFE6]">
              DOWNTOWN
            </span>
            <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#F9631C]">
              3
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
            {mode === 'USERNAME_SETUP'
              ? 'Claim your unique handle for Online 1v1 PVP and career stats.'
              : 'Sign in or create an account to save career stats and compete in Online PVP.'}
          </p>
        </div>

        {mode === 'USERNAME_SETUP' && firebaseUser ? (
          <form onSubmit={handleUsernameSetupSubmit} className="space-y-4">
            <div className="bg-[#0B0E14] border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-[#CBD5E1]">
              Signed in as{' '}
              <span className="font-semibold text-[#F4EFE6]">
                {firebaseUser.email || firebaseUser.displayName || 'Player'}
              </span>
            </div>

            <div>
              <label
                htmlFor="setup-username"
                className="block text-xs font-medium text-[#CBD5E1] mb-1.5"
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
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0E14] border border-white/15 text-sm text-[#F4EFE6] placeholder:text-[#64748B] focus:outline-none focus:border-[#F9631C]"
              />
              <div className="text-[11px] text-[#94A3B8] mt-1.5">
                3–16 characters · letters, numbers, and underscores only
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/25 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] disabled:opacity-50 text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-colors cursor-pointer"
            >
              {submitting ? 'Claiming Username...' : 'Enter Arena'}
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F4EFE6] transition-colors cursor-pointer"
            >
              Sign out &amp; use a different account
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Google Sign-In */}
            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-[#F4EFE6] hover:bg-white disabled:opacity-50 text-[#0B0E14] text-sm font-semibold transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] text-[#64748B] font-medium">OR EMAIL</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Sign In / Create Account Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0E14] border border-white/10 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setTab('SIGN_IN');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tab === 'SIGN_IN'
                    ? 'bg-[#1D2432] text-[#F4EFE6]'
                    : 'text-[#94A3B8] hover:text-[#F4EFE6]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('SIGN_UP');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tab === 'SIGN_UP'
                    ? 'bg-[#1D2432] text-[#F4EFE6]'
                    : 'text-[#94A3B8] hover:text-[#F4EFE6]'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {tab === 'SIGN_UP' && (
                <div>
                  <label
                    htmlFor="auth-username"
                    className="block text-xs font-medium text-[#CBD5E1] mb-1"
                  >
                    PVP Username
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    maxLength={16}
                    value={username}
                    onChange={(ev) => setUsername(ev.target.value)}
                    placeholder="SplashBro_3"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0E14] border border-white/15 text-sm text-[#F4EFE6] placeholder:text-[#64748B] focus:outline-none focus:border-[#F9631C]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="shooter@court.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0E14] border border-white/15 text-sm text-[#F4EFE6] placeholder:text-[#64748B] focus:outline-none focus:border-[#F9631C]"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={tab === 'SIGN_IN' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0E14] border border-white/15 text-sm text-[#F4EFE6] placeholder:text-[#64748B] focus:outline-none focus:border-[#F9631C]"
                />
              </div>

              {error && (
                <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/25 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg bg-[#F9631C] hover:bg-[#FB7A3C] disabled:opacity-50 text-[#0B0E14] font-display text-2xl font-extrabold tracking-wide transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Please wait...'
                  : tab === 'SIGN_IN'
                    ? 'Sign In'
                    : 'Create Account'}
              </button>
            </form>

            <div className="pt-2 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-xs font-medium text-[#94A3B8] hover:text-[#F4EFE6] transition-colors cursor-pointer py-1.5"
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
