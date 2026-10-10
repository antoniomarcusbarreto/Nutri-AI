-- ============================================================================
-- Migration 0036 — Diário de refeições do Portal do Paciente (scanner com IA)
-- ============================================================================
--
-- Mesmo fluxo do DoseCerta-AI ("Scanner de Refeições"):
--   foto (câmera/galeria) ou texto → IA identifica alimentos e macros →
--   paciente revisa/edita os itens → diz quanto comeu (100/50/25%) → salva.
--
-- Diferenças de propósito em relação ao DoseCerta:
--   * Guardamos os macros BASE (prato inteiro) e os CONSUMIDOS (já escalados)
--     separados — o DoseCerta escalava duas vezes na exibição.
--   * Cada registro tem a refeição do plano (café, almoço…) e o horário.
--   * Cota diária de IA por paciente (register_patient_meal_ai).
--   * O nutricionista responsável vê o diário (RLS clínico), só leitura.
--
-- Fotos: bucket privado `meal-photos`, caminho {patient_id}/{uuid}.jpg.
-- ============================================================================

begin;

create table if not exists public.meal_logs (
    id               uuid primary key default gen_random_uuid(),
    clinic_id        uuid not null references public.clinics(id) on delete cascade,
    patient_id       uuid not null references public.patients(id) on delete cascade,
    source           text not null check (source in ('foto', 'texto')),
    photo_path       text,
    description      text check (description is null or length(description) <= 1000),
    meal_key         text,
    eaten_at         timestamptz not null default now(),
    status           text not null default 'analyzing' check (status in ('analyzing', 'pending', 'completed', 'error')),
    analysis_error   text,
    items            jsonb not null default '[]'::jsonb,
    base_macros      jsonb,
    macros           jsonb,
    ai_feedback      text,
    -- Leitura da IA de quanto o prato segue a opção do plano para essa refeição.
    adherence        text check (adherence is null or adherence in ('segue_o_plano', 'parcial', 'fora_do_plano', 'sem_plano')),
    consumed_pct     numeric(4,2) check (consumed_pct is null or consumed_pct between 0.1 and 1),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check ((source = 'foto' and photo_path is not null) or (source = 'texto' and description is not null))
);
create index if not exists meal_logs_patient_idx on public.meal_logs (patient_id, eaten_at desc);

alter table public.meal_logs enable row level security;

-- Paciente: lê os próprios registros; grava só com o acesso vigente.
drop policy if exists meal_logs_patient_select on public.meal_logs;
drop policy if exists meal_logs_patient_insert on public.meal_logs;
drop policy if exists meal_logs_patient_update on public.meal_logs;
drop policy if exists meal_logs_patient_delete on public.meal_logs;
drop policy if exists meal_logs_clinical_select on public.meal_logs;

create policy meal_logs_patient_select on public.meal_logs for select to authenticated
    using (patient_id = public.current_patient_id());
create policy meal_logs_patient_insert on public.meal_logs for insert to authenticated
    with check (
        patient_id = public.current_patient_id()
        and public.patient_portal_active()
        and public.patient_in_clinic(patient_id, clinic_id)
    );
create policy meal_logs_patient_update on public.meal_logs for update to authenticated
    using (patient_id = public.current_patient_id() and public.patient_portal_active())
    with check (patient_id = public.current_patient_id() and public.patient_in_clinic(patient_id, clinic_id));
create policy meal_logs_patient_delete on public.meal_logs for delete to authenticated
    using (patient_id = public.current_patient_id() and public.patient_portal_active());

-- Equipe clínica com acesso ao paciente: só leitura.
create policy meal_logs_clinical_select on public.meal_logs for select to authenticated
    using (public.can_access_patient(patient_id));

-- ----------------------------------------------------------------------------
-- Fotos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "meal_photos_patient_insert"  on storage.objects;
drop policy if exists "meal_photos_patient_select"  on storage.objects;
drop policy if exists "meal_photos_patient_delete"  on storage.objects;
drop policy if exists "meal_photos_clinical_select" on storage.objects;

create policy "meal_photos_patient_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'meal-photos' and public.patient_portal_active()
                and split_part(name, '/', 1) = public.current_patient_id()::text);
create policy "meal_photos_patient_select" on storage.objects for select to authenticated
    using (bucket_id = 'meal-photos' and split_part(name, '/', 1) = public.current_patient_id()::text);
create policy "meal_photos_patient_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'meal-photos' and split_part(name, '/', 1) = public.current_patient_id()::text);
create policy "meal_photos_clinical_select" on storage.objects for select to authenticated
    using (bucket_id = 'meal-photos' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));

-- ----------------------------------------------------------------------------
-- Cota de IA do paciente (a register_ai_call é só da equipe)
-- ----------------------------------------------------------------------------
create or replace function public.register_patient_meal_ai(p_daily_limit int default 20)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_calls int;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado.' using errcode = '28000';
    end if;
    if public.current_patient_id() is null or not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    insert into public.ai_usage (user_id, day, calls)
    values (auth.uid(), current_date, 1)
    on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
    returning calls into v_calls;
    if v_calls > p_daily_limit then
        raise exception 'Você atingiu o limite de % análises por hoje. Tente amanhã ou digite os itens manualmente.', p_daily_limit
            using errcode = '53400';
    end if;
end;
$$;

-- portal_context passa a trazer clinic_id (o registro do diário precisa dele).
create or replace function public.portal_context()
returns jsonb language sql stable security definer set search_path = public
as $$
    select case when p.id is null then null else jsonb_build_object(
        'patient_id', p.id,
        'clinic_id', p.clinic_id,
        'name', p.name,
        'email', p.email,
        'phone', p.phone,
        'birth_date', p.birth_date,
        'biological_sex', p.biological_sex,
        'main_goal', p.main_goal,
        'access_until', p.portal_access_until,
        'active', p.portal_access_until > now() and p.status = 'ativo',
        'terms_version', p.portal_terms_version,
        'terms_accepted_at', p.portal_terms_accepted_at,
        'nutritionist_name', n.full_name,
        'nutritionist_crn', n.crn,
        'booking_enabled', exists (select 1 from public.nutritionist_availability av where av.nutritionist_id = p.nutritionist_id),
        'clinic', jsonb_build_object(
            'name', c.name, 'phone', c.phone, 'email', c.email,
            'address', c.address, 'city', c.city, 'state', c.state
        )
    ) end
    from (select public.current_patient_id() as id) cur
    left join public.patients p on p.id = cur.id
    left join public.profiles n on n.id = p.nutritionist_id
    left join public.clinics  c on c.id = p.clinic_id;
$$;

revoke execute on function public.register_patient_meal_ai(int) from public, anon;
grant execute on function public.register_patient_meal_ai(int) to authenticated;

commit;
