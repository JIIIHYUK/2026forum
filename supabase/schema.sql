create table if not exists public.app_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

grant usage on schema public to anon, authenticated;
revoke delete, truncate, references, trigger on table public.app_state from anon, authenticated;
grant select, insert, update on table public.app_state to anon, authenticated;

drop policy if exists "Anyone can read shared app state" on public.app_state;
drop policy if exists "Anyone can create shared app state" on public.app_state;
drop policy if exists "Anyone can update shared app state" on public.app_state;

create policy "Anyone can read shared app state"
on public.app_state
for select
to anon, authenticated
using (id = 'mars-terraforming-commons' or id like 'mars-terraforming-commons:%');

create policy "Anyone can create shared app state"
on public.app_state
for insert
to anon, authenticated
with check (id = 'mars-terraforming-commons' or id like 'mars-terraforming-commons:%');

create policy "Anyone can update shared app state"
on public.app_state
for update
to anon, authenticated
using (id = 'mars-terraforming-commons' or id like 'mars-terraforming-commons:%')
with check (id = 'mars-terraforming-commons' or id like 'mars-terraforming-commons:%');

create or replace function public.apply_scheduled_state_updates(
  p_state_id text,
  p_force_rank boolean default false,
  p_force_promotion boolean default false,
  p_support_interval_minutes integer default 20,
  p_promotion_delay_minutes integer default 15,
  p_promotion_pool_funding numeric default 30000000000,
  p_rank_grants numeric[] default array[12000000000, 9500000000, 7600000000, 6200000000, 5000000000, 4200000000]
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_state jsonb;
  current_companies jsonb;
  next_companies jsonb;
  core_state_id text := p_state_id || ':core';
  companies_state_id text := p_state_id || ':companies';
  uses_segmented_state boolean := false;
  now_ms numeric := floor(extract(epoch from clock_timestamp()) * 1000);
  interval_ms numeric := p_support_interval_minutes * 60 * 1000;
  promotion_delay_ms numeric := p_promotion_delay_minutes * 60 * 1000;
  last_rank_ms numeric;
  elapsed_ms numeric;
  rounds integer;
  promotion_score_total numeric;
  next_promotion_at numeric;
begin
  select count(*) = 2
  into uses_segmented_state
  from public.app_state
  where id in (core_state_id, companies_state_id);

  if uses_segmented_state then
    select state
    into current_state
    from public.app_state
    where id = core_state_id
    for update;

    select coalesce(state->'companies', '[]'::jsonb)
    into current_companies
    from public.app_state
    where id = companies_state_id
    for update;
  else
    select state
    into current_state
    from public.app_state
    where id = p_state_id
    for update;
  end if;

  if current_state is null then
    return null;
  end if;

  if not uses_segmented_state then
    current_companies := coalesce(current_state->'companies', '[]'::jsonb);
  end if;

  last_rank_ms := coalesce((current_state->>'lastRankGrantAt')::numeric, now_ms);
  elapsed_ms := now_ms - last_rank_ms;

  if p_force_rank or elapsed_ms >= interval_ms then
    rounds := case when p_force_rank then 1 else greatest(1, floor(elapsed_ms / interval_ms)::integer) end;

    with ranked as (
      select
        company->>'id' as company_id,
        row_number() over (
          order by coalesce((company->>'contribution')::numeric, 0) desc,
          coalesce((company->>'id')::integer, 0) asc
        ) as rank_no
      from jsonb_array_elements(current_companies) as company
    ),
    updated as (
      select
        ord,
        jsonb_set(
          jsonb_set(
            jsonb_set(
              company,
              '{budget}',
              to_jsonb(coalesce((company->>'budget')::numeric, 0) + coalesce(p_rank_grants[rank_no], 0) * rounds),
              true
            ),
            '{rankGrantReceived}',
            to_jsonb(coalesce((company->>'rankGrantReceived')::numeric, 0) + coalesce(p_rank_grants[rank_no], 0) * rounds),
            true
          ),
          '{projectAddsSinceFunding}',
          '0'::jsonb,
          true
        ) as company
      from jsonb_array_elements(current_companies) with ordinality as items(company, ord)
      left join ranked on ranked.company_id = items.company->>'id'
    )
    select coalesce(jsonb_agg(company order by ord), '[]'::jsonb)
    into next_companies
    from updated;

    current_companies := next_companies;
    if not uses_segmented_state then
      current_state := jsonb_set(current_state, '{companies}', current_companies, true);
    end if;
    current_state := jsonb_set(
      current_state,
      '{lastRankGrantAt}',
      to_jsonb(case when p_force_rank then now_ms else last_rank_ms + rounds * interval_ms end),
      true
    );

    select coalesce(sum(coalesce((company->>'promotionScore')::numeric, 0)), 0)
    into promotion_score_total
    from jsonb_array_elements(current_companies) as company;

    if promotion_score_total > 0 and coalesce((current_state->>'nextPromotionPayoutAt')::numeric, 0) = 0 then
      current_state := jsonb_set(current_state, '{promotionPoolPending}', 'true'::jsonb, true);
      current_state := jsonb_set(current_state, '{nextPromotionPayoutAt}', to_jsonb(now_ms + promotion_delay_ms), true);
    end if;
  end if;

  if coalesce((current_state->>'promotionPoolPending')::boolean, false) then
    next_promotion_at := coalesce((current_state->>'nextPromotionPayoutAt')::numeric, now_ms);

    if p_force_promotion or now_ms >= next_promotion_at then
      select coalesce(sum(coalesce((company->>'promotionScore')::numeric, 0)), 0)
      into promotion_score_total
      from jsonb_array_elements(current_companies) as company;

      if promotion_score_total > 0 then
        with updated as (
          select
            ord,
            round((p_promotion_pool_funding * coalesce((company->>'promotionScore')::numeric, 0)) / promotion_score_total / 1000000) * 1000000 as share,
            company
          from jsonb_array_elements(current_companies) with ordinality as items(company, ord)
        ),
        rebuilt as (
          select
            ord,
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(company, '{budget}', to_jsonb(coalesce((company->>'budget')::numeric, 0) + share), true),
                  '{promotionReceived}',
                  to_jsonb(coalesce((company->>'promotionReceived')::numeric, 0) + share),
                  true
                ),
                '{lastPromotionPayout}',
                to_jsonb(share),
                true
              ),
              '{promotionScore}',
              '0'::jsonb,
              true
            ) as company
          from updated
        )
        select coalesce(jsonb_agg(company order by ord), '[]'::jsonb)
        into next_companies
        from rebuilt;

        current_companies := next_companies;
        if not uses_segmented_state then
          current_state := jsonb_set(current_state, '{companies}', current_companies, true);
        end if;
      end if;

      current_state := jsonb_set(current_state, '{promotionPoolPending}', 'false'::jsonb, true);
      current_state := jsonb_set(current_state, '{nextPromotionPayoutAt}', 'null'::jsonb, true);
      current_state := jsonb_set(current_state, '{lastPromotionPayoutAt}', to_jsonb(now_ms), true);
    end if;
  end if;

  current_state := jsonb_set(current_state, '{updatedAt}', to_jsonb(clock_timestamp()::text), true);

  if uses_segmented_state then
    update public.app_state
    set state = current_state,
        updated_at = clock_timestamp()
    where id = core_state_id;

    update public.app_state
    set state = jsonb_build_object('companies', current_companies),
        updated_at = clock_timestamp()
    where id = companies_state_id;

    return current_state || jsonb_build_object('companies', current_companies);
  end if;

  current_state := jsonb_set(current_state, '{companies}', current_companies, true);

  update public.app_state
  set state = current_state,
      updated_at = clock_timestamp()
  where id = p_state_id;

  return current_state;
end;
$$;

grant execute on function public.apply_scheduled_state_updates(
  text,
  boolean,
  boolean,
  integer,
  integer,
  numeric,
  numeric[]
) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;
