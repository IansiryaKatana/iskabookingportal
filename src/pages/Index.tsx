import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to most recent future academic year
    const redirectToDefaultYear = async () => {
      // If there's an auth token or recovery type in the URL, don't redirect
      // This allows AuthContext to handle the password recovery/confirmation flow
      const hash = window.location.hash;
      const search = window.location.search;
      if (
        hash.includes("access_token=") || 
        hash.includes("type=recovery") || 
        hash.includes("type=signup") ||
        search.includes("type=recovery") ||
        search.includes("type=signup")
      ) {
        console.log("Index: Auth token detected, skipping default redirect");
        return;
      }

      const { data } = await supabase
        .from("academic_years")
        .select("name")
        .eq("is_active", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const urlYear = data.name.replace(/\//g, "-");
        navigate(`/studios/${urlYear}`, { replace: true });
      } else {
        // Fallback to /studios if no academic years
        navigate("/studios", { replace: true });
      }
    };

    redirectToDefaultYear();
  }, [navigate]);

  return null;
};

export default Index;
