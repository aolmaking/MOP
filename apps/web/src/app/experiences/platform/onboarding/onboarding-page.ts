import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ONBOARDING_STAGES, onboardingStage, type OnboardingStageId } from '@mop/shared';
import { OnboardingApi, type OnboardingBlueprint, type ProvisioningStep } from './onboarding.api';
import { OnboardingStore } from './onboarding.store';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { OnboardingSummary } from './components/onboarding-summary';
import { PublishSequence } from './components/publish-sequence';
import { StageIdentity } from './stages/stage-identity';
import { StagePlan } from './stages/stage-plan';
import { StageCapabilities } from './stages/stage-capabilities';
import { StageSpecialization } from './stages/stage-specialization';
import { StagePolicies } from './stages/stage-policies';
import { StageResponsibility } from './stages/stage-responsibility';
import { StageStructure } from './stages/stage-structure';
import { StageServices } from './stages/stage-services';
import { StageReview } from './stages/stage-review';
import { OnboardingRail } from './components/onboarding-rail';

type Phase = 'CONFIGURING' | 'PUBLISHING' | 'READY';

/**
 * The workshop creation journey.
 *
 * The shell owns three things and delegates everything else: which stage
 * is on screen, the persistent summary beside it, and the publish
 * transition. Each stage is its own component with its own concern, and
 * every fact any of them shows comes from `OnboardingStore`, which is a
 * view over the shared engine.
 *
 * Why a single route rather than one per stage: the draft is the unit of
 * work and it lives entirely in memory until publish. A URL per stage
 * would imply each is separately addressable and reloadable, which would
 * be a promise to persist a partial draft that nothing here keeps.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    RouterLink,
    ButtonDirective,
    ErrorBanner,
    OnboardingSummary,
    PublishSequence,
    StageIdentity,
    StagePlan,
    StageCapabilities,
    StageSpecialization,
    StagePolicies,
    StageResponsibility,
    StageStructure,
    StageServices,
    StageReview,
    OnboardingRail,
  ],
  providers: [OnboardingStore],
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.css',
})
export class OnboardingPage implements OnInit {
  private readonly api = inject(OnboardingApi);
  private readonly router = inject(Router);
  protected readonly store = inject(OnboardingStore);

  /**
   * Focus target on every stage change.
   *
   * Without this, moving between stages leaves focus on the "Continue"
   * button that has just been replaced, and a screen reader announces
   * nothing at all -- the transition would exist only for people who can
   * see it.
   */
  private readonly stageHeading = viewChild<ElementRef<HTMLElement>>('stageHeading');

  protected readonly blueprint = signal<OnboardingBlueprint | null>(null);
  protected readonly loadError = signal<PresentedError | null>(null);
  protected readonly publishError = signal<PresentedError | null>(null);
  protected readonly phase = signal<Phase>('CONFIGURING');

  /** Steps the server reports it really performed, revealed one at a time. */
  protected readonly publishedSteps = signal<readonly ProvisioningStep[]>([]);
  protected readonly revealedStepCount = signal(0);
  protected readonly created = signal<{ id: string; name: string; slug: string; inviteLink: string } | null>(null);

  protected readonly stages = ONBOARDING_STAGES;
  protected readonly stage = computed(() => onboardingStage(this.store.stage()));
  protected readonly isLastStage = computed(() => this.store.stage() === 'REVIEW');

  /**
   * Whether motion should be used at all.
   *
   * Read once rather than per animation: every transition in this flow
   * asks the same question, and a page that reads the media query in
   * twelve places is a page where one of them eventually forgets.
   */
  protected readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  async ngOnInit(): Promise<void> {
    try {
      this.blueprint.set(await firstValueFrom(this.api.blueprint()));
    } catch (error) {
      this.loadError.set(error as PresentedError);
    }
  }

  protected goTo(stage: OnboardingStageId): void {
    this.store.goTo(stage);
    this.focusStage();
  }

  protected next(): void {
    this.store.next();
    this.focusStage();
  }

  protected previous(): void {
    this.store.previous();
    this.focusStage();
  }

  /**
   * Moves focus to the new stage's heading so the change is announced.
   *
   * Deferred by a frame because the heading belongs to the stage that is
   * about to render, not the one being replaced.
   */
  private focusStage(): void {
    requestAnimationFrame(() => this.stageHeading()?.nativeElement.focus());
  }

  /**
   * Publishes, then reveals the steps the server says it performed.
   *
   * The sequence is driven by the response, not by a timer pretending to
   * be one: creation is a single transaction, so the honest presentation
   * is "it is done, and here is everything it did" revealed in order --
   * never a ten-second animation over a request that took 90ms.
   */
  protected async publish(): Promise<void> {
    if (!this.store.publishable() || this.phase() !== 'CONFIGURING') return;

    this.publishError.set(null);
    this.phase.set('PUBLISHING');

    try {
      const result = await firstValueFrom(this.api.publish(this.store.toCreatePayload()));
      this.publishedSteps.set(result.steps);
      this.created.set({ ...result.tenant, inviteLink: result.ownerInvitation.link });
      await this.revealSteps(result.steps.length);
      this.phase.set('READY');
    } catch (error) {
      this.publishError.set(error as PresentedError);
      this.phase.set('CONFIGURING');
    }
  }

  /**
   * Reveals what already happened, at a readable pace.
   *
   * Under reduced motion every step appears at once: the list is the
   * information, and the staggering is presentation only.
   */
  private async revealSteps(total: number): Promise<void> {
    if (this.reducedMotion) {
      this.revealedStepCount.set(total);
      return;
    }
    for (let index = 1; index <= total; index++) {
      this.revealedStepCount.set(index);
      await new Promise((resolve) => setTimeout(resolve, 110));
    }
  }

  protected async enterWorkshops(): Promise<void> {
    await this.router.navigate(['/platform/workshops']);
  }

  /** The one-line "what you just got" figure on the completion screen. */
  protected readonly summaryLine = computed(() => {
    const facts = this.store.facts();
    return (
      `${facts.activeCapabilities.length} capabilities live · ${facts.pageCount} pages · ` +
      `${facts.activeRoles.length} roles · ${facts.branchCount} branch(es)`
    );
  });

  /**
   * Next steps that genuinely apply to the workshop that was created.
   *
   * Derived from the configuration, never a fixed list: recommending
   * "add inventory" to a workshop that has no stock is the kind of
   * detail that tells a customer the software was not paying attention.
   */
  protected readonly nextSteps = computed(() => {
    const facts = this.store.facts();
    const draft = this.store.draft();
    const steps: { title: string; detail: string }[] = [
      {
        title: 'Send the owner their invite',
        detail: `${draft.owner.ownerFullName} cannot log in until they open the invite link and set a password.`,
      },
    ];

    if (facts.activeRoles.length > 1) {
      steps.push({
        title: 'Add the staff',
        detail: `${facts.activeRoles.length} roles have work in this workshop. Each person needs an account before they can pick any of it up.`,
      });
    }
    if (facts.activeCapabilities.includes('INVENTORY')) {
      steps.push({
        title: 'Stock the catalogue',
        detail: `${facts.warehouseCount} store(s) exist and are empty. Parts can be requested the moment there is something in them.`,
      });
    }
    if (draft.services.length === 0 && facts.activeCapabilities.includes('FINANCE_CORE')) {
      steps.push({
        title: 'Price the common jobs',
        detail: 'No catalogue prices were set, so staff will price each job by hand until some exist.',
      });
    }
    if (facts.specializationDefinitionCount > 0) {
      steps.push({
        title: 'Review the starter cards',
        detail: `${facts.specializationDefinitionCount} service card(s) and form(s) were created. The owner can edit their fields in Forms & Fields.`,
      });
    }

    return steps;
  });
}
