import { createHealthHandler } from '../server/health.js';

export default { fetch: createHealthHandler() };
