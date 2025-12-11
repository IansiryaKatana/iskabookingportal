-- Financial Forecasting Tables

-- Financial Forecasts (save scenarios)
CREATE TABLE IF NOT EXISTS public.financial_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  target_revenue NUMERIC(12,2) NOT NULL,
  current_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_gap NUMERIC(12,2) NOT NULL,
  forecast_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_forecasts_academic_year ON public.financial_forecasts(academic_year_id);
CREATE INDEX idx_financial_forecasts_created_by ON public.financial_forecasts(created_by);

DROP TRIGGER IF EXISTS set_timestamp_financial_forecasts ON public.financial_forecasts;
CREATE TRIGGER set_timestamp_financial_forecasts
BEFORE UPDATE ON public.financial_forecasts
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Forecast Breakdown (per contract type)
CREATE TABLE IF NOT EXISTS public.financial_forecast_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id UUID NOT NULL REFERENCES public.financial_forecasts(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  studio_grade_id UUID NOT NULL REFERENCES public.studio_grades(id) ON DELETE CASCADE,
  contract_name TEXT NOT NULL,
  studio_grade_name TEXT NOT NULL,
  contract_weeks INTEGER NOT NULL,
  weekly_price NUMERIC(10,2) NOT NULL,
  total_contract_value NUMERIC(10,2) NOT NULL,
  current_bookings INTEGER NOT NULL DEFAULT 0,
  students_needed INTEGER NOT NULL,
  new_bookings_needed INTEGER NOT NULL,
  revenue_contribution NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecast_breakdowns_forecast ON public.financial_forecast_breakdowns(forecast_id);
CREATE INDEX idx_forecast_breakdowns_contract ON public.financial_forecast_breakdowns(contract_id);

-- RLS Policies
ALTER TABLE public.financial_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_forecast_breakdowns ENABLE ROW LEVEL SECURITY;

-- Staff can manage forecasts
CREATE POLICY "Staff manage forecasts" ON public.financial_forecasts
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff view forecast breakdowns" ON public.financial_forecast_breakdowns
  FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff manage forecast breakdowns" ON public.financial_forecast_breakdowns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Add total_contract_value to student_applications for easier calculations
ALTER TABLE public.student_applications
ADD COLUMN IF NOT EXISTS total_contract_value NUMERIC(10,2);

-- Create function to calculate total contract value
CREATE OR REPLACE FUNCTION public.calculate_contract_value(
  p_contract_id UUID
) RETURNS NUMERIC(10,2) AS $$
DECLARE
  v_weekly_price NUMERIC(10,2);
  v_weeks INTEGER;
BEGIN
  SELECT 
    COALESCE(c.weekly_price_override, sgp.weekly_price),
    c.weeks
  INTO v_weekly_price, v_weeks
  FROM public.contracts c
  JOIN public.studio_grade_prices sgp 
    ON c.studio_grade_id = sgp.studio_grade_id 
    AND c.academic_year_id = sgp.academic_year_id
  WHERE c.id = p_contract_id;
  
  RETURN COALESCE(v_weekly_price * v_weeks, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Create trigger to auto-calculate total_contract_value on application creation/update
CREATE OR REPLACE FUNCTION public.set_application_contract_value()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    NEW.total_contract_value := public.calculate_contract_value(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_application_contract_value ON public.student_applications;
CREATE TRIGGER trigger_set_application_contract_value
BEFORE INSERT OR UPDATE OF contract_id ON public.student_applications
FOR EACH ROW EXECUTE FUNCTION public.set_application_contract_value();

-- Update existing applications with contract values
UPDATE public.student_applications
SET total_contract_value = public.calculate_contract_value(contract_id)
WHERE total_contract_value IS NULL AND contract_id IS NOT NULL;

