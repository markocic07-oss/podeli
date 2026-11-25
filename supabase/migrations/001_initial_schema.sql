-- PODELI Database Schema Migration 001
-- Complete relational PostgreSQL schema for Supabase
-- Monetary values are stored strictly as BIGINT minor units (para / cent / fening)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '' CHECK (char_length(first_name) <= 100),
  last_name TEXT NOT NULL DEFAULT '' CHECK (char_length(last_name) <= 100),
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'sr' CHECK (preferred_language IN ('sr', 'hr', 'bs')),
  preferred_currency TEXT NOT NULL DEFAULT 'RSD' CHECK (preferred_currency IN ('RSD', 'EUR', 'BAM')),
  notification_preferences JSONB NOT NULL DEFAULT '{"new_expense": true, "settlement_updates": true, "group_invites": true}'::jsonb,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. GROUPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  category TEXT NOT NULL DEFAULT 'other' CHECK (
    category IN ('nights_out', 'travel', 'housing', 'family', 'couples', 'celebrations', 'other')
  ),
  image_url TEXT,
  currency TEXT NOT NULL DEFAULT 'RSD' CHECK (currency IN ('RSD', 'EUR', 'BAM')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);

-- ============================================================================
-- 3. GROUP MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);

-- ============================================================================
-- 4. GROUP INVITATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (char_length(token) >= 16),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_invitations_group_id ON public.group_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invitations_created_by ON public.group_invitations(created_by);

-- ============================================================================
-- 5. EXPENSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency IN ('RSD', 'EUR', 'BAM')),
  paid_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (
    category IN ('food', 'drinks', 'transport', 'accommodation', 'groceries', 'bills', 'entertainment', 'gifts', 'other')
  ),
  split_method TEXT NOT NULL DEFAULT 'equal' CHECK (split_method IN ('equal', 'custom', 'percentage')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses(expense_date DESC);

-- ============================================================================
-- 6. EXPENSE SHARES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expense_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  share_amount_minor BIGINT NOT NULL CHECK (share_amount_minor >= 0),
  UNIQUE (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_shares_expense_id ON public.expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_user_id ON public.expense_shares(user_id);

-- ============================================================================
-- 7. SETTLEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 400),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_sender_id ON public.settlements(sender_id);
CREATE INDEX IF NOT EXISTS idx_settlements_receiver_id ON public.settlements(receiver_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status);

-- ============================================================================
-- 8. ACTIVITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (
    activity_type IN (
      'group_created',
      'member_joined',
      'member_removed',
      'expense_added',
      'expense_updated',
      'expense_deleted',
      'settlement_created',
      'settlement_confirmed',
      'settlement_rejected',
      'settlement_cancelled',
      'invitation_accepted'
    )
  ),
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_group_id ON public.activities(group_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at DESC);

-- ============================================================================
-- 9. NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  related_entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_related_group_id ON public.notifications(related_group_id);

-- ============================================================================
-- TRIGGERS (with immutable search_path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_expense_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_currency TEXT;
BEGIN
  SELECT currency INTO v_group_currency FROM public.groups WHERE id = NEW.group_id;
  IF v_group_currency IS NULL THEN
    RAISE EXCEPTION 'Group does not exist';
  END IF;
  IF NEW.currency <> v_group_currency THEN
    RAISE EXCEPTION 'Expense currency (%) must match group currency (%)', NEW.currency, v_group_currency;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_expense_currency ON public.expenses;
CREATE TRIGGER trg_enforce_expense_currency
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_expense_currency();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    email,
    preferred_language,
    preferred_currency
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.email, ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'preferred_language' IN ('sr', 'hr', 'bs')
        THEN NEW.raw_user_meta_data->>'preferred_language'
      ELSE 'sr'
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'preferred_currency' IN ('RSD', 'EUR', 'BAM')
        THEN NEW.raw_user_meta_data->>'preferred_currency'
      ELSE 'RSD'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
