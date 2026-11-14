import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CutGuideView from './CutGuide';
import { savePxPerMm } from '../lib/cutGuide';

vi.mock('../lib/repo', () => ({ repo: { heroUrl: (p: string) => `https://img.test/${p}`, makeSmallCopy: vi.fn() } }));

beforeEach(() => localStorage.clear());

test('with the ruler set, the cut, its meaning, a true-size marker and a life-size piece show', () => {
  savePxPerMm(5);
  render(<CutGuideView name="carrot" qty="1½" note="large, peeled, cut into 3cm chunks" photo="h/prep/cartoon-carrot.jpg" onClose={() => {}} />);
  const view = screen.getByRole('dialog', { name: 'How to cut carrot' });
  expect(within(view).getByText('Peel and cut the carrot into 3cm chunks')).toBeInTheDocument();
  expect(within(view).getByText(/rough cubes/i)).toBeInTheDocument();
  expect(within(view).getByRole('img', { name: 'carrot, chunks (3cm)' })).toBeInTheDocument();
  expect(within(view).getByText('3cm chunks').closest('[data-mm]')).toHaveStyle({ top: '150px' });
  expect(within(view).getByLabelText('Life-size piece: 3cm')).toHaveStyle({ width: '150px', height: '150px' });
});

test('the ruler is set once against a bank card and then shows', () => {
  render(<CutGuideView name="ginger" qty="3 cm" note="peeled, sliced into 2mm discs" photo={null} onClose={() => {}} />);
  expect(screen.queryByText('2mm discs')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Set the ruler' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Card size' }), { target: { value: '428' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('3cm piece').closest('[data-mm]')).toHaveStyle({ top: '150px' });
  expect(screen.getByText('2mm discs').closest('[data-mm]')).toHaveStyle({ top: '10px' });
  expect(Number(localStorage.getItem('cut-ruler:px-per-mm'))).toBeCloseTo(5);
});

test('a missing picture can be made from the view', async () => {
  savePxPerMm(5);
  const onMake = vi.fn().mockResolvedValue('h/prep/cartoon-x.jpg');
  render(<CutGuideView name="red onion" qty="1½" note="peeled, halved" photo={null} onMake={onMake} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Make the picture' }));
  expect(await screen.findByRole('img', { name: 'red onion, halved' })).toBeInTheDocument();
  expect(onMake).toHaveBeenCalled();
});

test('Close goes back', async () => {
  const onClose = vi.fn();
  render(<CutGuideView name="carrot" qty="1" note="cut into 3cm chunks" photo={null} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

test("the red line sits on the size itself (the marker row has no height of its own)", () => {
  savePxPerMm(5);
  render(<CutGuideView name="carrot" qty="1" note="cut into 3cm chunks" photo={null} onClose={() => {}} />);
  expect(screen.getByText('3cm chunks').closest('[data-mm]')).toHaveClass('h-0');
});

test('a length longer than the screen says to measure it in two goes', () => {
  savePxPerMm(5);
  render(<CutGuideView name="cucumber" qty="20 cm" note={null} photo={null} onClose={() => {}} />);
  expect(screen.getByText(/longer than this screen/i)).toBeInTheDocument();
});
