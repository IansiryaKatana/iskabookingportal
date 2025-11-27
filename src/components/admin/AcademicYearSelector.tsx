import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type AcademicYearRow = Database["public"]["Tables"]["academic_years"]["Row"];

type AcademicYearSelectorProps = {
  value?: string; // academic_year_id
  onValueChange: (academicYearId: string) => void;
  label?: string;
  className?: string;
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
}: AcademicYearSelectorProps) => {
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultYear, setDefaultYear] = useState<AcademicYearRow | null>(null);

  useEffect(() => {
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

      // If no value is set, use the default
      if (!value && selected) {
        onValueChange(selected.id);
      }
      
      setLoading(false);
    };

    loadAcademicYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (loading) {
    return (
      <div className={className}>
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder="Loading..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  // Ensure value is always a string (controlled component)
  const controlledValue = value ?? defaultYear?.id ?? "";

  return (
    <div className={className}>
      <Select value={controlledValue} onValueChange={onValueChange}>
        <SelectTrigger className="w-full rounded-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
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

