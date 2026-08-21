import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { errorInterceptor, PresentedError } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('passes an ApiErrorDto body through with the HTTP status attached', async () => {
    const pending = firstValueFrom(http.get('/api/v1/whatever')).catch((err: PresentedError) => err);

    httpMock
      .expectOne('/api/v1/whatever')
      .flush({ code: 'forbidden', message: 'Not allowed' }, { status: 403, statusText: 'Forbidden' });

    expect(await pending).toEqual({ code: 'forbidden', message: 'Not allowed', httpStatus: 403 });
  });

  it('normalizes a network failure (status 0) to code=network_error', async () => {
    const pending = firstValueFrom(http.get('/api/v1/whatever')).catch((err: PresentedError) => err);

    httpMock.expectOne('/api/v1/whatever').error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    const result = (await pending) as PresentedError;
    expect(result.code).toBe('network_error');
    expect(result.httpStatus).toBe(0);
  });

  it('normalizes a non-JSON error body to a generic code rather than leaking it raw', async () => {
    const pending = firstValueFrom(http.get('/api/v1/whatever')).catch((err: PresentedError) => err);

    httpMock
      .expectOne('/api/v1/whatever')
      .flush('<html>Internal Server Error</html>', { status: 500, statusText: 'Internal Server Error' });

    const result = (await pending) as PresentedError;
    expect(result.code).toBe('error');
    expect(result.httpStatus).toBe(500);
  });
});
