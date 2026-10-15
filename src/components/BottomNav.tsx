import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/week', label: 'Week', icon: 'M3 9h18M8 3v4M16 3v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
  { to: '/recipes', label: 'Recipes', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11' },
  { to: '/pantry', label: 'Pantry', icon: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 10h14M9 6.5v1M9 13v3' },
  { to: '/shop', label: 'Shop', icon: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6' },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="gutter fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pt-1.5"
      style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-1.5 text-[11.5px] font-semibold no-underline ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
