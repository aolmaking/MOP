import { IsString, Length } from "class-validator";

/** Every governed action on this platform requires a reason -- no "only high-risk needs one" exception, per Control Center's own spec. */
export class ReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}
