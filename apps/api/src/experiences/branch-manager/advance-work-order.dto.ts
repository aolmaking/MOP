import { IsBoolean, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { QcFailureReason } from "@mop/database";

/**
 * Passing or failing a job at review or QC.
 *
 * Deliberately carries no intent name. WHICH intent this becomes is
 * decided server-side from the state the job is actually in -- letting a
 * client name it would let it ask for `QC_PASSED` on a job that never
 * reached QC, and the graph, not the caller, owns that question.
 */
export class AdvanceWorkOrderDto {
  @IsBoolean()
  passed!: boolean;

  /**
   * Why it failed, in the words of whoever failed it. Optional on a pass
   * -- "it was fine" needs no explanation -- and carried into the
   * lifecycle transition's own `reason`, so it lands in the audit trail
   * rather than in a note nobody joins back up.
   */
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;

  /**
   * Structured QC failure reason (Prompt 7). Kept explicitly separate from
   * the free-text note to ensure data honesty and avoid guessing root causes.
   */
  @IsOptional()
  @IsEnum(QcFailureReason)
  failureReason?: QcFailureReason;
}
