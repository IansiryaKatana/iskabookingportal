import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import {
  SignJWT,
  importPKCS8,
} from "https://esm.sh/jose@4.15.5?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const results: {
      stripe: { connected: boolean; account?: string; error?: string };
      docusign: { connected: boolean; account?: string; error?: string };
      resend: { connected: boolean; domain?: string; error?: string };
    } = {
      stripe: { connected: false },
      docusign: { connected: false },
      resend: { connected: false },
    };

    // Check Stripe connection
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret);
        const account = await stripe.account.retrieve();
        results.stripe = {
          connected: true,
          account: account.id || "Connected",
        };
      } catch (error) {
        results.stripe = {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      results.stripe = {
        connected: false,
        error: "API key not configured",
      };
    }

    // Check DocuSign connection
    const DOCUSIGN_CLIENT_ID = Deno.env.get("DOCUSIGN_CLIENT_ID");
    const DOCUSIGN_USER_ID = Deno.env.get("DOCUSIGN_USER_ID");
    const DOCUSIGN_ACCOUNT_ID = Deno.env.get("DOCUSIGN_ACCOUNT_ID");
    const DOCUSIGN_BASE_URL = Deno.env.get("DOCUSIGN_BASE_URL") || "https://demo.docusign.net/restapi";
    const DOCUSIGN_AUTH_SERVER = Deno.env.get("DOCUSIGN_AUTH_SERVER") || "https://account-d.docusign.com";
    const DOCUSIGN_PRIVATE_KEY = (Deno.env.get("DOCUSIGN_PRIVATE_KEY") || "").replace(/\\n/g, "\n");

    if (DOCUSIGN_CLIENT_ID && DOCUSIGN_USER_ID && DOCUSIGN_ACCOUNT_ID && DOCUSIGN_PRIVATE_KEY) {
      try {
        const importedKey = await importPKCS8(DOCUSIGN_PRIVATE_KEY, "RS256");
        const audienceHost = DOCUSIGN_AUTH_SERVER.replace(/^https?:\/\//, "");
        const jwt = await new SignJWT({
          scope: "signature impersonation",
        })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer(DOCUSIGN_CLIENT_ID)
          .setSubject(DOCUSIGN_USER_ID)
          .setAudience(audienceHost)
          .setIssuedAt()
          .setExpirationTime("9m")
          .sign(importedKey);

        const params = new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        });

        const authResponse = await fetch(`${DOCUSIGN_AUTH_SERVER}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });

        if (authResponse.ok) {
          const tokenPayload = await authResponse.json();
          const accessToken = tokenPayload.access_token;

          // Try to get account info
          const accountResponse = await fetch(
            `${DOCUSIGN_BASE_URL}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json",
              },
            },
          );

          if (accountResponse.ok) {
            const accountData = await accountResponse.json();
            results.docusign = {
              connected: true,
              account: accountData.account_name || DOCUSIGN_ACCOUNT_ID,
            };
          } else {
            results.docusign = {
              connected: false,
              error: "Failed to retrieve account info",
            };
          }
        } else {
          const errorText = await authResponse.text();
          results.docusign = {
            connected: false,
            error: `Auth failed: ${errorText.substring(0, 100)}`,
          };
        }
      } catch (error) {
        results.docusign = {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      results.docusign = {
        connected: false,
        error: "Credentials not fully configured",
      };
    }

    // Check Resend connection - try database credentials first, fallback to env vars
    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    // Try to get from database credentials table
    const { data: credentials } = await supabaseClient
      .from("credentials")
      .select("credential_key, credential_value")
      .in("credential_key", ["resend_api_key", "resend_from_email"])
      .limit(2);

    if (credentials && credentials.length > 0) {
      const credsMap = new Map(
        credentials.map((c) => [c.credential_key, c.credential_value])
      );
      resendApiKey = credsMap.get("resend_api_key") || resendApiKey;
    }

    if (resendApiKey) {
      try {
        const response = await fetch("https://api.resend.com/domains", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const domains = await response.json();
          const verifiedDomain = domains.data?.find((d: any) => d.status === "verified");
          results.resend = {
            connected: true,
            domain: verifiedDomain?.name || "Connected",
          };
        } else {
          const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
          results.resend = {
            connected: false,
            error: errorData.message || "Failed to verify connection",
          };
        }
      } catch (error) {
        results.resend = {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      results.resend = {
        connected: false,
        error: "API key not configured",
      };
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in check-integration-status function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

