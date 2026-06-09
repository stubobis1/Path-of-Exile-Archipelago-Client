import React, { useState, useEffect } from 'react'
import { useStore, initStoreListeners } from './store'

const APP_PULSE_CSS = `
@keyframes app-err-pulse {
  0%,100% {
    opacity: 0;
    box-shadow: inset 0 0 0 3px var(--err), inset 0 0 80px color-mix(in srgb, var(--err) 18%, transparent);
  }
  50% {
    opacity: 1;
    box-shadow: inset 0 0 0 3px var(--err), inset 0 0 80px color-mix(in srgb, var(--err) 38%, transparent);
  }
}
.app-err-overlay {
  position: fixed; inset: 0; z-index: 9999; pointer-events: none;
  border: 3px solid var(--err);
  box-shadow: inset 0 0 80px color-mix(in srgb, var(--err) 18%, transparent),
              0 0 40px color-mix(in srgb, var(--err) 30%, transparent);
  animation: app-err-pulse 1.4s ease-in-out infinite;
}`
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Onboarding } from './screens/Onboarding'
import { DashboardPage } from './screens/Dashboard'
import { GearScreen } from './screens/Gear'
import { ItemsScreen } from './screens/Items'
import { GoalScreen } from './screens/Goal'
import { LocationsScreen } from './screens/Locations'
import { SettingsScreen } from './screens/Settings'
import { YamlGeneratorScreen } from './screens/YamlGenerator'

type Screen = 'dashboard' | 'gear' | 'items' | 'locations' | 'goal' | 'settings' | 'yaml' | 'setup'

let listenersInited = false

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [settingsSection, setSettingsSection] = useState('')
  const { onboardingDone, errors } = useStore()
  const [setupDone, setSetupDone] = useState(false)
  const [stateReady, setStateReady] = useState(false)

  const handleNavigate = (s: string, section?: string) => {
    setScreen(s as Screen)
    setSettingsSection(section ?? '')
  }

  useEffect(() => {
    if (!listenersInited) {
      initStoreListeners()
      listenersInited = true
    }
    // Mark ready after first state:full arrives (requestFullState is called inside initStoreListeners)
    const unsub = useStore.subscribe(() => { setStateReady(true); unsub() })
    return unsub
  }, [])

  if (!stateReady) return <div className="app"><TitleBar /></div>

  const showOnboarding = !onboardingDone && !setupDone

  if (showOnboarding) {
    return (
      <div className="app">
        <TitleBar />
        <Onboarding onDone={() => setSetupDone(true)} />
      </div>
    )
  }

  const hasErrors = errors.length > 0

  return (
    <div className="app">
      <style>{APP_PULSE_CSS}</style>
      {hasErrors && <div className="app-err-overlay" />}
      <TitleBar />
      <div className="shell">
        <Sidebar active={screen} onNavigate={s => { setScreen(s); setSettingsSection('') }} />
        <div className="content">
          {screen === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
          {screen === 'gear'      && <GearScreen />}
          {screen === 'items'     && <ItemsScreen />}
          {screen === 'locations' && <LocationsScreen />}
          {screen === 'goal'      && <GoalScreen />}
          {screen === 'yaml'      && <YamlGeneratorScreen />}
          {screen === 'settings'  && <SettingsScreen scrollTo={settingsSection} />}
          {screen === 'setup'     && <Onboarding onDone={() => setScreen('dashboard')} />}
        </div>
      </div>
    </div>
  )
}
