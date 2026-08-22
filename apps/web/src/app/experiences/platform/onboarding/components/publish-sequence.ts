import { Component, input, output } from '@angular/core';
import { ButtonDirective } from '../../../../ui/button/button.directive';
import type { ProvisioningStep } from '../onboarding.api';

/**
 * The publish transition, and the moment the workshop becomes real.
 *
 * The steps shown are the ones the server reports it actually performed,
 * with the row counts it actually wrote -- never a timed animation over
 * a request that usually takes under a second. Creation is one
 * transaction, so the honest presentation is "it is done, and here is
 * everything it did", revealed in order at a readable pace.
 *
 * Split from the page because the two stylesheets together exceeded the
 * per-component CSS budget, and this is a genuinely separate moment:
 * nothing on it is configuration.
 */
@Component({
  selector: 'app-publish-sequence',
  imports: [ButtonDirective],
  templateUrl: './publish-sequence.html',
  styleUrl: './publish-sequence.css',
})
export class PublishSequence {
  readonly workshopName = input.required<string>();
  readonly ownerEmail = input.required<string>();
  readonly steps = input.required<readonly ProvisioningStep[]>();
  readonly revealed = input.required<number>();
  readonly ready = input.required<boolean>();
  readonly inviteLink = input<string | null>(null);
  readonly nextSteps = input.required<readonly { title: string; detail: string }[]>();
  readonly summaryLine = input.required<string>();

  readonly done = output<void>();
}
