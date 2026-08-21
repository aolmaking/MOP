import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a toast with an incrementing id', () => {
    const service = new ToastService();

    service.show('First', 'success');
    service.show('Second', 'danger');

    expect(service.toasts()).toEqual([
      { id: 0, message: 'First', tone: 'success' },
      { id: 1, message: 'Second', tone: 'danger' },
    ]);
  });

  it('auto-dismisses after the given duration', () => {
    const service = new ToastService();

    service.show('Goes away', 'neutral', 1000);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(1000);

    expect(service.toasts().length).toBe(0);
  });

  it('never auto-dismisses when durationMs is 0', () => {
    const service = new ToastService();

    service.show('Stays', 'neutral', 0);
    vi.advanceTimersByTime(60000);

    expect(service.toasts().length).toBe(1);
  });

  it('dismiss() removes only the matching toast', () => {
    const service = new ToastService();
    service.show('Keep', 'neutral', 0);
    service.show('Remove', 'neutral', 0);

    service.dismiss(1);

    expect(service.toasts()).toEqual([{ id: 0, message: 'Keep', tone: 'neutral' }]);
  });

  it('dismissing an id that no longer exists is a harmless no-op (covers the auto-dismiss-after-manual-dismiss race)', () => {
    const service = new ToastService();
    service.show('Only one', 'neutral', 0);

    service.dismiss(0);
    expect(() => service.dismiss(0)).not.toThrow();
    expect(service.toasts()).toEqual([]);
  });
});
