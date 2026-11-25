-- PODELI Database Security & Transactional RPC Migration 002
-- Hardened Row Level Security (RLS) policies + Atomic financial & invitation RPCs

-- ============================================================================
-- HELPER MEMBERSHIP CHECK FUNCTIONS (SECURITY DEFINER with immutable search_path)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with(p_other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members m1
    JOIN public.group_members m2 ON m1.group_id = m2.group_id
    WHERE m1.user_id = (SELECT auth.uid())
      AND m2.user_id = p_other_user_id
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: PROFILES
-- ============================================================================
DROP POLICY IF EXISTS "profiles_select_self_or_co_member" ON public.profiles;
CREATE POLICY "profiles_select_self_or_co_member"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()) OR public.shares_group_with(id));

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ============================================================================
-- RLS POLICIES: GROUPS
-- ============================================================================
DROP POLICY IF EXISTS "groups_select_member" ON public.groups;
CREATE POLICY "groups_select_member"
  ON public.groups FOR SELECT
  TO authenticated
  USING (public.is_group_member(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "groups_insert_authenticated" ON public.groups;
CREATE POLICY "groups_insert_authenticated"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
CREATE POLICY "groups_update_admin"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (public.is_group_admin(id, (SELECT auth.uid())))
  WITH CHECK (public.is_group_admin(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "groups_delete_admin" ON public.groups;
CREATE POLICY "groups_delete_admin"
  ON public.groups FOR DELETE
  TO authenticated
  USING (public.is_group_admin(id, (SELECT auth.uid())));

-- ============================================================================
-- RLS POLICIES: GROUP MEMBERS
-- ============================================================================
DROP POLICY IF EXISTS "group_members_select_member" ON public.group_members;
CREATE POLICY "group_members_select_member"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "group_members_delete_admin_or_self" ON public.group_members;
CREATE POLICY "group_members_delete_admin_or_self"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (public.is_group_admin(group_id, (SELECT auth.uid())) OR user_id = (SELECT auth.uid()));

-- ============================================================================
-- RLS POLICIES: GROUP INVITATIONS
-- ============================================================================
DROP POLICY IF EXISTS "invitations_select_member" ON public.group_invitations;
CREATE POLICY "invitations_select_member"
  ON public.group_invitations FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "invitations_insert_admin" ON public.group_invitations;
CREATE POLICY "invitations_insert_admin"
  ON public.group_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_admin(group_id, (SELECT auth.uid())) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "invitations_update_admin" ON public.group_invitations;
CREATE POLICY "invitations_update_admin"
  ON public.group_invitations FOR UPDATE
  TO authenticated
  USING (public.is_group_admin(group_id, (SELECT auth.uid())))
  WITH CHECK (public.is_group_admin(group_id, (SELECT auth.uid())));

-- ============================================================================
-- RLS POLICIES: EXPENSES & EXPENSE SHARES
-- ============================================================================
DROP POLICY IF EXISTS "expenses_select_member" ON public.expenses;
CREATE POLICY "expenses_select_member"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "expenses_insert_member" ON public.expenses;
CREATE POLICY "expenses_insert_member"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id, (SELECT auth.uid())) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "expenses_update_creator_or_admin" ON public.expenses;
CREATE POLICY "expenses_update_creator_or_admin"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (
    public.is_group_member(group_id, (SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_group_admin(group_id, (SELECT auth.uid())))
  )
  WITH CHECK (
    public.is_group_member(group_id, (SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_group_admin(group_id, (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "expenses_delete_creator_or_admin" ON public.expenses;
CREATE POLICY "expenses_delete_creator_or_admin"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (
    public.is_group_member(group_id, (SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_group_admin(group_id, (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "expense_shares_select_member" ON public.expense_shares;
CREATE POLICY "expense_shares_select_member"
  ON public.expense_shares FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_shares.expense_id
        AND public.is_group_member(e.group_id, (SELECT auth.uid()))
    )
  );

-- ============================================================================
-- RLS POLICIES: SETTLEMENTS
-- ============================================================================
DROP POLICY IF EXISTS "settlements_select_member" ON public.settlements;
CREATE POLICY "settlements_select_member"
  ON public.settlements FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "settlements_insert_sender_member" ON public.settlements;
CREATE POLICY "settlements_insert_sender_member"
  ON public.settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_member(group_id, (SELECT auth.uid()))
    AND public.is_group_member(group_id, receiver_id)
    AND sender_id = (SELECT auth.uid())
    AND status = 'pending'
  );

-- ============================================================================
-- RLS POLICIES: ACTIVITIES
-- ============================================================================
DROP POLICY IF EXISTS "activities_select_member" ON public.activities;
CREATE POLICY "activities_select_member"
  ON public.activities FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

-- ============================================================================
-- RLS POLICIES: NOTIFICATIONS
-- ============================================================================
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================================
-- TRANSACTIONAL SERVER-SIDE RPC FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_group_with_admin(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'other',
  p_currency TEXT DEFAULT 'RSD',
  p_image_url TEXT DEFAULT NULL
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group public.groups;
  v_token TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.groups (name, description, category, currency, image_url, created_by)
  VALUES (trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_category, p_currency, p_image_url, v_user_id)
  RETURNING * INTO v_group;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, v_user_id, 'admin');

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  INSERT INTO public.group_invitations (group_id, token, created_by, expires_at)
  VALUES (v_group.id, v_token, v_user_id, NOW() + INTERVAL '30 days');

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    v_group.id,
    v_user_id,
    'group_created',
    v_group.name,
    jsonb_build_object('group_name', v_group.name),
    v_group.id
  );

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_expense_with_shares(
  p_group_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_amount_minor BIGINT,
  p_paid_by UUID,
  p_category TEXT,
  p_split_method TEXT,
  p_expense_date DATE,
  p_receipt_url TEXT,
  p_shares JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_currency TEXT;
  v_group_name TEXT;
  v_expense_id UUID;
  v_sum_shares BIGINT := 0;
  v_share JSONB;
  v_share_user UUID;
  v_share_amount BIGINT;
  v_actor_name TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_group_member(p_group_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF NOT public.is_group_member(p_group_id, p_paid_by) THEN
    RAISE EXCEPTION 'Payer must be a member of the group';
  END IF;

  SELECT currency, name INTO v_currency, v_group_name
  FROM public.groups
  WHERE id = p_group_id;

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) = 0 THEN
    RAISE EXCEPTION 'At least one participant share is required';
  END IF;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_user := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;

    IF NOT public.is_group_member(p_group_id, v_share_user) THEN
      RAISE EXCEPTION 'All participants must be valid group members';
    END IF;
    IF v_share_amount < 0 THEN
      RAISE EXCEPTION 'Share amount cannot be negative';
    END IF;
    v_sum_shares := v_sum_shares + v_share_amount;
  END LOOP;

  IF v_sum_shares <> p_amount_minor THEN
    RAISE EXCEPTION 'Sum of shares (%) must equal expense amount (%)', v_sum_shares, p_amount_minor;
  END IF;

  INSERT INTO public.expenses (
    group_id, title, description, amount_minor, currency, paid_by,
    category, split_method, expense_date, receipt_url, created_by
  )
  VALUES (
    p_group_id, trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
    p_amount_minor, v_currency, p_paid_by, p_category, p_split_method,
    p_expense_date, p_receipt_url, v_user_id
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.expense_shares (expense_id, user_id, share_amount_minor)
  SELECT
    v_expense_id,
    (elem->>'userId')::UUID,
    (elem->>'shareAmountMinor')::BIGINT
  FROM jsonb_array_elements(p_shares) AS elem;

  SELECT trim(first_name || ' ' || last_name) INTO v_actor_name
  FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    p_group_id,
    v_user_id,
    'expense_added',
    trim(p_title),
    jsonb_build_object(
      'expense_title', trim(p_title),
      'amount_minor', p_amount_minor,
      'currency', v_currency,
      'group_name', v_group_name
    ),
    v_expense_id
  );

  INSERT INTO public.notifications (user_id, title, message, related_group_id, related_entity_id)
  SELECT
    (elem->>'userId')::UUID,
    v_group_name,
    COALESCE(NULLIF(v_actor_name, ''), 'Član') || ' je dodao novi trošak: ' || trim(p_title),
    p_group_id,
    v_expense_id
  FROM jsonb_array_elements(p_shares) AS elem
  WHERE (elem->>'userId')::UUID <> v_user_id;

  RETURN v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_expense_with_shares(
  p_expense_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_amount_minor BIGINT,
  p_paid_by UUID,
  p_category TEXT,
  p_split_method TEXT,
  p_expense_date DATE,
  p_receipt_url TEXT,
  p_shares JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_expense public.expenses;
  v_sum_shares BIGINT := 0;
  v_share JSONB;
  v_share_user UUID;
  v_share_amount BIGINT;
BEGIN
  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_user_id IS NULL OR (v_expense.created_by <> v_user_id AND NOT public.is_group_admin(v_expense.group_id, v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF NOT public.is_group_member(v_expense.group_id, p_paid_by) THEN
    RAISE EXCEPTION 'Payer must be a member of the group';
  END IF;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_user := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;
    IF NOT public.is_group_member(v_expense.group_id, v_share_user) THEN
      RAISE EXCEPTION 'All participants must be valid group members';
    END IF;
    IF v_share_amount < 0 THEN
      RAISE EXCEPTION 'Share amount cannot be negative';
    END IF;
    v_sum_shares := v_sum_shares + v_share_amount;
  END LOOP;

  IF v_sum_shares <> p_amount_minor THEN
    RAISE EXCEPTION 'Sum of shares must equal expense amount';
  END IF;

  UPDATE public.expenses
  SET
    title = trim(p_title),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    amount_minor = p_amount_minor,
    paid_by = p_paid_by,
    category = p_category,
    split_method = p_split_method,
    expense_date = p_expense_date,
    receipt_url = p_receipt_url,
    updated_at = NOW()
  WHERE id = p_expense_id;

  DELETE FROM public.expense_shares WHERE expense_id = p_expense_id;

  INSERT INTO public.expense_shares (expense_id, user_id, share_amount_minor)
  SELECT
    p_expense_id,
    (elem->>'userId')::UUID,
    (elem->>'shareAmountMinor')::BIGINT
  FROM jsonb_array_elements(p_shares) AS elem;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    v_expense.group_id,
    v_user_id,
    'expense_updated',
    trim(p_title),
    jsonb_build_object('expense_title', trim(p_title), 'amount_minor', p_amount_minor, 'currency', v_expense.currency),
    p_expense_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expense_atomic(p_expense_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_expense public.expenses;
BEGIN
  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_user_id IS NULL OR (v_expense.created_by <> v_user_id AND NOT public.is_group_admin(v_expense.group_id, v_user_id)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.expenses WHERE id = p_expense_id;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    v_expense.group_id,
    v_user_id,
    'expense_deleted',
    v_expense.title,
    jsonb_build_object('expense_title', v_expense.title, 'amount_minor', v_expense.amount_minor, 'currency', v_expense.currency),
    p_expense_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_settlement_record(
  p_group_id UUID,
  p_receiver_id UUID,
  p_amount_minor BIGINT,
  p_payment_method TEXT DEFAULT 'cash',
  p_note TEXT DEFAULT NULL
)
RETURNS public.settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_settlement public.settlements;
  v_group_name TEXT;
  v_currency TEXT;
  v_sender_name TEXT;
BEGIN
  IF v_sender_id IS NULL OR NOT public.is_group_member(p_group_id, v_sender_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT public.is_group_member(p_group_id, p_receiver_id) THEN
    RAISE EXCEPTION 'Receiver must be a group member';
  END IF;
  IF v_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot settle with yourself';
  END IF;
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT name, currency INTO v_group_name, v_currency FROM public.groups WHERE id = p_group_id;
  SELECT trim(first_name || ' ' || last_name) INTO v_sender_name FROM public.profiles WHERE id = v_sender_id;

  INSERT INTO public.settlements (group_id, sender_id, receiver_id, amount_minor, payment_method, note, status)
  VALUES (p_group_id, v_sender_id, p_receiver_id, p_amount_minor, p_payment_method, NULLIF(trim(COALESCE(p_note, '')), ''), 'pending')
  RETURNING * INTO v_settlement;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    p_group_id,
    v_sender_id,
    'settlement_created',
    v_group_name,
    jsonb_build_object('amount_minor', p_amount_minor, 'currency', v_currency, 'receiver_id', p_receiver_id),
    v_settlement.id
  );

  INSERT INTO public.notifications (user_id, title, message, related_group_id, related_entity_id)
  VALUES (
    p_receiver_id,
    v_group_name,
    COALESCE(NULLIF(v_sender_name, ''), 'Član') || ' je zabeležio uplatu za potvrdu.',
    p_group_id,
    v_settlement.id
  );

  RETURN v_settlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_settlement_status(
  p_settlement_id UUID,
  p_new_status TEXT
)
RETURNS public.settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_settlement public.settlements;
  v_group_name TEXT;
  v_currency TEXT;
  v_actor_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_settlement FROM public.settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  IF v_settlement.status <> 'pending' THEN
    RAISE EXCEPTION 'Settlement has already been processed (current status: %)', v_settlement.status;
  END IF;

  IF p_new_status IN ('confirmed', 'rejected') THEN
    IF v_settlement.receiver_id <> v_user_id THEN
      RAISE EXCEPTION 'Only the receiver can confirm or reject a settlement';
    END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF v_settlement.sender_id <> v_user_id THEN
      RAISE EXCEPTION 'Only the sender can cancel a pending settlement';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid settlement status transition';
  END IF;

  UPDATE public.settlements
  SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN NOW() ELSE NULL END
  WHERE id = p_settlement_id
  RETURNING * INTO v_settlement;

  SELECT name, currency INTO v_group_name, v_currency FROM public.groups WHERE id = v_settlement.group_id;
  SELECT trim(first_name || ' ' || last_name) INTO v_actor_name FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    v_settlement.group_id,
    v_user_id,
    CASE p_new_status
      WHEN 'confirmed' THEN 'settlement_confirmed'
      WHEN 'rejected' THEN 'settlement_rejected'
      ELSE 'settlement_cancelled'
    END,
    v_group_name,
    jsonb_build_object('amount_minor', v_settlement.amount_minor, 'currency', v_currency),
    v_settlement.id
  );

  IF p_new_status = 'confirmed' THEN
    INSERT INTO public.notifications (user_id, title, message, related_group_id, related_entity_id)
    VALUES (
      v_settlement.sender_id,
      v_group_name,
      COALESCE(NULLIF(v_actor_name, ''), 'Član') || ' je potvrdio prijem uplate.',
      v_settlement.group_id,
      v_settlement.id
    );
  ELSIF p_new_status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, message, related_group_id, related_entity_id)
    VALUES (
      v_settlement.sender_id,
      v_group_name,
      COALESCE(NULLIF(v_actor_name, ''), 'Član') || ' je odbio zabeleženu uplatu.',
      v_settlement.group_id,
      v_settlement.id
    );
  END IF;

  RETURN v_settlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.group_invitations;
  v_group public.groups;
  v_member_count INTEGER;
  v_already_member BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_inv FROM public.group_invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'not_found');
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'revoked');
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'expired');
  END IF;

  IF v_inv.max_uses IS NOT NULL AND v_inv.uses_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'max_uses_reached');
  END IF;

  SELECT * INTO v_group FROM public.groups WHERE id = v_inv.group_id;
  SELECT COUNT(*) INTO v_member_count FROM public.group_members WHERE group_id = v_inv.group_id;

  IF auth.uid() IS NOT NULL THEN
    v_already_member := public.is_group_member(v_inv.group_id, auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'group_id', v_group.id,
    'group_name', v_group.name,
    'group_description', v_group.description,
    'group_category', v_group.category,
    'group_currency', v_group.currency,
    'group_image_url', v_group.image_url,
    'member_count', v_member_count,
    'already_member', v_already_member
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_group_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv public.group_invitations;
  v_group_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_inv FROM public.group_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has been revoked';
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF v_inv.max_uses IS NOT NULL AND v_inv.uses_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'Invitation usage limit reached';
  END IF;

  IF public.is_group_member(v_inv.group_id, v_user_id) THEN
    RETURN v_inv.group_id;
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_inv.group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  UPDATE public.group_invitations
  SET uses_count = uses_count + 1
  WHERE id = v_inv.id;

  SELECT name INTO v_group_name FROM public.groups WHERE id = v_inv.group_id;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    v_inv.group_id,
    v_user_id,
    'invitation_accepted',
    v_group_name,
    jsonb_build_object('group_name', v_group_name),
    v_inv.id
  );

  RETURN v_inv.group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_group_invitation(
  p_group_id UUID,
  p_expires_in_days INTEGER DEFAULT 30,
  p_max_uses INTEGER DEFAULT NULL
)
RETURNS public.group_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv public.group_invitations;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_group_admin(p_group_id, v_user_id) THEN
    RAISE EXCEPTION 'Only group administrators can create invitations';
  END IF;

  INSERT INTO public.group_invitations (group_id, token, created_by, expires_at, max_uses)
  VALUES (
    p_group_id,
    encode(extensions.gen_random_bytes(16), 'hex'),
    v_user_id,
    CASE WHEN p_expires_in_days IS NOT NULL THEN NOW() + (p_expires_in_days || ' days')::INTERVAL ELSE NULL END,
    p_max_uses
  )
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

-- Restrict RPC execute permissions strictly to intended roles
REVOKE EXECUTE ON FUNCTION public.create_group_with_admin(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_with_admin(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_expense_with_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_with_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_expense_with_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_expense_with_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_expense_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expense_atomic(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_settlement_record(UUID, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_settlement_record(UUID, UUID, BIGINT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.transition_settlement_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_settlement_status(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_group_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invitation(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_group_invitation(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_invitation(UUID, INTEGER, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO anon, authenticated;
