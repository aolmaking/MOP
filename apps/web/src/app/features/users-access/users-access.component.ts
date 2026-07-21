import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CategoryCode, CreateStaffUserDto, StaffUserDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { AuthStore } from "../../core/auth/auth.store";

interface CreationOptions {
  customerRegistration: { customerRegistrationCode: string; customerRegistrationEnabled: boolean } | null;
  roles: CreateStaffUserDto["role"][];
  categories: CategoryCode[];
  branches: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; branchId: string }>;
  templates: Array<{ id: string; code: string; label: string }>;
  technicians: Array<{ id: string; name: string; branchScope: string[] }>;
}

@Component({
  selector: "mop-users-access",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="min-h-screen bg-[#f4f6f8] px-4 py-6 lg:ml-72 lg:px-8">
      <header class="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div><p class="text-xs font-bold uppercase text-emerald-700">Organization & Access</p><h1 class="mt-1 text-3xl font-black">Staff identities</h1><p class="mt-2 text-sm text-black/50">Role, permission template, and operational scopes are enforced by the server.</p></div>
        <div class="flex flex-wrap items-center gap-3"><span *ngIf="options()?.customerRegistration?.customerRegistrationEnabled" class="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold">Customer code: {{ options()?.customerRegistration?.customerRegistrationCode }}</span><button *ngIf="auth.hasPermission('organization.users.invite')" class="mop-button-primary" type="button" (click)="drawerOpen.set(true)">Add Staff User</button></div>
      </header>

      <div *ngIf="error()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error() }}</div>
      <div *ngIf="notice()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{{ notice() }}</div>

      <section class="mx-auto mt-6 max-w-[1500px] overflow-x-auto rounded-md border border-black/10 bg-white">
        <table class="w-full min-w-[940px] text-left text-sm">
          <thead class="bg-black/[0.03] text-xs uppercase text-black/45"><tr><th class="p-4">User</th><th class="p-4">Role</th><th class="p-4">Status</th><th class="p-4">Categories</th><th class="p-4">Branches</th><th class="p-4">Warehouses</th><th class="p-4">Team</th></tr></thead>
          <tbody>
            <tr *ngFor="let user of users()" class="border-t border-black/10">
              <td class="p-4"><strong class="block">{{ user.name }}</strong><span class="text-black/45">{{ user.email }}</span></td>
              <td class="p-4">{{ user.roleLabel }}</td>
              <td class="p-4"><span class="rounded bg-black/5 px-2 py-1 text-xs font-bold uppercase">{{ user.status }}</span></td>
              <td class="p-4">{{ user.categoryScope.join(', ') || 'Not scoped' }}</td>
              <td class="p-4">{{ user.branchScope.length }}</td>
              <td class="p-4">{{ user.warehouseScope.length }}</td>
              <td class="p-4">{{ user.managedTechnicianIds.length || user.teamScope.length }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div *ngIf="drawerOpen()" class="fixed inset-0 z-50 bg-black/40" (click)="drawerOpen.set(false)"></div>
      <aside *ngIf="drawerOpen()" class="fixed inset-y-0 right-0 z-[60] w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <form class="p-5 sm:p-7" (ngSubmit)="createStaff()">
          <div class="flex items-start justify-between gap-4 border-b border-black/10 pb-5">
            <div><p class="text-xs font-bold uppercase text-emerald-700">New identity</p><h2 class="mt-1 text-2xl font-black">Add Staff User</h2></div>
            <button class="h-10 w-10 rounded-md border border-black/10 text-xl" type="button" title="Close" (click)="drawerOpen.set(false)">×</button>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-bold">Full name<input class="mop-input mt-2 w-full" name="name" [(ngModel)]="form.name" required></label>
            <label class="text-sm font-bold">Email<input class="mop-input mt-2 w-full" type="email" name="email" [(ngModel)]="form.email" required></label>
            <label class="text-sm font-bold">Role<select class="mop-input mt-2 w-full" name="role" [(ngModel)]="form.role" (ngModelChange)="roleChanged()"><option *ngFor="let role of options()?.roles" [value]="role">{{ label(role) }}</option></select></label>
            <label class="text-sm font-bold">Permission template<select class="mop-input mt-2 w-full" name="template" [(ngModel)]="form.permissionTemplateId" required><option value="">Select template</option><option *ngFor="let template of options()?.templates" [value]="template.id">{{ template.label }}</option></select></label>
            <label class="text-sm font-bold">Account status<select class="mop-input mt-2 w-full" name="status" [(ngModel)]="form.status"><option value="invited">Invited</option><option value="active">Active</option></select></label>
            <label *ngIf="form.status === 'active'" class="text-sm font-bold">Initial password<input class="mop-input mt-2 w-full" type="password" name="password" [(ngModel)]="form.password" minlength="10" required></label>
          </div>

          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            <label class="text-sm font-bold">Branch scope<select class="mop-input mt-2 h-32 w-full" name="branches" multiple [(ngModel)]="form.branchScope"><option *ngFor="let branch of options()?.branches" [value]="branch.id">{{ branch.name }}</option></select></label>
            <label class="text-sm font-bold">Warehouse scope<select class="mop-input mt-2 h-32 w-full" name="warehouses" multiple [(ngModel)]="form.warehouseScope"><option *ngFor="let warehouse of availableWarehouses()" [value]="warehouse.id">{{ warehouse.name }}</option></select></label>
            <label class="text-sm font-bold">Category scope<select class="mop-input mt-2 h-32 w-full" name="categories" multiple [(ngModel)]="form.categoryScope"><option *ngFor="let category of options()?.categories" [value]="category">{{ category }}</option></select></label>
            <label *ngIf="form.role === 'team_leader'" class="text-sm font-bold">Managed technicians<select class="mop-input mt-2 h-32 w-full" name="technicians" multiple [(ngModel)]="form.managedTechnicianIds"><option *ngFor="let technician of availableTechnicians()" [value]="technician.id">{{ technician.name }}</option></select></label>
          </div>

          <div *ngIf="error()" class="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error() }}</div>
          <div class="mt-7 flex justify-end gap-3 border-t border-black/10 pt-5">
            <button class="mop-button-secondary" type="button" (click)="drawerOpen.set(false)">Cancel</button>
            <button class="mop-button-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Creating...' : 'Create Staff User' }}</button>
          </div>
        </form>
      </aside>
    </main>
  `
})
export class UsersAccessComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly auth = inject(AuthStore);
  readonly users = signal<StaffUserDto[]>([]);
  readonly options = signal<CreationOptions | null>(null);
  readonly drawerOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly notice = signal("");
  form: CreateStaffUserDto & { password?: string } = this.emptyForm();

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const [users, options] = await Promise.all([
        firstValueFrom(this.api.get<StaffUserDto[]>("/identity/staff-users")),
        firstValueFrom(this.api.get<CreationOptions>("/identity/staff-creation-options"))
      ]);
      this.users.set(users);
      this.options.set(options);
      this.roleChanged();
    } catch (error: any) {
      this.error.set(error?.error?.message || "Users and access data could not be loaded.");
    }
  }

  roleChanged() {
    const match = this.options()?.templates.find((template) => template.code === this.form.role);
    if (match) this.form.permissionTemplateId = match.id;
    if (this.form.role !== "inventory_manager") this.form.warehouseScope = [];
    if (this.form.role !== "team_leader") this.form.managedTechnicianIds = [];
  }

  availableWarehouses() {
    const rows = this.options()?.warehouses || [];
    return this.form.branchScope?.length ? rows.filter((row) => this.form.branchScope!.includes(row.branchId)) : rows;
  }

  availableTechnicians() {
    const rows = this.options()?.technicians || [];
    return this.form.branchScope?.length ? rows.filter((row) => row.branchScope.some((id) => this.form.branchScope!.includes(id))) : rows;
  }

  async createStaff() {
    this.saving.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      const result = await firstValueFrom(this.api.post<any>("/identity/staff-users", this.form));
      this.users.set(await firstValueFrom(this.api.get<StaffUserDto[]>("/identity/staff-users")));
      this.notice.set(result?.invitation?.inviteLink ? `Staff invite created: ${result.invitation.inviteLink}` : "Active staff identity created with server-enforced role and scope.");
      this.drawerOpen.set(false);
      this.form = this.emptyForm();
      this.roleChanged();
    } catch (error: any) {
      this.error.set(error?.error?.message || "Staff identity could not be created.");
    } finally {
      this.saving.set(false);
    }
  }

  label(value: string) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private emptyForm(): CreateStaffUserDto & { password?: string } {
    return {
      name: "",
      email: "",
      password: "",
      role: "technician",
      branchScope: [],
      warehouseScope: [],
      categoryScope: [],
      teamScope: [],
      managedTechnicianIds: [],
      permissionTemplateId: "",
      status: "invited"
    };
  }
}
