import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SleepPod3D from './sleep-pod-3d'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SleepPod3D />
  </StrictMode>,
)
