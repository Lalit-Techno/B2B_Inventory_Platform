import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { Types } from 'mongoose';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/** Cursor pagination: newest first. `cursor` is the `nextCursor` of the previous page. */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsMongoId()
  cursor?: string;
}

/** Filter fragment for "rows older than the cursor" (ids grow with time). */
export const afterCursor = (cursor?: string) =>
  cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {};

/** Turns `limit + 1` fetched rows into one page plus the cursor for the next. */
export function toPage<T extends { id?: unknown; _id?: unknown }>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    meta: {
      limit,
      nextCursor: hasMore && last ? String(last._id ?? last.id) : null,
    },
  };
}
