import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentKey, createAnalytics } from './metrika';

let tracker: ReturnType<typeof createAnalytics>;
const tag = () => document.querySelector<HTMLScriptElement>('[data-booktrack-analytics]');
function loaded() {
  const send = vi.fn();
  window.ym = send;
  tag()!.dispatchEvent(new Event('load'));
  return send;
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  tracker = createAnalytics('123456');
});
afterEach(() => {
  tracker.setConsent('denied');
  localStorage.clear();
  delete window.ym;
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('Optional Metrika analytics', () => {
  it('never loads or buffers events before consent, including a stored refusal', () => {
    tracker.page('library');
    tracker.goal('book_created');
    expect(tag()).toBeNull();
    expect(window.ym).toBeUndefined();
    tracker.setConsent('denied');
    const restored = createAnalytics('123456');
    restored.page('library');
    expect(restored.getConsent()).toBe('denied');
    expect(tag()).toBeNull();
    tracker.setConsent('granted');
    expect(loaded().mock.calls.map(call => call[1])).toEqual(['init', 'hit']);
  });
  it('initializes once and sends one sanitized hit per logical SPA screen', () => {
    tracker.setConsent('granted');
    expect(tag()).toBeNull(); // Auth restoration must choose a screen first.
    tracker.page('auth');
    tracker.page('auth'); // React StrictMode must not duplicate loading or hits.
    expect(document.querySelectorAll('[data-booktrack-analytics]')).toHaveLength(1);
    const send = loaded();
    tracker.page('auth');
    tracker.page('library');
    tracker.page('library');
    expect(send.mock.calls).toEqual([
      [123456, 'init', expect.objectContaining({ defer: true, webvisor: false, clickmap: false, trackLinks: false, trackHash: false, sendTitle: false, disableYtm: true })],
      [123456, 'hit', `${location.origin}/#auth`, { title: 'BookTrack', referer: `${location.origin}/` }],
      [123456, 'hit', `${location.origin}/#library`, { title: 'BookTrack', referer: `${location.origin}/` }],
    ]);
  });
  it('buffers only consented events during loading and sends only allowlisted names', () => {
    tracker.page('library');
    tracker.goal('book_deleted');
    tracker.setConsent('granted');
    tracker.goal('book_created');
    const send = loaded();
    tracker.goal('book_finished');
    tracker.goal('book_deleted');
    expect(send.mock.calls.filter(call => call[1] === 'reachGoal')).toEqual([
      [123456, 'reachGoal', 'book_created'], [123456, 'reachGoal', 'book_finished'], [123456, 'reachGoal', 'book_deleted'],
    ]);
  });
  it('destroys the counter on withdrawal, drops events and permits a later opt-in', () => {
    tracker.page('library');
    tracker.setConsent('granted');
    const send = loaded();
    tracker.setConsent('denied');
    expect(send).toHaveBeenLastCalledWith(123456, 'destruct');
    expect(tag()).toBeNull();
    tracker.goal('book_deleted');
    tracker.page('auth');
    expect(send).toHaveBeenCalledTimes(3);
    tracker.setConsent('granted');
    const nextSend = loaded();
    expect(nextSend.mock.calls.map(call => call[1])).toEqual(['init', 'hit']);
  });
  it('ignores a late script load after withdrawal and clears pending goals', () => {
    tracker.page('library');
    tracker.setConsent('granted');
    tracker.goal('book_created');
    const script = tag()!;
    const onload = script.onload!;
    tracker.setConsent('denied');
    const send = vi.fn();
    window.ym = send;
    onload.call(script, new Event('load'));
    expect(send).not.toHaveBeenCalled();
    tracker.setConsent('granted');
    expect(loaded().mock.calls.map(call => call[1])).toEqual(['init', 'hit']);
  });
  it.each(['/?code=private-oauth-code', '/?email=private@example.test', '/#access_token=private-token'])('does not load third-party code on an unsafe URL: %s', url => {
    window.history.replaceState(null, '', url);
    tracker.setConsent('granted');
    tracker.page('auth');
    expect(tag()).toBeNull();
    expect(window.ym).toBeUndefined();
    window.history.replaceState(null, '', '/');
    tracker.page('auth');
    const send = loaded();
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/private|code=|email=|access_token=/);
  });
  it('honors a stored grant and storage changes from another tab', () => {
    localStorage.setItem(consentKey, 'granted');
    tracker = createAnalytics('123456');
    tracker.page('library');
    const send = loaded();
    const listener = vi.fn();
    const unsubscribe = tracker.subscribe(listener);
    localStorage.setItem(consentKey, 'denied');
    tracker.syncConsent();
    expect(send).toHaveBeenLastCalledWith(123456, 'destruct');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it('keeps the app usable with blocked storage, a blocked script or a throwing SDK', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    tracker = createAnalytics('123456');
    expect(tracker.getConsent()).toBe('unset');
    tracker.page('library');
    tracker.setConsent('granted');
    tag()!.dispatchEvent(new Event('error'));
    expect(tag()).toBeNull();
    tracker.setConsent('granted');
    window.ym = () => { throw new Error('SDK unavailable'); };
    expect(() => tag()!.dispatchEvent(new Event('load'))).not.toThrow();
    expect(() => tracker.goal('book_created')).not.toThrow();
    expect(() => tracker.setConsent('denied')).not.toThrow();
  });
  it.each([undefined, '', '0', '-1', 'abc', '123<script>', '9007199254740992'])('disables analytics for an absent or invalid ID: %s', id => {
    tracker = createAnalytics(id);
    tracker.page('library');
    tracker.setConsent('granted');
    expect(tracker.configured).toBe(false);
    expect(tag()).toBeNull();
  });
});
