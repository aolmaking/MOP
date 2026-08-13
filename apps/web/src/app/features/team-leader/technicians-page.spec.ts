import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechniciansPage } from './technicians-page';
import { TeamLeaderApi, type TechnicianDetail, type TechnicianRow } from './team-leader.api';

function row(overrides: Partial<TechnicianRow> = {}): TechnicianRow {
  return {
    staffUserId: 'tech-1',
    fullName: 'Omar Khaled',
    currentTask: null,
    openBlockers: 0,
    tasksCompletedToday: 2,
    ...overrides,
  };
}

function detail(overrides: Partial<TechnicianDetail> = {}): TechnicianDetail {
  return {
    ...row(),
    recentTasks: [],
    supervisionNotes: [],
    ...overrides,
  };
}

function render(
  rowsResponse: readonly TechnicianRow[] | { readonly error: unknown },
  api: Partial<TeamLeaderApi> = {},
) {
  const stub = {
    technicians: () =>
      'error' in rowsResponse ? throwError(() => rowsResponse.error) : of(rowsResponse),
    technician: () => of(detail()),
    addNote: () => of({ id: 'note-1' }),
    ...api,
  };

  TestBed.configureTestingModule({ providers: [{ provide: TeamLeaderApi, useValue: stub }] });
  const fixture = TestBed.createComponent(TechniciansPage);
  fixture.detectChanges();
  return { fixture, stub, element: fixture.nativeElement as HTMLElement };
}

describe('TechniciansPage', () => {
  it('shows the empty state when no technicians are managed', () => {
    const { element } = render([]);

    expect(element.textContent).toContain('No technicians are on your team yet');
  });

  it('lists every managed technician as a row', () => {
    const { element } = render([row(), row({ staffUserId: 'tech-2', fullName: 'Nada Fathy' })]);

    expect(element.querySelectorAll('.row').length).toBe(2);
    expect(element.textContent).toContain('Nada Fathy');
  });

  it('opens the drawer with the technician detail on click', () => {
    const { fixture, element } = render([row()]);

    (element.querySelector('.row') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('app-technician-drawer')).not.toBeNull();
  });

  it('closes the drawer', () => {
    const { fixture, element } = render([row()]);
    (element.querySelector('.row') as HTMLButtonElement).click();
    fixture.detectChanges();

    (element.querySelector('.drawer-close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('app-technician-drawer')).toBeNull();
  });

  it('submits a supervision note through the drawer form', () => {
    const addNote = vi.fn().mockReturnValue(of({ id: 'note-1' }));
    const { fixture, element } = render([row()], { addNote });

    (element.querySelector('.row') as HTMLButtonElement).click();
    fixture.detectChanges();

    const textarea = element.querySelector('.note-input') as HTMLTextAreaElement;
    textarea.value = 'Watch the torque spec.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const checkbox = element.querySelector('.escalate-check input') as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    (element.querySelector('.note-form button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(addNote).toHaveBeenCalledWith('tech-1', 'Watch the torque spec.', true);
  });

  it('shows a distinct no-access state on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });

    expect(element.textContent).toContain("don't have access");
  });
});
