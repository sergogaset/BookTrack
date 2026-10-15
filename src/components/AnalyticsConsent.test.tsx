import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalyticsConsent } from './AnalyticsConsent';
import { analytics, consentKey } from '../analytics/metrika';

vi.mock('../analytics/metrika', async importOriginal => {
  const original = await importOriginal<typeof import('../analytics/metrika')>();
  return { ...original, analytics: original.createAnalytics('123456') };
});
beforeEach(() => {
  localStorage.clear();
  analytics.syncConsent();
  analytics.page('auth');
});
afterEach(() => {
  act(() => analytics.setConsent('denied'));
  localStorage.clear();
  delete window.ym;
});

it('offers equal opt-in/refusal choices, remembers refusal and allows withdrawal after opt-in', async () => {
  render(<StrictMode><AnalyticsConsent /></StrictMode>);
  expect(document.querySelector('[data-booktrack-analytics]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Отказаться' }));
  expect(localStorage.getItem(consentKey)).toBe('denied');
  expect(screen.getByText('Аналитика отключена.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Разрешить аналитику' }));
  expect(document.querySelectorAll('[data-booktrack-analytics]')).toHaveLength(1);
  expect(localStorage.getItem(consentKey)).toBe('granted');
  const send = vi.fn();
  window.ym = send;
  act(() => document.querySelector('script[data-booktrack-analytics]')!.dispatchEvent(new Event('load')));
  await userEvent.click(screen.getByRole('button', { name: 'Отозвать согласие' }));
  expect(send).toHaveBeenLastCalledWith(123456, 'destruct');
  expect(localStorage.getItem(consentKey)).toBe('denied');
  expect(document.querySelector('[data-booktrack-analytics]')).toBeNull();
});

it('applies withdrawal from another tab without leaving a running counter', async () => {
  render(<AnalyticsConsent />);
  await userEvent.click(screen.getByRole('button', { name: 'Разрешить аналитику' }));
  const send = vi.fn();
  window.ym = send;
  act(() => document.querySelector('script[data-booktrack-analytics]')!.dispatchEvent(new Event('load')));
  localStorage.setItem(consentKey, 'denied');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: consentKey })));
  expect(send).toHaveBeenLastCalledWith(123456, 'destruct');
  expect(screen.getByText('Аналитика отключена.')).toBeVisible();
});
