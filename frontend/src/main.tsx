import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './shell/Shell';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('brak elementu #root w index.html');

createRoot(container).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
