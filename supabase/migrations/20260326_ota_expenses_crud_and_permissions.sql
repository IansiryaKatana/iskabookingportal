-- OTA Expenses CRUD table and route permissions

BEGIN;

CREATE TABLE IF NOT EXISTS public.ota_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_booking_id UUID REFERENCES public.ota_bookings(id) ON DELETE SET NULL,
  channel TEXT CHECK (channel IN ('airbnb', 'booking', 'agoda', 'expedia', 'other')),
  expense_category TEXT NOT NULL CHECK (expense_category IN (
    'commission', 'cleaning', 'maintenance', 'supplies', 'tax', 'refund', 'other'
  )),
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  vendor_name TEXT,
  invoice_number TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ota_expenses_expense_date ON public.ota_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_ota_expenses_category ON public.ota_expenses(expense_category);
CREATE INDEX IF NOT EXISTS idx_ota_expenses_channel ON public.ota_expenses(channel);
CREATE INDEX IF NOT EXISTS idx_ota_expenses_ota_booking_id ON public.ota_expenses(ota_booking_id);

CREATE OR REPLACE FUNCTION public.update_ota_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ota_expenses_updated_at ON public.ota_expenses;
CREATE TRIGGER ota_expenses_updated_at
  BEFORE UPDATE ON public.ota_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ota_expenses_updated_at();

ALTER TABLE public.ota_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage OTA expenses" ON public.ota_expenses
  FOR ALL USING (public.is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_expenses TO authenticated;

INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/ota-bookings/expenses', 'OTA Expenses', 'staff', true),
  ('/ota-bookings/expenses', 'OTA Expenses', 'superadmin', true),
  ('/ota-bookings/expenses', 'OTA Expenses', 'admin', true),
  ('/ota-bookings/expenses', 'OTA Expenses', 'operations_manager', true),
  ('/ota-bookings/expenses', 'OTA Expenses', 'reservationist', true)
ON CONFLICT (route_path, role) DO UPDATE SET allowed = EXCLUDED.allowed;

COMMIT;
