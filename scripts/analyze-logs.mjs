import { readFile, stat } from 'node:fs/promises';

// Analyze only an explicitly selected, sanitized JSONL export. Never echo raw records.
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/analyze-logs.mjs <sanitized-jsonl-file>');
  process.exit(2);
}
try {
  if ((await stat(file)).size > 1024 * 1024) throw new Error('Log export is too large');
  const events = ['backend.failure', 'health.completed', 'health.configuration_invalid', 'health.method_rejected'];
  const report = {
    inputKind: file.endsWith('.demo.jsonl') ? 'demonstration' : 'supplied_sanitized_export',
    records: 0, invalidLines: 0,
    levels: { info: 0, warning: 0, error: 0 },
    events: Object.fromEntries(events.map(event => [event, 0])),
    failedChecks: { app: 0, supabaseAuth: 0, database: 0 },
  };
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/).filter(line => line.trim())) {
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== 'object' || !events.includes(record.event) || !Object.hasOwn(report.levels, record.level) || typeof record.timestamp !== 'string' || !Number.isFinite(Date.parse(record.timestamp))) throw new Error();
      report.records++;
      report.levels[record.level]++;
      report.events[record.event]++;
      if (record.event === 'health.completed') {
        for (const key of Object.keys(report.failedChecks)) if (record.checks?.[key] === 'down') report.failedChecks[key]++;
      }
    } catch { report.invalidLines++; }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.invalidLines) process.exitCode = 1;
} catch {
  console.error('Cannot analyze the selected log export. Check its availability and size (maximum 1 MiB).');
  process.exitCode = 1;
}
