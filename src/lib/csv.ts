// CSV building + browser download, shared by admin exports (promo-code batches,
// the show manifest). RFC 4180 quoting: a field containing a comma, quote, CR or
// LF is wrapped in quotes with inner quotes doubled. Fields that a spreadsheet
// would run as a formula (=, +, -, @) are prefixed with ' so an exported name
// can never execute in Excel / Sheets.

const FORMULA_START = /^[=+\-@\t\r]/;

export const csvField = (value: unknown): string => {
  let s = value == null ? '' : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: ReadonlyArray<ReadonlyArray<unknown>>): string =>
  rows.map(r => r.map(csvField).join(',')).join('\r\n') + '\r\n';

// Web only (the admin dashboard runs in the browser). Returns false where there
// is no DOM (React Native native), so callers can say so instead of failing.
export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8'): boolean => {
  const g = globalThis as any;
  if (!g.document || !g.Blob || !g.URL?.createObjectURL) return false;
  // BOM so Excel opens UTF-8 (names with accents) correctly.
  const blob = new g.Blob(['﻿' + content], { type: mime });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement('a');
  a.href = url;
  a.download = filename;
  g.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => g.URL.revokeObjectURL(url), 1000);
  return true;
};

// "Class of 2027 graduation" → "class-of-2027-graduation" for file names.
export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
