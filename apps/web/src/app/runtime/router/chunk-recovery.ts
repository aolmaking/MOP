import { inject } from '@angular/core';
import { Router, type NavigationError } from '@angular/router';

/**
 * A page whose code will not download must not fail in silence.
 *
 * Every role surface is a lazy chunk, so opening a work card means
 * fetching a file whose name carries a build hash. When that fetch fails
 * the router aborts the navigation and does nothing else: the URL does not
 * change, no error is shown, and the technician is left pressing a card
 * that appears dead. That is the worst failure this app can produce on the
 * shop floor -- it looks like the product is broken rather than like
 * something needs retrying.
 *
 * It is not a rare case. The hash changes on every deploy, so anyone with
 * the app already open when a release ships asks for a file that no longer
 * exists, and so does anyone whose connection drops for the one second the
 * chunk was in flight. A workshop tablet left open all day hits this.
 *
 * The recovery is a full page load of the address the user asked for. That
 * re-fetches index.html, which names the chunks of the build that is now
 * live, and lands them on the page they pressed. One attempt per address:
 * if the reload does not fix it the fault is not a stale hash, and looping
 * would trap them in a reload cycle instead of letting the error surface.
 */

/** Marks the one recovery attempt, so a genuine failure cannot loop. */
const RECOVERY_KEY = 'mop.chunk-recovery';

/**
 * Matches what the browsers we support say when a dynamic import fails.
 * Chrome, Firefox and Safari each word it differently, and the older
 * "Loading chunk N failed" is still emitted by some bundler output, so all
 * of them are listed rather than assuming one engine.
 */
const CHUNK_FAILURE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \S+ failed|dynamically imported module/i;

function isChunkFailure(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return CHUNK_FAILURE.test(message);
}

/**
 * Reads and clears the marker in one go, so the attempt is consumed
 * whether or not the reload succeeds. Storage can throw -- Safari in
 * private mode, a browser set to block site data -- and a page that cannot
 * remember its attempt should still recover once rather than refuse to.
 */
function claimRecoveryAttempt(url: string): boolean {
  try {
    const alreadyTried = sessionStorage.getItem(RECOVERY_KEY) === url;
    if (alreadyTried) {
      sessionStorage.removeItem(RECOVERY_KEY);
      return false;
    }
    sessionStorage.setItem(RECOVERY_KEY, url);
    return true;
  } catch {
    return true;
  }
}

/**
 * Hands the router a handler that recovers from a chunk that will not
 * load, and leaves every other navigation error alone to be reported.
 *
 * Returning nothing keeps the router's own behaviour for errors this does
 * not recognise, so a real routing bug still surfaces instead of being
 * swallowed by the thing meant to make failures visible.
 */
export function recoverFromStaleChunk(error: NavigationError): void {
  const router = inject(Router);

  if (!isChunkFailure(error.error)) {
    return;
  }

  // `error.url` is the address that was asked for; the browser is still
  // showing the previous one, which is why the press looked ignored.
  const target = error.url || router.url;

  if (!claimRecoveryAttempt(target)) {
    return;
  }

  location.assign(target);
}
