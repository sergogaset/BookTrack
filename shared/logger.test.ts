// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backendError } from '../src/data/backendError';
import { logEvent, type LogDetails } from './logger';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('Structured logs', () => {
  it('writes one JSON record with the required fields and the correct severity', () => {
    logEvent('health.completed', { status: 200 });
    logEvent('health.method_rejected', { status: 405 });
    logEvent('health.completed', { status: 503 });
    for (const [method, level] of [['info', 'info'], ['warn', 'warning'], ['error', 'error']] as const) {
      const [line] = vi.mocked(console[method]).mock.calls[0];
      const record = JSON.parse(line);
      expect(record).toEqual({ timestamp: expect.any(String), level, event: expect.stringMatching(/^health\./), message: expect.any(String), status: level === 'info' ? 200 : level === 'warning' ? 405 : 503 });
      expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
      expect(line).not.toContain('\n');
    }
  });
  it('drops arbitrary fields, malformed request IDs and injected metadata instead of serializing them', () => {
    const privateValue = 'private-password-token-email-note';
    const details = {
      requestId: `attacker\n${privateValue}`, operation: privateValue, category: privateValue,
      message: privateValue, password: privateValue, token: privateValue, email: privateValue, notes: privateValue,
      status: 503, durationMs: Infinity, reason: privateValue,
      checks: { app: 'up', supabaseAuth: 'down', database: privateValue, extra: privateValue },
    } as unknown as LogDetails;
    logEvent('health.completed', details);
    const [line] = vi.mocked(console.error).mock.calls[0];
    expect(line).not.toContain(privateValue);
    expect(JSON.parse(line)).toEqual({ timestamp: expect.any(String), level: 'error', event: 'health.completed', message: 'Health check completed.', status: 503, checks: { app: 'up', supabaseAuth: 'down' } });
  });
  it('records only fixed categories from raw backend errors without their message or stack', () => {
    backendError(new TypeError('private-password-token-email-note'), 'create');
    const [line] = vi.mocked(console.error).mock.calls[0];
    expect(JSON.parse(line)).toMatchObject({ event: 'backend.failure', operation: 'create', category: 'network', level: 'error' });
    expect(line).not.toMatch(/private|stack|TypeError/);
    backendError({ code: 'invalid_credentials', message: 'private-credential-detail' }, 'auth');
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toMatchObject({ level: 'warning', operation: 'auth', category: 'validation' });
  });
  it('accepts a generated request ID but ignores unknown event names', () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    logEvent('health.completed', { requestId, status: 200, durationMs: 12.4 });
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({ requestId, durationMs: 12 });
    logEvent('private-user-input' as never);
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
  it('does not turn a console failure into an application failure', () => {
    vi.mocked(console.error).mockImplementation(() => { throw new Error('console unavailable'); });
    expect(() => logEvent('health.configuration_invalid')).not.toThrow();
  });
});
