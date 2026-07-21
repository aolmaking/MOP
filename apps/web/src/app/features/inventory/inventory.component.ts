import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type {
  CategoryCode,
  InventoryHomeDto,
  InventoryItemDto,
  InventoryMovementDto,
  InventoryReportsDto,
  InventoryReturnRequestDto,
  InventoryStockStatusDto,
  InventoryTechnicianRequestDto
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";
import { AuthStore } from "../../core/auth/auth.store";

type InventoryPage = "home" | "requests" | "catalog" | "quantity" | "returns" | "reports";

type CatalogDraft = {
  name: string;
  sku: string;
  barcode: string;
  type: string;
  catalogCategory: CategoryCode;
  subCategory: string;
  compatibleCategories: CategoryCode[];
  imageUrl: string;
  warehouseId: string;
  initialStock: number;
  minStock: number;
  criticalStock: number;
  price: number;
  cost: number;
  posVisible: boolean;
  workOrderUsable: boolean;
  stockTracked: boolean;
  supplierName: string;
  notes: string;
};

@Component({
  selector: "mop-inventory",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="min-h-screen bg-[#f5f2ed] px-5 py-6 lg:px-8">
      <div class="mx-auto max-w-7xl">
        <header class="rounded-lg bg-ink-950 p-6 text-white shadow-panel">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-xs font-semibold uppercase text-white/50">Inventory Manager</div>
              <h1 class="mt-3 text-3xl font-black tracking-normal">{{ title() }}</h1>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-white/70">{{ subtitle() }}</p>
            </div>
            <button type="button" class="mop-button-secondary border-white/15 bg-white/10 text-white hover:bg-white/20" (click)="load()">
              Refresh
            </button>
          </div>

          <nav class="mt-6 mop-adaptive-grid-sm">
            <a
              *ngFor="let nav of visiblePages()"
              [routerLink]="['/' + nav.route]"
              class="rounded-md px-3 py-3 text-sm font-black transition"
              [ngClass]="page() === nav.id ? 'bg-white text-ink-950' : 'bg-white/10 text-white/75 hover:bg-white/15 hover:text-white'"
            >
              {{ nav.label }}
            </a>
          </nav>
        </header>

        <div *ngIf="actionMessage()" class="mt-4 rounded-lg border border-signal-green/20 bg-green-50 p-4 text-sm font-bold text-signal-green">
          {{ actionMessage() }}
        </div>
        <div *ngIf="loading()" class="mt-4 rounded-lg border border-black/10 bg-white p-4 text-sm font-bold text-ink-500">
          Loading inventory workspace...
        </div>

        <ng-container [ngSwitch]="page()">
          <section *ngSwitchCase="'home'" class="mt-5">
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <a [routerLink]="['/inventory-requests']" class="mop-card">
                <div class="text-sm font-bold text-ink-500">Pending technician requests</div>
                <div class="mt-3 text-4xl font-black">{{ home()?.counts?.pendingTechnicianRequests || 0 }}</div>
              </a>
              <a [routerLink]="['/inventory-requests']" class="mop-card">
                <div class="text-sm font-bold text-ink-500">Items ready to dispatch</div>
                <div class="mt-3 text-4xl font-black">{{ home()?.counts?.itemsToDispatch || 0 }}</div>
              </a>
              <a [routerLink]="['/inventory-requests']" class="mop-card">
                <div class="text-sm font-bold text-ink-500">Waiting technician arrival</div>
                <div class="mt-3 text-4xl font-black">{{ home()?.counts?.waitingTechnicianArrival || 0 }}</div>
              </a>
              <a [routerLink]="['/inventory-returns']" class="mop-card">
                <div class="text-sm font-bold text-ink-500">Return requests</div>
                <div class="mt-3 text-4xl font-black">{{ home()?.counts?.returnRequests || 0 }}</div>
              </a>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <a [routerLink]="['/inventory-quantity']" class="rounded-lg border border-signal-gold/25 bg-[#fff4df] p-5 shadow-sm">
                <div class="text-sm font-black text-signal-gold">Low stock</div>
                <div class="mt-3 text-3xl font-black">{{ home()?.counts?.lowStock || 0 }}</div>
              </a>
              <a [routerLink]="['/inventory-quantity']" class="rounded-lg border border-signal-red/20 bg-signal-rose p-5 shadow-sm">
                <div class="text-sm font-black text-signal-red">Critical stock</div>
                <div class="mt-3 text-3xl font-black">{{ home()?.counts?.criticalStock || 0 }}</div>
              </a>
              <a [routerLink]="['/inventory-quantity']" class="rounded-lg border border-signal-red/25 bg-white p-5 shadow-sm">
                <div class="text-sm font-black text-signal-red">Out of stock</div>
                <div class="mt-3 flex items-center gap-3 text-3xl font-black">
                  <span class="inline-flex h-3 w-3 animate-pulse rounded-full bg-signal-red"></span>
                  {{ home()?.counts?.outOfStock || 0 }}
                </div>
              </a>
              <a [routerLink]="['/inventory-returns']" class="mop-card">
                <div class="text-sm font-bold text-ink-500">Today movements</div>
                <div class="mt-3 text-3xl font-black">{{ home()?.counts?.todayMovements || 0 }}</div>
              </a>
            </div>

            <section class="mt-5 rounded-lg border border-black/10 bg-white p-5 shadow-panel">
              <h2 class="text-xl font-black">Fast Moving Items</h2>
              <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div *ngFor="let item of home()?.fastMovingItems || []" class="rounded-lg border border-black/10 p-4">
                  <div class="text-sm font-black">{{ item.itemName }}</div>
                  <div class="mt-1 text-xs font-semibold text-ink-500">{{ item.category }}</div>
                  <div class="mt-3 text-2xl font-black">{{ item.qtyUsed }}</div>
                </div>
              </div>
            </section>
          </section>

          <section *ngSwitchCase="'requests'" class="mt-5 grid gap-4">
            <article *ngFor="let request of requests()" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap gap-2">
                    <span class="mop-pill">{{ request.workOrderNumber }}</span>
                    <span class="mop-pill" [ngClass]="urgencyClass(request.urgency)">Urgency: {{ request.urgency }}</span>
                    <span class="mop-pill" [ngClass]="availabilityClass(request.availability)">{{ request.availability }}</span>
                    <span class="mop-pill">{{ request.status }}</span>
                  </div>
                  <h2 class="mt-4 text-2xl font-black">{{ request.itemName }} <span class="text-base text-ink-500">x{{ request.qty }}</span></h2>
                  <p class="mt-1 text-sm font-semibold text-ink-500">{{ request.assetName }} - {{ request.assetIdentifier }} - {{ request.category }}</p>
                  <p class="mt-2 text-sm text-ink-600">{{ request.taskTitle || "Task" }} - {{ request.technicianName || "Technician" }} - {{ request.branchName || "Branch" }}</p>
                  <p *ngIf="request.reason" class="mt-3 rounded-md bg-black/[0.04] p-3 text-sm font-semibold text-ink-700">{{ request.reason }}</p>
                </div>
                <div class="grid min-w-56 gap-2">
                  <button type="button" class="mop-button-primary" [disabled]="requestClosed(request.status)" (click)="requestAction(request, 'approve')">Approve</button>
                  <button type="button" class="mop-button-secondary" [disabled]="requestClosed(request.status) || request.availability === 'out_of_stock'" (click)="requestAction(request, 'issue')">Issue / Dispatch</button>
                  <button type="button" class="mop-button-secondary" [disabled]="requestClosed(request.status)" (click)="requestAction(request, 'transfer')">Create Transfer</button>
                  <button type="button" class="mop-button-secondary" [disabled]="requestClosed(request.status)" (click)="requestAction(request, 'supplier')">Supplier Order</button>
                  <button type="button" class="mop-button-secondary text-signal-red" [disabled]="requestClosed(request.status)" (click)="requestAction(request, 'unavailable')">Mark Unavailable</button>
                  <button type="button" class="mop-button-secondary text-signal-red" [disabled]="requestClosed(request.status)" (click)="requestAction(request, 'reject')">Reject</button>
                </div>
              </div>

              <div class="mt-4 grid gap-2 md:grid-cols-3">
                <div *ngFor="let warehouse of request.availableWarehouses" class="rounded-md border border-black/10 p-3 text-sm">
                  <div class="font-black">{{ warehouse.warehouseName }}</div>
                  <div class="mt-1 text-ink-500">Available: {{ warehouse.availableQty }} - {{ warehouse.accessType || "scope" }}</div>
                  <button
                    type="button"
                    class="mt-3 w-full rounded-md bg-ink-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-black/20"
                    [disabled]="requestClosed(request.status) || warehouse.availableQty < request.qty"
                    (click)="requestAction(request, 'issue', { warehouseId: warehouse.warehouseId })"
                  >
                    Issue from this warehouse
                  </button>
                </div>
              </div>
            </article>
            <div *ngIf="!requests().length" class="rounded-lg border border-black/10 bg-white p-8 text-center text-sm font-bold text-ink-500">No technician requests in your warehouse scope.</div>
          </section>

          <section *ngSwitchCase="'catalog'" class="mt-5">
            <div class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-xl font-black">Inventory POS / Catalog Control</h2>
                  <p class="mt-1 text-sm text-ink-500">Control POS visibility, work-order usability, images, thresholds, and available quantities.</p>
                </div>
                <button type="button" class="mop-button-primary" (click)="openCreate()">Add New Item</button>
              </div>
              <input class="mt-4 w-full rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Search item, SKU, barcode, category" [ngModel]="catalogSearch()" (ngModelChange)="catalogSearch.set($event)" />
            </div>

            <form *ngIf="formOpen()" class="mt-4 rounded-lg border border-black/10 bg-white p-5 shadow-panel" (ngSubmit)="saveItem()">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 class="text-lg font-black">{{ selectedItem() ? "Edit Item" : "Add Inventory Item" }}</h3>
                  <p class="mt-1 text-sm text-ink-500">Required: name, SKU, type, category, subcategory, warehouse.</p>
                </div>
                <button type="button" class="mop-button-secondary" (click)="closeForm()">Close</button>
              </div>

              <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Item name" [ngModel]="itemDraft().name" name="name" (ngModelChange)="patchDraft({ name: $event })" required />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="SKU" [ngModel]="itemDraft().sku" name="sku" (ngModelChange)="patchDraft({ sku: $event })" required />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Barcode / QR" [ngModel]="itemDraft().barcode" name="barcode" (ngModelChange)="patchDraft({ barcode: $event })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Type" [ngModel]="itemDraft().type" name="type" (ngModelChange)="patchDraft({ type: $event })" required />
                <select class="rounded-md border border-black/10 px-3 py-3 text-sm" [ngModel]="itemDraft().catalogCategory" name="category" (ngModelChange)="setDraftCategory($event)">
                  <option *ngFor="let category of categories" [ngValue]="category">{{ category }}</option>
                </select>
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Subcategory" [ngModel]="itemDraft().subCategory" name="subCategory" (ngModelChange)="patchDraft({ subCategory: $event })" required />
                <select class="rounded-md border border-black/10 px-3 py-3 text-sm" [ngModel]="itemDraft().warehouseId" name="warehouseId" (ngModelChange)="patchDraft({ warehouseId: $event })">
                  <option value="">Select warehouse</option>
                  <option *ngFor="let warehouse of warehouseOptions()" [value]="warehouse.id">{{ warehouse.name }}</option>
                </select>
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Image URL" [ngModel]="itemDraft().imageUrl" name="imageUrl" (ngModelChange)="patchDraft({ imageUrl: $event })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" type="number" placeholder="Initial / current stock" [ngModel]="itemDraft().initialStock" name="stock" (ngModelChange)="patchDraft({ initialStock: numberValue($event) })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" type="number" placeholder="Low threshold" [ngModel]="itemDraft().minStock" name="minStock" (ngModelChange)="patchDraft({ minStock: numberValue($event) })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" type="number" placeholder="Critical threshold" [ngModel]="itemDraft().criticalStock" name="criticalStock" (ngModelChange)="patchDraft({ criticalStock: numberValue($event) })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" type="number" placeholder="POS price" [ngModel]="itemDraft().price" name="price" (ngModelChange)="patchDraft({ price: numberValue($event) })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" type="number" placeholder="Cost" [ngModel]="itemDraft().cost" name="cost" (ngModelChange)="patchDraft({ cost: numberValue($event) })" />
                <input class="rounded-md border border-black/10 px-3 py-3 text-sm" placeholder="Supplier" [ngModel]="itemDraft().supplierName" name="supplierName" (ngModelChange)="patchDraft({ supplierName: $event })" />
                <label class="rounded-md border border-black/10 px-3 py-3 text-sm font-bold">
                  Upload image
                  <input class="mt-2 w-full text-xs" type="file" accept="image/*" (change)="onImageFile($event)" />
                </label>
                <textarea class="rounded-md border border-black/10 px-3 py-3 text-sm xl:col-span-2" rows="3" placeholder="Notes" [ngModel]="itemDraft().notes" name="notes" (ngModelChange)="patchDraft({ notes: $event })"></textarea>
              </div>

              <div class="mt-4 flex flex-wrap gap-3">
                <label *ngFor="let category of categories" class="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm font-bold">
                  <input type="checkbox" [checked]="draftHasCategory(category)" (change)="toggleDraftCategory(category)" />
                  {{ category }}
                </label>
                <label class="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm font-bold"><input type="checkbox" [checked]="itemDraft().posVisible" (change)="patchDraft({ posVisible: !itemDraft().posVisible })" /> POS</label>
                <label class="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm font-bold"><input type="checkbox" [checked]="itemDraft().workOrderUsable" (change)="patchDraft({ workOrderUsable: !itemDraft().workOrderUsable })" /> Work Order</label>
                <label class="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm font-bold"><input type="checkbox" [checked]="itemDraft().stockTracked" (change)="patchDraft({ stockTracked: !itemDraft().stockTracked })" /> Stock tracked</label>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <button type="submit" class="mop-button-primary">{{ selectedItem() ? "Save Changes" : "Create Item" }}</button>
                <button type="button" class="mop-button-secondary" (click)="closeForm()">Cancel</button>
              </div>
            </form>

            <div class="mt-4 grid gap-4 xl:grid-cols-2">
              <article *ngFor="let item of filteredItems()" class="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                <div class="flex gap-4">
                  <div class="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-black/[0.04]">
                    <img *ngIf="item.imageUrl" [src]="item.imageUrl" class="h-full w-full object-cover" alt="" />
                    <div *ngIf="!item.imageUrl" class="flex h-full items-center justify-center text-xs font-black text-ink-400">IMAGE</div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="mop-pill">{{ item.category }}</span>
                      <span class="mop-pill">{{ item.status }}</span>
                      <span class="mop-pill">SKU {{ item.sku }}</span>
                    </div>
                    <h3 class="mt-3 text-xl font-black">{{ item.name }}</h3>
                    <p class="mt-1 text-sm font-semibold text-ink-500">{{ item.subCategory || item.type }} - {{ item.warehouseName }}</p>
                    <div class="mt-3 grid gap-2 text-sm md:grid-cols-4">
                      <div class="rounded-md bg-black/[0.04] p-3"><b>{{ item.stock }}</b><br />Available</div>
                      <div class="rounded-md bg-black/[0.04] p-3"><b>{{ item.minStock }}</b><br />Low</div>
                      <div class="rounded-md bg-black/[0.04] p-3"><b>{{ item.criticalStock || 0 }}</b><br />Critical</div>
                      <div class="rounded-md bg-black/[0.04] p-3"><b>{{ item.price | number: "1.0-2" }}</b><br />Price</div>
                    </div>
                  </div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button type="button" class="mop-button-secondary" (click)="openEdit(item)">Edit</button>
                  <button type="button" class="mop-button-secondary" (click)="itemAction(item, 'stock_adjust', { qty: 1, reason: 'Quick +1 stock correction.' })">+1 Stock</button>
                  <button type="button" class="mop-button-secondary" (click)="itemAction(item, 'stock_adjust', { qty: -1, reason: 'Quick -1 stock correction.' })">-1 Stock</button>
                  <button type="button" class="mop-button-secondary" (click)="itemAction(item, 'toggle_pos', { value: !item.posVisible })">{{ item.posVisible ? "Hide POS" : "Show POS" }}</button>
                  <button type="button" class="mop-button-secondary" (click)="itemAction(item, 'toggle_work_order', { value: !item.workOrderUsable })">{{ item.workOrderUsable ? "Disable WO" : "Enable WO" }}</button>
                  <button type="button" class="mop-button-secondary text-signal-red" (click)="itemAction(item, 'archive')">Archive</button>
                </div>
              </article>
            </div>
          </section>

          <section *ngSwitchCase="'quantity'" class="mt-5 grid gap-4">
            <div class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-xl font-black">Quantity Control & Stock Status</h2>
                <div class="flex flex-wrap gap-2">
                  <button *ngFor="let filter of stockFilters" type="button" class="rounded-full px-3 py-2 text-sm font-black" [ngClass]="stockFilter() === filter.id ? 'bg-ink-950 text-white' : 'bg-black/[0.05] text-ink-700'" (click)="stockFilter.set(filter.id)">{{ filter.label }}</button>
                </div>
              </div>
            </div>
            <article *ngFor="let item of filteredStock()" class="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="flex flex-wrap gap-2">
                    <span class="mop-pill">{{ item.category }}</span>
                    <span class="mop-pill" [ngClass]="stockStatusClass(item.status)">
                      <span *ngIf="item.status === 'out_of_stock'" class="mr-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-signal-red"></span>
                      {{ item.status }}
                    </span>
                  </div>
                  <h3 class="mt-3 text-2xl font-black">{{ item.itemName }}</h3>
                  <p class="mt-1 text-sm font-semibold text-ink-500">{{ item.sku }} - {{ item.subCategory || "General" }}</p>
                </div>
                <div class="grid grid-cols-4 gap-2 text-center text-sm">
                  <div class="rounded-md bg-green-50 p-3 text-signal-green"><b>{{ item.totalAvailable }}</b><br />Available</div>
                  <div class="rounded-md bg-blue-50 p-3 text-signal-blue"><b>{{ item.issuedToTechnicians }}</b><br />Issued</div>
                  <div class="rounded-md bg-[#fff4df] p-3 text-signal-gold"><b>{{ item.waitingReturn }}</b><br />Return</div>
                  <div class="rounded-md bg-signal-rose p-3 text-signal-red"><b>{{ item.damaged }}</b><br />Damaged</div>
                </div>
              </div>
              <div class="mt-4 grid gap-2 md:grid-cols-3">
                <div *ngFor="let warehouse of item.warehouseBalances" class="rounded-md border border-black/10 p-3 text-sm">
                  <div class="font-black">{{ warehouse.warehouseName }}</div>
                  <div class="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <span>Avail {{ warehouse.available }}</span>
                    <span>Issued {{ warehouse.issued }}</span>
                    <span>Return {{ warehouse.returnPending }}</span>
                    <span>Damaged {{ warehouse.damaged }}</span>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section *ngSwitchCase="'returns'" class="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div>
              <h2 class="mb-3 text-xl font-black">Returns Pending Inventory Review</h2>
              <article *ngFor="let row of returns()" class="mb-3 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span class="mop-pill">{{ row.status }}</span>
                    <h3 class="mt-3 text-xl font-black">{{ row.itemName }} x{{ row.qty }}</h3>
                    <p class="mt-1 text-sm text-ink-500">{{ row.technicianName || "Technician" }} - {{ row.workOrderId }}</p>
                    <p class="mt-3 rounded-md bg-black/[0.04] p-3 text-sm font-semibold">{{ row.reason }} - {{ row.condition }}</p>
                  </div>
                  <div class="grid gap-2">
                    <button type="button" class="mop-button-primary" [disabled]="!returnPending(row.status)" (click)="returnAction(row, 'accept_stock')">Accept to Stock</button>
                    <button type="button" class="mop-button-secondary" [disabled]="!returnPending(row.status)" (click)="returnAction(row, 'accept_damaged')">Accept Damaged</button>
                    <button type="button" class="mop-button-secondary text-signal-red" [disabled]="!returnPending(row.status)" (click)="returnAction(row, 'reject')">Reject</button>
                  </div>
                </div>
              </article>
              <div *ngIf="!returns().length" class="rounded-lg border border-black/10 bg-white p-6 text-sm font-bold text-ink-500">No return requests.</div>
            </div>
            <div>
              <h2 class="mb-3 text-xl font-black">Movement Ledger</h2>
              <article *ngFor="let movement of movements()" class="mb-3 rounded-lg border border-black/10 bg-white p-4 text-sm shadow-sm">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="font-black">{{ movement.itemName }}</div>
                    <div class="mt-1 text-ink-500">{{ movement.movementType }} - {{ movement.warehouseName }}</div>
                    <div *ngIf="movement.beforeQty !== undefined && movement.afterQty !== undefined" class="mt-1 text-xs font-bold text-ink-500">Balance {{ movement.beforeQty }} -> {{ movement.afterQty }}</div>
                    <div *ngIf="movement.reason" class="mt-2 text-ink-600">{{ movement.reason }}</div>
                  </div>
                  <div class="rounded-full px-3 py-1 text-xs font-black" [ngClass]="movement.qty < 0 ? 'bg-signal-rose text-signal-red' : 'bg-green-50 text-signal-green'">{{ movement.qty }}</div>
                </div>
              </article>
            </div>
          </section>

          <section *ngSwitchCase="'reports'" class="mt-5 grid gap-5">
            <div class="mop-adaptive-grid">
              <section *ngIf="canReport('reports.inventory.consumption.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Usage By Item</h2>
                <div *ngFor="let row of reports()?.usageByItem || []" class="mt-3 flex justify-between rounded-md bg-black/[0.04] p-3 text-sm">
                  <span>{{ row.itemName }} - {{ row.category }}</span>
                  <b>{{ row.qtyUsed }}</b>
                </div>
                <div *ngIf="!(reports()?.usageByItem || []).length" class="mop-empty-state mt-3">No usage data in this scope.</div>
              </section>
              <section *ngIf="canReport('reports.inventory.consumption.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Consumption Rate</h2>
                <p class="mt-1 text-sm text-ink-500">Current period usage count.</p>
                <div *ngFor="let row of reports()?.usageByItem || []" class="mt-3 rounded-md bg-black/[0.04] p-3 text-sm">
                  <div class="font-black">{{ row.itemName }}</div>
                  <div class="mt-1 text-ink-500">{{ row.qtyUsed }} used · {{ row.linkedWorkOrders }} linked work orders</div>
                </div>
                <div *ngIf="!(reports()?.usageByItem || []).length" class="mop-empty-state mt-3">No consumption records yet.</div>
              </section>
              <section *ngIf="canReport('reports.inventory.stock_health.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Stock Risk</h2>
                <div *ngFor="let row of reports()?.stockRisk || []" class="mt-3 rounded-md p-3 text-sm" [ngClass]="stockStatusClass(row.risk)">
                  <div class="font-black">{{ row.itemName }}</div>
                  <div class="mt-1">Stock {{ row.currentStock }} - Pending {{ row.pendingRequests }}</div>
                </div>
                <div *ngIf="!(reports()?.stockRisk || []).length" class="mop-empty-state mt-3">No stock risks in this scope.</div>
              </section>
              <section *ngIf="canReport('reports.inventory.returns.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Returns Report</h2>
                <div *ngFor="let row of reports()?.returns || []" class="mt-3 rounded-md bg-black/[0.04] p-3 text-sm">
                  <b>{{ row.itemName }}</b> - {{ row.returnedQty }} - {{ row.reason }}
                </div>
                <div *ngIf="!(reports()?.returns || []).length" class="mop-empty-state mt-3">No returns in this scope.</div>
              </section>
            </div>
            <div class="mop-adaptive-grid-lg">
              <section *ngIf="canReport('reports.inventory.movements.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Technician Request Report</h2>
                <p class="mt-1 text-sm text-ink-500">Average response time placeholder: tracked after live event timestamps are connected.</p>
                <div *ngFor="let row of reports()?.technicianRequests || []" class="mop-resilient-row mt-3">
                  <b>{{ row.technicianName }}</b>
                  <span>Req {{ row.requests }}</span>
                  <span>Ok {{ row.approved }}</span>
                  <span>Rejected {{ row.rejected }}</span>
                  <span>Returns {{ row.returned }}</span>
                </div>
                <div *ngIf="!(reports()?.technicianRequests || []).length" class="mop-empty-state mt-3">No technician request activity.</div>
              </section>
              <section *ngIf="canReport('reports.inventory.consumption.view')" class="rounded-lg border border-black/10 bg-white p-5 shadow-panel">
                <h2 class="text-xl font-black">Category Usage</h2>
                <div *ngFor="let row of reports()?.categoryUsage || []" class="mop-resilient-row mt-3">
                  <b>{{ row.category }}</b>
                  <span>Used {{ row.qtyUsed }}</span>
                  <span>Low {{ row.lowStockItems }}</span>
                  <span>Returns {{ row.returns }}</span>
                </div>
                <div *ngIf="!(reports()?.categoryUsage || []).length" class="mop-empty-state mt-3">No category usage in this scope.</div>
              </section>
            </div>
            <div *ngIf="!auth.hasAnyPermission(['reports.inventory.stock_health.view', 'reports.inventory.movements.view', 'reports.inventory.consumption.view', 'reports.inventory.returns.view'])" class="mop-empty-state">
              Inventory reports are hidden by Owner Configuration or Platform Control.
            </div>
          </section>
        </ng-container>
      </div>
    </section>
  `
})
export class InventoryComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthStore);

  readonly categories: CategoryCode[] = ["Cars", "Motorcycles", "Heavy Equipment"];
  readonly pages: Array<{ id: InventoryPage; route: string; label: string }> = [
    { id: "home", route: "inventory-home", label: "Home" },
    { id: "requests", route: "inventory-requests", label: "Requests" },
    { id: "catalog", route: "inventory-catalog", label: "Catalog" },
    { id: "quantity", route: "inventory-quantity", label: "Quantity" },
    { id: "returns", route: "inventory-returns", label: "Returns" },
    { id: "reports", route: "inventory-reports", label: "Reports" }
  ];
  readonly stockFilters = [
    { id: "all", label: "All" },
    { id: "low", label: "Low" },
    { id: "critical", label: "Critical" },
    { id: "out_of_stock", label: "Zero" }
  ];

  readonly page = signal<InventoryPage>("home");
  readonly loading = signal(false);
  readonly actionMessage = signal("");
  readonly home = signal<InventoryHomeDto | null>(null);
  readonly requests = signal<InventoryTechnicianRequestDto[]>([]);
  readonly items = signal<InventoryItemDto[]>([]);
  readonly stock = signal<InventoryStockStatusDto[]>([]);
  readonly movements = signal<InventoryMovementDto[]>([]);
  readonly returns = signal<InventoryReturnRequestDto[]>([]);
  readonly reports = signal<InventoryReportsDto | null>(null);
  readonly catalogSearch = signal("");
  readonly stockFilter = signal("all");
  readonly formOpen = signal(false);
  readonly selectedItem = signal<InventoryItemDto | null>(null);
  readonly itemDraft = signal<CatalogDraft>(this.emptyDraft());

  async ngOnInit() {
    this.page.set((this.route.snapshot.data["inventoryPage"] as InventoryPage) || "home");
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.actionMessage.set("");
    try {
      if (this.page() === "home") this.home.set(await firstValueFrom(this.api.get<InventoryHomeDto>("/inventory/home")));
      if (this.page() === "requests") this.requests.set(await firstValueFrom(this.api.get<InventoryTechnicianRequestDto[]>("/inventory/technician-requests")));
      if (this.page() === "catalog") this.items.set(await firstValueFrom(this.api.get<InventoryItemDto[]>("/inventory/items")));
      if (this.page() === "quantity") this.stock.set(await firstValueFrom(this.api.get<InventoryStockStatusDto[]>("/inventory/stock-status")));
      if (this.page() === "returns") {
        const [returnRows, movementRows] = await Promise.all([
          firstValueFrom(this.api.get<InventoryReturnRequestDto[]>("/inventory/returns")),
          firstValueFrom(this.api.get<InventoryMovementDto[]>("/inventory/movements"))
        ]);
        this.returns.set(returnRows);
        this.movements.set(movementRows);
      }
      if (this.page() === "reports") this.reports.set(await firstValueFrom(this.api.get<InventoryReportsDto>("/inventory/reports-lite")));
    } finally {
      this.loading.set(false);
    }
  }

  visiblePages() {
    return this.pages.filter((item) => this.auth.canRoute(item.route));
  }

  canReport(permission: string) {
    return this.auth.hasPermission(permission);
  }

  title() {
    return {
      home: "Inventory Home",
      requests: "Technician Requests",
      catalog: "Inventory POS / Catalog Control",
      quantity: "Quantity Control & Stock Status",
      returns: "Returns / Movements",
      reports: "Reports & Stock Insights"
    }[this.page()];
  }

  subtitle() {
    return {
      home: "A live command view for requests, dispatches, returns, low stock, and today movement.",
      requests: "Approve, issue, transfer, reject, or create supplier orders from technician task context.",
      catalog: "Maintain the item master with POS visibility, work-order usability, photos, thresholds, and stock controls.",
      quantity: "Track Available, Issued, Return Pending, and Damaged quantities across warehouse access.",
      returns: "Review unused parts, restore stock, mark damage, and audit every movement.",
      reports: "Lite reporting for usage, risk, returns, technician requests, and category consumption."
    }[this.page()];
  }

  async requestAction(request: InventoryTechnicianRequestDto, action: "approve" | "issue" | "reject" | "unavailable" | "transfer" | "supplier", extra: Record<string, unknown> = {}) {
    const sourceWarehouse = request.availableWarehouses.find((warehouse) => warehouse.availableQty >= request.qty);
    const body: Record<string, unknown> = { action, ...extra };
    if (action === "issue") body["qty"] = request.qty;
    if (action === "reject") body["reason"] = "Rejected by Inventory Manager after request review.";
    if (action === "transfer") {
      body["fromWarehouseId"] = sourceWarehouse?.warehouseId;
      body["reason"] = "Transfer created from technician request queue.";
    }
    if (action === "supplier") body["reason"] = "Supplier order created from technician request queue.";
    await firstValueFrom(this.api.post(`/inventory/technician-requests/${request.id}/action`, body));
    this.actionMessage.set(`Request ${action} completed.`);
    await this.load();
  }

  async returnAction(row: InventoryReturnRequestDto, action: "accept_stock" | "accept_damaged" | "reject") {
    await firstValueFrom(this.api.post(`/inventory/returns/${row.id}/action`, { action }));
    this.actionMessage.set(`Return ${action} completed.`);
    await this.load();
  }

  async itemAction(item: InventoryItemDto, action: "archive" | "toggle_pos" | "toggle_work_order" | "stock_adjust", extra: Record<string, unknown> = {}) {
    await firstValueFrom(this.api.post(`/inventory/catalog/items/${item.id}/action`, { action, ...extra }));
    this.actionMessage.set(`Item ${action} completed.`);
    await this.load();
  }

  openCreate() {
    this.selectedItem.set(null);
    this.itemDraft.set(this.emptyDraft());
    this.formOpen.set(true);
  }

  openEdit(item: InventoryItemDto) {
    this.selectedItem.set(item);
    this.itemDraft.set({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode || "",
      type: item.type || "",
      catalogCategory: (this.categories.includes(item.category as CategoryCode) ? item.category : "Cars") as CategoryCode,
      subCategory: item.subCategory || "",
      compatibleCategories: item.compatibleCategories?.length ? item.compatibleCategories : ["Cars"],
      imageUrl: item.imageUrl || "",
      warehouseId: item.warehouseId || "",
      initialStock: item.stock,
      minStock: item.minStock,
      criticalStock: item.criticalStock || 0,
      price: item.price,
      cost: item.cost || 0,
      posVisible: item.posVisible ?? true,
      workOrderUsable: item.workOrderUsable ?? true,
      stockTracked: item.stockTracked ?? true,
      supplierName: "",
      notes: ""
    });
    this.formOpen.set(true);
  }

  closeForm() {
    this.formOpen.set(false);
    this.selectedItem.set(null);
  }

  async saveItem() {
    const draft = this.itemDraft();
    const missing = ["name", "sku", "type", "subCategory", "warehouseId"].filter((field) => !String((draft as any)[field] || "").trim());
    if (missing.length) {
      this.actionMessage.set(`Missing required fields: ${missing.join(", ")}`);
      return;
    }
    if (this.selectedItem()) {
      await firstValueFrom(this.api.post(`/inventory/catalog/items/${this.selectedItem()!.id}/action`, { action: "update", ...draft }));
      this.actionMessage.set("Item changes saved.");
    } else {
      await firstValueFrom(this.api.post("/inventory/catalog/items", draft));
      this.actionMessage.set("Item created.");
    }
    this.closeForm();
    await this.load();
  }

  patchDraft(patch: Partial<CatalogDraft>) {
    this.itemDraft.set({ ...this.itemDraft(), ...patch });
  }

  setDraftCategory(category: CategoryCode) {
    this.patchDraft({ catalogCategory: category });
  }

  toggleDraftCategory(category: CategoryCode) {
    const current = this.itemDraft().compatibleCategories;
    const next = current.includes(category) ? current.filter((row) => row !== category) : [...current, category];
    this.patchDraft({ compatibleCategories: next.length ? next : [category] });
  }

  draftHasCategory(category: CategoryCode) {
    return this.itemDraft().compatibleCategories.includes(category);
  }

  onImageFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.patchDraft({ imageUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  numberValue(value: unknown) {
    return Number(value || 0);
  }

  warehouseOptions() {
    const map = new Map<string, string>();
    for (const item of this.items()) {
      if (item.warehouseId) map.set(item.warehouseId, item.warehouseName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }

  filteredItems() {
    const term = this.catalogSearch().trim().toLowerCase();
    if (!term) return this.items();
    return this.items().filter((item) => [item.name, item.sku, item.barcode || "", item.category, item.subCategory || ""].some((value) => value.toLowerCase().includes(term)));
  }

  filteredStock() {
    if (this.stockFilter() === "all") return this.stock();
    return this.stock().filter((item) => item.status === this.stockFilter());
  }

  requestClosed(status: string) {
    return ["used", "cancelled", "rejected", "return_accepted", "returned_to_stock", "return_rejected"].includes(status);
  }

  returnPending(status: string) {
    return status === "pending_inventory_review";
  }

  availabilityClass(availability: string) {
    if (availability === "available") return "border-signal-green/20 bg-green-50 text-signal-green";
    if (availability === "available_other_warehouse") return "border-signal-blue/20 bg-blue-50 text-signal-blue";
    if (availability === "low") return "border-signal-gold/20 bg-[#fff4df] text-signal-gold";
    return "border-signal-red/20 bg-signal-rose text-signal-red";
  }

  urgencyClass(urgency: string) {
    if (urgency === "critical") return "border-signal-red/20 bg-signal-rose text-signal-red";
    if (urgency === "high") return "border-signal-gold/20 bg-[#fff4df] text-signal-gold";
    return "";
  }

  stockStatusClass(status: string) {
    if (status === "healthy") return "border-signal-green/20 bg-green-50 text-signal-green";
    if (status === "low") return "border-signal-gold/20 bg-[#fff4df] text-signal-gold";
    if (status === "critical") return "border-signal-red/20 bg-signal-rose text-signal-red";
    return "border-signal-red/25 bg-white text-signal-red";
  }

  private emptyDraft(): CatalogDraft {
    return {
      name: "",
      sku: "",
      barcode: "",
      type: "",
      catalogCategory: "Cars",
      subCategory: "",
      compatibleCategories: ["Cars"],
      imageUrl: "",
      warehouseId: this.warehouseOptions()[0]?.id || "",
      initialStock: 0,
      minStock: 0,
      criticalStock: 0,
      price: 0,
      cost: 0,
      posVisible: true,
      workOrderUsable: true,
      stockTracked: true,
      supplierName: "",
      notes: ""
    };
  }
}
