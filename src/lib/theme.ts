/**
 * Theme system — applies dark/light mode via JavaScript.
 *
 * Strategy:
 * 1. CSS custom properties are set directly on <html> via style.setProperty()
 *    — inline styles have highest specificity, guaranteed to win.
 * 2. A <style> tag with all Tailwind-class overrides is injected/removed.
 *    — injected at runtime, bypasses any CSS build pipeline issues.
 * 3. The data-theme attribute is still set for any CSS that references it.
 */

export type Theme = 'dark' | 'light';

const STYLE_TAG_ID = 'light-theme-overrides';

/* ─── CSS variable values per theme ─── */
const THEME_VARS: Record<Theme, Record<string, string>> = {
  dark: {
    '--surface-0': '5 5 5',
    '--surface-1': '10 10 12',
    '--surface-2': '15 15 18',
    '--surface-3': '22 22 26',
    '--surface-4': '28 28 34',
    '--scrollbar-thumb': 'rgba(255, 255, 255, 0.08)',
    '--scrollbar-thumb-hover': 'rgba(255, 255, 255, 0.15)',
  },
  light: {
    '--surface-0': '255 255 255',
    '--surface-1': '247 247 250',
    '--surface-2': '242 242 246',
    '--surface-3': '234 234 240',
    '--surface-4': '226 226 234',
    '--scrollbar-thumb': 'rgba(0, 0, 0, 0.12)',
    '--scrollbar-thumb-hover': 'rgba(0, 0, 0, 0.25)',
  },
};

/* ─── Light theme utility class overrides ─── */
const LIGHT_OVERRIDES_CSS = `
/* ── Body ── */
[data-theme="light"] body {
  background-color: rgb(242 242 246) !important;
  color: rgb(17 24 39) !important;
}

/* ── Text: white/XX → dark text ── */
[data-theme="light"] .text-white { color: rgb(15 15 20) !important; }
[data-theme="light"] .text-white\\/90 { color: rgb(15 15 20 / 0.9) !important; }
[data-theme="light"] .text-white\\/80 { color: rgb(15 15 20 / 0.85) !important; }
[data-theme="light"] .text-white\\/70 { color: rgb(15 15 20 / 0.7) !important; }
[data-theme="light"] .text-white\\/60 { color: rgb(15 15 20 / 0.65) !important; }
[data-theme="light"] .text-white\\/50 { color: rgb(15 15 20 / 0.55) !important; }
[data-theme="light"] .text-white\\/40 { color: rgb(15 15 20 / 0.45) !important; }
[data-theme="light"] .text-white\\/45 { color: rgb(15 15 20 / 0.5) !important; }
[data-theme="light"] .text-white\\/35 { color: rgb(15 15 20 / 0.4) !important; }
[data-theme="light"] .text-white\\/30 { color: rgb(15 15 20 / 0.35) !important; }
[data-theme="light"] .text-white\\/25 { color: rgb(15 15 20 / 0.3) !important; }
[data-theme="light"] .text-white\\/20 { color: rgb(15 15 20 / 0.25) !important; }
[data-theme="light"] .text-white\\/15 { color: rgb(15 15 20 / 0.2) !important; }
[data-theme="light"] .text-white\\/10 { color: rgb(15 15 20 / 0.15) !important; }
[data-theme="light"] .text-white\\/5 { color: rgb(15 15 20 / 0.1) !important; }

/* ── Hover text ── */
[data-theme="light"] .hover\\:text-white:hover { color: rgb(15 15 20) !important; }
[data-theme="light"] .hover\\:text-white\\/90:hover { color: rgb(15 15 20 / 0.9) !important; }
[data-theme="light"] .hover\\:text-white\\/80:hover { color: rgb(15 15 20 / 0.85) !important; }
[data-theme="light"] .hover\\:text-white\\/70:hover { color: rgb(15 15 20 / 0.7) !important; }
[data-theme="light"] .hover\\:text-white\\/60:hover { color: rgb(15 15 20 / 0.65) !important; }
[data-theme="light"] .hover\\:text-white\\/50:hover { color: rgb(15 15 20 / 0.55) !important; }

/* ── Group hover text ── */
[data-theme="light"] .group:hover .group-hover\\:text-white\\/80 { color: rgb(15 15 20 / 0.85) !important; }
[data-theme="light"] .group:hover .group-hover\\:text-white\\/70 { color: rgb(15 15 20 / 0.7) !important; }
[data-theme="light"] .group:hover .group-hover\\:text-white\\/60 { color: rgb(15 15 20 / 0.65) !important; }

/* ── Placeholder text ── */
[data-theme="light"] .placeholder\\:text-white\\/30::placeholder { color: rgb(15 15 20 / 0.35) !important; }
[data-theme="light"] .placeholder\\:text-white\\/20::placeholder { color: rgb(15 15 20 / 0.25) !important; }
[data-theme="light"] .placeholder\\:text-white\\/40::placeholder { color: rgb(15 15 20 / 0.45) !important; }

/* ── Backgrounds: white/XX → black/XX ── */
[data-theme="light"] .bg-white\\/\\[0\\.02\\] { background-color: rgb(0 0 0 / 0.02) !important; }
[data-theme="light"] .bg-white\\/\\[0\\.03\\] { background-color: rgb(0 0 0 / 0.025) !important; }
[data-theme="light"] .bg-white\\/\\[0\\.04\\] { background-color: rgb(0 0 0 / 0.03) !important; }
[data-theme="light"] .bg-white\\/5 { background-color: rgb(0 0 0 / 0.04) !important; }
[data-theme="light"] .bg-white\\/\\[0\\.06\\] { background-color: rgb(0 0 0 / 0.05) !important; }
[data-theme="light"] .bg-white\\/\\[0\\.07\\] { background-color: rgb(0 0 0 / 0.055) !important; }
[data-theme="light"] .bg-white\\/10 { background-color: rgb(0 0 0 / 0.06) !important; }
[data-theme="light"] .bg-white\\/15 { background-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .bg-white\\/20 { background-color: rgb(0 0 0 / 0.1) !important; }

/* ── Hover backgrounds ── */
[data-theme="light"] .hover\\:bg-white\\/\\[0\\.02\\]:hover { background-color: rgb(0 0 0 / 0.03) !important; }
[data-theme="light"] .hover\\:bg-white\\/\\[0\\.04\\]:hover { background-color: rgb(0 0 0 / 0.04) !important; }
[data-theme="light"] .hover\\:bg-white\\/5:hover { background-color: rgb(0 0 0 / 0.05) !important; }
[data-theme="light"] .hover\\:bg-white\\/\\[0\\.06\\]:hover { background-color: rgb(0 0 0 / 0.06) !important; }
[data-theme="light"] .hover\\:bg-white\\/\\[0\\.08\\]:hover { background-color: rgb(0 0 0 / 0.07) !important; }
[data-theme="light"] .hover\\:bg-white\\/10:hover { background-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .hover\\:bg-white\\/15:hover { background-color: rgb(0 0 0 / 0.1) !important; }
[data-theme="light"] .hover\\:bg-white\\/20:hover { background-color: rgb(0 0 0 / 0.12) !important; }

/* ── Borders: white/XX → black/XX ── */
[data-theme="light"] .border-white\\/\\[0\\.03\\] { border-color: rgb(0 0 0 / 0.03) !important; }
[data-theme="light"] .border-white\\/5 { border-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .border-white\\/\\[0\\.05\\] { border-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .border-white\\/\\[0\\.06\\] { border-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .border-white\\/10 { border-color: rgb(0 0 0 / 0.12) !important; }
[data-theme="light"] .border-white\\/\\[0\\.1\\] { border-color: rgb(0 0 0 / 0.12) !important; }
[data-theme="light"] .border-white\\/15 { border-color: rgb(0 0 0 / 0.15) !important; }
[data-theme="light"] .border-white\\/20 { border-color: rgb(0 0 0 / 0.18) !important; }

/* ── Hover borders ── */
[data-theme="light"] .hover\\:border-white\\/10:hover { border-color: rgb(0 0 0 / 0.15) !important; }
[data-theme="light"] .hover\\:border-white\\/\\[0\\.1\\]:hover { border-color: rgb(0 0 0 / 0.15) !important; }
[data-theme="light"] .hover\\:border-white\\/20:hover { border-color: rgb(0 0 0 / 0.2) !important; }

/* ── Divide ── */
[data-theme="light"] .divide-white\\/5 > :not([hidden]) ~ :not([hidden]) { border-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .divide-white\\/10 > :not([hidden]) ~ :not([hidden]) { border-color: rgb(0 0 0 / 0.12) !important; }

/* ── Ring ── */
[data-theme="light"] .ring-white\\/5 { --tw-ring-color: rgb(0 0 0 / 0.08) !important; }
[data-theme="light"] .ring-white\\/10 { --tw-ring-color: rgb(0 0 0 / 0.12) !important; }
[data-theme="light"] .focus\\:ring-white\\/10:focus { --tw-ring-color: rgb(0 0 0 / 0.12) !important; }

/* ── Focus borders ── */
[data-theme="light"] .focus\\:border-white\\/15:focus { border-color: rgb(0 0 0 / 0.15) !important; }
[data-theme="light"] .focus\\:border-white\\/10:focus { border-color: rgb(0 0 0 / 0.12) !important; }
[data-theme="light"] .focus\\:bg-white\\/\\[0\\.07\\]:focus { background-color: rgb(0 0 0 / 0.05) !important; }

/* ── Glass utility ── */
[data-theme="light"] .glass {
  background-color: rgb(255 255 255 / 0.85) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  backdrop-filter: blur(12px) !important;
  border-color: rgb(0 0 0 / 0.1) !important;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.06) !important;
}
[data-theme="light"] .glass-hover:hover {
  background-color: rgb(255 255 255 / 0.95) !important;
  border-color: rgb(0 0 0 / 0.15) !important;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08) !important;
}

/* ── Text gradient ── */
[data-theme="light"] .text-gradient {
  background: linear-gradient(to right, #4f46e5, #7c3aed) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
}

/* ── Dark backgrounds used in panels ── */
[data-theme="light"] .bg-gray-950\\/90 { background-color: rgb(255 255 255 / 0.95) !important; }
[data-theme="light"] .bg-gray-950\\/80 { background-color: rgb(255 255 255 / 0.9) !important; }
[data-theme="light"] .bg-gray-950\\/40 { background-color: rgb(247 247 250 / 0.95) !important; }
[data-theme="light"] .bg-gray-950 { background-color: rgb(255 255 255) !important; }
[data-theme="light"] .bg-gray-900\\/95 { background-color: rgb(255 255 255 / 0.97) !important; }
[data-theme="light"] .bg-gray-900 { background-color: rgb(247 247 250) !important; }
[data-theme="light"] .bg-gray-800 { background-color: rgb(0 0 0 / 0.06) !important; }
[data-theme="light"] .bg-gray-800\\/50 { background-color: rgb(0 0 0 / 0.04) !important; }

/* ── Branch graph gradients ── */
[data-theme="light"] .from-slate-950 { --tw-gradient-from: rgb(247 247 250) !important; }
[data-theme="light"] .to-slate-900\\/50 { --tw-gradient-to: rgb(242 242 246 / 0.5) !important; }

/* ── Border grays ── */
[data-theme="light"] .border-gray-800 { border-color: rgb(0 0 0 / 0.1) !important; }
[data-theme="light"] .border-gray-700 { border-color: rgb(0 0 0 / 0.12) !important; }
[data-theme="light"] .border-gray-700\\/50 { border-color: rgb(0 0 0 / 0.08) !important; }

/* ── Text grays ── */
[data-theme="light"] .text-gray-100 { color: rgb(15 15 20 / 0.9) !important; }
[data-theme="light"] .text-gray-200 { color: rgb(15 15 20 / 0.85) !important; }
[data-theme="light"] .text-gray-300 { color: rgb(15 15 20 / 0.65) !important; }
[data-theme="light"] .text-gray-400 { color: rgb(15 15 20 / 0.5) !important; }
[data-theme="light"] .text-gray-500 { color: rgb(15 15 20 / 0.45) !important; }

/* ── Shadows ── */
[data-theme="light"] .shadow-xl {
  --tw-shadow-color: rgb(0 0 0 / 0.08) !important;
  --tw-shadow: 0 20px 25px -5px var(--tw-shadow-color), 0 8px 10px -6px var(--tw-shadow-color) !important;
}
[data-theme="light"] .shadow-lg {
  --tw-shadow-color: rgb(0 0 0 / 0.06) !important;
  --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color), 0 4px 6px -4px var(--tw-shadow-color) !important;
}
[data-theme="light"] .hover\\:shadow-lg:hover { --tw-shadow-color: rgb(0 0 0 / 0.1) !important; }

/* ── Modal shadows ── */
[data-theme="light"] .shadow-2xl { box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.15) !important; }
[data-theme="light"] .shadow-black\\/50 { --tw-shadow-color: rgb(0 0 0 / 0.1) !important; }
[data-theme="light"] .shadow-black\\/60 { --tw-shadow-color: rgb(0 0 0 / 0.12) !important; }

/* ── Black overlays ── */
[data-theme="light"] .bg-black\\/50 { background-color: rgb(0 0 0 / 0.25) !important; }
[data-theme="light"] .bg-black\\/60 { background-color: rgb(0 0 0 / 0.3) !important; }
[data-theme="light"] .bg-black\\/40 { background-color: rgb(0 0 0 / 0.2) !important; }

/* ── Indigo accents ── */
[data-theme="light"] .bg-indigo-500\\/5 { background-color: rgb(99 102 241 / 0.06) !important; }
[data-theme="light"] .bg-indigo-500\\/10 { background-color: rgb(99 102 241 / 0.08) !important; }
[data-theme="light"] .border-indigo-500\\/10 { border-color: rgb(99 102 241 / 0.15) !important; }
[data-theme="light"] .border-indigo-500\\/20 { border-color: rgb(99 102 241 / 0.25) !important; }

/* ── Color accent contrast for light mode ── */
[data-theme="light"] .text-indigo-400 { color: rgb(79 70 229) !important; }
[data-theme="light"] .text-indigo-400\\/80 { color: rgb(79 70 229 / 0.8) !important; }
[data-theme="light"] .text-indigo-400\\/70 { color: rgb(79 70 229 / 0.7) !important; }
[data-theme="light"] .text-amber-400 { color: rgb(217 119 6) !important; }
[data-theme="light"] .text-red-400 { color: rgb(220 38 38) !important; }
[data-theme="light"] .text-emerald-400 { color: rgb(5 150 105) !important; }
[data-theme="light"] .text-emerald-300 { color: rgb(5 150 105) !important; }
[data-theme="light"] .text-blue-400 { color: rgb(37 99 235) !important; }
[data-theme="light"] .text-cyan-400 { color: rgb(8 145 178) !important; }
[data-theme="light"] .text-purple-400 { color: rgb(124 58 237) !important; }
[data-theme="light"] .text-yellow-400 { color: rgb(202 138 4) !important; }
[data-theme="light"] .text-orange-400 { color: rgb(234 88 12) !important; }
[data-theme="light"] .text-pink-400 { color: rgb(219 39 119) !important; }

/* ── Preserve white text on colored backgrounds ── */
[data-theme="light"] .bg-indigo-500 .text-white,
[data-theme="light"] .bg-indigo-500.text-white,
[data-theme="light"] .bg-indigo-600.text-white,
[data-theme="light"] .bg-red-500.text-white,
[data-theme="light"] .bg-emerald-500.text-white { color: white !important; }

/* ── Kbd styling ── */
[data-theme="light"] kbd {
  background-color: rgb(0 0 0 / 0.06) !important;
  border-color: rgb(0 0 0 / 0.12) !important;
  color: rgb(15 15 20 / 0.55) !important;
}

/* ── Selection ── */
[data-theme="light"] ::selection { background-color: rgb(99 102 241 / 0.2); }

/* ── Scrollbar ── */
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.12) !important; }
[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.25) !important; }

/* ── Surface backgrounds (use variables for consistency) ── */
[data-theme="light"] .bg-surface-0 { background-color: rgb(255 255 255) !important; }
[data-theme="light"] .bg-surface-1 { background-color: rgb(247 247 250) !important; }
[data-theme="light"] .bg-surface-2 { background-color: rgb(242 242 246) !important; }
[data-theme="light"] .bg-surface-2\\/50 { background-color: rgb(242 242 246 / 0.5) !important; }
[data-theme="light"] .bg-surface-3 { background-color: rgb(234 234 240) !important; }
[data-theme="light"] .bg-surface-3\\/80 { background-color: rgb(234 234 240 / 0.8) !important; }
[data-theme="light"] .bg-surface-4 { background-color: rgb(226 226 234) !important; }

/* ── Surface borders ── */
[data-theme="light"] .border-surface-3 { border-color: rgb(234 234 240) !important; }
[data-theme="light"] .border-surface-4 { border-color: rgb(226 226 234) !important; }
`.trim();

/**
 * Apply the given theme to the document.
 * This function is the single source of truth for theme application.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // 1. Set the data-theme attribute (for any CSS that references it)
  root.setAttribute('data-theme', theme);

  // 2. Set CSS variables DIRECTLY on the root element via inline styles.
  //    Inline styles have the highest specificity — guaranteed to override any CSS rule.
  const vars = THEME_VARS[theme];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.style.colorScheme = theme;

  // 3. Set body inline styles as fallback
  if (theme === 'light') {
    document.body.style.backgroundColor = '#f2f2f6';
    document.body.style.color = '#111827';
  } else {
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
  }

  // 4. Inject or remove the light-theme override stylesheet
  let styleTag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;

  if (theme === 'light') {
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = STYLE_TAG_ID;
      styleTag.setAttribute('type', 'text/css');
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = LIGHT_OVERRIDES_CSS;
  } else {
    if (styleTag) {
      styleTag.remove();
    }
  }

  // 5. Force style recalculation by reading a layout property
  // This ensures the browser applies all style changes immediately
  void document.body.offsetHeight;

  // Theme applied successfully
}
