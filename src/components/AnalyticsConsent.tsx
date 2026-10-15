import { useEffect, useState } from 'react';
import { readConsent, setConsent, type Consent } from '../analytics';

export function AnalyticsConsent() {
  const [choice, setChoice] = useState<Consent>(readConsent);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const sync = () => { const next = readConsent(); setConsent(next ?? 'declined'); setChoice(next); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function choose(value: 'accepted' | 'declined') { setConsent(value); setChoice(value); setEditing(false); }
  return <aside aria-label="Настройки аналитики" className="mx-auto max-w-6xl px-4 py-5 text-sm text-slate-600">
    {choice === null || editing ? <>
      <p>Разрешить необязательную аналитику Яндекс.Метрики? Она помогает оценивать посещения и успешные действия. Названия книг, заметки и email в события не передаются. Выбор можно изменить здесь.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button className="btn-secondary" onClick={() => choose('accepted')}>Разрешить аналитику</button>
        <button className="btn-secondary" onClick={() => choose('declined')}>Отказаться</button>
      </div>
    </> : <button className="text-teal-700 underline" onClick={() => setEditing(true)}>Настройки аналитики: {choice === 'accepted' ? 'разрешена' : 'отключена'}</button>}
  </aside>;
}
