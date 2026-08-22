import { IsBoolean, IsIn } from "class-validator";
import {
  MONEY_HANDLER_PERMISSION_KEYS,
  MONEY_HANDLER_ROLES,
  type MoneyHandlerPermissionKey,
  type MoneyHandlerRole,
} from "./money-handling-permissions.constants";

export class SetMoneyHandlerPermissionDto {
  @IsIn(MONEY_HANDLER_ROLES)
  role!: MoneyHandlerRole;

  @IsIn(MONEY_HANDLER_PERMISSION_KEYS)
  permissionKey!: MoneyHandlerPermissionKey;

  @IsBoolean()
  allowed!: boolean;
}
