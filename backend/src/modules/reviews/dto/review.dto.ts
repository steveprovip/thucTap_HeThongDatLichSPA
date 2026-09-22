import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitReviewDto {
  @Type(() => Number)
  @IsInt({ message: 'Điểm đánh giá phải là số nguyên' })
  @Min(1, { message: 'Điểm đánh giá từ 1 đến 5 sao' })
  @Max(5, { message: 'Điểm đánh giá từ 1 đến 5 sao' })
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Nhận xét tối đa 500 ký tự' })
  comment?: string;
}
