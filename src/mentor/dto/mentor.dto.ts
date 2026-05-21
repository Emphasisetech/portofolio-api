import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message!: string;
}

export class UpdateChatTitleDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;
}
