import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Min } from "class-validator";

/**
 * The inventory manager's catalog vocabulary, over the wire.
 *
 * Nothing here accepts a slug or a key: those are minted server-side
 * from the name, because a client that could choose them could collide
 * with another workshop's naming convention or overwrite a link every
 * existing part hangs off.
 */
export class CatalogCategoryDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  /** Null clears the parent; absent means the same thing on create. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * A category the workshop keeps for its own bookkeeping but does not
   * want a technician browsing -- bulk consumables, say.
   */
  @IsOptional()
  @IsBoolean()
  technicianVisible?: boolean;
}

export class CategoryAttributesDto {
  @IsArray()
  @IsString({ each: true })
  attributeIds!: string[];
}

export class CatalogAttributeDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsOptional()
  @IsBoolean()
  showOnCard?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogAttributeValueDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
