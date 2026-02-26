-- Migration: Add plan_key to subscriptions table for feature restrictions
-- Run this in your Supabase SQL Editor

-- Add plan_key column to subscriptions table
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS plan_key TEXT;

-- Add check constraint to ensure valid plan keys
ALTER TABLE subscriptions
  ADD CONSTRAINT check_plan_key 
  CHECK (plan_key IN ('essencial', 'profissional', 'clinic_pro', 'fundador') OR plan_key IS NULL);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_key ON subscriptions(plan_key);

-- Comment for documentation
COMMENT ON COLUMN subscriptions.plan_key IS 'Plan type: essencial, profissional, clinic_pro, or fundador';
