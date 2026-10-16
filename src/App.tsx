import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireHousehold from './auth/RequireHousehold';
import BottomNav from './components/BottomNav';
import Placeholder from './screens/Placeholder';
import CookMode from './screens/recipes/CookMode';
import WeekView from './screens/week/WeekView';
import RecipeCard from './screens/recipes/RecipeCard';
import RecipeLibrary from './screens/recipes/RecipeLibrary';
import Household from './screens/settings/Household';
import HouseRules from './screens/settings/HouseRules';
import Kitchen from './screens/settings/Kitchen';
import SettingsHome from './screens/settings/SettingsHome';
import Shopping from './screens/settings/Shopping';
import Staples from './screens/settings/Staples';
import WeekPattern from './screens/settings/WeekPattern';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl pb-28">
      <header
        className="sticky z-10 flex items-center justify-between bg-bg py-3 print:hidden"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Family Food Planner</span>
        <Link to="/settings" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold no-underline">
          Settings
        </Link>
      </header>
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/week" replace />} />
      <Route path="/week" element={<WeekView />} />
      <Route path="/recipes" element={<RecipeLibrary />} />
      <Route path="/recipes/:id" element={<RecipeCard />} />
      <Route path="/recipes/:id/cook" element={<CookMode />} />
      <Route path="/pantry" element={<Placeholder title="Pantry" phase={3} />} />
      <Route path="/shop" element={<Placeholder title="Shop" phase={3} />} />
      <Route path="/settings">
        <Route index element={<SettingsHome />} />
        <Route path="household" element={<Household />} />
        <Route path="week" element={<WeekPattern />} />
        <Route path="kitchen" element={<Kitchen />} />
        <Route path="rules" element={<HouseRules />} />
        <Route path="shopping" element={<Shopping />} />
        <Route path="staples" element={<Staples />} />
      </Route>
      <Route path="*" element={<Navigate to="/week" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <div className="gutter">
          <RequireHousehold>
            <Shell>
              <AppRoutes />
            </Shell>
          </RequireHousehold>
        </div>
      </AuthProvider>
    </HashRouter>
  );
}
