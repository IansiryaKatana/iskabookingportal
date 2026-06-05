import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

type AcademicYearSelectorProps = {
  value?: string; // academic_year_id
  onValueChange: (academicYearId: string | undefined) => void;
  label?: string;
  className?: string;
  allowEmpty?: boolean; // Allow selecting "All" option
};

const formatYearForDisplay = (yearName: string) => {
  // Convert "2025/2026" to "25/26" for display
  return yearName.replace(/\d{2}(\d{2})\/\d{2}(\d{2})/, "$1/$2");
};

export const AcademicYearSelector = ({
  value,
  onValueChange,
  label = "Academic Year",
  className,
  allowEmpty = false,
}: AcademicYearSelectorProps) => {
  const { session, loading: authLoading } = useAuth();
  const authReady = !!session && !authLoading;
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultYear, setDefaultYear] = useState<AcademicYearRow | null>(null);
  // Initialize with a placeholder to ensure component is always controlled
  const [internalValue, setInternalValue] = useState<string>("__loading__");

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }

    const loadAcademicYears = async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: false });

      if (error) {
        console.error("Error loading academic years:", error);
        setLoading(false);
        return;
      }

      const years = data || [];
      setAcademicYears(years);

      // Find most recent future year (or most recent if none are future)
      const now = new Date();
      const futureYear = years.find((y) => new Date(y.start_date) > now);
      const selected = futureYear || years[0] || null;
      setDefaultYear(selected);
      
      // Set initial internal value based on props or default
      if (value) {
        setInternalValue(value);
      } else if (selected) {
        setInternalValue(selected.id);
        // Notify parent of default selection
        onValueChange(selected.id);
      } else if (allowEmpty) {
        setInternalValue("all");
      } else {
        setInternalValue("__placeholder__");
      }
      
      setLoading(false);
    };

    loadAcademicYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  // Update internal value when prop changes
  useEffect(() => {
    if (value) {
      setInternalValue(value);
    } else if (defaultYear && !allowEmpty) {
      setInternalValue(defaultYear.id);
    } else if (allowEmpty) {
      setInternalValue("all");
    }
  }, [value, defaultYear, allowEmpty]);

  if (loading) {
    return (
      <div className={className}>
        <Select value="__loading__" disabled>
          <SelectTrigger>
            <SelectValue placeholder="Loading..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  const handleValueChange = (newValue: string) => {
    // Ignore placeholder and loading values
    if (newValue === "__placeholder__" || newValue === "__loading__") {
      return;
    }
    
    setInternalValue(newValue);
    
    if (allowEmpty && newValue === "all") {
      onValueChange(undefined);
    } else {
      onValueChange(newValue);
    }
  };

  // Ensure we always have a valid controlled value
  const controlledValue = internalValue === "__loading__" 
    ? (defaultYear?.id || (allowEmpty ? "all" : "__placeholder__"))
    : internalValue;

  return (
    <div className={className}>
      <Select value={controlledValue} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full rounded-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && (
            <SelectItem value="all">All Academic Years</SelectItem>
          )}
          {academicYears.map((year) => (
            <SelectItem key={year.id} value={year.id}>
              {formatYearForDisplay(year.name)} ({year.name})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

