import { CommonModule } from "@angular/common";
import { Component, OnInit, inject } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { AuthStore } from "./core/auth/auth.store";
import { ShellComponent } from "./core/layout/shell.component";

@Component({
  selector: "mop-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, ShellComponent],
  template: `
    <div class="mop-shell">
      <mop-shell *ngIf="shellVisible()"></mop-shell>
      <main [class]="shellVisible() ? 'pl-0 lg:pl-72' : ''">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthStore);
  readonly router = inject(Router);

  ngOnInit() {
    void this.auth.ready();
  }

  shellVisible() {
    const technicianSimpleRoute = ["/technician", "/my-work", "/work-card"].some((path) => this.router.url.startsWith(path));
    return Boolean(this.auth.session()) && !this.router.url.startsWith("/decision/") && !(this.auth.session()?.roleId === "technician" && technicianSimpleRoute);
  }
}
