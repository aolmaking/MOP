import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export const FORM_KEYS = [
  'CUSTOMER_INTAKE',
  'ASSET_REGISTRATION',
  'QUICK_INSPECTION',
  'FULL_INSPECTION',
  'PART_REQUEST',
  'RETURN_UNUSED',
  'CUSTOMER_DECISION_REQUEST',
  'WORK_ORDER',
  'INVOICE_NOTES',
] as const;

export const FIELD_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'CHECKBOX', 'DATE', 'TEXTAREA'] as const;

export interface CustomFieldView {
  readonly id: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly fieldType: string;
  readonly options: readonly { key: string; label: string }[] | null;
  readonly categoryScope: readonly string[];
  readonly roleScope: readonly string[];
  readonly customerVisible: boolean;
  readonly reportable: boolean;
  readonly required: boolean;
  readonly order: number;
  readonly isArchived: boolean;
}

export interface FormFieldsView {
  readonly key: string;
  readonly label: string;
  readonly coreFields: readonly string[];
  readonly customFields: readonly CustomFieldView[];
}

export interface AddFieldInput {
  readonly label: string;
  readonly fieldType: string;
  readonly options?: { key: string; label: string }[];
  readonly categoryScope?: string[];
  readonly roleScope?: string[];
  readonly customerVisible?: boolean;
  readonly reportable?: boolean;
  readonly required?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FormsApi {
  private readonly http = inject(HttpClient);

  form(formKey: string): Observable<FormFieldsView> {
    return this.http.get<FormFieldsView>(`/api/v1/organization/forms/${formKey}`);
  }

  addField(formKey: string, input: AddFieldInput): Observable<CustomFieldView> {
    return this.http.post<CustomFieldView>(`/api/v1/organization/forms/${formKey}`, input);
  }

  setArchived(fieldId: string, archived: boolean): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`/api/v1/organization/forms/fields/${fieldId}/archived`, { archived });
  }
}
