import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from "class-validator";
import { CUSTOM_FIELD_TYPES } from "./form-registry";

export class AddFieldDto {
  @IsString()
  @Length(1, 80)
  label!: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  fieldType!: (typeof CUSTOM_FIELD_TYPES)[number];

  @ValidateIf((dto: AddFieldDto) => dto.fieldType === "SELECT")
  @IsArray()
  options?: { key: string; label: string }[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryScope?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleScope?: string[];

  @IsOptional()
  @IsBoolean()
  customerVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  reportable?: boolean;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
