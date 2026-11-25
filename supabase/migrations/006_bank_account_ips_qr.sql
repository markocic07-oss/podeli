-- NBS IPS QR payment support: store optional normalized 18-digit Serbian bank account on profiles and group_guests
alter table public.profiles
  add column if not exists bank_account text,
  add column if not exists bank_recipient_name text;

alter table public.group_guests
  add column if not exists bank_account text,
  add column if not exists bank_recipient_name text;

create or replace function public.update_guest_bank_account(
  p_share_token text,
  p_guest_member_id uuid,
  p_guest_session_token text,
  p_bank_account text,
  p_bank_recipient_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_clean_acc text;
  v_clean_name text;
begin
  select id into v_group_id
  from public.groups
  where share_token = trim(p_share_token)
    and is_public_link_enabled = true;

  if v_group_id is null then
    raise exception 'Invalid share token';
  end if;

  v_clean_acc := nullif(trim(coalesce(p_bank_account, '')), '');
  if v_clean_acc is not null and v_clean_acc !~ '^\d{18}$' then
    raise exception 'Bank account must be exactly 18 digits';
  end if;

  v_clean_name := nullif(left(trim(coalesce(p_bank_recipient_name, '')), 70), '');

  update public.group_guests
  set bank_account = v_clean_acc,
      bank_recipient_name = v_clean_name
  where id = p_guest_member_id
    and group_id = v_group_id
    and session_token = p_guest_session_token;

  if not found then
    raise exception 'Invalid guest session';
  end if;

  return jsonb_build_object(
    'bank_account', v_clean_acc,
    'bank_recipient_name', v_clean_name
  );
end;
$$;

grant execute on function public.update_guest_bank_account(text, uuid, text, text, text) to anon, authenticated;
