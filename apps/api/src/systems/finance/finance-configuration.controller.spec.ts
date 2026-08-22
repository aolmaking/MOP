import { ForbiddenException } from "@nestjs/common";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { FinanceConfigurationController } from "./finance-configuration.controller";

function harness(allowed = true) {
  const config = {
    get: jest.fn().mockResolvedValue({ currency: "EGP" }),
    update: jest.fn().mockResolvedValue({ currency: "EGP", maxDiscountPercent: "20" }),
  };
  const catalog = {
    list: jest.fn().mockResolvedValue([]),
    setPrice: jest.fn().mockResolvedValue({ id: "price-1", itemKey: "Oil change" }),
  };
  const access = { can: jest.fn().mockResolvedValue(allowed) };
  const controller = new FinanceConfigurationController(config as never, catalog as never, access as never);
  const session = createSession({
    tenantId: "tenant-1",
    accountId: "owner-1",
    displayName: "Owner",
    role: "TENANT_OWNER",
  });

  return { controller, config, catalog, access, session };
}

describe("FinanceConfigurationController", () => {
  it("passes the current tenant into configuration reads", async () => {
    const { controller, config, access, session } = harness();

    await controller.get(session);

    expect(access.can).toHaveBeenCalledWith(session, "finance.configuration.manage");
    expect(config.get).toHaveBeenCalledWith("tenant-1");
  });

  it("passes the current tenant and actor into configuration updates", async () => {
    const { controller, config, session } = harness();

    await controller.update(session, { maxDiscountPercent: 20 });

    expect(config.update).toHaveBeenCalledWith("tenant-1", { maxDiscountPercent: 20 }, { accountId: "owner-1", displayName: "Owner" });
  });

  it("passes the current tenant and actor into catalog price writes", async () => {
    const { controller, catalog, session } = harness();
    const input = { itemKey: "Oil change", itemType: "SERVICE", unitPrice: 100 };

    await controller.setPrice(session, input);

    expect(catalog.setPrice).toHaveBeenCalledWith("tenant-1", input, { accountId: "owner-1", displayName: "Owner" });
  });

  it("does not call services when access is denied", async () => {
    const { controller, config, catalog, session } = harness(false);

    await expect(controller.catalogList(session)).rejects.toBeInstanceOf(ForbiddenException);

    expect(config.get).not.toHaveBeenCalled();
    expect(catalog.list).not.toHaveBeenCalled();
  });
});
