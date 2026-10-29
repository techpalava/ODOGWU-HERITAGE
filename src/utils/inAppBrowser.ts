/**
 * Google blocks OAuth inside embedded in-app browsers ("disallowed_useragent"),
 * and popups are unreliable there. Detect the common ones so the login screen
 * can tell people how to continue.
 */
export type InAppBrowserInfo = {
  /** Human-readable app name, e.g. "Instagram". */
  appName: string;
  isAndroid: boolean;
  isIos: boolean;
};

const IN_APP_PATTERNS: Array<[RegExp, string]> = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, "Facebook"],
  [/WhatsApp/i, "WhatsApp"],
  [/musical_ly|TikTok|BytedanceWebview|ByteLocale/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/\bLine\//, "LINE"],
  [/Twitter/i, "X"],
];

export function detectInAppBrowser(
  userAgent: string | undefined | null,
): InAppBrowserInfo | null {
  if (!userAgent) return null;
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  for (const [pattern, appName] of IN_APP_PATTERNS) {
    if (pattern.test(userAgent)) return { appName, isAndroid, isIos };
  }
  // Generic Android WebView marker ("; wv)").
  if (isAndroid && /;\s*wv\)/.test(userAgent)) {
    return { appName: "this app", isAndroid, isIos };
  }
  return null;
}

/** Android intent URL that reopens the current page in Chrome. */
export function buildOpenInChromeUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:") return null;
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
  } catch {
    return null;
  }
}
