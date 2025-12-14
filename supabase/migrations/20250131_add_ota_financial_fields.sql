-- Add Financial Fields to OTA Bookings Table
-- Adds pricing, commission, and revenue tracking fields

BEGIN;

-- Add financial columns to ota_bookings
ALTER TABLE public.ota_bookings
  ADD COLUMN IF NOT EXISTS price_per_night DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS number_of_nights INTEGER;

-- Add check constraint to ensure valid financial values
ALTER TABLE public.ota_bookings
  ADD CONSTRAINT ota_bookings_price_per_night_check 
    CHECK (price_per_night IS NULL OR price_per_night >= 0),
  ADD CONSTRAINT ota_bookings_commission_amount_check 
    CHECK (commission_amount IS NULL OR commission_amount >= 0);

-- Create function to calculate number of nights
CREATE OR REPLACE FUNCTION public.calculate_ota_nights(
  p_check_in DATE,
  p_check_out DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_check_out <= p_check_in THEN
    RETURN 0;
  END IF;
  
  RETURN (p_check_out - p_check_in);
END;
$$;

-- Create function to calculate total revenue
CREATE OR REPLACE FUNCTION public.calculate_ota_revenue(
  p_price_per_night DECIMAL,
  p_number_of_nights INTEGER,
  p_commission_amount DECIMAL
)
RETURNS DECIMAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_total_booking_value DECIMAL;
BEGIN
  IF p_price_per_night IS NULL OR p_number_of_nights IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_total_booking_value := p_price_per_night * p_number_of_nights;
  
  RETURN GREATEST(0, v_total_booking_value - COALESCE(p_commission_amount, 0));
END;
$$;

-- Create trigger function to auto-calculate nights and revenue
CREATE OR REPLACE FUNCTION public.ota_bookings_calculate_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nights INTEGER;
  v_revenue DECIMAL;
BEGIN
  -- Calculate number of nights
  IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
    v_nights := public.calculate_ota_nights(NEW.check_in, NEW.check_out);
    NEW.number_of_nights := v_nights;
  END IF;
  
  -- Calculate total revenue if we have price per night and nights
  IF NEW.price_per_night IS NOT NULL AND NEW.number_of_nights IS NOT NULL THEN
    v_revenue := public.calculate_ota_revenue(
      NEW.price_per_night,
      NEW.number_of_nights,
      NEW.commission_amount
    );
    NEW.total_revenue := v_revenue;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-calculate financials on insert/update
DROP TRIGGER IF EXISTS ota_bookings_calculate_financials_trigger ON public.ota_bookings;
CREATE TRIGGER ota_bookings_calculate_financials_trigger
  BEFORE INSERT OR UPDATE OF check_in, check_out, price_per_night, commission_amount ON public.ota_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_bookings_calculate_financials();

-- Add indexes for financial reporting queries
CREATE INDEX IF NOT EXISTS idx_ota_bookings_check_in_date ON public.ota_bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_ota_bookings_status_revenue ON public.ota_bookings(status) 
  WHERE status IN ('checked_in', 'in_house_guest', 'checked_out');
CREATE INDEX IF NOT EXISTS idx_ota_bookings_channel_date ON public.ota_bookings(channel, check_in);

-- Update existing bookings to calculate nights (revenue will be NULL until price/commission added)
UPDATE public.ota_bookings
SET number_of_nights = public.calculate_ota_nights(check_in, check_out)
WHERE number_of_nights IS NULL AND check_in IS NOT NULL AND check_out IS NOT NULL;

COMMENT ON COLUMN public.ota_bookings.price_per_night IS 'Price per night in the booking currency';
COMMENT ON COLUMN public.ota_bookings.commission_amount IS 'Commission charged by the OTA platform';
COMMENT ON COLUMN public.ota_bookings.total_revenue IS 'Calculated: (price_per_night * number_of_nights) - commission_amount';
COMMENT ON COLUMN public.ota_bookings.currency IS 'Currency code (default: GBP)';
COMMENT ON COLUMN public.ota_bookings.number_of_nights IS 'Auto-calculated: check_out - check_in';

COMMIT;

