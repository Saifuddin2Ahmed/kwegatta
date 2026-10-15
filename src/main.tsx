import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for mobile installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration note:', err.message);
    });
  });
}

const sharePathMatch = window.location.pathname.match(/^\/e\/([^/]+)\/?$/);
if (sharePathMatch && !window.location.hash) {
  window.history.replaceState(null, '', `/#/events/${sharePathMatch[1]}`);
}

createRoot(document.getElementById('root')!).render(<App />);
