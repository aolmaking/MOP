import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import { CategoryCode } from "@mop/database";

/** Money is a string in and a string out. Never a number, anywhere. */
const MONEY = /^\d+(\.\d{1,2})?$/;

export class CatalogItemDto {
  @IsString()
  @Length(1, 64)
  sku!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 40)
  itemType!: string;

  /**
   * The configured category, by id. Free text was removed deliberately
   * -- see the migration note on `inventory_items`: two taxonomies is
   * how the manager's page and the technician's page stopped agreeing.
   */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  catalogCategoryId?: string;

  /**
   * A part that fits cars and motorcycles is entered ONCE with both,
   * never duplicated per category. The spec is explicit.
   */
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(CategoryCode), { each: true })
  compatibleCategories?: CategoryCode[];

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  criticalStockThreshold?: number;

  @Matches(MONEY, { message: "sellingPrice must be a money value with at most 2 decimal places, as a string" })
  sellingPrice!: string;

  @IsOptional()
  @Matches(MONEY, { message: "cost must be a money value with at most 2 decimal places, as a string" })
  cost?: string;

  @IsOptional()
  @IsBoolean()
  workOrderUsable?: boolean;

  @IsOptional()
  @IsBoolean()
  posVisible?: boolean;

  /**
   * An item can exist for pricing alone, without quantity discipline --
   * a small workshop should not have to count every washer.
   */
  @IsOptional()
  @IsBoolean()
  stockTracked?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  barcode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  supplier?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  imageUrl?: string;

  /** The one line a technician reads under the name on a card. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  summary?: string;

  /**
   * The filter values this part carries. Absent means "leave them
   * alone"; an empty array means "it has none", and the two are
   * deliberately different on update.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attributeValueIds?: string[];
}
