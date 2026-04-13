-- Migration: Create subscriptions table for Stripe billing
-- Run this in your Supabase SQL Editor

-- Create subscriptions table (one per clinic)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN (
    'inactive',
    'active',
    'trialing',
    'past_due',
    'canceled'
  )),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add optional columns to clinics table for quick reference
-- (subscriptions table remains source of truth)
ALTER TABLE clinics 
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic_id ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Clinics can only see their own subscription
CREATE POLICY "Users can view their clinic subscription"
  ON subscriptions FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert/update (for webhooks)
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE subscriptions IS 'Stores Stripe subscription data for each clinic (one per clinic)';
COMMENT ON COLUMN subscriptions.status IS 'Values: inactive, active, trialing, past_due, canceled';
COMMENT ON COLUMN subscriptions.current_period_end IS 'Next billing date (or subscription end date)';
