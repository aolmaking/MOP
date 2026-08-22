import { IsIn, IsObject, IsString, Length } from "class-validator";
import { ANALYST_SAVED_VIEW_SOURCE_PAGES, type AnalystSavedViewSourcePageValue } from "./saved-views.constants";

export class CreateAnalystSavedViewDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsIn(ANALYST_SAVED_VIEW_SOURCE_PAGES)
  sourcePage!: AnalystSavedViewSourcePageValue;

  @IsObject()
  configuration!: Record<string, unknown>;
}

export class RenameAnalystSavedViewDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}
