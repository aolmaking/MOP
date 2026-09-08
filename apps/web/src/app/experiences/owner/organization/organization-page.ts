import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { DismissOnEscapeDirective } from '../../../ui/dismiss-on-escape/dismiss-on-escape.directive';
import { isHeldBack } from '../../../runtime/launch-surface';
import { VEHICLE_SUBSYSTEMS, getVehicleSubsystem, type VehicleSubsystem } from '@mop/shared';
import {
  OrganizationApi,
  type BranchListItem,
  type InviteStaffInput,
  type OrganizationInfrastructure,
  type StaffListItem,
  type StaffRole,
  type TeamSetupPage,
  type TeamView,
} from './organization.api';

type Tab = 'staff' | 'teams' | 'branches' | 'warehouses';
type State = 'loading' | 'ready' | 'forbidden' | 'error';

const INVITABLE_ROLES: readonly StaffRole[] = [
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'TECHNICIAN',
  'INVENTORY_MANAGER',
  'TEAM_LEADER',
  'DATA_ANALYST',
  'OPERATOR',
];

/**
 * Organization & Access, per docs/detailed-specs/tenant-owner.md:
 * "This is the first page that has to work -- nothing else in the product
 * is usable for a given workshop until staff exist."
 *
 * Four unified tabs: Staff, Teams & Leaders, Branches, Warehouses.
 */
@Component({
  selector: 'app-organization-page',
  imports: [FormsModule, RouterLink, ErrorBanner, ButtonDirective, DismissOnEscapeDirective],
  templateUrl: './organization-page.html',
  styleUrl: './organization-page.css',
})
export class OrganizationPage {
  /**
   * The Teams page exists and works; the launch sprint holds its whole
   * surface back because TEAMS is off in the launch profile. Without
   * this the sentence above would send a pilot owner to a page their
   * rail deliberately does not offer.
   */
  protected readonly teamsVisible = !isHeldBack('/owner/organization/teams');

  private readonly api = inject(OrganizationApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly vehicleSubsystems = VEHICLE_SUBSYSTEMS;
  protected readonly roles = INVITABLE_ROLES;
  protected readonly tab = signal<Tab>('staff');
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly staff = signal<readonly StaffListItem[]>([]);
  protected readonly infra = signal<OrganizationInfrastructure | null>(null);

  // Teams & Team Leaders capability state
  protected readonly teamsEnabled = signal<boolean>(this.loadTeamsCapability());
  protected readonly teamsData = signal<TeamSetupPage | null>(null);
  protected readonly showCreateTeam = signal(false);
  protected readonly newTeamName = signal('');
  protected readonly newTeamBranchId = signal('');
  protected readonly newTeamLeaderId = signal('');
  protected readonly newTeamSpecializations = signal<string[]>([]);
  protected readonly editingTeam = signal<TeamView | null>(null);
  protected readonly editingTeamSpecializations = signal<string[]>([]);
  protected readonly teamModalError = signal<string | null>(null);
  protected readonly teamSubmitting = signal(false);

  // Individual staff specializations state
  protected readonly editingStaff = signal<StaffListItem | null>(null);
  protected readonly staffSpecializations = signal<string[]>([]);
  protected readonly staffSpecializationsSaving = signal(false);
  // Independent of the tab-scoped `infra` load below: the Staff tab needs
  // branch names to resolve a row's branchScope ids, but only fetches
  // staff itself, so this is loaded once, separately, on init.
  private readonly branchNameById = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly showInvite = signal(false);
  protected readonly creationMode = signal<'password' | 'invite'>('password');
  protected readonly workerPassword = signal('');
  protected readonly inviteForm = signal<InviteStaffInput>({ fullName: '', email: '', phone: '', role: 'TECHNICIAN' });
  protected readonly inviteError = signal<PresentedError | null>(null);
  protected readonly submitting = signal(false);

  protected readonly needsBranch = computed(() => this.inviteForm().role === 'BRANCH_MANAGER');
  protected readonly needsWarehouse = computed(() => this.inviteForm().role === 'INVENTORY_MANAGER');
  protected readonly branchScopeText = signal('');
  protected readonly warehouseScopeText = signal('');

  protected readonly showCreateBranch = signal(false);
  protected readonly branchDraft = signal({ name: '', code: '', city: '' });
  protected readonly showCreateWarehouse = signal(false);
  protected readonly warehouseDraft = signal({ name: '', code: '' });
  protected readonly createError = signal<PresentedError | null>(null);

  constructor() {
    this.load();
    this.api
      .infrastructure()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((infra) => {
        this.infra.set(infra);
        this.branchNameById.set(new Map(infra.branches.map((b) => [b.id, b.name])));
      });
  }

  private loadTeamsCapability(): boolean {
    if (typeof localStorage === 'undefined') return true;
    const stored = localStorage.getItem('mop_teams_and_leaders_enabled');
    return stored === null ? true : stored === 'true';
  }

  protected toggleTeamsCapability(): void {
    const nextVal = !this.teamsEnabled();
    this.teamsEnabled.set(nextVal);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mop_teams_and_leaders_enabled', String(nextVal));
    }
  }

  protected branchNames(ids: readonly string[]): string {
    if (ids.length === 0) return 'All branches';
    const names = this.branchNameById();
    return ids.map((id) => names.get(id) ?? id).join(', ');
  }

  protected switchTab(tab: Tab): void {
    this.tab.set(tab);
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    const onError = (err: PresentedError) => {
      this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      this.error.set(err);
    };

    // Always keep infrastructure fresh for branch and warehouse scopes
    this.api
      .infrastructure()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inf) => {
          this.infra.set(inf);
          if (this.tab() !== 'staff' && this.tab() !== 'teams') {
            this.state.set('ready');
          }
        },
        error: (err) => {
          if (this.tab() !== 'staff' && this.tab() !== 'teams') onError(err);
        },
      });

    if (this.tab() === 'staff') {
      this.api
        .listStaff()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (page) => {
            this.staff.set(page.items);
            this.state.set('ready');
          },
          error: onError,
        });
    } else if (this.tab() === 'teams') {
      this.loadTeams();
    }
  }

  protected loadTeams(): void {
    this.api
      .teamsPage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.teamsData.set(page);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  // --- Teams CRUD & Specializations ---

  protected openCreateTeam(): void {
    const branches = this.infra()?.branches ?? [];
    const eligibleLeaders = this.teamsData()?.eligibleLeaders ?? [];
    this.newTeamName.set('');
    this.newTeamBranchId.set(branches[0]?.id ?? '');
    this.newTeamLeaderId.set(eligibleLeaders[0]?.id ?? '');
    this.newTeamSpecializations.set([]);
    this.teamModalError.set(null);
    this.showCreateTeam.set(true);
  }

  protected closeCreateTeam(): void {
    this.showCreateTeam.set(false);
  }

  protected toggleNewTeamSubsystem(id: string): void {
    const current = this.newTeamSpecializations();
    if (current.includes(id)) {
      this.newTeamSpecializations.set(current.filter((item) => item !== id));
    } else {
      this.newTeamSpecializations.set([...current, id]);
    }
  }

  protected submitCreateTeam(): void {
    const name = this.newTeamName().trim();
    const branchId = this.newTeamBranchId();
    const leaderId = this.newTeamLeaderId();
    if (!name) {
      this.teamModalError.set('Team name is required.');
      return;
    }
    if (!branchId) {
      this.teamModalError.set('Please select a branch.');
      return;
    }
    this.teamSubmitting.set(true);
    this.teamModalError.set(null);
    this.api
      .createTeam({
        name,
        branchId,
        teamLeaderId: leaderId,
        specializations: this.newTeamSpecializations(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.teamSubmitting.set(false);
          this.showCreateTeam.set(false);
          this.loadTeams();
        },
        error: (err: PresentedError) => {
          this.teamSubmitting.set(false);
          this.teamModalError.set(err.message || 'Failed to create team.');
        },
      });
  }

  protected openEditTeamSpecializations(team: TeamView): void {
    this.editingTeam.set(team);
    this.editingTeamSpecializations.set([...(team.specializations ?? [])]);
    this.teamModalError.set(null);
  }

  protected closeEditTeamSpecializations(): void {
    this.editingTeam.set(null);
  }

  protected toggleEditingTeamSubsystem(id: string): void {
    const current = this.editingTeamSpecializations();
    if (current.includes(id)) {
      this.editingTeamSpecializations.set(current.filter((item) => item !== id));
    } else {
      this.editingTeamSpecializations.set([...current, id]);
    }
  }

  protected saveTeamSpecializations(): void {
    const team = this.editingTeam();
    if (!team) return;
    this.teamSubmitting.set(true);
    this.teamModalError.set(null);
    this.api
      .updateTeamSpecializations(team.id, this.editingTeamSpecializations())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.teamSubmitting.set(false);
          this.editingTeam.set(null);
          this.loadTeams();
        },
        error: (err: PresentedError) => {
          this.teamSubmitting.set(false);
          this.teamModalError.set(err.message || 'Failed to update team specializations.');
        },
      });
  }

  // --- Individual Staff Specializations ---

  protected openStaffSpecializations(staff: StaffListItem): void {
    this.editingStaff.set(staff);
    this.staffSpecializations.set([...(staff.specializations ?? [])]);
  }

  protected closeStaffSpecializations(): void {
    this.editingStaff.set(null);
  }

  protected toggleStaffSubsystem(id: string): void {
    const current = this.staffSpecializations();
    if (current.includes(id)) {
      this.staffSpecializations.set(current.filter((item) => item !== id));
    } else {
      this.staffSpecializations.set([...current, id]);
    }
  }

  protected saveStaffSpecializations(): void {
    const staff = this.editingStaff();
    if (!staff) return;
    this.staffSpecializationsSaving.set(true);
    const specs = this.staffSpecializations();
    this.api
      .updateStaffSpecializations(staff.id, specs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.staffSpecializationsSaving.set(false);
          this.staff.update((items) =>
            items.map((i) => (i.id === staff.id ? { ...i, specializations: specs } : i)),
          );
          this.editingStaff.set(null);
        },
        error: () => {
          this.staffSpecializationsSaving.set(false);
        },
      });
  }

  protected subsystemName(id: string): string {
    return getVehicleSubsystem(id)?.nameEn ?? id;
  }

  protected subsystemIcon(id: string): string {
    return getVehicleSubsystem(id)?.icon ?? '🔧';
  }

  // -- Staff ------------------------------------------------------------

  protected openInvite(): void {
    const defaultBranchId = this.infra()?.branches?.[0]?.id ?? '';
    const defaultWarehouseId = this.infra()?.warehouses?.[0]?.id ?? '';
    this.inviteForm.set({ fullName: '', email: '', phone: '', role: 'TECHNICIAN' });
    this.creationMode.set('password');
    this.workerPassword.set('');
    this.branchScopeText.set(defaultBranchId);
    this.warehouseScopeText.set(defaultWarehouseId);
    this.inviteError.set(null);
    this.showInvite.set(true);
  }

  protected closeInvite(): void {
    this.showInvite.set(false);
  }

  protected updateField<K extends keyof InviteStaffInput>(key: K, value: InviteStaffInput[K]): void {
    this.inviteForm.set({ ...this.inviteForm(), [key]: value });
    if (key === 'role') {
      if (!this.branchScopeText() && this.infra()?.branches?.length) {
        this.branchScopeText.set(this.infra()!.branches[0]!.id);
      }
      if (!this.warehouseScopeText() && this.infra()?.warehouses?.length) {
        this.warehouseScopeText.set(this.infra()!.warehouses[0]!.id);
      }
    }
  }

  protected submitInvite(): void {
    const form = this.inviteForm();
    const input: InviteStaffInput = {
      ...form,
      password: this.creationMode() === 'password' && this.workerPassword().trim() ? this.workerPassword().trim() : undefined,
      branchScope: this.branchScopeText().trim() ? this.branchScopeText().split(',').map((s) => s.trim()) : undefined,
      warehouseScope: this.warehouseScopeText().trim()
        ? this.warehouseScopeText().split(',').map((s) => s.trim())
        : undefined,
    };

    this.submitting.set(true);
    this.inviteError.set(null);
    this.api
      .inviteStaff(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.showInvite.set(false);
          this.load();
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.inviteError.set(err);
        },
      });
  }

  protected toggleActive(row: StaffListItem): void {
    this.api
      .setActive(row.id, !row.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }

  protected toggleLocked(row: StaffListItem): void {
    this.api
      .setLocked(row.id, row.lockedAt === null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }

  protected readonly activeInviteLink = signal<string | null>(null);

  protected copyInviteLink(row: StaffListItem): void {
    this.api
      .getInviteLink(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.activeInviteLink.set(window.location.origin + res.inviteLink);
          void navigator.clipboard?.writeText(window.location.origin + res.inviteLink);
        },
      });
  }

  // -- Branches -----------------------------------------------------------

  protected openCreateBranch(): void {
    this.branchDraft.set({ name: '', code: '', city: '' });
    this.createError.set(null);
    this.showCreateBranch.set(true);
  }

  protected submitBranch(): void {
    const draft = this.branchDraft();
    this.createError.set(null);
    this.api
      .createBranch({ name: draft.name, code: draft.code || undefined, city: draft.city || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCreateBranch.set(false);
          this.load();
        },
        error: (err: PresentedError) => this.createError.set(err),
      });
  }

  protected toggleBranchActive(branch: BranchListItem): void {
    this.api
      .setBranchActive(branch.id, !branch.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (err: PresentedError) => this.error.set(err),
      });
  }

  // -- Warehouses + matrix --------------------------------------------------

  protected openCreateWarehouse(): void {
    this.warehouseDraft.set({ name: '', code: '' });
    this.createError.set(null);
    this.showCreateWarehouse.set(true);
  }

  protected submitWarehouse(): void {
    const draft = this.warehouseDraft();
    this.createError.set(null);
    this.api
      .createWarehouse({ name: draft.name, code: draft.code || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCreateWarehouse.set(false);
          this.load();
        },
        error: (err: PresentedError) => this.createError.set(err),
      });
  }

  protected isLinked(branchId: string, warehouseId: string): boolean {
    return this.infra()?.links.some((l) => l.branchId === branchId && l.warehouseId === warehouseId) ?? false;
  }

  protected toggleLink(branchId: string, warehouseId: string): void {
    const linked = this.isLinked(branchId, warehouseId);
    this.api
      .setLink(branchId, warehouseId, !linked)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }
}
