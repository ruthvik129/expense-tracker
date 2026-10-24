import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/AppShell'
import { LoadingState } from '@/components/states'
import { SettingsProvider, useSettings } from '@/data/settings'
import { AppProvider } from '@/data/store'
import AddScreen from '@/screens/AddScreen'
import HistoryScreen from '@/screens/HistoryScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import BillsScreen from '@/screens/BillsScreen'

// Chart-heavy screens load on demand so the Add screen opens fast.
const WeeklyScreen = lazy(() => import('@/screens/WeeklyScreen'))
const MonthlyScreen = lazy(() => import('@/screens/MonthlyScreen'))
const YearScreen = lazy(() => import('@/screens/YearScreen'))

function Themed() {
  const { settings } = useSettings()
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return <Toaster theme={dark ? 'dark' : 'light'} position="top-center" />
}

export default function App() {
  return (
    <SettingsProvider>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-4"><LoadingState /></div>}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<AddScreen />} />
                <Route path="bills" element={<BillsScreen />} />
                <Route path="history" element={<HistoryScreen />} />
                <Route path="week" element={<WeeklyScreen />} />
                <Route path="month" element={<MonthlyScreen />} />
                <Route path="year" element={<YearScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
                <Route path="*" element={<AddScreen />} />
              </Route>
            </Routes>
          </Suspense>
          <Themed />
        </BrowserRouter>
      </AppProvider>
    </SettingsProvider>
  )
}
