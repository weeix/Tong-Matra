import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Calendar Events access
provider.addScope('https://www.googleapis.com/auth/calendar.events');

let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== 'undefined' ? sessionStorage.getItem('google_calendar_token') : null;

// Listen for auth state changes & handle in-memory cache token
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Clear token since we don't have it cached
        cachedAccessToken = null;
        sessionStorage.removeItem('google_calendar_token');
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('google_calendar_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Initiate Google Sign-In pop-up
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token from Firebase Authentication');
    }

    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('google_calendar_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign-in Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve currently cached access token
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Set token directly (e.g. immediately after login)
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    sessionStorage.setItem('google_calendar_token', token);
  } else {
    sessionStorage.removeItem('google_calendar_token');
  }
};

// Sign out and clear in-memory caches
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  sessionStorage.removeItem('google_calendar_token');
};
