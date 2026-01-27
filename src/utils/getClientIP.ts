/**
 * Utility function to get the client's IP address
 * Uses a free service to get the public IP address
 * Falls back gracefully if the service is unavailable
 */
export async function getClientIP(): Promise<string | null> {
  try {
    // Try using ipify.org (free, no API key required)
    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      throw new Error(`IP service returned ${response.status}`);
    }

    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    // Silently fail - IP address is optional for audit logs
    // Log only in development
    if (import.meta.env.DEV) {
      console.warn('Failed to get client IP address:', error);
    }
    return null;
  }
}

/**
 * Alternative: Get IP from Edge Function (more reliable, but requires Edge Function call)
 * This can be used if you want to capture the actual request IP from Supabase
 * Note: Requires Edge Function to be created at supabase/functions/get-client-ip
 */
export async function getClientIPFromEdgeFunction(): Promise<string | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.functions.invoke('get-client-ip', {
      method: 'GET',
    });

    if (error || !data?.ip) {
      return null;
    }

    return data.ip;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to get IP from Edge Function:', error);
    }
    return null;
  }
}

