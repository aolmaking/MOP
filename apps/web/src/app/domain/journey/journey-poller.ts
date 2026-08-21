import { DestroyRef, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import type { PresentedJourney } from './workflow-strip';

/**
 * How often a journey re-reads itself.
 *
 * Twenty seconds is the same order as the platform Live View's own
 * refresh, which is the only other polling surface in the product --
 * matching it keeps one answer to "how live is live" rather than three.
 * A workshop job changes hands in minutes, not milliseconds, so a faster
 * poll would cost queries without telling anybody anything new.
 */
const REFRESH_MS = 20_000;

export interface JourneyFeed {
  readonly journey: Signal<PresentedJourney | null>;
  /** Re-read now. Call after an action that may have moved the job. */
  refresh(): void;
  stop(): void;
}

/**
 * Keeps a work order's journey current.
 *
 * The requirement this exists for: when the authoritative state changes,
 * the visible journey must reliably reflect it. A technician issuing a
 * part must change what the customer sees, without either of them
 * reloading the page.
 *
 * **Polling, deliberately.** The product has no websocket or SSE
 * infrastructure, and introducing one for this would be a new runtime
 * dependency, a new failure mode and a new thing to operate, for a
 * screen whose truth changes on a human timescale. This reuses the
 * pattern Live View already established. If push ever arrives, this is
 * the one place that has to change.
 *
 * **Never optimistic.** The strip is only ever redrawn from a server
 * response. Advancing it locally after an action would make the one
 * component whose entire purpose is telling the truth about state into
 * the one component that guesses.
 */
/**
 * `destroyRef` is passed in rather than injected here on purpose. A
 * caller typically starts the feed from inside a subscribe callback --
 * once the page has confirmed the reader may see this job at all -- and
 * `inject()` outside an injection context throws NG0203. Taking it as a
 * parameter lets the component grab it in its own field initializer,
 * where injection is legal, and start the feed whenever it likes.
 */
export function pollJourney(
  destroyRef: DestroyRef,
  load: () => Observable<PresentedJourney>,
  /**
   * Called on every successful read. For a caller holding MANY feeds --
   * the customer's list of open jobs -- this is how the result reaches a
   * shared map without an `effect()` per row, which would need an
   * injection context the caller does not have at that point.
   */
  onUpdate?: (journey: PresentedJourney) => void,
): JourneyFeed {
  const journey = signal<PresentedJourney | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;

  const read = (): void => {
    load()
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: (next) => {
          journey.set(next);
          onUpdate?.(next);
        },
        // Silent on purpose. The page around this already says where the
        // job is; a failed background refresh should cost detail, not
        // throw an error banner over a working screen.
        error: () => undefined,
      });
  };

  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  read();
  timer = setInterval(read, REFRESH_MS);
  destroyRef.onDestroy(stop);

  return { journey: journey.asReadonly(), refresh: read, stop };
}
