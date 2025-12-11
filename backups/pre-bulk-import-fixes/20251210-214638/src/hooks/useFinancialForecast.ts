import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ForecastInput {
  targetRevenue: number;
  academicYearId: string;
  includeExistingBookings?: boolean;
  studioGradeFilter?: string[];
}

export interface ContractBreakdown {
  contractId: string;
  contractName: string;
  studioGradeId: string;
  studioGradeName: string;
  weeks: number;
  weeklyPrice: number;
  totalContractValue: number;
  currentBookings: number;
  studentsNeeded: number;
  newBookingsNeeded: number;
  revenueContribution: number;
}

export interface ForecastResult {
  targetRevenue: number;
  currentRevenue: number;
  revenueGap: number;
  breakdown: ContractBreakdown[];
  totalStudentsNeeded: number;
  occupancyImpact: {
    totalStudios: number;
    currentBookings: number;
    currentOccupancy: number;
    forecastedBookings: number;
    forecastedOccupancy: number;
    availableCapacity: number;
  };
}

export const useCalculateForecast = () => {
  return useMutation({
    mutationFn: async (input: ForecastInput): Promise<ForecastResult> => {
      const { data, error } = await supabase.functions.invoke<ForecastResult>(
        "calculate-forecast",
        {
          body: input,
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to calculate forecast");
      }

      if (!data) {
        throw new Error("No data returned from forecast calculation");
      }

      return data;
    },
  });
};

