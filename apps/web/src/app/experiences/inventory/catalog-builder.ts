import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type Observable, map, switchMap } from 'rxjs';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { FormField } from '../../ui/form-field/form-field';
import { ToastService } from '../../ui/toast/toast.service';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  InventoryApi,
  type AttributeRecord,
  type CatalogConfiguration,
  type ConfiguredAttribute,
  type ConfiguredCategory,
  type PreviewPage,
} from './inventory.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

interface CategoryForm {
  name: string;
  parentId: string;
  description: string;
  isActive: boolean;
  technicianVisible: boolean;
}

function emptyCategoryForm(): CategoryForm {
  return { name: '', parentId: '', description: '', isActive: true, technicianVisible: true };
}

/** The sentinel `expandedId` for a category that does not exist yet. */
const NEW = 'new';

/**
 * Catalog Builder -- where the technician's shopping experience is
 * actually authored, as one continuous job rather than three.
 *
 * The earlier shape of this page put categories in one panel and filters
 * in another, with "which filters does this category offer" as a third,
 * separate toggle buried in a category row. Building "Brakes needs a
 * Vehicle Type filter with Sedan/SUV/Truck" meant: create the category
 * here, switch panels, invent the filter and its values there, switch
 * back, open the assignment toggle, tick a checkbox, save. Four contexts
 * for one decision.
 *
 * Now a category IS the unit of work. Click one and its own editor
 * expands in place: rename it, and right there attach an existing
 * filter, invent a brand new one with its first value, add more values
 * to one it already has, or detach one it no longer needs. Nothing
 * requires leaving the row. Filters themselves stay a shared vocabulary
 * -- "Brand" invented once is reusable by every category -- which is why
 * creating one still writes a workshop-wide `CatalogAttribute` under the
 * hood; the difference is that the workshop-wide object is now created
 * from inside the one place a manager actually needs it.
 *
 * A filter that ends up attached to nothing (the result of detaching it
 * from its last category) is not orphaned data -- it is listed, quietly,
 * at the bottom, so it can be picked back up by attaching it to a
 * category later, without ever being deleted.
 *
 * The preview is the proof this isn't just a nicer form: it calls the
 * same server browse the technician's page calls, so a category left
 * invisible or a filter attached to nothing shows up here exactly as it
 * would in a bay.
 */
@Component({
  selector: 'app-catalog-builder',
  imports: [ErrorBanner, ButtonDirective, FormField],
  templateUrl: './catalog-builder.html',
  styleUrl: './catalog-builder.css',
})
export class CatalogBuilder {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly config = signal<CatalogConfiguration | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /**
   * Which category's editor is open. `NEW` is the not-yet-saved category
   * at the top of the list; a real id is an existing one; `null` means
   * nothing is expanded. Only one at a time -- this is read as a single
   * decision, not a spreadsheet of them.
   */
  protected readonly expandedId = signal<string | null>(null);
  protected readonly isNew = computed(() => this.expandedId() === NEW);

  protected readonly categoryForm = signal<CategoryForm>(emptyCategoryForm());
  /** The exact filters THIS category offers -- not inherited from a parent. */
  protected readonly categoryFilterIds = signal<string[]>([]);

  /** The pending choice in "attach an existing filter". */
  protected readonly attachChoice = signal('');

  /** The inline "invent a new filter" mini-form, scoped to the open category. */
  protected readonly creatingFilter = signal(false);
  protected readonly newFilterLabel = signal('');
  protected readonly newFilterFirstValue = signal('');

  /** Renaming one already-attached filter, inline. */
  protected readonly renamingAttributeId = signal<string | null>(null);
  protected readonly renameLabel = signal('');

  /** Adding one more value to an already-attached filter, inline. */
  protected readonly addingValueFor = signal<string | null>(null);
  protected readonly newValueLabel = signal('');

  /** The housekeeping list at the bottom, collapsed by default. */
  protected readonly orphansOpen = signal(false);

  /* --- preview -------------------------------------------------------- */

  protected readonly preview = signal<PreviewPage | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewCategoryId = signal<string | null>(null);
  protected readonly previewSelections = signal<Record<string, string[]>>({});
  protected readonly previewQuery = signal('');

  /* --- derived ---------------------------------------------------------- */

  /** Flat category list, depth-tagged, for the row list and the parent picker. */
  protected readonly flatCategories = computed(() => {
    const walk = (nodes: readonly ConfiguredCategory[], depth: number): { node: ConfiguredCategory; depth: number }[] =>
      nodes.flatMap((node) => [{ node, depth }, ...walk(node.children, depth + 1)]);
    return walk(this.config()?.categories ?? [], 0);
  });

  /** Only top-level categories may be a parent -- the tree is one deep. */
  protected readonly parentOptions = computed(() =>
    this.flatCategories()
      .filter((entry) => entry.depth === 0 && entry.node.id !== this.expandedId())
      .map((entry) => entry.node),
  );

  /** All filters, in the order the technician sees them (global sortOrder). */
  protected readonly allAttributes = computed(() => this.config()?.attributes ?? []);

  /** The open category's filters, resolved to full objects, technician order. */
  protected readonly categoryAttributes = computed<readonly ConfiguredAttribute[]>(() => {
    const ids = new Set(this.categoryFilterIds());
    return this.allAttributes().filter((attribute) => ids.has(attribute.id));
  });

  /** Active filters the open category does not already offer. */
  protected readonly attachableAttributes = computed(() => {
    const attached = new Set(this.categoryFilterIds());
    return this.allAttributes().filter((attribute) => attribute.isActive && !attached.has(attribute.id));
  });

  /** Filters attached to nothing at all -- reachable, never deleted. */
  protected readonly orphanAttributes = computed(() =>
    this.allAttributes().filter((attribute) => attribute.usedByCategoryIds.length === 0),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .catalogConfiguration()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.config.set(config);
          this.state.set('ready');
          this.refreshPreview();
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  /* --- opening / closing a category's editor -------------------------- */

  protected startNewCategory(): void {
    this.formError.set(null);
    this.categoryForm.set(emptyCategoryForm());
    this.categoryFilterIds.set([]);
    this.resetInlineState();
    this.expandedId.set(NEW);
  }

  protected toggleCategory(category: ConfiguredCategory): void {
    if (this.expandedId() === category.id) {
      this.closeExpanded();
      return;
    }
    this.formError.set(null);
    this.categoryForm.set({
      name: category.name,
      parentId: category.parentId ?? '',
      description: category.description ?? '',
      isActive: category.isActive,
      technicianVisible: category.technicianVisible,
    });
    this.categoryFilterIds.set([...category.attributeIds]);
    this.resetInlineState();
    this.expandedId.set(category.id);
  }

  protected closeExpanded(): void {
    this.expandedId.set(null);
    this.resetInlineState();
  }

  private resetInlineState(): void {
    this.creatingFilter.set(false);
    this.newFilterLabel.set('');
    this.newFilterFirstValue.set('');
    this.renamingAttributeId.set(null);
    this.addingValueFor.set(null);
    this.attachChoice.set('');
  }

  protected patchCategory<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]): void {
    this.categoryForm.update((form) => ({ ...form, [key]: value }));
  }

  /**
   * Saves the category, then re-opens the SAME editor on the saved row --
   * it does not collapse. A just-created category has nothing to manage
   * yet but its own fields; the moment it exists, this is where its
   * filters get built, in the same place, without a second click to get
   * back here.
   */
  protected saveCategory(): void {
    const id = this.expandedId();
    if (!id) return;
    const form = this.categoryForm();
    const name = form.name.trim();
    if (!name) {
      this.formError.set('A category needs a name.');
      return;
    }

    const draft = {
      name,
      parentId: form.parentId || null,
      description: form.description.trim() || undefined,
      isActive: form.isActive,
      technicianVisible: form.technicianVisible,
    };

    this.saving.set(true);
    this.formError.set(null);
    const request = id === NEW ? this.api.createCategory(draft) : this.api.updateCategory(id, draft);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.show(id === NEW ? `${name} added.` : `${name} updated.`, 'success');
        this.reloadThenExpand(id === NEW ? saved.id : id);
      },
      error: (err: PresentedError) => {
        this.saving.set(false);
        this.formError.set(err.message ?? 'That could not be saved.');
      },
    });
  }

  /**
   * Reloads the configuration and keeps (or moves) the open editor onto
   * `categoryId` -- the one operation every write on this page ends
   * with, since the server is the source of truth for slugs, sort
   * positions and counts, and the manager should never lose their place
   * to find that out.
   */
  private reloadThenExpand(categoryId: string): void {
    this.api
      .catalogConfiguration()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.config.set(config);
          const node = this.findCategory(config, categoryId);
          if (node) {
            this.categoryForm.set({
              name: node.name,
              parentId: node.parentId ?? '',
              description: node.description ?? '',
              isActive: node.isActive,
              technicianVisible: node.technicianVisible,
            });
            this.categoryFilterIds.set([...node.attributeIds]);
          }
          this.expandedId.set(categoryId);
          this.refreshPreview();
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  private findCategory(config: CatalogConfiguration, id: string): ConfiguredCategory | null {
    const walk = (nodes: readonly ConfiguredCategory[]): ConfiguredCategory | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(config.categories);
  }

  /* --- ordering --------------------------------------------------------
   *
   * Up/down rather than drag: this list is read on a desk, the moves are
   * one position at a time in practice, and a keyboard can reach a
   * button. Each move sends the whole sibling group, so two rows can
   * never end up sharing a position.
   * ---------------------------------------------------------------------- */

  private siblingsOf(category: ConfiguredCategory): string[] {
    const config = this.config();
    if (!config) return [];
    if (!category.parentId) return config.categories.map((node) => node.id);

    const findChildren = (nodes: readonly ConfiguredCategory[]): string[] => {
      for (const node of nodes) {
        if (node.id === category.parentId) return node.children.map((child) => child.id);
        const deeper = findChildren(node.children);
        if (deeper.length > 0) return deeper;
      }
      return [];
    };
    return findChildren(config.categories);
  }

  /** Returns null when the move would fall off either end. */
  private shifted(ids: readonly string[], id: string, delta: number): string[] | null {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return null;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  }

  protected canMoveCategory(category: ConfiguredCategory, delta: number): boolean {
    return this.shifted(this.siblingsOf(category), category.id, delta) !== null;
  }

  protected moveCategory(category: ConfiguredCategory, delta: number): void {
    const next = this.shifted(this.siblingsOf(category), category.id, delta);
    if (!next) return;
    this.run(this.api.reorderCategories(category.parentId, next), () => undefined);
  }

  protected canMoveAttribute(attribute: ConfiguredAttribute, delta: number): boolean {
    return this.shifted(this.allAttributes().map((a) => a.id), attribute.id, delta) !== null;
  }

  /**
   * Moves the filter's GLOBAL order -- the same position it holds in
   * every category that offers it, and in the technician's own filter
   * panel. There is deliberately no separate per-category order: two
   * ordering concepts for one row would be a second thing to keep in
   * sync, and the technician only ever experiences the one.
   */
  protected moveAttribute(attribute: ConfiguredAttribute, delta: number): void {
    const next = this.shifted(this.allAttributes().map((a) => a.id), attribute.id, delta);
    if (!next) return;
    this.run(this.api.reorderAttributes(next), () => undefined);
  }

  protected canMoveValue(attribute: ConfiguredAttribute, valueId: string, delta: number): boolean {
    return this.shifted(attribute.values.map((v) => v.id), valueId, delta) !== null;
  }

  protected moveValue(attribute: ConfiguredAttribute, valueId: string, delta: number): void {
    const next = this.shifted(attribute.values.map((v) => v.id), valueId, delta);
    if (!next) return;
    this.run(this.api.reorderAttributeValues(attribute.id, next), () => undefined);
  }

  /* --- a category's filters: attach, invent, rename, add value, detach - */

  protected attachExisting(): void {
    const categoryId = this.expandedId();
    const attributeId = this.attachChoice();
    if (!categoryId || categoryId === NEW || !attributeId) return;

    const next = [...this.categoryFilterIds(), attributeId];
    this.run(this.api.setCategoryAttributes(categoryId, next), () => {
      this.categoryFilterIds.set(next);
      this.attachChoice.set('');
      this.toast.show('Filter attached.', 'success');
    });
  }

  protected detachFilter(attributeId: string, label: string): void {
    const categoryId = this.expandedId();
    if (!categoryId || categoryId === NEW) return;

    const next = this.categoryFilterIds().filter((id) => id !== attributeId);
    this.run(this.api.setCategoryAttributes(categoryId, next), () => {
      this.categoryFilterIds.set(next);
      this.toast.show(`${label} removed from this category.`, 'success');
    });
  }

  protected startNewFilter(): void {
    this.formError.set(null);
    this.creatingFilter.set(true);
    this.newFilterLabel.set('');
    this.newFilterFirstValue.set('');
  }

  protected cancelNewFilter(): void {
    this.creatingFilter.set(false);
  }

  /**
   * Invent a filter, give it its first value, and attach it to the open
   * category -- three server calls that read as one action, because
   * from here they are one action. A filter with zero values is not
   * useful to a technician, so the first value is asked for up front
   * rather than left for a second visit.
   */
  protected saveNewFilter(): void {
    const categoryId = this.expandedId();
    const label = this.newFilterLabel().trim();
    const firstValue = this.newFilterFirstValue().trim();
    if (!categoryId || categoryId === NEW) return;
    if (!label) {
      this.formError.set('A filter needs a name.');
      return;
    }
    if (!firstValue) {
      this.formError.set('Give it at least one value to start with.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.api
      .createAttribute({ label })
      .pipe(
        switchMap((attribute) => this.api.addAttributeValue(attribute.id, { label: firstValue }).pipe(map(() => attribute))),
        switchMap((attribute) =>
          this.api.setCategoryAttributes(categoryId, [...this.categoryFilterIds(), attribute.id]).pipe(map(() => attribute)),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (attribute: AttributeRecord) => {
          this.saving.set(false);
          this.creatingFilter.set(false);
          this.toast.show(`${attribute.label} added, with "${firstValue}".`, 'success');
          this.reloadThenExpand(categoryId);
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.formError.set(err.message ?? 'That could not be saved.');
        },
      });
  }

  protected startRename(attribute: ConfiguredAttribute): void {
    this.formError.set(null);
    this.renamingAttributeId.set(attribute.id);
    this.renameLabel.set(attribute.label);
  }

  protected cancelRename(): void {
    this.renamingAttributeId.set(null);
  }

  protected saveRename(attribute: ConfiguredAttribute): void {
    const label = this.renameLabel().trim();
    if (!label) {
      this.formError.set('A filter needs a name.');
      return;
    }
    this.run(this.api.updateAttribute(attribute.id, { label, showOnCard: attribute.showOnCard, isActive: attribute.isActive }), () => {
      this.renamingAttributeId.set(null);
      this.toast.show(`Renamed to ${label}.`, 'success');
    });
  }

  protected openAddValue(attributeId: string): void {
    this.formError.set(null);
    this.addingValueFor.set(this.addingValueFor() === attributeId ? null : attributeId);
    this.newValueLabel.set('');
  }

  protected saveNewValue(attributeId: string): void {
    const label = this.newValueLabel().trim();
    if (!label) {
      this.formError.set('A filter value needs a name.');
      return;
    }
    this.run(this.api.addAttributeValue(attributeId, { label }), () => {
      this.addingValueFor.set(null);
      this.toast.show(`${label} added.`, 'success');
    });
  }

  /**
   * Deactivating a value rather than removing it. Parts already carry
   * it, and a workshop that stops selling BMW parts still has to be able
   * to read last year's requests.
   */
  protected toggleValueActive(id: string, label: string, isActive: boolean): void {
    this.run(this.api.updateAttributeValue(id, { label, isActive: !isActive }), () => {
      this.toast.show(isActive ? `${label} hidden from filters.` : `${label} back in filters.`, 'success');
    });
  }

  /* --- preview ---------------------------------------------------------- */

  protected previewCategory(id: string | null): void {
    this.previewCategoryId.set(this.previewCategoryId() === id ? null : id);
    this.previewSelections.set({});
    this.refreshPreview();
  }

  protected previewFilter(attributeId: string, valueId: string): void {
    this.previewSelections.update((current) => {
      const chosen = current[attributeId] ?? [];
      const next = chosen.includes(valueId) ? chosen.filter((id) => id !== valueId) : [...chosen, valueId];
      const updated = { ...current };
      if (next.length === 0) delete updated[attributeId];
      else updated[attributeId] = next;
      return updated;
    });
    this.refreshPreview();
  }

  protected onPreviewQuery(value: string): void {
    this.previewQuery.set(value);
    this.refreshPreview();
  }

  private refreshPreview(): void {
    this.previewLoading.set(true);
    this.api
      .catalogPreview({
        q: this.previewQuery().trim() || undefined,
        categoryId: this.previewCategoryId() ?? undefined,
        attributes: this.previewSelections(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.preview.set(page);
          this.previewLoading.set(false);
        },
        error: () => {
          this.previewLoading.set(false);
        },
      });
  }

  /* --- plumbing ----------------------------------------------------------
   *
   * Every write reloads the configuration and, if a category is open,
   * keeps it open with fresh data -- deliberately not an optimistic
   * local patch: the server mints slugs, keys and sort positions, and
   * the preview's whole value is being the server's answer rather than
   * this page's guess about it.
   * ---------------------------------------------------------------------- */

  private run<T>(request: Observable<T>, onDone: (result: T) => void): void {
    this.saving.set(true);
    this.formError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.saving.set(false);
        onDone(result);
        const keepExpanded = this.expandedId();
        if (keepExpanded && keepExpanded !== NEW) {
          this.reloadThenExpand(keepExpanded);
        } else {
          this.load();
        }
      },
      error: (err: PresentedError) => {
        this.saving.set(false);
        this.formError.set(err.message ?? 'That could not be saved.');
      },
    });
  }
}
