import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthenticatedApp } from './AuthenticatedApp';
import { createAuthService } from './data/authService';
import { createSupabaseClient } from './data/supabase';
import { createSupabaseRepository } from './data/supabaseRepository';
import './styles.css';
import { AnalyticsConsent } from './components/AnalyticsConsent';

const root = ReactDOM.createRoot(document.getElementById('root')!);
try {
  const client = createSupabaseClient();
  const auth = createAuthService(client);
  root.render(<React.StrictMode><AuthenticatedApp auth={auth} repositoryFor={(userId, onInvalid) => createSupabaseRepository(client, userId, onInvalid)} /><AnalyticsConsent /></React.StrictMode>);
} catch (cause) {
  root.render(<main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Настройка BookTrack</h1><p role="alert" className="field-error mt-4">{cause instanceof Error ? cause.message : 'Не удалось настроить подключение к Supabase.'}</p></main>);
}
