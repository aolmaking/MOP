import { IsString, Length } from "class-validator";

/** POST_CLOSE_ADDENDA: refused by the service, not this DTO, once the job is CLOSED and the policy says NOTHING. */
export class AddNoteDto {
  @IsString()
  @Length(1, 2000)
  body!: string;
}
