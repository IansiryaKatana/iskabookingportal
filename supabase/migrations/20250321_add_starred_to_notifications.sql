-- Add is_starred column to notifications table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'is_starred'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_starred BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_notifications_starred ON public.notifications(is_starred);
  END IF;
END $$;

