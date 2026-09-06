import { IsOptional, IsString, Length } from "class-validator";

/**
 * A branch manager putting a task on a job directly from the workspace --
 * the same write `TechnicianWorkService.createTask()` always exposed, now
 * reachable from a second, manager-facing door.
 */
export class CreateBranchTaskDto {
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

  /**
   * The approved customer recommendation this task carries out, when it
   * carries one out. Optional, because most tasks are ordinary work that
   * was never a recommendation -- but supplying it is the only way the
   * history can later say this recommendation was PERFORMED rather than
   * "approved, no work linked".
   */
  @IsOptional()
  @IsString()
  decisionItemId?: string;
}

export { CreateBranchTaskDto as CreateTaskDto };

