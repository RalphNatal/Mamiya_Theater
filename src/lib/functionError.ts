// The HTTP status and { error } message an Edge Function returned with a
// non-2xx response. supabase.functions.invoke() wraps it in a
// FunctionsHttpError whose `context` is the raw Response; anything else
// (network failure, relay error) yields nulls.
export async function readFunctionError(err: any): Promise<{ status: number | null; message: string | null }> {
  const res = err?.context;
  if (!res || typeof res.json !== 'function') return { status: null, message: null };
  try {
    const body = await (typeof res.clone === 'function' ? res.clone() : res).json();
    return { status: res.status ?? null, message: typeof body?.error === 'string' ? body.error : null };
  } catch {
    return { status: res.status ?? null, message: null };
  }
}

// A message worth showing the visitor as-is: our own rate-limit (429) and
// validation / CAPTCHA (400) answers. Anything else stays generic.
export async function userFacingFunctionError(err: any): Promise<string | null> {
  const { status, message } = await readFunctionError(err);
  return (status === 429 || status === 400) && message ? message : null;
}
