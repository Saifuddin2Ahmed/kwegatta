import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  User,
  AuthError
} from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyCW0tukqDxhKmmk6IZxvtjMk7U49scZh5o",
  authDomain: "kwegatta.firebaseapp.com",
  projectId: "kwegatta",
  storageBucket: "kwegatta.firebasestorage.app",
  messagingSenderId: "359429599502",
  appId: "1:359429599502:web:11c90cfa839247291b675f"
};

// Initialize Firebase App & Auth Singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google with popup, falling back to redirect on mobile / popup blocked
 */
export async function signInWithGoogle(): Promise<User> {
  const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  // If mobile or iframe environment that might restrict popups, try popup first but catch and redirect
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const authErr = error as AuthError;
    if (
      authErr.code === 'auth/popup-blocked' ||
      authErr.code === 'auth/popup-closed-by-user' ||
      authErr.code === 'auth/cancelled-popup-request' ||
      isMobile
    ) {
      console.warn('[Firebase Auth] Popup blocked or on mobile device; falling back to signInWithRedirect', authErr.code);
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectErr) {
        throw redirectErr;
      }
    }
    throw error;
  }
}

/**
 * Check if the user is returning from a signInWithRedirect
 */
export async function handleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (error: any) {
    console.warn('[Firebase Auth] getRedirectResult check:', error?.message || error);
    return null;
  }
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return cred.user;
}

/**
 * Create Account with Email and Password & send email verification
 */
export async function signUpWithEmail(email: string, pass: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (cred.user) {
    try {
      await sendEmailVerification(cred.user);
    } catch (e: any) {
      console.warn('[Firebase Auth] sendEmailVerification note:', e?.message || e);
    }
  }
  return cred.user;
}

/**
 * Send Password Reset Email via Firebase Web SDK
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter a valid email address.');
  }
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    console.log('[Firebase Auth] sendPasswordResetEmail successfully invoked for:', cleanEmail);
  } catch (err: any) {
    console.error('[Firebase Auth] sendPasswordResetEmail error for:', cleanEmail, err);
    throw err;
  }
}

/**
 * Re-send Email Verification
 */
export async function resendEmailVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

/**
 * Sign Out
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Get current ID token or refresh if expired
 */
export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch (err: any) {
      console.warn('[Firebase Auth] getIdToken error:', err?.message || err);
    }
  }
  return null;
}

const COMMON_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'admin123',
  'qwertyui',
  'qwerty123',
  '11111111',
  '00000000',
  'kwegatta',
  'kwegatta123',
  'letmein123',
  'iloveyou',
  'sunshine',
  'princess',
  'welcome1'
]);

/**
 * Validate password strength: minimum 8 characters and rejection of common patterns
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  const clean = password.toLowerCase().trim();
  if (COMMON_PASSWORDS.has(clean) || /^(.)\1+$/.test(clean) || /^12345678/.test(clean) || /^password/i.test(clean)) {
    return 'This password is too common or easily guessed. Please choose a stronger password.';
  }
  return null;
}

/**
 * Helper to get clean, friendly error messages mapped from Firebase error codes
 */
export function formatAuthError(err: any): string {
  if (!err) return 'An error occurred during authentication.';
  const code = err.code || '';
  if (code === 'auth/wrong-password') {
    return 'Wrong password. Please check your password and try again, or reset it below.';
  }
  if (code === 'auth/user-not-found') {
    return 'No account found with this email. If you joined with Google, click Continue with Google.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Wrong email or password. If you joined with Google, use Continue with Google.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists with this email. Please sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 8 characters with letters and numbers.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Access is temporarily disabled. Please wait a minute and try again, or reset your password.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection and try again.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'This security operation requires recent authentication. Please verify your account and try again.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been disabled. Please contact support.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This preview domain is not in the Firebase authorized domains list. Sign-in works on kwegatta.ai.studio and the Cloud Run production URL.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Please allow popups or try again.';
  }
  if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
    return 'Sign-in was canceled before completion. Please try again.';
  }
  return err.message || 'Authentication error. Please try again.';
}

/**
 * Check which sign-in providers are attached to user
 */
export function getAuthProviders(user: User | null): { isGoogle: boolean; isPassword: boolean; email: string | null } {
  if (!user) return { isGoogle: false, isPassword: false, email: null };
  const providers = user.providerData || [];
  const isGoogle = providers.some(p => p.providerId === 'google.com');
  const isPassword = providers.some(p => p.providerId === 'password');
  return { isGoogle, isPassword, email: user.email };
}

/**
 * Link or update an email/password credential to an existing user account.
 * Handles auth/requires-recent-login by re-authenticating with Google popup automatically.
 * Confirms that providerData contains "password" on the reloaded user before resolving.
 */
export async function addPasswordToAccount(password: string): Promise<{ success: boolean; isChange: boolean }> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('No signed-in user account found.');
  }

  const strengthErr = validatePasswordStrength(password);
  if (strengthErr) {
    throw new Error(strengthErr);
  }

  const existingProviders = user.providerData || [];
  const alreadyHasPassword = existingProviders.some(p => p.providerId === 'password');

  const credential = EmailAuthProvider.credential(user.email, password);

  if (alreadyHasPassword) {
    // Update existing password
    try {
      await updatePassword(user, password);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        console.log('[Firebase Auth] requires-recent-login received during updatePassword; re-authenticating with Google popup...');
        try {
          await reauthenticateWithPopup(user, googleProvider);
        } catch (_) {
          await signInWithPopup(auth, googleProvider);
        }
        await updatePassword(auth.currentUser || user, password);
      } else {
        throw err;
      }
    }
  } else {
    // Link new email/password credential
    try {
      await linkWithCredential(user, credential);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        console.log('[Firebase Auth] requires-recent-login received during linkWithCredential; re-authenticating with Google popup...');
        try {
          await reauthenticateWithPopup(user, googleProvider);
        } catch (_) {
          await signInWithPopup(auth, googleProvider);
        }
        const activeUser = auth.currentUser || user;
        const freshCred = EmailAuthProvider.credential(activeUser.email || user.email, password);
        await linkWithCredential(activeUser, freshCred);
      } else if (err.code === 'auth/provider-already-linked' || err.code === 'auth/credential-already-in-use') {
        await updatePassword(user, password);
      } else {
        throw err;
      }
    }
  }

  // Reload user and verify providerData contains "password"
  const activeUser = auth.currentUser || user;
  await activeUser.reload();
  const refreshedUser = auth.currentUser;
  const hasPasswordConfirmed = refreshedUser?.providerData?.some(p => p.providerId === 'password');

  if (!hasPasswordConfirmed) {
    throw new Error('Verification failed: Password provider is not attached to this account.');
  }

  console.log('[Firebase Auth] Password successfully linked and verified on account providerData');
  return { success: true, isChange: alreadyHasPassword };
}
