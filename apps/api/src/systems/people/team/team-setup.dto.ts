import { IsOptional, IsString, Length } from "class-validator";

export class CreateTeamDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 40)
  branchId!: string;

  @IsString()
  @Length(1, 40)
  teamLeaderId!: string;
}

export class AssignLeaderDto {
  @IsString()
  @Length(1, 40)
  teamLeaderId!: string;
}

export class MoveTechnicianDto {
  @IsString()
  @Length(1, 40)
  technicianId!: string;

  /** Absent or null moves them off every team, which is a real choice. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  teamId?: string | null;
}
