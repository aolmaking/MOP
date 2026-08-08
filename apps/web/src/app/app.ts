import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root shell: all real layout/content lives in routed components (see
 * app.routes.ts) -- login, the authenticated Shell, and whatever it hosts.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {}
