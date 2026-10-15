export type LogLevel = 'info' | 'warning' | 'error';
const messages = {
  health_ok: 'Application and database check passed',
  health_failed: 'Required backend check failed',
  health_method: 'Unsupported health request method',
  backend_failed: 'Backend operation failed',
} as const;
export type LogEvent = keyof typeof messages;

// Fixed vocabulary: callers cannot pass exception messages, payloads or credentials.
export function log(level: LogLevel, event: LogEvent, requestId?: string) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, message: messages[event],
    ...(requestId && /^[a-f0-9-]{36}$/i.test(requestId) ? { requestId } : {}) });
  if (level === 'error') console.error(entry);
  else if (level === 'warning') console.warn(entry);
  else console.info(entry);
}
