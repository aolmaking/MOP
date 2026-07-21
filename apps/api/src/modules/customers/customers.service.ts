import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, AccountType, PortalStatus } from "@prisma/client";
import type { CustomerDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async list(session: RequestSessionContext): Promise<CustomerDto[]> {
    const customers = await this.prisma.customer.findMany({
      where: this.access.customerWhere(session),
      include: { assets: true, branch: true },
      orderBy: { updatedAt: "desc" }
    });
    return customers.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email || undefined,
      portalStatus: customer.portalStatus.toLowerCase() as any,
      assetCount: customer.assets.length,
      branchName: customer.branch?.name
    }));
  }

  async create(session: RequestSessionContext, body: any) {
    const branchId = body.branchId || session.branchScope[0] || null;
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: session.tenantId || "",
        branchId,
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        portalStatus: PortalStatus.DISABLED,
        communicationConsent: Boolean(body.communicationConsent),
        createdByStaffUserId: session.userId
      }
    });
    await this.audit(session, "customer.created", "customer", customer.id, "Customer record created.");
    return customer;
  }

  async enablePortal(session: RequestSessionContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.access.customerWhere(session) }
    });
    if (!customer) throw new NotFoundException("Customer not found in current scope.");

    const account = await this.prisma.account.create({
      data: {
        tenantId: session.tenantId,
        accountType: AccountType.CUSTOMER,
        loginIdentifier: customer.phone,
        status: AccountStatus.INVITED
      }
    });
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { accountId: account.id, portalStatus: PortalStatus.INVITED }
    });
    await this.audit(session, "customer.portal_invited", "customer", customerId, "Customer portal account invited.");
    return updated;
  }

  async transferAsset(session: RequestSessionContext, assetId: string, newCustomerId: string, reason?: string) {
    const elevatedScope = session.roleId === "tenant_owner" || session.roleId === "tenant_admin" || session.roleId === "data_analyst";
    const assetScope = elevatedScope
      ? {}
      : session.branchScope.length
        ? { branchId: { in: session.branchScope } }
        : { id: "__deny_all__" };
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: session.tenantId, ...assetScope },
      include: { currentOwner: true }
    });
    if (!asset) throw new NotFoundException("Asset not found in current scope.");

    const newOwner = await this.prisma.customer.findFirst({
      where: { ...this.access.customerWhere(session), id: newCustomerId }
    });
    if (!newOwner) throw new NotFoundException("New asset owner not found in current scope.");
    if (!elevatedScope && asset.branchId && newOwner.branchId && asset.branchId !== newOwner.branchId) {
      throw new BadRequestException("Asset ownership cannot move across branches without elevated scope.");
    }

    const transferredAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.assetOwnershipHistory.updateMany({
        where: { assetId, toDate: null },
        data: { toDate: transferredAt }
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { currentOwnerCustomerId: newCustomerId }
      });
      await tx.assetOwnershipHistory.create({
        data: {
          assetId,
          customerId: newCustomerId,
          fromDate: transferredAt,
          transferredBy: session.userId,
          transferReason: reason || "Ownership transfer."
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorType: "TENANT_STAFF",
          actorId: session.userId,
          actorName: session.displayName,
          action: "asset.ownership_transfer",
          targetType: "asset",
          targetId: assetId,
          reason: reason || "Ownership transferred."
        }
      });
    });
    return { assetId, previousCustomerId: asset.currentOwnerCustomerId, newCustomerId };
  }

  private audit(session: RequestSessionContext, action: string, targetType: string, targetId: string, reason: string) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: "TENANT_STAFF",
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType,
        targetId,
        reason
      }
    });
  }
}
