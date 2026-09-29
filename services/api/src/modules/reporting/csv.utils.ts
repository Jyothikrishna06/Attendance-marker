/**
 * RFC-4180 Compliant CSV Serializer
 */

export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str: string;
  if (val instanceof Date) {
    str = val.toISOString();
  } else if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  // If contains quotes, commas, CRLF or LF, wrap in quotes and escape internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
