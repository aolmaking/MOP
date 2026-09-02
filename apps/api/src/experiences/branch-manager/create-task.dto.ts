import { IsOptional, IsString, Length } from "class-validator";

/**
 * A branch manager putting a task on a job directly from the workspace --
 * the same write `TechnicianWorkService.createTask()` always exposed, now
 * reachable from a second, manager-facing door.
 */
export class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  /** Names a row in the workshop's own Service Catalog; optional, see createTask()'s own note. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  serviceKey?: string;

  @IsOptional()
  @IsString()
  assignToStaffUserId?: string;
}
