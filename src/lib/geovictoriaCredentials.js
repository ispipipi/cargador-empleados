const STORED_CREDENTIALS_KEY = 'maper:geovictoria:credentials:v1';

export function loadStoredGeovictoriaCredentials() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawCredentials = window.localStorage.getItem(STORED_CREDENTIALS_KEY);

    if (!rawCredentials) {
      return null;
    }

    const parsedCredentials = JSON.parse(rawCredentials);
    const apiKey = String(parsedCredentials?.apiKey ?? '').trim();
    const apiSecret = String(parsedCredentials?.apiSecret ?? '').trim();

    if (!apiKey || !apiSecret) {
      return null;
    }

    return { apiKey, apiSecret };
  } catch {
    return null;
  }
}

export function saveStoredGeovictoriaCredentials({ apiKey, apiSecret }) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      STORED_CREDENTIALS_KEY,
      JSON.stringify({
        apiKey,
        apiSecret,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Storage can be disabled by browser policy.
  }
}

export function clearStoredGeovictoriaCredentials() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORED_CREDENTIALS_KEY);
  } catch {
    // Storage can be disabled by browser policy.
  }
}
