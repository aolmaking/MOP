import { Component, computed, inject, input, signal } from '@angular/core';
import { isCapabilityActive, type DraftBranch, type DraftWarehouse, type WarehouseTopologyType } from '@mop/shared';
import { OnboardingStore } from '../onboarding.store';
import type { OnboardingBlueprint } from '../onboarding.api';

/**
 * Stage Structure: Branches & Inventory Topology Management.
 *
 * Provides a dedicated, world-class UI inspired by the modern workshop creation layout:
 * - Branches management table (Name, Code, City, Address, Actions) with Add/Edit modal.
 * - 3 Topology Presets:
 *     1. Central Hub (1:N): One central warehouse serving all branches.
 *     2. Dedicated Stores (1:1): Each branch has its own local parts store.
 *     3. Custom Mesh (M:N): Interactive matrix routing any warehouse to any branch.
 * - Warehouses table (Name, Code, Type, Supplying Branches, Actions) with Add/Edit modal.
 * - Interactive Serving Matrix Grid: Warehouse x Branch checkbox matrix with live updates.
 * - Real-time Branch Supply Coverage status indicators.
 */
@Component({
  selector: 'app-stage-structure',
  imports: [],
  templateUrl: './stage-structure.html',
  styleUrl: './stage-structure.css',
})
export class StageStructure {
  readonly blueprint = input.required<OnboardingBlueprint>();
  protected readonly store = inject(OnboardingStore);

  protected readonly multiBranch = computed(() => isCapabilityActive(this.store.draft().capabilities, 'MULTI_BRANCH'));
  protected readonly hasInventory = computed(() => isCapabilityActive(this.store.draft().capabilities, 'INVENTORY'));
  protected readonly multiWarehouse = computed(() =>
    isCapabilityActive(this.store.draft().capabilities, 'MULTI_WAREHOUSE'),
  );

  // Active view filter
  protected readonly activeTab = signal<'ALL' | 'BRANCHES' | 'WAREHOUSES' | 'MATRIX'>('ALL');

  // Branch modal state
  protected readonly branchModalOpen = signal(false);
  protected readonly editingBranchIndex = signal<number | null>(null);
  protected readonly branchName = signal('');
  protected readonly branchCode = signal('');
  protected readonly branchCity = signal('');
  protected readonly branchAddress = signal('');

  // Warehouse modal state
  protected readonly warehouseModalOpen = signal(false);
  protected readonly editingWarehouseIndex = signal<number | null>(null);
  protected readonly warehouseName = signal('');
  protected readonly warehouseCode = signal('');
  protected readonly warehouseTopology = signal<WarehouseTopologyType>('BRANCH_STORE');
  protected readonly warehouseBranchCodes = signal<string[]>([]);

  // Open Add Branch Modal
  protected openAddBranch(): void {
    const index = this.store.draft().branches.length + 1;
    this.editingBranchIndex.set(null);
    this.branchName.set('');
    this.branchCode.set(`BR${index}`);
    this.branchCity.set(this.store.draft().identity.city || '');
    this.branchAddress.set('');
    this.branchModalOpen.set(true);
  }

  // Open Edit Branch Modal
  protected openEditBranch(index: number): void {
    const branch = this.store.draft().branches[index];
    if (!branch) return;
    this.editingBranchIndex.set(index);
    this.branchName.set(branch.name);
    this.branchCode.set(branch.code);
    this.branchCity.set(branch.city || '');
    this.branchAddress.set(branch.address || '');
    this.branchModalOpen.set(true);
  }

  protected saveBranch(): void {
    const name = this.branchName().trim();
    const code = this.branchCode().trim().toUpperCase();
    const city = this.branchCity().trim();
    const address = this.branchAddress().trim();
    if (!code) return;

    const idx = this.editingBranchIndex();
    if (idx !== null) {
      this.store.updateBranch(idx, { name, code, city, address });
    } else {
      this.store.addBranch({ name: name || code, code, city, address });
    }
    this.branchModalOpen.set(false);
  }

  protected closeBranchModal(): void {
    this.branchModalOpen.set(false);
  }

  // Open Add Warehouse Modal
  protected openAddWarehouse(): void {
    const index = this.store.draft().warehouses.length + 1;
    this.editingWarehouseIndex.set(null);
    this.warehouseName.set('');
    this.warehouseCode.set(`WH${index}`);
    this.warehouseTopology.set(this.store.draft().branches.length > 1 ? 'BRANCH_STORE' : 'CENTRAL_HUB');
    this.warehouseBranchCodes.set(this.store.draft().branches.map((b) => b.code));
    this.warehouseModalOpen.set(true);
  }

  // Open Edit Warehouse Modal
  protected openEditWarehouse(index: number): void {
    const warehouse = this.store.draft().warehouses[index];
    if (!warehouse) return;
    this.editingWarehouseIndex.set(index);
    this.warehouseName.set(warehouse.name);
    this.warehouseCode.set(warehouse.code);
    this.warehouseTopology.set(
      warehouse.topologyType || (warehouse.branchCodes.length === 0 ? 'CENTRAL_HUB' : 'BRANCH_STORE'),
    );
    this.warehouseBranchCodes.set(
      warehouse.branchCodes.length === 0
        ? this.store.draft().branches.map((b) => b.code)
        : [...warehouse.branchCodes],
    );
    this.warehouseModalOpen.set(true);
  }

  protected toggleWarehouseModalBranch(branchCode: string): void {
    const current = this.warehouseBranchCodes();
    if (current.includes(branchCode)) {
      this.warehouseBranchCodes.set(current.filter((c) => c !== branchCode));
    } else {
      this.warehouseBranchCodes.set([...current, branchCode]);
    }
  }

  protected setModalSelectAllBranches(all: boolean): void {
    if (all) {
      this.warehouseBranchCodes.set(this.store.draft().branches.map((b) => b.code));
    } else {
      this.warehouseBranchCodes.set([]);
    }
  }

  protected saveWarehouse(): void {
    const name = this.warehouseName().trim();
    const code = this.warehouseCode().trim().toUpperCase();
    const topologyType = this.warehouseTopology();
    const branchCodes = this.warehouseBranchCodes();
    if (!code) return;

    const idx = this.editingWarehouseIndex();
    if (idx !== null) {
      this.store.updateWarehouse(idx, { name, code, branchCodes, topologyType });
    } else {
      this.store.addWarehouse({ name: name || code, code, branchCodes, topologyType });
    }
    this.warehouseModalOpen.set(false);
  }

  protected closeWarehouseModal(): void {
    this.warehouseModalOpen.set(false);
  }

  protected applyPreset(preset: 'CENTRAL_HUB' | 'DEDICATED' | 'CUSTOM'): void {
    this.store.applyTopologyPreset(preset);
  }

  protected getWarehouseRoleBadge(warehouse: DraftWarehouse): { label: string; class: string } {
    if (warehouse.topologyType === 'CENTRAL_HUB' || warehouse.branchCodes.length === 0) {
      return { label: 'Central Hub (1:N)', class: 'badge--central' };
    }
    if (warehouse.topologyType === 'BRANCH_STORE' || warehouse.branchCodes.length === 1) {
      return { label: 'Branch Store (1:1)', class: 'badge--branch' };
    }
    return { label: 'Custom Regional (M:N)', class: 'badge--custom' };
  }

  protected getSupplyingBranchesText(warehouse: DraftWarehouse): string {
    const allBranches = this.store.draft().branches;
    if (allBranches.length === 0) return 'No branches';
    if (warehouse.branchCodes.length === 0 || warehouse.branchCodes.length >= allBranches.length) {
      return `All Branches (${allBranches.length})`;
    }
    return warehouse.branchCodes
      .map((code) => {
        const found = allBranches.find((b) => b.code === code);
        return found ? found.name || found.code : code;
      })
      .join(', ');
  }

  protected isStoreServingBranch(warehouse: DraftWarehouse, branchCode: string): boolean {
    return this.store.warehouseServesBranch(warehouse, branchCode);
  }

  protected getCoverageWarehousesList(warehouses: readonly DraftWarehouse[]): string {
    const total = this.store.draft().warehouses.length;
    if (warehouses.length === total) {
      return `All Stores (${total})`;
    }
    return warehouses.map((wh) => wh.name || wh.code).join(', ') || 'Connected';
  }
}
