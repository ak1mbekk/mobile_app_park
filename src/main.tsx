import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// В Electron production загрузка через file:// — HashRouter держит всё в index.html#/path
const Router = window.location?.protocol === 'file:' ? HashRouter : BrowserRouter;

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="padding: 40px; color: #fff; background: #0b0f12; font-family: system-ui; text-align: center;"><h1 style="color: #ef4444;">Ошибка: элемент #root не найден</h1></div>';
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Router>
        <App />
      </Router>
    </React.StrictMode>
  );
}
