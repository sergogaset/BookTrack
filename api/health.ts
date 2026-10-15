import { createHealthHandler } from '../server/health';

export default { fetch: createHealthHandler() };
