import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

interface HealthResponse {
  status: string;
  database: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly apiStatus = signal<'checking' | 'connected' | 'unreachable'>('checking');

  constructor() {
    this.http.get<HealthResponse>('/api/v1/health').subscribe({
      next: (res) => this.apiStatus.set(res.status === 'ok' ? 'connected' : 'unreachable'),
      error: () => this.apiStatus.set('unreachable')
    });
  }
}
