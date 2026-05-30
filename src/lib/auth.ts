export interface CustomUser {
  displayName: string | null;
  email: string;
  photoURL: string | null;
}

// Check if we have active user and token in sessionStorage
export const getStoredAuth = (): { user: CustomUser | null; token: string | null } => {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }
  try {
    const token = sessionStorage.getItem('google_calendar_token');
    const userStr = sessionStorage.getItem('auth_user');
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
  } else {
    sessionStorage.removeItem('google_calendar_token');
    sessionStorage.removeItem('auth_user');
  }
};

// Start Google sign-in by fetching authorization URL and opening child window
export const requestGoogleSignIn = async (
  onSuccess: (user: CustomUser, token: string) => void,
  onFailure: (error: string) => void
) => {
  try {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const response = await fetch(`/api/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch auth URL' }));
      throw new Error(errorData.error || 'Server rejected authorization URL request');
    }

    const { url } = await response.json();

    // Use popup-based OAuth
    const width = 550;
    const height = 655;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      url,
      'google_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popup) {
      onFailure('ป๊อปอัปเข้าสู่ระบบถูกปิดกั้นโดยเบราว์เซอร์ของคุณ โปรดปิดตัวบล็อคป๊อปอัปแล้วลองอีกครั้ง');
      return;
    }

    // Set message listener
    const handleMessage = (event: MessageEvent) => {
      // Security: Validate origin matches standard Cloud Run pattern or localhost
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { token, user } = event.data;
        if (token && user) {
          setStoredAuth(user, token);
          onSuccess(user, token);
        } else {
          onFailure('ข้อมูลสิทธิ์ความปลอดภัยหรือข้อมูลผู้ใช้จาก Google ผิดพลาด');
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // Watch for popup closed by user before completing
    const checkClosedInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosedInterval);
        window.removeEventListener('message', handleMessage);
      }
    }, 1000);

  } catch (error) {
    console.error('OAuth initiation failed:', error);
    onFailure(error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อเพื่อดึงสิทธิ์เข้าถึงบัญชี Google ได้');
  }
};
