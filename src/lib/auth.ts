export interface CustomUser {
  displayName: string | null;
  email: string;
  photoURL: string | null;
}

// Check if we have active user and token in sessionStorage or localStorage
export const getStoredAuth = (): { user: CustomUser | null; token: string | null } => {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }
  try {
    const token = sessionStorage.getItem('google_calendar_token') || localStorage.getItem('google_calendar_token');
    const userStr = sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { user, token };
  } catch (error) {
    console.error('Failed to parse stored auth user:', error);
    return { user: null, token: null };
  }
};

// Set stored credentials
export const setStoredAuth = (user: CustomUser | null, token: string | null) => {
  if (typeof window === 'undefined') return;
  if (token && user) {
    sessionStorage.setItem('google_calendar_token', token);
    sessionStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('google_calendar_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('google_calendar_token');
    sessionStorage.removeItem('auth_user');
    localStorage.removeItem('google_calendar_token');
    localStorage.removeItem('auth_user');
  }
};

// Check for Google Client ID from environment variables configured during build time
export const getGoogleClientId = (): string => {
  // Check Vite env variable injected during build
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv.VITE_GOOGLE_CLIENT_ID) {
    return metaEnv.VITE_GOOGLE_CLIENT_ID;
  }
  return '';
};

// Start Google sign-in by opening Google OAuth 2.0 Implicit Flow (Redirect directly to Google)
export const requestGoogleSignIn = async (
  onSuccess: (user: CustomUser, token: string) => void,
  onFailure: (error: string) => void
) => {
  try {
    const client_id = getGoogleClientId();
    if (!client_id) {
      onFailure('กรุณากำหนด Google Client ID ก่อนเข้าสู่ระบบ');
      return;
    }

    // Google redirections are standard, safe, and bypass popup blocker issues
    const redirectUri = `${window.location.origin}/`;
    const oauth2Url = 'https://accounts.google.com/o/oauth2/v2/auth';
    
    const params = new URLSearchParams({
      client_id,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/calendar.events openid email profile',
      include_granted_scopes: 'true',
      state: 'oauth_implicit',
    });

    window.location.href = `${oauth2Url}?${params.toString()}`;
  } catch (error) {
    console.error('OAuth initiation failed:', error);
    onFailure(error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบ Google Auth ได้');
  }
};

// Handler to check URL hash for tokens on application mount
export const checkAuthCallback = async (
  onSuccess: (user: CustomUser, token: string) => void,
  onFailure: (error: string) => void
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  const hash = window.location.hash;
  if (!hash) return false;

  try {
    const params = new URLSearchParams(hash.substring(1)); // strip the leading '#'
    const accessToken = params.get('access_token');
    const state = params.get('state');

    if (accessToken && state === 'oauth_implicit') {
      // Clear URL hash immediately to keep web path clean
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

      // Retrieve User Profile utilizing pure fetch API client-side
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!profileRes.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลโปรไฟล์ผู้ใช้จากบัญชี Google ได้');
      }

      const profileData = await profileRes.json();
      const userProfile: CustomUser = {
        displayName: profileData.name || profileData.given_name || 'Google User',
        email: profileData.email || '',
        photoURL: profileData.picture || '',
      };

      setStoredAuth(userProfile, accessToken);
      onSuccess(userProfile, accessToken);
      return true;
    }
  } catch (error) {
    console.error('Callback parsing failed:', error);
    onFailure(error instanceof Error ? error.message : 'การยืนยันสิทธิ์หรือดึงรูปโปรไฟล์ล้มเหลว');
  }

  return false;
};
