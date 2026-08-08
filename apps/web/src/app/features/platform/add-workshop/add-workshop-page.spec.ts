import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AddWorkshopPage } from './add-workshop-page';
import { PlatformWorkshopsApi, type PlanOption } from '../../../core/api/platform-workshops.api';
import { ToastService } from '../../../shared/toast/toast.service';

const PLAN: PlanOption = { id: 'plan-1', code: 'STARTER', name: 'Starter', maxBranches: 3, maxUsers: 15, maxWarehouses: 3, monthlyPrice: '0' };

/**
 * Mocks PlatformWorkshopsApi directly rather than going through real HTTP
 * (HttpTestingController): the async validators still run their real
 * 500ms debounce (RxJS debounceTime, unaffected by mocking the API layer
 * underneath it), which fakeAsync/tick would normally absorb -- but this
 * project's Vitest setup doesn't load zone.js/testing, so fakeAsync isn't
 * available (confirmed directly: it throws "zone-testing.js is needed").
 * vi.useFakeTimers() advances past the debounce instead, and mocking the
 * API service (rather than real HttpClient) avoids the separate problem
 * of coordinating that with HttpTestingController's own request lifecycle
 * -- the same pattern already used for LoginPage's AuthStore mock.
 */
describe('AddWorkshopPage', () => {
  function configure(apiOverrides: Partial<PlatformWorkshopsApi> = {}) {
    const api: Partial<PlatformWorkshopsApi> = {
      listPlans: vi.fn().mockReturnValue(of([PLAN])),
      checkNameAvailability: vi.fn().mockReturnValue(of({ available: true })),
      checkSlugAvailability: vi.fn().mockReturnValue(of({ available: true })),
      checkOwnerEmailAvailability: vi.fn().mockReturnValue(of({ available: true })),
      createWorkshop: vi.fn(),
      ...apiOverrides,
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PlatformWorkshopsApi, useValue: api }],
    });
    return api as Record<keyof PlatformWorkshopsApi, ReturnType<typeof vi.fn>>;
  }

  function createFixture(apiOverrides: Partial<PlatformWorkshopsApi> = {}) {
    const api = configure(apiOverrides);
    const fixture = TestBed.createComponent(AddWorkshopPage);
    fixture.detectChanges(); // triggers ngOnInit -> listPlans()
    return { fixture, api };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-derives the slug from the name until the user edits it manually', () => {
    const { fixture } = createFixture();
    const form = fixture.componentInstance['form'];

    form.controls.name.setValue('Cairo West Auto Care');
    expect(form.controls.slug.value).toBe('cairo-west-auto-care');

    fixture.componentInstance['editSlugManually']();
    form.controls.slug.setValue('custom-slug');
    form.controls.name.setValue('A Totally Different Name');

    expect(form.controls.slug.value).toBe('custom-slug');
  });

  it('requires businessTypeOther only when businessType is "Other", and clears it otherwise', () => {
    const { fixture } = createFixture();
    const form = fixture.componentInstance['form'];

    form.controls.businessType.setValue('Other');
    form.controls.businessTypeOther.updateValueAndValidity();
    expect(form.controls.businessTypeOther.invalid).toBe(true); // required and empty

    form.controls.businessTypeOther.setValue('Mobile detailing van');
    expect(form.controls.businessTypeOther.valid).toBe(true);

    form.controls.businessType.setValue('Independent Garage');
    expect(form.controls.businessTypeOther.value).toBe('');
    expect(form.controls.businessTypeOther.valid).toBe(true); // no longer required
  });

  it("applies the selected plan's ceilings to the soft-target fields", async () => {
    const { fixture } = createFixture();
    const form = fixture.componentInstance['form'];
    // ngOnInit's listPlans() resolves via firstValueFrom on a microtask,
    // even though the mock's Observable emits synchronously -- flush it
    // before relying on plans() being populated.
    await vi.advanceTimersByTimeAsync(0);

    form.controls.planId.setValue('plan-1');

    expect(fixture.componentInstance['selectedPlan']()).toEqual(PLAN);
    form.controls.allowedBranchesStart.setValue(5); // plan only allows 3
    expect(form.controls.allowedBranchesStart.hasError('max')).toBe(true);
    form.controls.allowedBranchesStart.setValue(2);
    expect(form.controls.allowedBranchesStart.valid).toBe(true);
  });

  it('does not submit when the form is invalid', async () => {
    const { fixture, api } = createFixture();

    await fixture.componentInstance.submit();

    expect(api['createWorkshop']).not.toHaveBeenCalled();
  });

  it('on successful submit, shows a toast and navigates to the Workshops list', async () => {
    const { fixture, api } = createFixture({
      createWorkshop: vi.fn().mockReturnValue(
        of({
          tenant: { id: 't1', name: 'Cairo West Auto Care', slug: 'cairo-west-auto-care' },
          inviteLink: '/invite/accept?token=abc',
          demoDataEnqueued: false,
        }),
      ),
    });
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fillValidForm(fixture);
    await vi.advanceTimersByTimeAsync(600); // let the debounced async validators settle

    await fixture.componentInstance.submit();

    expect(api['createWorkshop']).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('Cairo West Auto Care'), 'success');
    expect(navigateSpy).toHaveBeenCalled();
  });

  it('on submit failure, shows the error inline and does not navigate', async () => {
    const { fixture } = createFixture({
      createWorkshop: vi
        .fn()
        .mockReturnValue(throwError(() => ({ code: 'name_already_taken', message: 'A workshop with this name already exists.' }))),
    });
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fillValidForm(fixture);
    await vi.advanceTimersByTimeAsync(600);

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance['submitError']()?.message).toContain('already exists');
  });

  function fillValidForm(fixture: ReturnType<typeof createFixture>['fixture']): void {
    const form = fixture.componentInstance['form'];
    form.setValue({
      name: 'Cairo West Auto Care',
      slug: 'cairo-west-auto-care',
      country: 'EG',
      city: 'Cairo',
      businessType: 'Independent Garage',
      businessTypeOther: '',
      primaryCategory: 'CARS',
      currency: 'EGP',
      timezone: 'Africa/Cairo',
      ownerFullName: 'New Owner',
      ownerEmail: 'owner@example.com',
      ownerPhone: '+201234567890',
      planId: 'plan-1',
      allowedBranchesStart: 1,
      allowedUsersStart: 1,
      allowedWarehousesStart: 0,
      starterBuilderTemplate: 'DEFAULT',
      enableDemoData: false,
      initialStatus: 'ACTIVE',
    });
  }
});
