import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n'; // must be imported before App
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
