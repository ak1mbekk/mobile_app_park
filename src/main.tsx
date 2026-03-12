import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const Router = window.location?.protocol === 'file:' ? HashRouter : BrowserRouter;

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="padding: 40px; color: #fff; background: #0b0f12; font-family: system-ui; text-align: center;"><h1 style="color: #ef4444;">Ошибка: элемент #root не найден</h1></div>';
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <Router>
            <App />
          </Router>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    rootElement.innerHTML = [
      '<div style="padding: 24px; font-family: system-ui; background: #e4e8ec; color: #2d3748; min-height: 100vh;">',
      '<h1 style="color: #c53030; margin-bottom: 12px;">Ошибка запуска</h1>',
      '<pre style="white-space: pre-wrap; font-size: 14px;">' + msg + '</pre>',
      '<p style="margin-top: 16px;">Перезапустите приложение.</p>',
      '</div>',
    ].join('');
    console.error('Root render error:', e);
  }
}
