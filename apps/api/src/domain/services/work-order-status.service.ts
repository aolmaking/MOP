import { Injectable } from "@nestjs/common";
import { paymentStatus, workOrderLifecycle, type WorkOrderLifecycleStatus } from "@mop/shared";

@Injectable()
export class WorkOrderStatusService {
  definition(status: WorkOrderLifecycleStatus) {
    return workOrderLifecycle.statuses[status];
  }

  paymentState(total: number, paid: number, balance: number) {
    return paymentStatus(total, paid, balance);
  }

  deliveryBlockedReasons(input: {
    customerDecisionPending: boolean;
    partsPending: boolean;
    blockersOpen: boolean;
    paymentPending: boolean;
  }) {
    return [
      input.customerDecisionPending ? "Customer decision pending." : "",
      input.partsPending ? "Parts lifecycle is not resolved." : "",
      input.blockersOpen ? "Open blocker exists." : "",
      input.paymentPending ? "Payment is not clear." : ""
    ].filter(Boolean);
  }
}
