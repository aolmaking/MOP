import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface TemplateView {
  readonly key: string;
  readonly label: string;
  readonly requiredVariables: readonly string[];
  readonly availableVariables: readonly string[];
  readonly body: string;
  readonly version: number;
  readonly publishedAt: string;
  readonly isPublished: boolean;
}

@Injectable({ providedIn: 'root' })
export class MessagesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<TemplateView[]> {
    return this.http.get<TemplateView[]>('/api/v1/organization/messages');
  }

  preview(key: string, body: string): Observable<{ preview: string }> {
    return this.http.post<{ preview: string }>('/api/v1/organization/messages/preview', { key, body });
  }

  publish(key: string, body: string): Observable<TemplateView> {
    return this.http.post<TemplateView>('/api/v1/organization/messages', { key, body });
  }
}
