import { describe, it, expect } from 'vitest';
import { extractEdgeFunctionError } from './edgeFunctionError';

/**
 * Mimics a supabase-js FunctionsHttpError: a generic `message` plus the real
 * response body attached as `context` (a Response).
 */
function makeFunctionsHttpError(status: number, body: unknown, isJson = true) {
  const response = new Response(
    isJson ? JSON.stringify(body) : String(body),
    {
      status,
      headers: { 'Content-Type': isJson ? 'application/json' : 'text/plain' },
    },
  );
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: response,
  };
}

describe('extractEdgeFunctionError', () => {
  it('reads the `error` field from a JSON body', async () => {
    const err = makeFunctionsHttpError(403, {
      error: 'Forbidden: Authenticator app (MFA) is required',
    });
    const result = await extractEdgeFunctionError(err);
    expect(result.message).toBe('Forbidden: Authenticator app (MFA) is required');
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'Forbidden: Authenticator app (MFA) is required' });
  });

  it('falls back to the `message` field when there is no `error` field', async () => {
    const err = makeFunctionsHttpError(400, { message: 'Something went wrong' });
    const result = await extractEdgeFunctionError(err);
    expect(result.message).toBe('Something went wrong');
    expect(result.status).toBe(400);
  });

  it('surfaces a staff/admin-email conflict message', async () => {
    const err = makeFunctionsHttpError(400, {
      error: 'This email is already used by a staff or admin account. Please use a different email or link the existing account.',
    });
    const result = await extractEdgeFunctionError(err);
    expect(result.message).toContain('already used by a staff or admin account');
  });

  it('returns non-JSON body text when the body is not JSON', async () => {
    const err = makeFunctionsHttpError(500, 'Internal Server Error', false);
    const result = await extractEdgeFunctionError(err);
    expect(result.message).toBe('Internal Server Error');
    expect(result.status).toBe(500);
    expect(result.body).toBeNull();
  });

  it('uses the generic message when there is no context Response', async () => {
    const err = { message: 'Edge Function returned a non-2xx status code' };
    const result = await extractEdgeFunctionError(err);
    expect(result.message).toBe('Edge Function returned a non-2xx status code');
    expect(result.status).toBeNull();
    expect(result.body).toBeNull();
  });

  it('handles null / undefined errors gracefully', async () => {
    const result = await extractEdgeFunctionError(null);
    expect(result.message).toBe('');
    expect(result.status).toBeNull();
  });
});
