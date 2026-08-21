import { IsIn, IsString } from "class-validator";
import { MESSAGE_TEMPLATE_KEYS } from "./message-template-registry";

export class PublishTemplateDto {
  @IsIn(MESSAGE_TEMPLATE_KEYS)
  key!: (typeof MESSAGE_TEMPLATE_KEYS)[number];

  @IsString()
  body!: string;
}
