import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  Lock,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ExternalLink
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  resendEmailVerification,
  formatAuthError
} from '../services/firebase';
import { Profile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: (user: User) => void;
  isInline?: boolean;
  title?: string;
  subtitle?: string;
  existingProfile?: Profile | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isInline = false,
  title,
  subtitle,
  existingProfile
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'google' | 'email' | 'forgot' | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [needsVerificationUser, setNeedsVerificationUser] = useState<User | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap, Escape key handling, and focus restoration
  useEffect(() => {
    if (!isOpen || isInline) return;

    // Save previous focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus first interactive element in modal
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      // Return focus to previous active element
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, isInline, onClose]);

  if (!isOpen && !isInline) return null;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessNotice(null);
    setIsLoading(true);
    setLastAction('google');
    try {
      const user = await signInWithGoogle();
      if (user) {
        onSuccess(user);
        if (onClose) onClose();
      }
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    setErrorMsg(null);
    setSuccessNotice(null);
    setIsLoading(true);
    setLastAction('email');

    try {
      if (mode === 'signup') {
        const user = await signUpWithEmail(email, password);
        setNeedsVerificationUser(user);
        setSuccessNotice('Account created! A verification email has been sent to ' + email + '.');
        onSuccess(user);
        if (!isInline && onClose) onClose();
      } else {
        const user = await signInWithEmail(email, password);
        if (!user.emailVerified) {
          setNeedsVerificationUser(user);
        }
        onSuccess(user);
        if (onClose) onClose();
      }
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address to receive password reset instructions.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    setLastAction('forgot');
    try {
      await sendPasswordReset(cleanEmail);
      console.log(`[AuthModal] sendPasswordReset succeeded for: ${cleanEmail}`);
      setSuccessNotice(`If an account exists for ${cleanEmail}, a reset link has been sent. Check spam too.`);
      setMode('signin');
    } catch (err: any) {
      console.error('[AuthModal] sendPasswordReset failed:', err);
      setErrorMsg(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryAgain = () => {
    setErrorMsg(null);
    if (lastAction === 'google') {
      handleGoogleSignIn();
    }
  };

  const handleResendVerification = async () => {
    if (!needsVerificationUser) return;
    try {
      await resendEmailVerification(needsVerificationUser);
      setSuccessNotice('Verification email resent! Please check your spam folder if you do not see it.');
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    }
  };

  const content = (
    <div className={`space-y-4 ${isInline ? 'w-full' : 'max-w-md w-full'}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-bold font-display text-[var(--fg)] tracking-tight">
            {title || (existingProfile ? `Connect ${existingProfile.name.split(' ')[0]}'s Profile` : 'Sign in to Kwegatta')}
          </h3>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed mt-0.5">
            {subtitle || (existingProfile
              ? 'Connect your existing profile to Google or Email so you can access your matches from any device.'
              : 'Sign in with Google in one tap to secure your profile and connect with collaborators.')}
          </p>
        </div>
        {!isInline && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--fg-subtle)] hover:text-[var(--fg)] p-1 rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Success Notification */}
      {successNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p>{successNotice}</p>
            {needsVerificationUser && (
              <button
                type="button"
                onClick={handleResendVerification}
                className="underline text-[11px] font-medium cursor-pointer"
              >
                Resend verification email
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Banner with Try again button */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <p className="leading-relaxed font-medium">{errorMsg}</p>
              {errorMsg.includes('unauthorized-domain') && (
                <p className="text-[11px] text-[var(--fg-muted)]">
                  Authorised domains for this app: <code className="text-[var(--gold)]">kwegatta.ai.studio</code> and the Cloud Run deployment domain.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleTryAgain}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      )}

      {/* PRIMARY BUTTON: Continue with Google (One Tap) */}
      <button
        type="button"
        disabled={isLoading}
        onClick={handleGoogleSignIn}
        className="w-full py-2.5 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-xs sm:text-sm font-semibold text-[var(--fg)] flex items-center justify-center gap-3 shadow-xs hover:border-[var(--gold)] transition-all cursor-pointer active:scale-[0.99]"
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--gold)]" />
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>Continue with Google in one tap</span>
      </button>

      {/* DIVIDER */}
      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-[var(--card-border)]"></div>
        <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-mono">
          or email with password
        </span>
        <div className="flex-grow border-t border-[var(--card-border)]"></div>
      </div>

      {/* MODE TABS: Sign In / Create Account / Forgot */}
      {mode !== 'forgot' ? (
        <div className="flex rounded-xl bg-[var(--bg-subtle)] p-1 border border-[var(--card-border)]">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-[var(--card)] text-[var(--gold)] shadow-xs'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-[var(--card)] text-[var(--gold)] shadow-xs'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            Create Account
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--fg)]">Reset Password</span>
          <button
            type="button"
            onClick={() => setMode('signin')}
            className="text-[var(--gold)] hover:underline cursor-pointer"
          >
            Back to Sign In
          </button>
        </div>
      )}

      {/* FORM: Email + Password */}
      {mode === 'forgot' ? (
        <form onSubmit={handleForgotPassword} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[var(--fg-subtle)]" />
              <span>Your registered email address</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. sandra@example.com"
              className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--gold)] hover:brightness-110 text-[#090D16] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            <span>Send Password Reset Email</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmitEmail} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[var(--fg-subtle)]" />
              <span>Email address</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. sandra@example.com"
              className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--fg-subtle)]" />
                <span>Password</span>
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-[11px] text-[var(--gold)] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--gold)] hover:brightness-110 text-[#090D16] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
            <span>{mode === 'signup' ? 'Create Account with Email' : 'Sign In with Email'}</span>
          </button>
        </form>
      )}

      {/* Security & Ownership footnote */}
      <p className="text-[11px] text-[var(--fg-subtle)] text-center leading-relaxed pt-1">
        Your email is strictly used for authentication and account ownership. Zero trackers or passwords stored on our servers.
      </p>
    </div>
  );

  if (isInline) {
    return (
      <div className="kw-card p-4 sm:p-6 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-md">
        {content}
      </div>
    );
  }

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="kw-card p-6 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl max-w-md w-full"
      >
        {content}
      </div>
    </div>
  );
};
