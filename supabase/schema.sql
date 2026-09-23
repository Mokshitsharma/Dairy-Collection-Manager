-- Dairy Collection Manager — database setup.
-- Run once: Supabase dashboard > SQL Editor > New query > paste this file > Run.

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null default '',
  status          text not null default 'active' check (status in ('active', 'inactive')),
  rate_chart      jsonb not null default '[]'::jsonb,          -- [{ "fat": 4.5, "rate": 46.10 }, ...]
  advance_balance numeric(12,2) not null default 0,            -- kept in sync from advances by trigger
  created_at      timestamptz not null default now()
);

create table public.settlements (
  id                    uuid primary key default gen_random_uuid(),
  supplier_id           uuid not null references public.suppliers(id),
  from_date             date not null,
  to_date               date not null,
  paid_on               date not null,
  entry_count           int not null,
  total_liters          numeric(12,3) not null,
  total_amount          numeric(12,2) not null,
  deducted              numeric(12,2) not null default 0,       -- advance EMI recovered
  net_payable           numeric(12,2) not null,
  advance_balance_after numeric(12,2) not null,
  allocations           jsonb not null default '[]'::jsonb,     -- [{ "advance_id": ..., "amount": ... }]
  note                  text not null default '',
  created_at            timestamptz not null default now()
);

create table public.entries (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id),
  date            date not null,
  shift           text not null check (shift in ('morning', 'evening')),
  liters          int not null default 0 check (liters >= 0),
  ml              int not null default 0 check (ml between 0 and 999),
  quantity        numeric(10,3) generated always as (liters + ml / 1000.0) stored,
  fat             numeric(4,1) not null check (fat > 0 and fat < 15),
  rate            numeric(10,2) not null check (rate > 0),
  chart_rate      numeric(10,2),
  rate_overridden boolean not null default false,
  amount          numeric(12,2) generated always as (round((liters + ml / 1000.0) * rate, 2)) stored,
  notes           text not null default '',
  settlement_id   uuid references public.settlements(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint entries_quantity_positive check (liters > 0 or ml > 0)
);

create table public.advances (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  date        date not null,
  amount      numeric(12,2) not null check (amount > 0),
  emi         numeric(12,2) not null default 0 check (emi >= 0),
  remaining   numeric(12,2) not null,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  constraint advances_remaining_range check (remaining >= 0 and remaining <= amount)
);

create index entries_date_idx          on public.entries (date);
create index entries_supplier_date_idx on public.entries (supplier_id, date);
create index advances_supplier_idx     on public.advances (supplier_id);
create index settlements_supplier_idx  on public.settlements (supplier_id);

------------------------------------------------------------------------------
-- Integrity triggers
------------------------------------------------------------------------------

-- suppliers.advance_balance = sum of remaining on that supplier's advances.
create function public.sync_advance_balance() returns trigger
language plpgsql set search_path = public as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then ids := array[new.supplier_id];
  elsif tg_op = 'DELETE' then ids := array[old.supplier_id];
  else ids := array[new.supplier_id, old.supplier_id];
  end if;
  update suppliers s
     set advance_balance = coalesce((select sum(a.remaining) from advances a where a.supplier_id = s.id), 0)
   where s.id = any(ids);
  return null;
end $$;

create trigger advances_sync_balance
  after insert or update or delete on public.advances
  for each row execute function public.sync_advance_balance();

-- An advance can only be deleted before any EMI has been taken from it.
create function public.guard_advance_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.remaining <> old.amount then
    raise exception 'EMI has already been deducted from this advance.';
  end if;
  return old;
end $$;

create trigger advances_guard_delete
  before delete on public.advances
  for each row execute function public.guard_advance_delete();

-- Settled entries are locked: they can only be released by reversing the settlement.
create function public.guard_settled_entry() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.settlement_id is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Settled entries cannot be deleted. Reverse the settlement first.';
  end if;
  if new.settlement_id is not distinct from old.settlement_id then
    raise exception 'Settled entries cannot be changed. Reverse the settlement first.';
  end if;
  return new;
end $$;

create trigger entries_guard_settled
  before update or delete on public.entries
  for each row execute function public.guard_settled_entry();

------------------------------------------------------------------------------
-- Settlements (each runs as one transaction)
------------------------------------------------------------------------------

-- Settle every unsettled entry of a supplier in [p_from, p_to].
-- The deduction is capped at the milk amount and the outstanding advance, then split across
-- open advances: each advance's own EMI first (oldest first), any extra to the oldest advances.
create function public.create_settlement(
  p_supplier_id uuid, p_from date, p_to date, p_paid_on date, p_deduction numeric, p_note text default ''
) returns public.settlements
language plpgsql set search_path = public as $$
declare
  v_ids uuid[];
  v_count int;
  v_liters numeric;
  v_total numeric;
  v_outstanding numeric;
  v_target numeric;
  v_left numeric;
  v_take numeric;
  v_alloc jsonb := '{}'::jsonb;
  a record;
  v_row settlements;
begin
  perform 1 from suppliers where id = p_supplier_id for update;
  if not found then raise exception 'Supplier not found.'; end if;

  perform 1 from entries
   where supplier_id = p_supplier_id and settlement_id is null and date between p_from and p_to
   for update;
  select array_agg(id), count(*), coalesce(sum(quantity), 0), coalesce(sum(amount), 0)
    into v_ids, v_count, v_liters, v_total
    from entries
   where supplier_id = p_supplier_id and settlement_id is null and date between p_from and p_to;
  if v_count = 0 then raise exception 'No unsettled entries in this period.'; end if;

  select coalesce(sum(remaining), 0) into v_outstanding from advances where supplier_id = p_supplier_id;
  v_target := greatest(0, least(coalesce(p_deduction, 0), v_total, v_outstanding));
  v_left := v_target;

  for a in select id, emi, remaining from advances
            where supplier_id = p_supplier_id and remaining > 0
            order by date, created_at for update loop
    v_take := least(a.emi, a.remaining, v_left);
    if v_take > 0 then
      v_alloc := v_alloc || jsonb_build_object(a.id::text, v_take);
      v_left := v_left - v_take;
    end if;
  end loop;

  for a in select id, remaining from advances
            where supplier_id = p_supplier_id and remaining > 0
            order by date, created_at loop
    v_take := least(a.remaining - coalesce((v_alloc ->> a.id::text)::numeric, 0), v_left);
    if v_take > 0 then
      v_alloc := v_alloc || jsonb_build_object(a.id::text, coalesce((v_alloc ->> a.id::text)::numeric, 0) + v_take);
      v_left := v_left - v_take;
    end if;
  end loop;

  update advances x
     set remaining = x.remaining - (v_alloc ->> x.id::text)::numeric
   where v_alloc ? x.id::text;

  insert into settlements (
    supplier_id, from_date, to_date, paid_on, entry_count, total_liters, total_amount,
    deducted, net_payable, advance_balance_after, allocations, note
  ) values (
    p_supplier_id, p_from, p_to, p_paid_on, v_count, v_liters, v_total,
    v_target - v_left, v_total - (v_target - v_left), v_outstanding - (v_target - v_left),
    coalesce((select jsonb_agg(jsonb_build_object('advance_id', key, 'amount', value::numeric))
                from jsonb_each_text(v_alloc)), '[]'::jsonb),
    coalesce(p_note, '')
  ) returning * into v_row;

  update entries set settlement_id = v_row.id where id = any(v_ids);
  return v_row;
end $$;

-- Undo a settlement: its entries become unsettled and the EMI goes back onto the advances.
create function public.reverse_settlement(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare s settlements;
begin
  select * into s from settlements where id = p_id for update;
  if not found then raise exception 'Settlement not found.'; end if;

  update advances a
     set remaining = a.remaining + x.amount
    from jsonb_to_recordset(s.allocations) as x(advance_id uuid, amount numeric)
   where a.id = x.advance_id;
  update entries set settlement_id = null where settlement_id = p_id;
  delete from settlements where id = p_id;
end $$;

------------------------------------------------------------------------------
-- Access: only signed-in users (the owner account). Public sign-up must be off.
------------------------------------------------------------------------------

alter table public.suppliers   enable row level security;
alter table public.entries     enable row level security;
alter table public.advances    enable row level security;
alter table public.settlements enable row level security;

create policy "owner full access" on public.suppliers   for all to authenticated using (true) with check (true);
create policy "owner full access" on public.entries     for all to authenticated using (true) with check (true);
create policy "owner full access" on public.advances    for all to authenticated using (true) with check (true);
create policy "owner full access" on public.settlements for all to authenticated using (true) with check (true);

revoke execute on function public.create_settlement(uuid, date, date, date, numeric, text) from public, anon;
revoke execute on function public.reverse_settlement(uuid) from public, anon;
grant  execute on function public.create_settlement(uuid, date, date, date, numeric, text) to authenticated;
grant  execute on function public.reverse_settlement(uuid) to authenticated;

-- Live updates across devices (phone at the collection point + PC in the office).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.suppliers, public.entries, public.advances, public.settlements;
  end if;
end $$;
