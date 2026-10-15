import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireHousehold from './auth/RequireHousehold';
import BottomNav from './components/BottomNav';
import Placeholder from './screens/Placeholder';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl pb-28">
      <header
        className="sticky z-10 flex items-center justify-between bg-bg py-3"
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
      <Route path="/week" element={<Placeholder title="Week" phase={3} />} />
      <Route path="/recipes" element={<Placeholder title="Recipes" phase={2} />} />
      <Route path="/pantry" element={<Placeholder title="Pantry" phase={3} />} />
      <Route path="/shop" element={<Placeholder title="Shop" phase={3} />} />
      <Route path="/settings/*" element={<Placeholder title="Settings" phase={1} />} />
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
