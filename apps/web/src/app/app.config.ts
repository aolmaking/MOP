import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';

import { routes } from './app.routes';
import { errorInterceptor } from './runtime/http/error.interceptor';
import { refreshInterceptor } from './runtime/http/refresh.interceptor';
import { recoverFromStaleChunk } from './runtime/router/chunk-recovery';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route params arrive as component inputs, so a page that needs an id
    // declares it rather than reaching into ActivatedRoute and unwrapping
    // an observable to get one string.
    // A lazy chunk that will not download used to abort the navigation in
    // silence -- the card stayed on screen and the press looked ignored.
    // `recoverFromStaleChunk` reloads the address that was asked for, which
    // is what a technician pressing a job card actually needs to happen.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(recoverFromStaleChunk)
    ),
    // Order matters: `refreshInterceptor` sits OUTSIDE `errorInterceptor`,
    // so by the time it sees a failure the error is already the single
    // PresentedError shape the rest of the app deals in, and its retry
    // re-enters the chain normally.
    provideHttpClient(withFetch(), withInterceptors([refreshInterceptor, errorInterceptor]))
  ]
};
