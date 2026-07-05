/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────
// Dev-only client logger.
//
// Forwards to the real console in development and NO-OPS in production, so we
// never spill diagnostics into the shipped browser console (or into any
// error-monitoring tool that scrapes console output).
//
// Both our web build (webpack `mode`) and Metro (React Native) inline
// `process.env.NODE_ENV` at build time, so the production bundle evaluates the
// guard to `false` and every call dead-ends in `noop`.
//
// ⚠️  Never pass PII (email, phone, names, tokens) to this logger. Dev-gating
//     keeps it out of production, but PII should not be logged at all — logs
//     that carried PII were removed outright rather than routed through here.
//
// This is the ONE sanctioned place for `console.*` in client code; everywhere
// else calls `logger.*`.
// ─────────────────────────────────────────────────────────────────────────

// `process` isn't in this project's ambient types (tsconfig `types: ["jest"]`),
// so declare the one field we read. Type-only — stripped at build; the web
// bundle inlines the literal via webpack's DefinePlugin.
declare const process: { env: { NODE_ENV?: string } };

const isDev = process.env.NODE_ENV !== 'production';

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

// `.bind(console)` (rather than wrapping in an arrow) preserves the original
// call site as the source location shown in browser devtools.
export const logger: Record<'log' | 'warn' | 'error', LogFn> = {
  log: isDev ? console.log.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  error: isDev ? console.error.bind(console) : noop,
};
