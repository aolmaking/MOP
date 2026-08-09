import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { PaymentMethod } from "@mop/database";

/**
 * Money arrives as a STRING and stays one all the way in.
 *
 * Typing this as `number` would be the bug the whole phase exists to
 * prevent: `class-validator` would happily accept 1800.5 and by the time
 * it reached a service it would already have been through a float.
 */
const MONEY = /^-?\d+(\.\d{1,2})?$/;

export class AddLineDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 40)
  itemType!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @Matches(MONEY, { message: "unitPrice must be a money value with at most 2 decimal places, as a string" })
  unitPrice!: string;

  @IsOptional()
  @Matches(MONEY, { message: "labour must be a money value with at most 2 decimal places, as a string" })
  labour?: string;
}

export class IssueInvoiceDto {
  /**
   * A percentage, not money -- so a plain number is correct here. The
   * rounding it implies happens inside the money module, once.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;
}

export class RecordPaymentDto {
  @Matches(MONEY, { message: "amount must be a money value with at most 2 decimal places, as a string" })
  amount!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /**
   * Supplied by the client, and required.
   *
   * A double-tap on a counter tablet with bad signal must record one
   * payment, not two. Generating this server-side would defeat it
   * entirely -- two requests would get two keys.
   */
  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
