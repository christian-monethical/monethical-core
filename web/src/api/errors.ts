export interface FieldDetail {
  field: string;
  message: string;
}

/** Error envelope of the backend: `{error:{code,message,details?}}`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Map of dotted field path -> server message, for inline form errors. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

interface Envelope {
  error?: { code?: string; message?: string; details?: unknown };
}

function parseDetails(raw: unknown): FieldDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d: unknown) => {
    if (typeof d !== 'object' || d === null) return [];
    const { field, message } = d as Record<string, unknown>;
    return typeof field === 'string' && typeof message === 'string' ? [{ field, message }] : [];
  });
}

export async function toApiError(res: Response): Promise<ApiError> {
  let body: Envelope = {};
  try {
    body = (await res.json()) as Envelope;
  } catch {
    /* non-JSON body (e.g. gateway error) */
  }
  const e = body.error;
  return new ApiError(
    res.status,
    e?.code ?? (res.status === 401 ? 'unauthorized' : 'unknown_error'),
    e?.message ?? res.statusText,
    parseDetails(e?.details),
  );
}

export const networkError = (): ApiError => new ApiError(0, 'network_error', 'Network error');

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
