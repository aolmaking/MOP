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
    // refreshInterceptor after errorInterceptor: interceptors run
    // request-order left-to-right and response-order right-to-left, so
    // this ordering puts refreshInterceptor closest to the backend --
    // it sees the raw HttpErrorResponse (status 401) and, once it has
    // either recovered or given up, whatever it produces is what
    // errorInterceptor normalizes into a PresentedError. The reverse
    // order would hand refreshInterceptor an already-normalized error
    // with no HttpErrorResponse to inspect.
    provideHttpClient(withFetch(), withInterceptors([errorInterceptor, refreshInterceptor]))
  ]
};
