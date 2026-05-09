type LogPayload = Record<string, unknown>;
type LogMethod = (message: string, payload?: LogPayload) => void;

const SECRET_FIELD_PATTERN = /(authorization|x-amz-access-token|api[_-]?key|secret|token|credential|password)/i;
const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

export function sanitizeLogPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const sanitizedArray = value.map((item) => sanitizeLogPayload(item, seen));
    seen.delete(value);
    return sanitizedArray;
  }

  const sanitizedObject = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SECRET_FIELD_PATTERN.test(key) ? REDACTED : sanitizeLogPayload(entry, seen),
    ]),
  );

  seen.delete(value);
  return sanitizedObject;
}

function writeLog(method: 'info' | 'warn' | 'error', message: string, payload?: LogPayload): void {
  if (payload === undefined) {
    console[method](message);
    return;
  }

  console[method](message, sanitizeLogPayload(payload));
}

export const logger: Record<'info' | 'warn' | 'error', LogMethod> = {
  info: (message, payload) => writeLog('info', message, payload),
  warn: (message, payload) => writeLog('warn', message, payload),
  error: (message, payload) => writeLog('error', message, payload),
};
