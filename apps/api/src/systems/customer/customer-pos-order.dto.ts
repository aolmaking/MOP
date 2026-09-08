import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Length, Min, ValidateNested } from "class-validator";

export class CustomerPosOrderLineDto {
  @IsString()
  @Length(1, 64)
  readonly inventoryItemId!: string;

  @IsInt()
  @Min(1)
  readonly quantity!: number;
}

export class CustomerPosOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomerPosOrderLineDto)
  readonly lines!: CustomerPosOrderLineDto[];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  readonly notes?: string;
}
