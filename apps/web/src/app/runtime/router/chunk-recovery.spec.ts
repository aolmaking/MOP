import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, type NavigationError } from '@angular/router';

import { recoverFromStaleChunk } from './chunk-recovery';

/**
 * The guarantee: pressing a job card whose code will not download must not
 * look like nothing happened.
 *
 * These assert the recovery itself rather than the router wiring, because
 * the defect was never that the handler was wrong -- there was no handler,
 * and the navigation failed in silence.
 */
describe('recoverFromStaleChunk', () => {
  let assign: ReturnType<typeof vi.fn>;

  /** Runs the handler the way the router does: inside an injection context. */
  function handle(error: NavigationError): void {
    TestBed.runInInjectionContext(() => recoverFromStaleChunk(error));
  }

  function navigationError(error: unknown, url = '/tech/card/wo1'): NavigationError {
    return { id: 1, url, error, type: 1 } as unknown as NavigationError;
  }

  beforeEach(() => {
    sessionStorage.clear();
    assign = vi.fn();
    // `location.assign` is not callable in jsdom; the test needs to observe
    // the call, not perform it.
    Object.defineProperty(globalThis, 'location', {
      value: { assign, href: 'http://localhost/tech' },
      writable: true,
      configurable: true,
    });
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { url: '/tech' } }],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reloads the address that was asked for when the chunk will not load', () => {
    handle(navigationError(new Error('Failed to fetch dynamically imported module: /chunk-A1.js')));

    expect(assign).toHaveBeenCalledWith('/tech/card/wo1');
  });

  it.each([
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Loading chunk 42 failed',
  ])('recognises the wording browsers actually use: %s', (message) => {
    handle(navigationError(new Error(message)));

    expect(assign).toHaveBeenCalledOnce();
  });

  it('leaves a genuine routing error alone, so it still surfaces', () => {
    handle(navigationError(new Error('Cannot match any routes. URL Segment: nowhere')));

    expect(assign).not.toHaveBeenCalled();
  });

  /**
   * Without this the fix would be worse than the bug: a page that is
   * genuinely broken would reload forever instead of letting the failure
   * be seen.
   */
  it('tries once per address rather than looping', () => {
    const failure = navigationError(new Error('Failed to fetch dynamically imported module'));

    handle(failure);
    expect(assign).toHaveBeenCalledOnce();

    handle(failure);
    expect(assign).toHaveBeenCalledOnce();
  });

  it('recovers a different address even after one has been tried', () => {
    handle(navigationError(new Error('Failed to fetch dynamically imported module'), '/tech/card/a'));
    handle(navigationError(new Error('Failed to fetch dynamically imported module'), '/tech/card/b'));

    expect(assign).toHaveBeenNthCalledWith(1, '/tech/card/a');
    expect(assign).toHaveBeenNthCalledWith(2, '/tech/card/b');
  });

  /**
   * A browser set to block site data must still get one recovery: the
   * technician's ability to open the card matters more than the loop
   * guard, which only exists for the rarer broken-build case.
   */
  it('still recovers when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    handle(navigationError(new Error('Failed to fetch dynamically imported module')));

    expect(assign).toHaveBeenCalledOnce();
  });

  it('falls back to the current url when the router did not name one', () => {
    handle(navigationError(new Error('Failed to fetch dynamically imported module'), ''));

    expect(assign).toHaveBeenCalledWith('/tech');
  });
});
