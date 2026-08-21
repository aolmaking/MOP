import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../identity/auth/session.guard";
import { CurrentSession } from "../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../identity/access/effective-access.service";
import { FinanceConfigurationService, type FinanceConfigView } from "./finance-configuration.service";
import { PriceCatalogService, type PriceCatalogItemView } from "./price-catalog.service";
import { SetPriceDto, UpdateFinanceConfigDto } from "./finance-configuration.dto";

/**
 * Pricing & Financial Configuration -- Tax/VAT, Discounts & Deposits,
 * Payment Methods, Invoice Settings, Delivery Payment Gate, and Service
 * Catalog. "Who Can Handle Money" is not here yet -- see
 * finance-configuration.service.ts's doc comment.
 */
@Controller("organization/finance-configuration")
@UseGuards(SessionGuard)
export class FinanceConfigurationController {
  constructor(
    private readonly config: FinanceConfigurationService,
    private readonly catalog: PriceCatalogService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async get(@CurrentSession() session: SessionContext): Promise<FinanceConfigView> {
    const tenantId = await this.require(session);
    return this.config.get(tenantId);
  }

  @Post()
  async update(
    @CurrentSession() session: SessionContext,
    @Body() dto: UpdateFinanceConfigDto,
  ): Promise<FinanceConfigView> {
    const tenantId = await this.require(session);
    return this.config.update(tenantId, dto, this.actorOf(session));
  }

  @Get("catalog")
  async catalogList(@CurrentSession() session: SessionContext): Promise<PriceCatalogItemView[]> {
    const tenantId = await this.require(session);
    return this.catalog.list(tenantId);
  }

  @Post("catalog")
  async setPrice(@CurrentSession() session: SessionContext, @Body() dto: SetPriceDto): Promise<PriceCatalogItemView> {
    const tenantId = await this.require(session);
    return this.catalog.setPrice(tenantId, dto, this.actorOf(session));
  }

  private actorOf(session: SessionContext) {
    return { accountId: session.accountId, displayName: session.displayName };
  }

  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "finance.configuration.manage");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to Pricing & Financial Configuration.",
      });
    }
    return session.tenantId;
  }
}
