const messages = {
  'backend.failure': 'Backend operation failed.',
  'health.completed': 'Health check completed.',
  'health.configuration_invalid': 'Health check configuration is unavailable.',
  'health.method_rejected': 'Health check rejected an unsupported method.',
} as const;

export type LogEvent = keyof typeof messages;
type Operation = 'auth' | 'list' | 'create' | 'update' | 'remove';
type Category = 'validation' | 'unauthenticated' | 'unavailable' | 'network' | 'unexpected';
type Checks = Partial<Record<'app' | 'supabaseAuth' | 'database', 'up' | 'down'>>;
export interface LogDetails {
  requestId?: string; operation?: Operation; category?: Category;
  status?: number; durationMs?: number; checks?: Checks; reason?: 'timeout' | 'dependency';
}

// Only fixed messages and explicitly allowed metadata can enter a log record.
// Never accept Error objects, request headers, URLs, user identities or book data.
export function logEvent(event: LogEvent, details: LogDetails = {}): void {
  if (!Object.hasOwn(messages, event)) return;
  const level = event === 'health.method_rejected' || event === 'backend.failure' && !['network', 'unexpected'].includes(details.category ?? '')
    ? 'warning' : event === 'health.completed' && details.status === 200 ? 'info' : 'error';
  const record: Record<string, unknown> = { timestamp: new Date().toISOString(), level, event, message: messages[event] };
  if (typeof details.requestId === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(details.requestId)) record.requestId = details.requestId;
  if (['auth', 'list', 'create', 'update', 'remove'].includes(details.operation ?? '')) record.operation = details.operation;
  if (['validation', 'unauthenticated', 'unavailable', 'network', 'unexpected'].includes(details.category ?? '')) record.category = details.category;
  if (typeof details.status === 'number' && Number.isInteger(details.status) && details.status >= 100 && details.status <= 599) record.status = details.status;
  if (typeof details.durationMs === 'number' && Number.isFinite(details.durationMs) && details.durationMs >= 0) record.durationMs = Math.round(details.durationMs);
  if (details.reason === 'timeout' || details.reason === 'dependency') record.reason = details.reason;
  if (details.checks) {
    const checks: Checks = {};
    for (const key of ['app', 'supabaseAuth', 'database'] as const) {
      const state = details.checks[key];
      if (state === 'up' || state === 'down') checks[key] = state;
    }
    record.checks = checks;
  }
  try {
    const line = JSON.stringify(record);
    if (level === 'info') console.info(line);
    else if (level === 'warning') console.warn(line);
    else console.error(line);
  } catch { /* Diagnostics must never interrupt the user's operation. */ }
}
