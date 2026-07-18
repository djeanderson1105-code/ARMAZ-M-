import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initImageCacheFromIDB } from './utils/indexedDbCache.ts';

// Init IndexedDB Cache before rendering to guarantee instant transparent restore
initImageCacheFromIDB().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
