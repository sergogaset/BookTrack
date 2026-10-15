import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, children, busy, onClose, initialFocus }: {
  title: string; children: ReactNode; busy: boolean; onClose(): void; initialFocus?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>(initialFocus ?? 'input')?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus]);
  return <dialog ref={ref} aria-labelledby="dialog-title" aria-busy={busy} onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className="p-5 sm:p-8">
      <h2 id="dialog-title" className="mb-6 break-words text-2xl font-semibold">{title}</h2>
      {children}
    </div>
  </dialog>;
}
