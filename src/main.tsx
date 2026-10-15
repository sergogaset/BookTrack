import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createMockRepository } from './data/mockRepository';
import './styles.css';

// Development-only, deterministic scenarios for review; no network or persistent state.
const params = new URLSearchParams(location.search);
const repository = createMockRepository(import.meta.env.DEV && params.has('empty') ? { initial: [] } : {});
const failure = params.get('mockError');
if (import.meta.env.DEV && (failure === 'list' || failure === 'create' || failure === 'update' || failure === 'remove')) {
  repository.failNext(failure);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App repository={repository} /></React.StrictMode>,
);
