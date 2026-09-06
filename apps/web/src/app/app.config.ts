import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { errorInterceptor } from './runtime/http/error.interceptor';
import { refreshInterceptor } from './runtime/http/refresh.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route params arrive as component inputs, so a page that needs an id
    // declares it rather than reaching into ActivatedRoute and unwrapping
    // an observable to get one string.
    provideRouter(routes, withComponentInputBinding()),
    // Order matters: `refreshInterceptor` sits OUTSIDE `errorInterceptor`,
    // so by the time it sees a failure the error is already the single
    // PresentedError shape the rest of the app deals in, and its retry
    // re-enters the chain normally.
    provideHttpClient(withFetch(), withInterceptors([refreshInterceptor, errorInterceptor]))
  ]
};
