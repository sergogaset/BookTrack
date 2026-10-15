import { useRef, useState } from 'react';
import { BookUnavailableError } from '../domain/errors';
import { BackendError } from '../data/backendError';

// A synchronous lock also covers repeated submissions before React renders disabled controls.
export function useAsyncAction(failureMessage: string) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  async function run(action: () => Promise<void>) {
    if (locked.current || needsReview) return;
    locked.current = true;
    setPending(true);
    setError('');
    try { await action(); }
    catch (cause) {
      setError(cause instanceof BookUnavailableError || cause instanceof BackendError ? cause.message : failureMessage);
      setNeedsReview(cause instanceof BackendError && cause.needsReview);
    }
    finally { locked.current = false; setPending(false); }
  }
  return { pending, error, needsReview, run, clearError: () => setError('') };
}
