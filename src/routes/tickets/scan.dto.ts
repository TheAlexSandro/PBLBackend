import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ScanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;
}
