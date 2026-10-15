import { render, screen } from '@testing-library/react';
import App from './App';

test('renders bottom nav with Week, Recipes, Pantry, Shop and a Settings link', () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  for (const name of ['Week', 'Recipes', 'Pantry', 'Shop']) {
    expect(nav).toContainElement(screen.getByRole('link', { name }));
  }
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
});
