import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LocaleService } from './runtime/i18n/locale.service';

/**
 * Root shell: all real layout/content lives in routed components (see
 * app.routes.ts) -- login, the authenticated Shell, and whatever it hosts.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  // Injected purely for its constructor side effect: it resolves the
  // stored locale and stamps `lang`/`dir` onto <html> before anything
  // renders. Direction is set in exactly one place for the whole app --
  // components never set it, they use CSS logical properties and mirror
  // off this attribute.
  private readonly locale = inject(LocaleService);
}
