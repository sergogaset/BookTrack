import { useRef, useState } from 'react';
import { BookUnavailableError } from '../domain/errors';

// A synchronous lock also covers repeated submissions before React renders disabled controls.
export function useAsyncAction(failureMessage: string) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof BookUnavailableError ? cause.message : failureMessage); }
    finally { locked.current = false; setPending(false); }
  }
  return { pending, error, run, clearError: () => setError('') };
}
