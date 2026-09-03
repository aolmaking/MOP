import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { FormField } from '../../ui/form-field/form-field';
import { ToastService } from '../../ui/toast/toast.service';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  InventoryApi,
  type CatalogConfiguration,
  type ConfiguredAttribute,
  type ConfiguredCategory,
  type PreviewPage,
} from './inventory.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

interface CategoryForm {
  id: string | null;
  name: string;
  parentId: string;
  description: string;
  isActive: boolean;
  technicianVisible: boolean;
}

interface AttributeForm {
  id: string | null;
  label: string;
  showOnCard: boolean;
  isActive: boolean;
}

function emptyCategory(): CategoryForm {
  return { id: null, name: '', parentId: '', description: '', isActive: true, technicianVisible: true };
}

function emptyAttribute(): AttributeForm {
  return { id: null, label: '', showOnCard: true, isActive: true };
}

/**
 * Catalog Builder -- where the technician's shopping experience is
 * actually authored.
 *
 * Three things happen on one page because they are one decision: what
 * the categories are, what questions someone browsing them can ask
 * ("Brand", "Engine Size"), and which of those questions each category
 * offers. Splitting them across three routes would mean creating a
 * filter, navigating away, and hoping you remembered to attach it.
 *
 * The preview is the fourth panel and it is not a mock-up: it calls the
 * same server browse the technician's page calls, so a category left
 * invisible or a filter attached to nothing shows up here exactly as it
 * would in a bay. A preview drawn from local state would agree with the
 * form and disagree with the product.
 *
 * Nothing on this page deletes. A category with parts filed under it and
 * a filter value stamped on a hundred of them are both referenced by
 * records that outlive the decision to stop using them -- deactivating
 * takes them out of the technician's browse while leaving every existing
 * part readable.
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

  protected readonly categoryForm = signal<CategoryForm>(emptyCategory());
  protected readonly categoryOpen = signal(false);

  protected readonly attributeForm = signal<AttributeForm>(emptyAttribute());
  protected readonly attributeOpen = signal(false);

  /** Which attribute is taking a new value, and what it is called. */
  protected readonly valueFor = signal<string | null>(null);
  protected readonly valueLabel = signal('');

  /** Which category's filter assignment is open, and the working set. */
  protected readonly assigningTo = signal<string | null>(null);
  protected readonly assignment = signal<string[]>([]);

  /* --- preview ------------------------------------------------------ */

  protected readonly preview = signal<PreviewPage | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewCategoryId = signal<string | null>(null);
  protected readonly previewSelections = signal<Record<string, string[]>>({});
  protected readonly previewQuery = signal('');

  /** Flat category list for the parent picker and the preview rail. */
  protected readonly flatCategories = computed(() => {
    const walk = (nodes: readonly ConfiguredCategory[], depth: number): { node: ConfiguredCategory; depth: number }[] =>
      nodes.flatMap((node) => [{ node, depth }, ...walk(node.children, depth + 1)]);
    return walk(this.config()?.categories ?? [], 0);
  });

  /** Only top-level categories may be a parent -- the tree is one deep. */
  protected readonly parentOptions = computed(() =>
    this.flatCategories()
      .filter((entry) => entry.depth === 0 && entry.node.id !== this.categoryForm().id)
      .map((entry) => entry.node),
  );

  protected readonly attributes = computed(() => this.config()?.attributes ?? []);

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

  /* --- categories --------------------------------------------------- */

  protected newCategory(): void {
    this.formError.set(null);
    this.categoryForm.set(emptyCategory());
    this.categoryOpen.set(true);
  }

  protected editCategory(category: ConfiguredCategory): void {
    this.formError.set(null);
    this.categoryForm.set({
      id: category.id,
      name: category.name,
      parentId: category.parentId ?? '',
      description: category.description ?? '',
      isActive: category.isActive,
      technicianVisible: category.technicianVisible,
    });
    this.categoryOpen.set(true);
  }

  protected patchCategory<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]): void {
    this.categoryForm.update((form) => ({ ...form, [key]: value }));
  }

  protected saveCategory(): void {
    const form = this.categoryForm();
    if (!form.name.trim()) {
      this.formError.set('A category needs a name.');
      return;
    }

    const draft = {
      name: form.name.trim(),
      parentId: form.parentId || null,
      description: form.description.trim() || undefined,
      isActive: form.isActive,
      technicianVisible: form.technicianVisible,
    };

    this.run(form.id ? this.api.updateCategory(form.id, draft) : this.api.createCategory(draft), () => {
      this.categoryOpen.set(false);
      this.toast.show(form.id ? `${draft.name} updated.` : `${draft.name} added.`, 'success');
    });
  }

  /* --- ordering ----------------------------------------------------- *
   *
   * Up/down rather than drag: this list is read on a desk, the moves are
   * one position at a time in practice, and a keyboard can reach a
   * button. Each move sends the whole sibling group, so two rows can
   * never end up sharing a position.
   * ------------------------------------------------------------------ */

  /** The ordered ids of the group this category sits in. */
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
    this.run(this.api.reorderCategories(category.parentId, next), () => {
      this.toast.show(`${category.name} moved.`, 'success');
    });
  }

  protected canMoveAttribute(attribute: ConfiguredAttribute, delta: number): boolean {
    return this.shifted(this.attributes().map((a) => a.id), attribute.id, delta) !== null;
  }

  protected moveAttribute(attribute: ConfiguredAttribute, delta: number): void {
    const next = this.shifted(this.attributes().map((a) => a.id), attribute.id, delta);
    if (!next) return;
    this.run(this.api.reorderAttributes(next), () => {
      this.toast.show(`${attribute.label} moved.`, 'success');
    });
  }

  protected canMoveValue(attribute: ConfiguredAttribute, valueId: string, delta: number): boolean {
    return this.shifted(attribute.values.map((v) => v.id), valueId, delta) !== null;
  }

  protected moveValue(attribute: ConfiguredAttribute, valueId: string, delta: number): void {
    const next = this.shifted(attribute.values.map((v) => v.id), valueId, delta);
    if (!next) return;
    this.run(this.api.reorderAttributeValues(attribute.id, next), () => {
      this.toast.show('Filter values reordered.', 'success');
    });
  }

  /* --- filters ------------------------------------------------------ */

  protected newAttribute(): void {
    this.formError.set(null);
    this.attributeForm.set(emptyAttribute());
    this.attributeOpen.set(true);
  }

  protected editAttribute(attribute: ConfiguredAttribute): void {
    this.formError.set(null);
    this.attributeForm.set({
      id: attribute.id,
      label: attribute.label,
      showOnCard: attribute.showOnCard,
      isActive: attribute.isActive,
    });
    this.attributeOpen.set(true);
  }

  protected patchAttribute<K extends keyof AttributeForm>(key: K, value: AttributeForm[K]): void {
    this.attributeForm.update((form) => ({ ...form, [key]: value }));
  }

  protected saveAttribute(): void {
    const form = this.attributeForm();
    if (!form.label.trim()) {
      this.formError.set('A filter needs a name.');
      return;
    }

    const draft = { label: form.label.trim(), showOnCard: form.showOnCard, isActive: form.isActive };
    this.run(form.id ? this.api.updateAttribute(form.id, draft) : this.api.createAttribute(draft), () => {
      this.attributeOpen.set(false);
      this.toast.show(form.id ? `${draft.label} updated.` : `${draft.label} added.`, 'success');
    });
  }

  protected openValueFor(attributeId: string): void {
    this.formError.set(null);
    this.valueFor.set(this.valueFor() === attributeId ? null : attributeId);
    this.valueLabel.set('');
  }

  protected addValue(): void {
    const attributeId = this.valueFor();
    const label = this.valueLabel().trim();
    if (!attributeId || !label) {
      this.formError.set('A filter value needs a name.');
      return;
    }
    this.run(this.api.addAttributeValue(attributeId, { label }), () => {
      this.valueLabel.set('');
      this.toast.show(`${label} added.`, 'success');
    });
  }

  /**
   * Deactivating a value rather than removing it. Parts already carry
   * it, and a workshop that stops selling BMW parts still has to be able
   * to read last year's requests.
   */
  protected toggleValue(id: string, label: string, isActive: boolean): void {
    this.run(this.api.updateAttributeValue(id, { label, isActive: !isActive }), () => {
      this.toast.show(isActive ? `${label} hidden from filters.` : `${label} back in filters.`, 'success');
    });
  }

  /* --- which filters a category offers ------------------------------ */

  protected openAssignment(category: ConfiguredCategory): void {
    this.formError.set(null);
    const open = this.assigningTo() === category.id;
    this.assigningTo.set(open ? null : category.id);
    this.assignment.set(open ? [] : [...category.attributeIds]);
  }

  protected toggleAssignment(attributeId: string): void {
    this.assignment.update((current) =>
      current.includes(attributeId) ? current.filter((id) => id !== attributeId) : [...current, attributeId],
    );
  }

  protected isAssigned(attributeId: string): boolean {
    return this.assignment().includes(attributeId);
  }

  protected saveAssignment(): void {
    const categoryId = this.assigningTo();
    if (!categoryId) return;
    this.run(this.api.setCategoryAttributes(categoryId, this.assignment()), () => {
      this.assigningTo.set(null);
      this.toast.show('Filters updated for this category.', 'success');
    });
  }

  /* --- preview ------------------------------------------------------ */

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

  /* --- plumbing ----------------------------------------------------- */

  /**
   * Every write reloads the configuration AND the preview. Deliberately
   * not an optimistic local patch: the server mints slugs and keys, and
   * the preview's whole value is being the server's answer rather than
   * this page's guess about it.
   */
  private run(request: ReturnType<InventoryApi['createCategory']>, onDone: () => void): void {
    this.saving.set(true);
    this.formError.set(null);
    forkJoin([request, of(null)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          onDone();
          this.load();
        },
        error: (err: PresentedError) => {
          this.saving.set(false);
          this.formError.set(err.message ?? 'That could not be saved.');
        },
      });
  }
}
