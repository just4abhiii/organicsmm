begin;
create table if not exists public.legal_consent_settings (
 id boolean primary key default true check (id = true),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
grant select, update on public.legal_consent_settings to authenticated;
grant all on public.legal_consent_settings to service_role;
alter table public.legal_consent_settings enable row level security;
create policy "Admins manage consent settings" on public.legal_consent_settings for all to authenticated using (public.has_role(auth.uid(), 'admin'::public.app_role)) with check (public.has_role(auth.uid(), 'admin'::public.app_role));
insert into public.legal_consent_settings(id, enabled) values(true,true) on conflict(id) do nothing;
create or replace function public.get_legal_consent_enabled() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select enabled from public.legal_consent_settings where id=true),true) $$;
revoke all on function public.get_legal_consent_enabled() from public;
grant execute on function public.get_legal_consent_enabled() to anon,authenticated,service_role;
create or replace function public.set_legal_consent_enabled(_enabled boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(auth.uid(),'admin'::public.app_role) then raise exception 'Admin access required' using errcode='42501'; end if;
 if _enabled is null then raise exception 'Enabled must be true or false'; end if;
 update public.legal_consent_settings set enabled=_enabled,updated_at=now() where id=true;
 return _enabled;
end $$;
revoke all on function public.set_legal_consent_enabled(boolean) from public,anon;
grant execute on function public.set_legal_consent_enabled(boolean) to authenticated;
commit;
