-- Allow participants or group admins to undo a confirmed settlement (e.g. when the underlying expense was deleted)
create or replace function public.undo_confirmed_settlement(p_settlement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.settlements%rowtype;
  v_gs public.guest_settlements%rowtype;
  v_is_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Check registered settlements table
  select * into v_s from public.settlements where id = p_settlement_id;
  if found then
    if v_s.status <> 'confirmed' then
      raise exception 'Only confirmed settlements can be undone';
    end if;

    select exists(
      select 1 from public.group_members
      where group_id = v_s.group_id and user_id = v_uid and role = 'admin'
    ) into v_is_admin;

    if v_uid <> v_s.sender_id and v_uid <> v_s.receiver_id and not v_is_admin then
      raise exception 'Not authorized to undo this settlement';
    end if;

    update public.settlements
    set status = 'cancelled', confirmed_at = null
    where id = p_settlement_id;

    insert into public.activities (group_id, actor_id, type, metadata)
    values (
      v_s.group_id,
      v_uid,
      'settlement_cancelled',
      jsonb_build_object('settlement_id', v_s.id, 'amount_minor', v_s.amount_minor, 'undone', true)
    );

    return jsonb_build_object('id', v_s.id, 'status', 'cancelled');
  end if;

  -- 2. Check guest_settlements table
  select * into v_gs from public.guest_settlements where id = p_settlement_id;
  if found then
    if v_gs.status <> 'confirmed' then
      raise exception 'Only confirmed settlements can be undone';
    end if;

    select exists(
      select 1 from public.group_members
      where group_id = v_gs.group_id and user_id = v_uid and role = 'admin'
    ) into v_is_admin;

    if v_uid is distinct from v_gs.sender_user_id and v_uid is distinct from v_gs.receiver_user_id and not v_is_admin then
      raise exception 'Not authorized to undo this settlement';
    end if;

    update public.guest_settlements
    set status = 'cancelled', confirmed_at = null
    where id = p_settlement_id;

    return jsonb_build_object('id', v_gs.id, 'status', 'cancelled');
  end if;

  raise exception 'Settlement not found';
end;
$$;

grant execute on function public.undo_confirmed_settlement(uuid) to authenticated;
