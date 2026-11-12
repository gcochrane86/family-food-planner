import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fakeRepo, type FakeRepo } from '../../test/fakeRepo';
import Kitchen from './Kitchen';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })) }));

beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.listEquipment.mockResolvedValue([
    { id: 'e1', household_id: 'h1', code: 'apo', name: 'Anova Precision Oven', photo: null },
    { id: 'e2', household_id: 'h1', code: 'tm7', name: 'Thermomix TM7', photo: 'h1/kit/tm7-1.jpg' },
  ]);
  h.repo.uploadEquipmentPhoto.mockResolvedValue('h1/kit/apo-2.jpg');
});

test('each machine can have a photo, picked from Photos or Files', async () => {
  render(<Kitchen />, { wrapper: MemoryRouter });
  expect(await screen.findByRole('img', { name: 'Thermomix TM7' })).toHaveAttribute('src', 'https://img.test/h1/kit/tm7-1.jpg');
  const file = new File(['x'], 'anova.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Add a photo of Anova Precision Oven'), file);
  expect(h.repo.uploadEquipmentPhoto).toHaveBeenCalledWith('h1', expect.objectContaining({ id: 'e1', code: 'apo' }), expect.any(Blob));
  expect(await screen.findByRole('img', { name: 'Anova Precision Oven' })).toHaveAttribute('src', 'https://img.test/h1/kit/apo-2.jpg');
  expect(screen.getByLabelText('Change the photo of Thermomix TM7')).toBeInTheDocument();
});
