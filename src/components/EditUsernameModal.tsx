import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AtSign, Check, X } from 'lucide-react';
import {
  isUsernameAvailable,
  updateUserUsernameAtomic,
  validateUsername,
} from '../firebase';
import { UserProfile } from '../game/types';

interface EditUsernameModalProps {
  userProfile: UserProfile | null;
  guestName: string;
  onSaveAccountProfile: (updated: UserProfile) => void;
  onSaveGuestName: (name: string) => void;
  onOpenAuth?: () => void;
  onClose: () => void;
}

export const EditUsernameModal: React.FC<EditUsernameModalProps> = ({
  userProfile,
  guestName,
  onSaveAccountProfile,
  onSaveGuestName,
  onOpenAuth,
  onClose,
}) => {
  const isAccount = Boolean(userProfile);
  const initialValue = userProfile ? userProfile.username : guestName;
  const [inputValue, setInputValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmed = inputValue.trim();

    if (!isAccount || !userProfile) {
      if (trimmed.length < 1 || trimmed.length > 16) {
        setError('Display name must be 1 to 16 characters.');
        return;
      }
      onSaveGuestName(trimmed);
      onClose();
      return;
    }

    const validationErr = validateUsername(trimmed);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    if (trimmed === userProfile.username) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      if (trimmed.toLowerCase() !== userProfile.username.toLowerCase()) {
        const available = await isUsernameAvailable(trimmed);
        if (!available) {
          setError('That username is already taken.');
          setSubmitting(false);
          return;
        }
      }
      const updated = await updateUserUsernameAtomic(
        userProfile.uid,
        userProfile.username,
        trimmed
      );
      onSaveAccountProfile(updated);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('already taken')) {
        setError('That username is already taken.');
      } else {
        setError('Could not update username. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#05070B]/94 backdrop-blur-sm p-4"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md bg-[#0A0D14] border border-white/35 rounded-[4px] p-5 sm:p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-username-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#00ffaa] block mb-1">
              Shooter Identity
            </span>
            <h2
              id="edit-username-title"
              className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#FFFFFF] leading-none"
            >
              Edit Username
            </h2>
            <p className="text-xs text-[#F8FAFC] mt-1.5 leading-relaxed">
              {isAccount
                ? 'Updates your public PVP handle and the label floating above your shooter.'
                : 'Updates the display label floating above your shooter.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close username editor"
            className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 text-[#FFFFFF] transition-colors cursor-pointer shrink-0 disabled:bg-[#1A202C] disabled:text-[#F1F5F9] disabled:border-white/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="edit-username-input"
              className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFFFF] mb-1.5"
            >
              {isAccount ? 'Handle' : 'Shooter Display Name'}
            </label>
            <div className="relative flex items-center">
              {isAccount && (
                <AtSign className="w-4 h-4 text-[#00ffaa] absolute left-3 pointer-events-none" />
              )}
              <input
                id="edit-username-input"
                type="text"
                autoFocus
                maxLength={16}
                value={inputValue}
                onChange={(ev) => {
                  setInputValue(ev.target.value);
                  if (error) setError(null);
                }}
                placeholder={isAccount ? 'your_handle' : 'Shooter'}
                className={`w-full ${
                  isAccount ? 'pl-9 pr-3.5' : 'px-3.5'
                } py-2.5 rounded-[2px] bg-[#05070B] border border-white/40 focus:border-[#00ffaa] focus:outline-none text-base sm:text-sm font-mono text-[#FFFFFF] placeholder:text-[#E2E8F0]`}
              />
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-[#F8FAFC]">
              {isAccount
                ? '3–16 characters · letters, numbers, and underscores only.'
                : '1–16 characters · sign in to reserve a unique @handle for Online PVP.'}
            </div>
          </div>

          {error && (
            <div className="text-xs font-semibold text-[#FEE2E2] bg-[#240A0E] border border-[#FCA5A5]/80 rounded-[2px] px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[42px] px-4 py-2 rounded-[2px] bg-[#141824] hover:bg-[#1E2434] border border-white/35 font-mono text-xs font-bold uppercase text-[#FFFFFF] transition-colors cursor-pointer disabled:bg-[#1A202C] disabled:text-[#F1F5F9] disabled:border-white/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-[2px] bg-[#00ffaa] hover:bg-[#33ffbb] disabled:bg-[#1A202C] disabled:text-[#F1F5F9] text-[#05070B] font-mono text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Saving...' : 'Save Username'}</span>
            </button>
          </div>

          {!isAccount && onOpenAuth && (
            <div className="pt-3 border-t border-white/25 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#F8FAFC]">Have an existing cloud handle?</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#00ffaa] hover:underline cursor-pointer"
              >
                Sign In with Google
              </button>
            </div>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
};
