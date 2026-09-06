import type { PresentedJourney } from './workflow-strip';

/**
 * A journey payload for a test that is not about the journey.
 *
 * Every role surface loads a journey, so every one of their specs has to
 * stub one, and three hand-written literals meant that adding a field to
 * the contract broke three unrelated test files in a way that said
 * nothing about the change. One fixture, overridden per test.
 *
 * Deliberately EMPTY rather than plausible: a fixture with invented
 * stages and events would let a test pass by matching the fixture's
 * fiction. A spec that cares about journey content supplies its own.
 */
export function journeyFixture(overrides: Partial<PresentedJourney> = {}): PresentedJourney {
  return {
    workOrderId: 'wo1',
    stages: [],
    finished: false,
    waiting: false,
    blocked: false,
    headline: 'Moving normally.',
    happened: null,
    next: null,
    waitingOn: null,
    current: {
      status: 'IN_PROGRESS',
      label: 'In progress',
      since: null,
      forMinutes: null,
      waitingOn: null,
      waitingSince: null,
      waitingForMinutes: null,
      reason: null,
      next: null,
    },
    events: [],
    actions: [],
    asOf: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}
