import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { AppComponent } from "./app/app.component";
import { appRoutes } from "./app/app.routes";

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideRouter(appRoutes, withComponentInputBinding())]
}).catch((error) => console.error(error));
