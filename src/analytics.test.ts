import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  delete window.ym;
  document.getElementById('booktrack-metrika')?.remove();
  vi.stubEnv('VITE_YANDEX_METRIKA_ID', '123456'); // Test fixture, never a production counter.
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('Optional analytics', () => {
  it('loads nothing before consent or after refusal', async () => {
    const analytics = await import('./analytics');
    analytics.pageView('/library');
    analytics.reachGoal('book_created');
    expect(document.getElementById('booktrack-metrika')).toBeNull();
    analytics.setConsent('declined');
    expect(window.ym).toBeUndefined();
    expect(analytics.readConsent()).toBe('declined');
  });
  it('deduplicates scripts/pages and strips URL/query/hash/referrer from outgoing views', async () => {
    history.replaceState(null, '', '/?unused=private-query#private-fragment');
    const analytics = await import('./analytics');
    const counter = vi.fn<(...args: unknown[]) => void>();
    window.ym = counter;
    analytics.setConsent('accepted');
    analytics.pageView('/auth');
    analytics.pageView('/library');
    analytics.pageView('/library');
    analytics.reachGoal('book_created');
    analytics.reachGoal('book_finished');
    analytics.reachGoal('book_deleted');
    const calls = counter.mock.calls;
    expect(document.querySelectorAll('#booktrack-metrika')).toHaveLength(1);
    expect(calls.filter(call => call[1] === 'hit')).toHaveLength(2);
    expect(calls.filter(call => call[1] === 'reachGoal')).toEqual([
      [123456, 'reachGoal', 'book_created'], [123456, 'reachGoal', 'book_finished'], [123456, 'reachGoal', 'book_deleted'],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/private|code=|token/);
    history.replaceState(null, '', '/');
  });
  it('never loads a third party while OAuth callback credentials are still in the URL', async () => {
    history.replaceState(null, '', '/auth/callback?code=test-only-private-code');
    const analytics = await import('./analytics');
    analytics.setConsent('accepted');
    expect(document.getElementById('booktrack-metrika')).toBeNull();
    history.replaceState(null, '', '/');
    analytics.pageView('/library');
    expect(document.getElementById('booktrack-metrika')).not.toBeNull();
  });
  it('revokes consent, destroys the counter and stops events', async () => {
    const analytics = await import('./analytics');
    const counter = vi.fn<(...args: unknown[]) => void>();
    window.ym = counter;
    analytics.setConsent('accepted');
    analytics.setConsent('declined');
    counter.mockClear();
    analytics.reachGoal('book_deleted');
    analytics.pageView('/library');
    expect(window.ym).not.toHaveBeenCalled();
    expect(document.getElementById('booktrack-metrika')).toBeNull();
  });
  it.each(['', 'not-a-counter', '0'])('works without a configured valid counter (%s)', async id => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', id);
    const analytics = await import('./analytics');
    expect(() => analytics.setConsent('accepted')).not.toThrow();
    expect(document.getElementById('booktrack-metrika')).toBeNull();
  });
  it('does not break CRUD if the counter is blocked or throws', async () => {
    const analytics = await import('./analytics');
    window.ym = vi.fn(() => { throw new Error('blocked'); });
    expect(() => { analytics.setConsent('accepted'); analytics.reachGoal('book_created'); analytics.setConsent('declined'); }).not.toThrow();
  });
  it('safely handles denied localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const analytics = await import('./analytics');
    expect(analytics.readConsent()).toBeNull();
    expect(() => analytics.setConsent('declined')).not.toThrow();
  });
});
