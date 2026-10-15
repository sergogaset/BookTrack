import { useEffect, useSyncExternalStore } from 'react';
import { analytics, consentKey } from '../analytics/metrika';

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(analytics.subscribe, analytics.getConsent);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === consentKey || event.key === null) analytics.syncConsent(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  if (!analytics.configured) return null;
  return <section aria-label="Настройки аналитики" className="mx-4 mb-6 max-w-6xl rounded-xl border border-slate-200 bg-white p-5 sm:mx-8 xl:mx-auto">
    <h2 className="font-semibold">Необязательная аналитика</h2>
    <p className="my-3 text-sm text-slate-600">С вашего согласия Яндекс.Метрика получает просмотры экранов и события добавления, завершения чтения и удаления книг. Данные книг и аккаунта не передаются. Вы можете отказаться или отозвать согласие здесь.</p>
    <div className="flex flex-wrap items-center gap-3">
      {consent === 'granted' ? <>
        <p className="text-sm text-slate-600">Аналитика разрешена.</p>
        <button className="btn-secondary" onClick={() => analytics.setConsent('denied')}>Отозвать согласие</button>
      </> : <>
        {consent === 'denied' && <p className="text-sm text-slate-600">Аналитика отключена.</p>}
        <button className="btn-secondary" onClick={() => analytics.setConsent('granted')}>Разрешить аналитику</button>
        {consent === 'unset' && <button className="btn-secondary" onClick={() => analytics.setConsent('denied')}>Отказаться</button>}
      </>}
    </div>
  </section>;
}
