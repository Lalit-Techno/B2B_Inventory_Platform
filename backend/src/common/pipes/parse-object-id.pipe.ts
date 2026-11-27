import { Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AppError } from '../errors/app-error';

/** A malformed id is "not found", the same answer as an id that does not exist (no information leaked). */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-fA-F]{24}$/.test(value) ||
      !isValidObjectId(value)
    ) {
      throw new AppError('NOT_FOUND', 'Not found');
    }
    return value;
  }
}
