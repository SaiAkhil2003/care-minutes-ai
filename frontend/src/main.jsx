import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { FacilityProvider } from './FacilityProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <FacilityProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </FacilityProvider>
    </BrowserRouter>
  </StrictMode>,
)
