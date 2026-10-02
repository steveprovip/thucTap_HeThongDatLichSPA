import { IsOptional, Matches } from 'class-validator';

export class ReportRangeQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu phải theo định dạng yyyy-MM-dd' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc phải theo định dạng yyyy-MM-dd' })
  to?: string;
}
