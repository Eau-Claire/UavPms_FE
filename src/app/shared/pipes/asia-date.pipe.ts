import { Pipe, PipeTransform } from '@angular/core';
import { formatAsiaDate } from '../utils/date-utils';

@Pipe({
  name: 'asiaDate',
})
export class AsiaDatePipe implements PipeTransform {
  transform(
    value: string | number | Date | null | undefined,
    format: 'datetime' | 'date' | 'time' | 'full' = 'datetime',
  ): string {
    switch (format) {
      case 'date':
        return formatAsiaDate(value, { dateOnly: true });
      case 'time':
        return formatAsiaDate(value, { timeOnly: true });
      case 'full':
        return formatAsiaDate(value, { includeSeconds: true });
      case 'datetime':
      default:
        return formatAsiaDate(value);
    }
  }
}

