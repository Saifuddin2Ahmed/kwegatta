import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
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
 * Send Password Reset Email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
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

/**
 * Helper to get clean, friendly error messages
 */
export function formatAuthError(err: any): string {
  if (!err) return 'An error occurred during authentication.';
  const code = err.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'This preview domain is not in the Firebase authorized domains list. Sign-in works on kwegatta.ai.studio and the Cloud Run production URL.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Please allow popups or try again.';
  }
  if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
    return 'Sign-in was canceled before completion. Please try again.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Wrong email or password. If you joined with Google, use Continue with Google.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists with this email. Please sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Access is temporarily disabled. Please wait a minute and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection and try again.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been disabled. Please contact support.';
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
 * Link an email/password credential to a Google account so user can sign in both ways
 */
export async function addPasswordToAccount(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('No signed-in account with an email found.');
  }
  const cred = EmailAuthProvider.credential(user.email, password);
  try {
    await linkWithCredential(user, cred);
  } catch (err: any) {
    if (err.code === 'auth/provider-already-linked' || err.code === 'auth/credential-already-in-use') {
      await updatePassword(user, password);
    } else {
      throw err;
    }
  }
}
