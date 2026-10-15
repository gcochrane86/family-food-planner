import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { card } from './ui';

const SECTIONS = [
  { to: 'household', title: 'Household', text: 'People, portion sizes, invite code' },
  { to: 'week', title: 'Office days', text: 'Packed lunches and quick dinners' },
  { to: 'kitchen', title: 'Kitchen', text: 'Thermomix, ovens, pans' },
  { to: 'rules', title: 'House rules', text: 'Swaps, preferences, things to avoid' },
  { to: 'shopping', title: 'Planning & shopping', text: 'Plan length, delivery slots, dinner time limit' },
  { to: 'staples', title: 'Cupboard staples', text: 'Have / low / out' },
];

export default function SettingsHome() {
  const { signOut } = useAuth();
  return (
    <section className="grid gap-4 py-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <ul className={`${card} divide-y divide-line`}>
        {SECTIONS.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="flex items-center justify-between gap-3 p-4 no-underline">
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-sm text-muted">{s.text}</span>
              </span>
              <span aria-hidden="true" className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" className="justify-self-start text-sm text-muted underline" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
