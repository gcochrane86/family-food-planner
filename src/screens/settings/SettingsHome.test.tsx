import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsHome from './SettingsHome';

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

test('Settings shows which version of the app is running', () => {
  render(<SettingsHome />, { wrapper: MemoryRouter });
  expect(screen.getByText(/^Version [0-9a-f]{7}|^Version dev/)).toHaveTextContent(/built \d{1,2} \w{3} \d{2}:\d{2}/);
});
