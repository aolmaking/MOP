import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class SupervisionNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsBoolean()
  escalate?: boolean;
}
