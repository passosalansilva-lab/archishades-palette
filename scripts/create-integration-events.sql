-- Cria tabela de observabilidade para integrações (visível apenas para super_admin)
-- Execute este script no SQL Editor do seu Supabase.

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  provider text not null, -- ex: 'resend', 'stripe', 'mercadopago'
  source text not null,   -- ex: 'send-bonus-email'
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null,

  company_id uuid null,
  user_id uuid null,
  details jsonb null,

  resolved boolean not null default false
);

create index if not exists integration_events_created_at_idx
  on public.integration_events (created_at desc);

alter table public.integration_events enable row level security;

-- Somente super_admin pode ver/gerenciar (via função has_role para evitar recursion)
-- Caso a função has_role não exista, cria:
create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text = _role
  )
$$;

drop policy if exists integration_events_select_super_admin on public.integration_events;
create policy integration_events_select_super_admin
  on public.integration_events
  for select
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists integration_events_insert_super_admin on public.integration_events;
create policy integration_events_insert_super_admin
  on public.integration_events
  for insert
  with check (true); -- Edge functions usam service_role, não precisa checar

drop policy if exists integration_events_update_super_admin on public.integration_events;
create policy integration_events_update_super_admin
  on public.integration_events
  for update
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists integration_events_delete_super_admin on public.integration_events;
create policy integration_events_delete_super_admin
  on public.integration_events
  for delete
  using (public.has_role(auth.uid(), 'super_admin'));
