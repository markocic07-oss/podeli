-- PODELI Migration 004: Zero-Friction Guest Access via Shareable Group Links (/g/:share_token)
-- 100% additive schema + strict RLS + token-validated SECURITY DEFINER RPCs + Soft Account Upgrade (claiming)

-- ============================================================================
-- 1. EXTEND GROUPS WITH SHAREABLE LINK & GUEST PAYMENT SETTINGS
-- ============================================================================
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS is_public_link_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS guest_payments_auto_confirm BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.groups
SET share_token = encode(extensions.gen_random_bytes(12), 'hex')
WHERE share_token IS NULL;

ALTER TABLE public.groups
  ALTER COLUMN share_token SET DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_share_token ON public.groups(share_token);

-- ============================================================================
-- 2. GROUP GUESTS TABLE (Unregistered participants inside a group)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  session_token_hash TEXT,
  claimed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_guests_group_id ON public.group_guests(group_id);
CREATE INDEX IF NOT EXISTS idx_group_guests_claimed_by ON public.group_guests(claimed_by_user_id);

-- ============================================================================
-- 3. EXTEND EXPENSES + ADD GUEST EXPENSE SHARES & GUEST SETTLEMENTS
-- ============================================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_by_guest_id UUID REFERENCES public.group_guests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_guest_id UUID REFERENCES public.group_guests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_paid_by_guest_id ON public.expenses(paid_by_guest_id);

CREATE TABLE IF NOT EXISTS public.guest_expense_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.group_guests(id) ON DELETE CASCADE,
  share_amount_minor BIGINT NOT NULL CHECK (share_amount_minor >= 0),
  UNIQUE (expense_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_expense_shares_expense_id ON public.guest_expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_guest_expense_shares_guest_id ON public.guest_expense_shares(guest_id);

CREATE TABLE IF NOT EXISTS public.guest_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_guest_id UUID REFERENCES public.group_guests(id) ON DELETE CASCADE,
  receiver_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  receiver_guest_id UUID REFERENCES public.group_guests(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 400),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((sender_user_id IS NOT NULL) <> (sender_guest_id IS NOT NULL)),
  CHECK ((receiver_user_id IS NOT NULL) <> (receiver_guest_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_guest_settlements_group_id ON public.guest_settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_guest_settlements_sender_guest ON public.guest_settlements(sender_guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_settlements_receiver_guest ON public.guest_settlements(receiver_guest_id);

-- ============================================================================
-- 4. RLS POLICIES ON NEW TABLES (Locked to authenticated group members only)
-- ============================================================================
ALTER TABLE public.group_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_guests_select_member"
  ON public.group_guests FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

CREATE POLICY "group_guests_insert_member"
  ON public.group_guests FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id, (SELECT auth.uid())));

CREATE POLICY "guest_expense_shares_select_member"
  ON public.guest_expense_shares FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = guest_expense_shares.expense_id
        AND public.is_group_member(e.group_id, (SELECT auth.uid()))
    )
  );

CREATE POLICY "guest_expense_shares_insert_member"
  ON public.guest_expense_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = guest_expense_shares.expense_id
        AND public.is_group_member(e.group_id, (SELECT auth.uid()))
    )
  );

CREATE POLICY "guest_expense_shares_delete_creator_or_admin"
  ON public.guest_expense_shares FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = guest_expense_shares.expense_id
        AND public.is_group_member(e.group_id, (SELECT auth.uid()))
        AND (e.created_by = (SELECT auth.uid()) OR public.is_group_admin(e.group_id, (SELECT auth.uid())))
    )
  );

CREATE POLICY "guest_settlements_select_member"
  ON public.guest_settlements FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())));

CREATE POLICY "guest_settlements_insert_member"
  ON public.guest_settlements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(group_id, (SELECT auth.uid())));

CREATE POLICY "guest_settlements_update_member"
  ON public.guest_settlements FOR UPDATE
  TO authenticated
  USING (public.is_group_member(group_id, (SELECT auth.uid())))
  WITH CHECK (public.is_group_member(group_id, (SELECT auth.uid())));

-- ============================================================================
-- 5. TOKEN-VALIDATED RPCs FOR ZERO-FRICTION GUEST ACCESS
-- ============================================================================

-- 5A. Read full shared group payload by valid share_token (anon + authenticated)
CREATE OR REPLACE FUNCTION public.get_shared_group(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups;
  v_members JSONB;
  v_expenses JSONB;
  v_settlements JSONB;
BEGIN
  IF p_share_token IS NULL OR char_length(trim(p_share_token)) < 12 THEN
    RETURN jsonb_build_object('found', FALSE, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', FALSE, 'reason', 'not_found');
  END IF;

  IF NOT v_group.is_public_link_enabled THEN
    RETURN jsonb_build_object('found', FALSE, 'reason', 'disabled');
  END IF;

  -- Registered members + unclaimed guest members (never expose emails to anonymous guests)
  SELECT COALESCE(jsonb_agg(m ORDER BY m->>'joined_at' ASC), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT jsonb_build_object(
      'id', gm.id,
      'group_id', gm.group_id,
      'user_id', gm.user_id,
      'role', gm.role,
      'joined_at', gm.joined_at,
      'is_guest', FALSE,
      'profile', jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'email', '',
        'avatar_url', p.avatar_url,
        'preferred_language', p.preferred_language,
        'preferred_currency', p.preferred_currency,
        'notification_preferences', p.notification_preferences,
        'onboarding_completed', p.onboarding_completed,
        'created_at', p.created_at,
        'is_guest', FALSE
      )
    ) AS m
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.group_id = v_group.id

    UNION ALL

    SELECT jsonb_build_object(
      'id', gg.id,
      'group_id', gg.group_id,
      'user_id', gg.id,
      'role', 'member',
      'joined_at', gg.created_at,
      'is_guest', TRUE,
      'profile', jsonb_build_object(
        'id', gg.id,
        'first_name', gg.display_name,
        'last_name', '',
        'email', '',
        'avatar_url', NULL,
        'preferred_language', 'sr',
        'preferred_currency', v_group.currency,
        'notification_preferences', '{"new_expense": true, "settlement_updates": true, "group_invites": true}'::jsonb,
        'onboarding_completed', TRUE,
        'created_at', gg.created_at,
        'is_guest', TRUE
      )
    ) AS m
    FROM public.group_guests gg
    WHERE gg.group_id = v_group.id
      AND gg.claimed_by_user_id IS NULL
  ) sub;

  -- Expenses with unified paid_by + combined registered & guest shares
  SELECT COALESCE(jsonb_agg(e_obj ORDER BY e_obj->>'expense_date' DESC, e_obj->>'created_at' DESC), '[]'::jsonb)
  INTO v_expenses
  FROM (
    SELECT jsonb_build_object(
      'id', e.id,
      'group_id', e.group_id,
      'title', e.title,
      'description', e.description,
      'amount_minor', e.amount_minor,
      'currency', e.currency,
      'paid_by', COALESCE(e.paid_by_guest_id, e.paid_by),
      'category', e.category,
      'split_method', e.split_method,
      'expense_date', e.expense_date,
      'receipt_url', e.receipt_url,
      'created_by', COALESCE(e.created_by_guest_id, e.created_by),
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'shares', (
        SELECT COALESCE(jsonb_agg(sh), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'id', es.id,
            'expense_id', es.expense_id,
            'user_id', es.user_id,
            'share_amount_minor', es.share_amount_minor
          ) AS sh
          FROM public.expense_shares es
          WHERE es.expense_id = e.id

          UNION ALL

          SELECT jsonb_build_object(
            'id', ges.id,
            'expense_id', ges.expense_id,
            'user_id', ges.guest_id,
            'share_amount_minor', ges.share_amount_minor
          ) AS sh
          FROM public.guest_expense_shares ges
          JOIN public.group_guests gg ON gg.id = ges.guest_id
          WHERE ges.expense_id = e.id
            AND gg.claimed_by_user_id IS NULL
        ) all_sh
      )
    ) AS e_obj
    FROM public.expenses e
    WHERE e.group_id = v_group.id
  ) sub_e;

  -- Unified settlements (registered + guest settlements)
  SELECT COALESCE(jsonb_agg(s_obj ORDER BY s_obj->>'created_at' DESC), '[]'::jsonb)
  INTO v_settlements
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'group_id', s.group_id,
      'sender_id', s.sender_id,
      'receiver_id', s.receiver_id,
      'amount_minor', s.amount_minor,
      'payment_method', s.payment_method,
      'note', s.note,
      'status', s.status,
      'confirmed_at', s.confirmed_at,
      'created_at', s.created_at
    ) AS s_obj
    FROM public.settlements s
    WHERE s.group_id = v_group.id

    UNION ALL

    SELECT jsonb_build_object(
      'id', gs.id,
      'group_id', gs.group_id,
      'sender_id', COALESCE(gs.sender_user_id, gs.sender_guest_id),
      'receiver_id', COALESCE(gs.receiver_user_id, gs.receiver_guest_id),
      'amount_minor', gs.amount_minor,
      'payment_method', gs.payment_method,
      'note', gs.note,
      'status', gs.status,
      'confirmed_at', gs.confirmed_at,
      'created_at', gs.created_at
    ) AS s_obj
    FROM public.guest_settlements gs
    WHERE gs.group_id = v_group.id
  ) sub_s;

  RETURN jsonb_build_object(
    'found', TRUE,
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'description', v_group.description,
      'category', v_group.category,
      'image_url', v_group.image_url,
      'currency', v_group.currency,
      'created_by', v_group.created_by,
      'created_at', v_group.created_at,
      'share_token', v_group.share_token,
      'is_public_link_enabled', v_group.is_public_link_enabled,
      'guest_payments_auto_confirm', v_group.guest_payments_auto_confirm
    ),
    'members', v_members,
    'expenses', v_expenses,
    'settlements', v_settlements
  );
END;
$$;

-- 5B. Pick an existing guest member OR add a new guest name on a shared group
CREATE OR REPLACE FUNCTION public.join_shared_group_as_guest(
  p_share_token TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_existing_guest_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups;
  v_guest public.group_guests;
  v_raw_token TEXT;
  v_hash TEXT;
BEGIN
  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token)
    AND is_public_link_enabled = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_DISABLED_SHARE_LINK';
  END IF;

  v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  IF p_existing_guest_id IS NOT NULL THEN
    SELECT * INTO v_guest
    FROM public.group_guests
    WHERE id = p_existing_guest_id
      AND group_id = v_group.id
      AND claimed_by_user_id IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'GUEST_MEMBER_NOT_FOUND';
    END IF;

    UPDATE public.group_guests
    SET session_token_hash = v_hash
    WHERE id = v_guest.id;
  ELSE
    IF p_display_name IS NULL OR char_length(trim(p_display_name)) < 1 THEN
      RAISE EXCEPTION 'DISPLAY_NAME_REQUIRED';
    END IF;

    INSERT INTO public.group_guests (group_id, display_name, session_token_hash)
    VALUES (v_group.id, trim(p_display_name), v_hash)
    RETURNING * INTO v_guest;
  END IF;

  RETURN jsonb_build_object(
    'group_id', v_group.id,
    'guest_member_id', v_guest.id,
    'display_name', v_guest.display_name,
    'guest_session_token', v_raw_token
  );
END;
$$;

-- 5C. Guest creates an expense in a shared group (validated by share_token + guest_session_token)
CREATE OR REPLACE FUNCTION public.guest_create_expense(
  p_share_token TEXT,
  p_guest_member_id UUID,
  p_guest_session_token TEXT,
  p_title TEXT,
  p_description TEXT,
  p_amount_minor BIGINT,
  p_paid_by UUID,
  p_category TEXT,
  p_split_method TEXT,
  p_expense_date DATE,
  p_shares JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups;
  v_guest public.group_guests;
  v_hash TEXT;
  v_expense_id UUID;
  v_paid_by_is_guest BOOLEAN := FALSE;
  v_sum_shares BIGINT := 0;
  v_share JSONB;
  v_share_uid UUID;
  v_share_amount BIGINT;
BEGIN
  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token)
    AND is_public_link_enabled = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_DISABLED_SHARE_LINK';
  END IF;

  v_hash := encode(extensions.digest(COALESCE(p_guest_session_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_guest
  FROM public.group_guests
  WHERE id = p_guest_member_id
    AND group_id = v_group.id
    AND session_token_hash = v_hash
    AND claimed_by_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNAUTHORIZED_GUEST';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_guests WHERE id = p_paid_by AND group_id = v_group.id AND claimed_by_user_id IS NULL) THEN
    v_paid_by_is_guest := TRUE;
  ELSIF NOT public.is_group_member(v_group.id, p_paid_by) THEN
    RAISE EXCEPTION 'Payer must be a member of the group';
  END IF;

  IF jsonb_typeof(p_shares) <> 'array' OR jsonb_array_length(p_shares) = 0 THEN
    RAISE EXCEPTION 'At least one participant share is required';
  END IF;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_uid := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;
    IF v_share_amount < 0 THEN
      RAISE EXCEPTION 'Share amount cannot be negative';
    END IF;
    IF NOT public.is_group_member(v_group.id, v_share_uid)
       AND NOT EXISTS (SELECT 1 FROM public.group_guests WHERE id = v_share_uid AND group_id = v_group.id AND claimed_by_user_id IS NULL) THEN
      RAISE EXCEPTION 'All participants must belong to the group';
    END IF;
    v_sum_shares := v_sum_shares + v_share_amount;
  END LOOP;

  IF v_sum_shares <> p_amount_minor THEN
    RAISE EXCEPTION 'Sum of shares must equal expense amount';
  END IF;

  INSERT INTO public.expenses (
    group_id, title, description, amount_minor, currency,
    paid_by, paid_by_guest_id,
    category, split_method, expense_date, receipt_url,
    created_by, created_by_guest_id
  )
  VALUES (
    v_group.id, trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
    p_amount_minor, v_group.currency,
    CASE WHEN v_paid_by_is_guest THEN v_group.created_by ELSE p_paid_by END,
    CASE WHEN v_paid_by_is_guest THEN p_paid_by ELSE NULL END,
    p_category, p_split_method, p_expense_date, NULL,
    v_group.created_by, v_guest.id
  )
  RETURNING id INTO v_expense_id;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_uid := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;

    IF public.is_group_member(v_group.id, v_share_uid) THEN
      INSERT INTO public.expense_shares (expense_id, user_id, share_amount_minor)
      VALUES (v_expense_id, v_share_uid, v_share_amount);
    ELSE
      INSERT INTO public.guest_expense_shares (expense_id, guest_id, share_amount_minor)
      VALUES (v_expense_id, v_share_uid, v_share_amount);
    END IF;
  END LOOP;

  RETURN v_expense_id;
END;
$$;

-- 5D. Guest marks a debt as paid (auto-confirmed if group.guest_payments_auto_confirm = true, else pending)
CREATE OR REPLACE FUNCTION public.guest_create_settlement(
  p_share_token TEXT,
  p_guest_member_id UUID,
  p_guest_session_token TEXT,
  p_receiver_id UUID,
  p_amount_minor BIGINT,
  p_payment_method TEXT DEFAULT 'cash',
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups;
  v_guest public.group_guests;
  v_hash TEXT;
  v_receiver_is_guest BOOLEAN := FALSE;
  v_status TEXT;
  v_settlement public.guest_settlements;
BEGIN
  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token)
    AND is_public_link_enabled = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_DISABLED_SHARE_LINK';
  END IF;

  v_hash := encode(extensions.digest(COALESCE(p_guest_session_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_guest
  FROM public.group_guests
  WHERE id = p_guest_member_id
    AND group_id = v_group.id
    AND session_token_hash = v_hash
    AND claimed_by_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNAUTHORIZED_GUEST';
  END IF;

  IF p_receiver_id = v_guest.id THEN
    RAISE EXCEPTION 'Cannot settle with yourself';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_guests WHERE id = p_receiver_id AND group_id = v_group.id AND claimed_by_user_id IS NULL) THEN
    v_receiver_is_guest := TRUE;
  ELSIF NOT public.is_group_member(v_group.id, p_receiver_id) THEN
    RAISE EXCEPTION 'Receiver must belong to the group';
  END IF;

  v_status := CASE WHEN v_group.guest_payments_auto_confirm THEN 'confirmed' ELSE 'pending' END;

  INSERT INTO public.guest_settlements (
    group_id, sender_guest_id,
    receiver_user_id, receiver_guest_id,
    amount_minor, payment_method, note, status, confirmed_at
  )
  VALUES (
    v_group.id, v_guest.id,
    CASE WHEN v_receiver_is_guest THEN NULL ELSE p_receiver_id END,
    CASE WHEN v_receiver_is_guest THEN p_receiver_id ELSE NULL END,
    p_amount_minor, p_payment_method, NULLIF(trim(COALESCE(p_note, '')), ''),
    v_status,
    CASE WHEN v_status = 'confirmed' THEN NOW() ELSE NULL END
  )
  RETURNING * INTO v_settlement;

  IF NOT v_receiver_is_guest THEN
    INSERT INTO public.notifications (user_id, title, message, related_group_id, related_entity_id)
    VALUES (
      p_receiver_id,
      v_group.name,
      v_guest.display_name || ' je označio/la uplatu kao plaćenu.',
      v_group.id,
      v_settlement.id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'group_id', v_settlement.group_id,
    'sender_id', v_guest.id,
    'receiver_id', p_receiver_id,
    'amount_minor', v_settlement.amount_minor,
    'payment_method', v_settlement.payment_method,
    'note', v_settlement.note,
    'status', v_settlement.status,
    'confirmed_at', v_settlement.confirmed_at,
    'created_at', v_settlement.created_at
  );
END;
$$;

-- 5E. Guest confirms/rejects/cancels a pending guest_settlement
CREATE OR REPLACE FUNCTION public.guest_transition_settlement(
  p_share_token TEXT,
  p_guest_member_id UUID,
  p_guest_session_token TEXT,
  p_settlement_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups;
  v_guest public.group_guests;
  v_hash TEXT;
  v_settlement public.guest_settlements;
BEGIN
  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token)
    AND is_public_link_enabled = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_DISABLED_SHARE_LINK';
  END IF;

  v_hash := encode(extensions.digest(COALESCE(p_guest_session_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_guest
  FROM public.group_guests
  WHERE id = p_guest_member_id
    AND group_id = v_group.id
    AND session_token_hash = v_hash
    AND claimed_by_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNAUTHORIZED_GUEST';
  END IF;

  SELECT * INTO v_settlement
  FROM public.guest_settlements
  WHERE id = p_settlement_id
    AND group_id = v_group.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  IF v_settlement.status <> 'pending' THEN
    RAISE EXCEPTION 'Settlement already processed';
  END IF;

  IF p_new_status IN ('confirmed', 'rejected') THEN
    IF v_settlement.receiver_guest_id <> v_guest.id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_GUEST';
    END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF v_settlement.sender_guest_id <> v_guest.id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_GUEST';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.guest_settlements
  SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN NOW() ELSE NULL END
  WHERE id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'confirmed_at', v_settlement.confirmed_at
  );
END;
$$;

-- ============================================================================
-- 6. AUTHENTICATED RPCs: SHARE SETTINGS, CLAIM GUEST IDENTITY, MIXED EXPENSES
-- ============================================================================

-- 6A. Admin regenerates share_token (invalidates old leaked link immediately)
CREATE OR REPLACE FUNCTION public.regenerate_group_share_token(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_token TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_group_admin(p_group_id, v_user_id) THEN
    RAISE EXCEPTION 'Only group administrators can reset the share link';
  END IF;

  v_new_token := encode(extensions.gen_random_bytes(12), 'hex');
  UPDATE public.groups
  SET share_token = v_new_token
  WHERE id = p_group_id;

  RETURN v_new_token;
END;
$$;

-- 6B. Authenticated user joins a shared group directly via share_token
CREATE OR REPLACE FUNCTION public.join_shared_group_as_user(p_share_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group public.groups;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE share_token = trim(p_share_token)
    AND is_public_link_enabled = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_DISABLED_SHARE_LINK';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group.id;
END;
$$;

-- 6C. Soft Account Upgrade: claim guest_member_id -> auth.uid() without duplicating member
CREATE OR REPLACE FUNCTION public.claim_guest_identity(
  p_group_id UUID,
  p_guest_member_id UUID,
  p_guest_session_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hash TEXT;
  v_guest public.group_guests;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_hash := encode(extensions.digest(COALESCE(p_guest_session_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_guest
  FROM public.group_guests
  WHERE id = p_guest_member_id
    AND group_id = p_group_id
    AND session_token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_guest.claimed_by_user_id IS NOT NULL THEN
    RETURN v_guest.claimed_by_user_id = v_user_id;
  END IF;

  -- Add real user to group_members without duplicating
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (p_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Transfer expense payer & creator ownership
  UPDATE public.expenses
  SET paid_by = v_user_id, paid_by_guest_id = NULL
  WHERE group_id = p_group_id AND paid_by_guest_id = v_guest.id;

  UPDATE public.expenses
  SET created_by = v_user_id, created_by_guest_id = NULL
  WHERE group_id = p_group_id AND created_by_guest_id = v_guest.id;

  -- Transfer guest expense shares into registered expense_shares
  INSERT INTO public.expense_shares (expense_id, user_id, share_amount_minor)
  SELECT ges.expense_id, v_user_id, ges.share_amount_minor
  FROM public.guest_expense_shares ges
  WHERE ges.guest_id = v_guest.id
  ON CONFLICT (expense_id, user_id) DO UPDATE
    SET share_amount_minor = public.expense_shares.share_amount_minor + EXCLUDED.share_amount_minor;

  -- Transfer guest settlements
  UPDATE public.guest_settlements
  SET sender_user_id = v_user_id, sender_guest_id = NULL
  WHERE group_id = p_group_id AND sender_guest_id = v_guest.id;

  UPDATE public.guest_settlements
  SET receiver_user_id = v_user_id, receiver_guest_id = NULL
  WHERE group_id = p_group_id AND receiver_guest_id = v_guest.id;

  -- Mark guest as claimed (so queries filtering claimed_by_user_id IS NULL never double-count)
  UPDATE public.group_guests
  SET claimed_by_user_id = v_user_id, session_token_hash = NULL
  WHERE id = v_guest.id;

  RETURN TRUE;
END;
$$;

-- 6D. Authenticated member creates expense that may include BOTH registered members and guest members
CREATE OR REPLACE FUNCTION public.create_expense_with_mixed_shares(
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
  v_group public.groups;
  v_expense_id UUID;
  v_paid_by_is_guest BOOLEAN := FALSE;
  v_sum_shares BIGINT := 0;
  v_share JSONB;
  v_share_uid UUID;
  v_share_amount BIGINT;
  v_actor_name TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT public.is_group_member(p_group_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_group FROM public.groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_guests WHERE id = p_paid_by AND group_id = p_group_id AND claimed_by_user_id IS NULL) THEN
    v_paid_by_is_guest := TRUE;
  ELSIF NOT public.is_group_member(p_group_id, p_paid_by) THEN
    RAISE EXCEPTION 'Payer must be a member of the group';
  END IF;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_uid := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;
    IF v_share_amount < 0 THEN
      RAISE EXCEPTION 'Share amount cannot be negative';
    END IF;
    IF NOT public.is_group_member(p_group_id, v_share_uid)
       AND NOT EXISTS (SELECT 1 FROM public.group_guests WHERE id = v_share_uid AND group_id = p_group_id AND claimed_by_user_id IS NULL) THEN
      RAISE EXCEPTION 'All participants must belong to the group';
    END IF;
    v_sum_shares := v_sum_shares + v_share_amount;
  END LOOP;

  IF v_sum_shares <> p_amount_minor THEN
    RAISE EXCEPTION 'Sum of shares must equal expense amount';
  END IF;

  INSERT INTO public.expenses (
    group_id, title, description, amount_minor, currency,
    paid_by, paid_by_guest_id,
    category, split_method, expense_date, receipt_url, created_by
  )
  VALUES (
    p_group_id, trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''),
    p_amount_minor, v_group.currency,
    CASE WHEN v_paid_by_is_guest THEN v_user_id ELSE p_paid_by END,
    CASE WHEN v_paid_by_is_guest THEN p_paid_by ELSE NULL END,
    p_category, p_split_method, p_expense_date, p_receipt_url, v_user_id
  )
  RETURNING id INTO v_expense_id;

  FOR v_share IN SELECT * FROM jsonb_array_elements(p_shares)
  LOOP
    v_share_uid := (v_share->>'userId')::UUID;
    v_share_amount := (v_share->>'shareAmountMinor')::BIGINT;

    IF public.is_group_member(p_group_id, v_share_uid) THEN
      INSERT INTO public.expense_shares (expense_id, user_id, share_amount_minor)
      VALUES (v_expense_id, v_share_uid, v_share_amount);
    ELSE
      INSERT INTO public.guest_expense_shares (expense_id, guest_id, share_amount_minor)
      VALUES (v_expense_id, v_share_uid, v_share_amount);
    END IF;
  END LOOP;

  SELECT trim(first_name || ' ' || last_name) INTO v_actor_name
  FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.activities (group_id, user_id, activity_type, description, metadata, related_entity_id)
  VALUES (
    p_group_id, v_user_id, 'expense_added', trim(p_title),
    jsonb_build_object('expense_title', trim(p_title), 'amount_minor', p_amount_minor, 'currency', v_group.currency, 'group_name', v_group.name),
    v_expense_id
  );

  RETURN v_expense_id;
END;
$$;

-- ============================================================================
-- 7. STRICT EXECUTE GRANTS
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_shared_group(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_group(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.join_shared_group_as_guest(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_shared_group_as_guest(TEXT, TEXT, UUID) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.guest_create_expense(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_expense(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, JSONB) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.guest_create_settlement(TEXT, UUID, TEXT, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_settlement(TEXT, UUID, TEXT, UUID, BIGINT, TEXT, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.guest_transition_settlement(TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_transition_settlement(TEXT, UUID, TEXT, UUID, TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.regenerate_group_share_token(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_group_share_token(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.join_shared_group_as_user(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_shared_group_as_user(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_guest_identity(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_guest_identity(UUID, UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_expense_with_mixed_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_with_mixed_shares(UUID, TEXT, TEXT, BIGINT, UUID, TEXT, TEXT, DATE, TEXT, JSONB) TO authenticated;
