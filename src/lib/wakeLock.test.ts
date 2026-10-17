import { renderHook } from '@testing-library/react';
import { isTablet, useWakeLock } from './wakeLock';

function fakeWakeLock() {
  const release = vi.fn(async () => {});
  const request = vi.fn(async (_type: 'screen') => ({ release }));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, release };
}

test('keeps the screen on while enabled, asks again when the app comes back, and lets go on unmount', async () => {
  const { request, release } = fakeWakeLock();
  const { unmount } = renderHook(() => useWakeLock(true));
  expect(request).toHaveBeenCalledWith('screen');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(request).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  unmount();
  expect(release).toHaveBeenCalled();
});

test('does nothing when not enabled', () => {
  const { request } = fakeWakeLock();
  renderHook(() => useWakeLock(false));
  expect(request).not.toHaveBeenCalled();
});

test('a tablet is a touch screen at least 744 points on its short side (iPad mini and up)', () => {
  expect(isTablet({ maxTouchPoints: 5, width: 820, height: 1180 })).toBe(true);
  expect(isTablet({ maxTouchPoints: 5, width: 744, height: 1133 })).toBe(true);
  expect(isTablet({ maxTouchPoints: 5, width: 390, height: 844 })).toBe(false);  // iPhone
  expect(isTablet({ maxTouchPoints: 0, width: 1440, height: 900 })).toBe(false); // Mac
});
