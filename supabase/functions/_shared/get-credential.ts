/**
 * Shared utility for Edge Functions to get credentials from database with env var fallback
 * 
 * Usage:
 *   import { getCredential } from "../_shared/get-credential.ts";
 *   const apiKey = await getCredential("RESEND_API_KEY", supabaseAdmin);
 * 
 * This follows the same pattern as DocuSign templates - database-first with env var fallback
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

interface GetCredentialOptions {
  /** Supabase admin client (required for database access) */
  supabase: SupabaseClient;
  /** Fallback value if not found in database or env */
  fallback?: string;
  /** Whether to cache the result (default: true, cache for 5 minutes) */
  cache?: boolean;
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTTL?: number;
}

// In-memory cache for credentials
const credentialCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Get credential from database, with fallback to environment variable
 * 
 * Priority:
 * 1. Database (credentials table)
 * 2. Environment variable (Deno.env.get)
 * 3. Fallback value (if provided)
 * 
 * @param key - Credential key (e.g., "RESEND_API_KEY")
 * @param options - Options including supabase client
 * @returns The credential value
 */
export async function getCredential(
  key: string,
  options: GetCredentialOptions
): Promise<string> {
  const { supabase, fallback, cache = true, cacheTTL = 300000 } = options;

  // Check cache first
  if (cache) {
    const cached = credentialCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  let value = "";

  try {
    // Try database first
    const { data, error } = await supabase
      .from("credentials")
      .select("credential_value, is_encrypted, encrypted_value, sync_to_edge_function")
      .eq("credential_key", key.toLowerCase())
      .eq("sync_to_edge_function", true)
      .maybeSingle();

    if (!error && data) {
      // If encrypted, decrypt it
      if (data.is_encrypted && data.encrypted_value) {
        try {
          const { data: decrypted, error: decryptError } = await supabase.rpc(
            "get_credential_value",
            { p_credential_key: key.toLowerCase() }
          );

          if (!decryptError && decrypted) {
            value = decrypted;
          } else {
            console.warn(`Failed to decrypt ${key}, falling back to env var`);
            value = Deno.env.get(key.toUpperCase()) || fallback || "";
          }
        } catch (decryptError) {
          console.warn(`Decryption error for ${key}:`, decryptError);
          value = Deno.env.get(key.toUpperCase()) || fallback || "";
        }
      } else {
        // Not encrypted, use plain value
        value = data.credential_value || "";
      }

      // If database value is empty or placeholder, fall back to env var
      if (!value || value === "[ENCRYPTED]" || value.trim() === "") {
        value = Deno.env.get(key.toUpperCase()) || fallback || "";
      }
    } else {
      // Not in database, try env var
      value = Deno.env.get(key.toUpperCase()) || fallback || "";
    }
  } catch (error) {
    // Database error, fall back to env var
    console.warn(`Database error reading ${key}, using env var fallback:`, error);
    value = Deno.env.get(key.toUpperCase()) || fallback || "";
  }

  // Cache the result
  if (cache && value) {
    credentialCache.set(key, {
      value,
      expiresAt: Date.now() + cacheTTL,
    });
  }

  return value;
}

/**
 * Get multiple credentials at once (more efficient)
 */
export async function getCredentials(
  keys: string[],
  options: GetCredentialOptions
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Fetch all at once from database
  try {
    const { data, error } = await options.supabase
      .from("credentials")
      .select("credential_key, credential_value, is_encrypted, encrypted_value")
      .in("credential_key", keys.map(k => k.toLowerCase()))
      .eq("sync_to_edge_function", true);

    if (!error && data) {
      // Process each credential
      for (const key of keys) {
        const dbCred = data.find(c => c.credential_key === key.toLowerCase());
        
        if (dbCred) {
          if (dbCred.is_encrypted && dbCred.encrypted_value) {
            try {
              const { data: decrypted } = await options.supabase.rpc(
                "get_credential_value",
                { p_credential_key: key.toLowerCase() }
              );
              results[key] = decrypted || Deno.env.get(key.toUpperCase()) || options.fallback || "";
            } catch {
              results[key] = Deno.env.get(key.toUpperCase()) || options.fallback || "";
            }
          } else {
            results[key] = dbCred.credential_value || Deno.env.get(key.toUpperCase()) || options.fallback || "";
          }
        } else {
          results[key] = Deno.env.get(key.toUpperCase()) || options.fallback || "";
        }
      }
    } else {
      // Fallback to env vars for all
      for (const key of keys) {
        results[key] = Deno.env.get(key.toUpperCase()) || options.fallback || "";
      }
    }
  } catch (error) {
    // Fallback to env vars
    for (const key of keys) {
      results[key] = Deno.env.get(key.toUpperCase()) || options.fallback || "";
    }
  }

  return results;
}

/**
 * Clear credential cache (useful for testing or after updates)
 */
export function clearCredentialCache(key?: string): void {
  if (key) {
    credentialCache.delete(key);
  } else {
    credentialCache.clear();
  }
}

