import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    const { applicationId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch application data
    const { data: application, error: appError } = await supabaseClient
      .from("student_applications")
      .select(`
        *,
        contract:contracts(*),
        student_application_steps(*)
      `)
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      throw new Error("Application not found");
    }

    // Get step data
    const step1 = application.student_application_steps?.find((s: any) => s.step_number === 1);
    const step2 = application.student_application_steps?.find((s: any) => s.step_number === 2);
    const step5 = application.student_application_steps?.find((s: any) => s.step_number === 5);

    // Generate PDF content (simplified - in production, use a proper PDF library)
    const pdfContent = `
CONTRACT FOR STUDENT ACCOMMODATION

Tenant Information:
Name: ${step1?.payload?.first_name || ""} ${step1?.payload?.last_name || ""}
Date of Birth: ${step1?.payload?.date_of_birth || ""}
Email: ${step2?.payload?.email || ""}
Phone: ${step2?.payload?.phone || ""}

Contract Details:
Contract: ${application.contract?.slug || ""}
Start Date: ${application.contract?.contract_start || ""}
End Date: ${application.contract?.contract_end || ""}
Duration: ${application.contract?.weeks || ""} weeks

Payment Plan:
${step5?.payload?.selected_plan_name || "Not selected"}

Total Contract Value: £${application.total_contract_value || 0}

This is a simplified contract document. In production, this would be a properly formatted PDF.
    `.trim();

    // Store PDF in contracts bucket
    const fileName = `contract-${applicationId}-${Date.now()}.pdf`;
    const filePath = `${applicationId}/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("contracts")
      .upload(filePath, new TextEncoder().encode(pdfContent), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get signed URL
    const { data: signedUrlData, error: urlError } = await supabaseClient.storage
      .from("contracts")
      .createSignedUrl(filePath, 3600);

    if (urlError) {
      throw urlError;
    }

    return new Response(
      JSON.stringify({
        message: "Contract PDF generated",
        url: signedUrlData?.signedUrl,
        path: filePath,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in create-contract-pdf function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


