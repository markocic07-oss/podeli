-- Splitwise-style instant settlement recording: any group member can record a payment
-- between any two members (registered or guest) and it immediately updates balances.
-- Either participant or a group admin can still undo it anytime via undo_confirmed_settlement.
create or replace function public.record_instant_settlement(
  p_group_id uuid,
  p_sender_id uuid,
  p_receiver_id uuid,
  p_amount_minor bigint,
  p_payment_method text default 'cash',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_member boolean := false;
  v_sender_is_user boolean := false;
  v_receiver_is_user boolean := false;
  v_sender_is_guest boolean := false;
  v_receiver_is_guest boolean := false;
  v_now timestamptz := now();
  v_method text := case when p_payment_method = 'bank_transfer' then 'bank_transfer' else 'cash' end;
  v_s public.settlements%rowtype;
  v_gs public.guest_settlements%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_sender_id = p_receiver_id then
    raise exception 'Sender and receiver cannot be the same';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select exists(
    select 1 from public.group_members where group_id = p_group_id and user_id = v_uid
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not a member of this group';
  end if;

  select exists(
    select 1 from public.group_members where group_id = p_group_id and user_id = p_sender_id
  ) into v_sender_is_user;

  select exists(
    select 1 from public.group_members where group_id = p_group_id and user_id = p_receiver_id
  ) into v_receiver_is_user;

  if v_sender_is_user and v_receiver_is_user then
    insert into public.settlements (
      group_id, sender_id, receiver_id, amount_minor, payment_method, note, status, confirmed_at
    )
    values (
      p_group_id, p_sender_id, p_receiver_id, p_amount_minor, v_method, nullif(trim(coalesce(p_note, '')), ''), 'confirmed', v_now
    )
    returning * into v_s;

    insert into public.activities (group_id, actor_id, type, metadata)
    values (
      p_group_id,
      v_uid,
      'settlement_confirmed',
      jsonb_build_object(
        'settlement_id', v_s.id,
        'sender_id', p_sender_id,
        'receiver_id', p_receiver_id,
        'amount_minor', p_amount_minor
      )
    );

    return jsonb_build_object(
      'id', v_s.id,
      'group_id', v_s.group_id,
      'sender_id', v_s.sender_id,
      'receiver_id', v_s.receiver_id,
      'amount_minor', v_s.amount_minor,
      'payment_method', v_s.payment_method,
      'note', v_s.note,
      'status', v_s.status,
      'confirmed_at', v_s.confirmed_at,
      'created_at', v_s.created_at
    );
  end if;

  select exists(
    select 1 from public.group_guests
    where group_id = p_group_id and id = p_sender_id and claimed_by_user_id is null
  ) into v_sender_is_guest;

  select exists(
    select 1 from public.group_guests
    where group_id = p_group_id and id = p_receiver_id and claimed_by_user_id is null
  ) into v_receiver_is_guest;

  if (not v_sender_is_user and not v_sender_is_guest) or (not v_receiver_is_user and not v_receiver_is_guest) then
    raise exception 'Sender and receiver must be members of this group';
  end if;

  insert into public.guest_settlements (
    group_id,
    sender_user_id,
    sender_guest_id,
    receiver_user_id,
    receiver_guest_id,
    amount_minor,
    payment_method,
    note,
    status,
    confirmed_at
  )
  values (
    p_group_id,
    case when v_sender_is_user then p_sender_id else null end,
    case when v_sender_is_guest then p_sender_id else null end,
    case when v_receiver_is_user then p_receiver_id else null end,
    case when v_receiver_is_guest then p_receiver_id else null end,
    p_amount_minor,
    v_method,
    nullif(trim(coalesce(p_note, '')), ''),
    'confirmed',
    v_now
  )
  returning * into v_gs;

  return jsonb_build_object(
    'id', v_gs.id,
    'group_id', v_gs.group_id,
    'sender_id', coalesce(v_gs.sender_user_id, v_gs.sender_guest_id),
    'receiver_id', coalesce(v_gs.receiver_user_id, v_gs.receiver_guest_id),
    'amount_minor', v_gs.amount_minor,
    'payment_method', v_gs.payment_method,
    'note', v_gs.note,
    'status', v_gs.status,
    'confirmed_at', v_gs.confirmed_at,
    'created_at', v_gs.created_at
  );
end;
$$;

grant execute on function public.record_instant_settlement(uuid, uuid, uuid, bigint, text, text) to authenticated;
