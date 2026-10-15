export type AnalyticsGoal = 'book_created' | 'book_finished' | 'book_deleted';
export type AnalyticsPage = '/auth' | '/library';
export type Consent = 'accepted' | 'declined' | null;
type Metrika = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global { interface Window { ym?: Metrika } }
const storageKey = 'booktrack.analytics-consent';
let consent: Consent = readConsent();
let activeId: number | null = null;
let currentPage: AnalyticsPage = '/auth';
let lastPage: AnalyticsPage | null = null;

export function readConsent(): Consent {
  try { const value = localStorage.getItem(storageKey); return value === 'accepted' || value === 'declined' ? value : null; }
  catch { return null; }
}
function send(...args: unknown[]) {
  try { if (activeId && consent === 'accepted') window.ym?.(activeId, ...args); }
  catch { /* Analytics must never affect Auth or CRUD. */ }
}
function start() {
  const raw: unknown = import.meta.env.VITE_YANDEX_METRIKA_ID;
  if (consent !== 'accepted' || activeId || typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return;
  // Consent may be clicked before Auth finishes restoring. Wait for URL cleanup.
  const callback = new URL(window.location.href);
  const fragment = new URLSearchParams(callback.hash.slice(1));
  if (callback.pathname === '/auth/callback' || ['code', 'error', 'access_token', 'refresh_token'].some(key => callback.searchParams.has(key) || fragment.has(key))) return;
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) return;
  activeId = id;
  if (!window.ym) {
    const queue: Metrika = (...args) => { queue.a?.push(args); };
    queue.a = [];
    queue.l = Date.now();
    window.ym = queue;
  }
  if (!document.getElementById('booktrack-metrika')) {
    const script = document.createElement('script');
    script.id = 'booktrack-metrika';
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  }
  send('init', { defer: true, clickmap: false, trackLinks: false, accurateTrackBounce: false,
    webvisor: false, trackHash: false, sendTitle: false });
}
export function pageView(page: AnalyticsPage) {
  currentPage = page;
  start();
  if (!activeId || consent !== 'accepted' || lastPage === page) return;
  send('hit', `${window.location.origin}${page}`, { title: 'BookTrack', referer: '' });
  lastPage = page;
}
export function setConsent(value: Exclude<Consent, null>) {
  consent = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Keep the choice for this tab. */ }
  if (value === 'declined') {
    try { if (activeId) window.ym?.(activeId, 'destruct'); } catch { /* Optional script. */ }
    if (window.ym?.a) window.ym.a = [];
    activeId = null;
    lastPage = null;
    document.getElementById('booktrack-metrika')?.remove();
  } else pageView(currentPage);
}
export function reachGoal(goal: AnalyticsGoal) {
  if (!['book_created', 'book_finished', 'book_deleted'].includes(goal)) return;
  send('reachGoal', goal);
}
