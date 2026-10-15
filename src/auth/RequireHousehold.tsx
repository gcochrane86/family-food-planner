import ErrorBanner from '../components/ErrorBanner';
import { useAuth } from './AuthProvider';
import Onboarding from './Onboarding';
import SignIn from './SignIn';

/** Shows sign-in or household setup until both exist, then the requested screen (the URL is left untouched). */
export default function RequireHousehold({ children }: { children: React.ReactNode }) {
  const { session, householdId, loading, error, refresh } = useAuth();
  if (error) {
    return (
      <div className="py-10">
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      </div>
    );
  }
  if (loading) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (!session) return <SignIn />;
  if (!householdId) return <Onboarding />;
  return <>{children}</>;
}
