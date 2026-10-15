import { describe, expect, it, vi } from 'vitest';
import { log } from './logger';

describe('JSON logger', () => {
  it.each(['info', 'warning', 'error'] as const)('writes %s with a fixed schema', level => {
    const sink = vi.spyOn(console, level === 'warning' ? 'warn' : level).mockImplementation(() => undefined);
    const requestId = '10000000-0000-4000-8000-000000000001';
    log(level, 'health_failed', requestId);
    const result = JSON.parse(sink.mock.calls[0][0] as string);
    expect(result).toMatchObject({ level, event: 'health_failed', message: 'Required backend check failed', requestId });
    expect(Number.isFinite(Date.parse(result.timestamp))).toBe(true);
    sink.mockRestore();
  });
  it('does not accept arbitrary request identifiers', () => {
    const sink = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    log('warning', 'backend_failed', 'private@example.test');
    expect(JSON.parse(sink.mock.calls[0][0] as string)).not.toHaveProperty('requestId');
    sink.mockRestore();
  });
});
