import { render, screen } from '@testing-library/react';
import PhotoFrame from './PhotoFrame';

vi.mock('../lib/repo', () => ({ repo: { heroUrl: (p: string) => `https://img.test/${p}`, makeSmallCopy: vi.fn() } }));

test('one photo fills a standard 4:3 frame; several sit in a grid of equal tiles with captions', () => {
  const { rerender } = render(<PhotoFrame photos={[{ path: 'a.jpg', alt: 'A' }]} />);
  expect(screen.getByRole('img', { name: 'A' })).toHaveClass('aspect-[4/3]', 'w-full', 'rounded-2xl', 'object-cover');
  rerender(<PhotoFrame photos={[{ path: 'a.jpg', alt: 'A', caption: 'potato, halved' }, { path: 'b.jpg', alt: 'B' }]} />);
  const [a, b] = screen.getAllByRole('img');
  expect(a.className).toBe(b.className);
  expect(screen.getByRole('list', { name: 'Photos' })).toHaveClass('grid-cols-2');
  expect(screen.getByText('potato, halved')).toBeInTheDocument();
});

test('no photos, no frame', () => {
  const { container } = render(<PhotoFrame photos={[]} />);
  expect(container).toBeEmptyDOMElement();
});
