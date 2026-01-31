import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to most recent future academic year
    const redirectToDefaultYear = async () => {
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

  // Return a minimal loading state to prevent white screen flash
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    </div>
  );
};

export default Index;
