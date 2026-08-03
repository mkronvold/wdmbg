import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startVersionWatcher } from './versionCheck';
import './index.css';

const queryClient = new QueryClient();

// Reload when GHCR autoupdate serves a new web image (version.json SHA changes).
startVersionWatcher();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
