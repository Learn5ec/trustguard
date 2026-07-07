import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Catch async errors that React's error boundary can't catch (e.g. in event handlers)
window.addEventListener('unhandledrejection', (event) => {
  console.error('[TrustGuard] Unhandled async error:', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

