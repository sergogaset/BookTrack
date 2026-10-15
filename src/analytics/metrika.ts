export type AnalyticsConsent = 'unset' | 'granted' | 'denied';
export type AnalyticsPage = 'auth' | 'library';
export type BookGoal = 'book_created' | 'book_finished' | 'book_deleted';
export const consentKey = 'booktrack.analytics-consent.v1';

type MetrikaCommand = [number, 'init' | 'hit' | 'reachGoal' | 'destruct', ...unknown[]];
type Metrika = { (...args: MetrikaCommand): void; a?: MetrikaCommand[]; l?: number };
declare global { interface Window { ym?: Metrika } }

export function createAnalytics(rawId: unknown) {
  const id = typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : null;
  function readConsent(): AnalyticsConsent {
    try {
      const value = localStorage.getItem(consentKey);
      return value === 'granted' || value === 'denied' ? value : 'unset';
    } catch { return 'unset'; }
  }
  let consent = readConsent();
  let page: AnalyticsPage | null = null;
  let lastPage: AnalyticsPage | null = null;
  let script: HTMLScriptElement | null = null;
  let active = false;
  let goals: BookGoal[] = [];
  const listeners = new Set<() => void>();
  const rootUrl = () => `${window.location.origin}/`;
  // Never load third-party code while an OAuth callback or arbitrary URL data is present.
  const safeLocation = () => !window.location.search && ['', '#auth', '#library'].includes(window.location.hash);
  function send(...args: MetrikaCommand) {
    try { window.ym?.(...args); } catch { /* Optional analytics must not interrupt the library. */ }
  }
  function hit() {
    if (!id || !active || consent !== 'granted' || !page || lastPage === page || !safeLocation()) return;
    send(id, 'hit', `${rootUrl()}#${page}`, { title: 'BookTrack', referer: rootUrl() });
    lastPage = page;
  }
  function start() {
    if (!id || consent !== 'granted' || !page || script || !safeLocation()) return;
    if (!window.ym) {
      const stub: Metrika = (...args) => { (stub.a ??= []).push(args); };
      stub.l = Date.now();
      window.ym = stub;
    }
    const tag = document.createElement('script');
    script = tag;
    tag.async = true;
    tag.src = 'https://mc.yandex.ru/metrika/tag.js';
    tag.referrerPolicy = 'no-referrer';
    tag.dataset.booktrackAnalytics = 'true';
    tag.onload = () => {
      if (script !== tag || consent !== 'granted' || !safeLocation()) return;
      active = true;
      send(id, 'init', {
        defer: true, clickmap: false, trackLinks: false, trackHash: false,
        accurateTrackBounce: false, webvisor: false, ecommerce: false,
        sendTitle: false, disableYtm: true,
      });
      hit();
      for (const goal of goals) send(id, 'reachGoal', goal);
      goals = [];
    };
    tag.onerror = () => { stop(); };
    document.head.append(tag);
  }
  function stop() {
    goals = [];
    if (active && id) send(id, 'destruct');
    active = false;
    lastPage = null;
    if (script) { script.onload = null; script.onerror = null; script.remove(); script = null; }
    // Drop pending commands if consent was withdrawn before the library finished loading.
    if (window.ym?.a) window.ym.a = [];
  }
  function applyConsent(next: AnalyticsConsent) {
    consent = next;
    if (next === 'granted') start(); else stop();
    for (const listener of listeners) listener();
  }
  return {
    configured: id !== null,
    getConsent: () => consent,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setConsent(next: 'granted' | 'denied') {
      try { localStorage.setItem(consentKey, next); } catch { /* The choice still applies to this tab. */ }
      applyConsent(next);
    },
    syncConsent() { applyConsent(readConsent()); },
    page(next: AnalyticsPage) { page = next; start(); hit(); },
    goal(goal: BookGoal) {
      if (!id || consent !== 'granted' || !safeLocation() || !['book_created', 'book_finished', 'book_deleted'].includes(goal)) return;
      if (active) send(id, 'reachGoal', goal);
      else if (script && goals.length < 100) goals.push(goal);
    },
  };
}

export const analytics = createAnalytics(import.meta.env.VITE_YANDEX_METRIKA_ID);
