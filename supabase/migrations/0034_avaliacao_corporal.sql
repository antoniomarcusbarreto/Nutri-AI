-- ============================================================================
-- Migration 0034 — Avaliação corporal (medidas com fita + fotos + IA)
-- ============================================================================
--
-- Regras de negócio (decididas pelo dono do produto, 2026-10-09):
--   * Só o NUTRICIONISTA abre uma avaliação para o paciente (fita, fotos ou as
--     duas). Sem solicitação aberta, o paciente não envia nada.
--   * O paciente envia pelo portal: peso, altura, perímetros e/ou fotos
--     (frente, lado, costas). As fotos ficam no bucket privado `body-photos`.
--   * A análise por IA das fotos é disparada SÓ pelo nutricionista (Edge
--     Function `body-assessment-ai`, que exige acesso clínico e passa pela
--     quota `register_ai_call`, que recusa pacientes). O paciente nunca vê o
--     resultado da IA (`ai_estimate`).
--   * O nutricionista revisa, corrige e VALIDA. Só o que ele valida e marca
--     como compartilhado aparece para o paciente.
--   * Os indicadores (IMC, IMM, IMG, razões, conicidade, gasto de repouso...)
--     são calculados no front a partir destes valores — não ficam no banco.
--   * Risco do erro da estimativa por fotos assumido pelo dono do produto.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Avaliações
-- ----------------------------------------------------------------------------
create table if not exists public.body_assessments (
    id                  uuid primary key default gen_random_uuid(),
    clinic_id           uuid not null references public.clinics(id) on delete cascade,
    patient_id          uuid not null references public.patients(id) on delete cascade,
    nutritionist_id     uuid references public.profiles(id) on delete set null,
    kind                text not null check (kind in ('fita', 'fotos', 'completa')),
    source              text not null default 'portal' check (source in ('portal', 'consultorio')),
    status              text not null default 'solicitada'
                        check (status in ('solicitada', 'enviada', 'validada', 'cancelada')),
    request_note        text,
    assessed_at         timestamptz,
    height_cm           numeric(5,1),
    weight_kg           numeric(5,1),
    arm_cm              numeric(5,1),
    forearm_cm          numeric(5,1),
    waist_cm            numeric(5,1),
    hip_cm              numeric(5,1),
    thigh_cm            numeric(5,1),
    calf_cm             numeric(5,1),
    body_fat_pct        numeric(4,1),
    body_fat_source     text check (body_fat_source in ('rfm', 'ia', 'informado')),
    photo_paths         jsonb not null default '{}'::jsonb,
    ai_estimate         jsonb,
    ai_analyzed_at      timestamptz,
    nutritionist_note   text,
    shared_with_patient boolean not null default false,
    validated_at        timestamptz,
    validated_by        uuid references public.profiles(id) on delete set null,
    created_at          timestamptz not null default now()
);
create index if not exists body_assessments_patient_idx on public.body_assessments (patient_id, created_at desc);
create unique index if not exists body_assessments_one_open
    on public.body_assessments (patient_id) where status = 'solicitada';

alter table public.body_assessments enable row level security;

-- Equipe clínica com acesso ao paciente: tudo. Secretária e paciente: nada
-- direto (o paciente usa as RPCs do portal, que nunca devolvem `ai_estimate`).
drop policy if exists body_assessments_clinical_all on public.body_assessments;
create policy body_assessments_clinical_all on public.body_assessments for all to authenticated
    using (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id))
    with check (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id));

-- ----------------------------------------------------------------------------
-- 2. Fotos (bucket privado)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Caminho: {patient_id}/{assessment_id}/{pose}-{timestamp}.jpg
drop policy if exists "body_photos_patient_insert"  on storage.objects;
drop policy if exists "body_photos_patient_select"  on storage.objects;
drop policy if exists "body_photos_clinical_select" on storage.objects;
drop policy if exists "body_photos_clinical_delete" on storage.objects;

-- Paciente envia só para a pasta de uma solicitação aberta que pede fotos.
create policy "body_photos_patient_insert" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'body-photos'
        and public.patient_portal_active()
        and split_part(name, '/', 1) = public.current_patient_id()::text
        and exists (
            select 1 from public.body_assessments b
            where b.id::text = split_part(name, '/', 2)
              and b.patient_id = public.current_patient_id()
              and b.status = 'solicitada'
              and b.kind in ('fotos', 'completa')
        )
    );
-- Paciente vê as próprias fotos.
create policy "body_photos_patient_select" on storage.objects for select to authenticated
    using (bucket_id = 'body-photos' and split_part(name, '/', 1) = public.current_patient_id()::text);
-- Equipe clínica vê e apaga as fotos dos pacientes que acessa.
create policy "body_photos_clinical_select" on storage.objects for select to authenticated
    using (bucket_id = 'body-photos' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));
create policy "body_photos_clinical_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'body-photos' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));

-- ----------------------------------------------------------------------------
-- 3. RPCs da equipe
-- ----------------------------------------------------------------------------

-- Pede uma avaliação ao paciente (substitui uma solicitação ainda não enviada).
create or replace function public.request_body_assessment(p_patient_id uuid, p_kind text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_clinic uuid;
    v_id uuid;
begin
    if not public.can_access_patient(p_patient_id) then
        raise exception 'Apenas o nutricionista do paciente pode solicitar a avaliação.' using errcode = '42501';
    end if;
    if p_kind not in ('fita', 'fotos', 'completa') then
        raise exception 'Tipo de avaliação inválido.';
    end if;
    select clinic_id into v_clinic from public.patients where id = p_patient_id;
    update public.body_assessments set status = 'cancelada'
    where patient_id = p_patient_id and status = 'solicitada';
    insert into public.body_assessments (clinic_id, patient_id, nutritionist_id, kind, request_note)
    values (v_clinic, p_patient_id, auth.uid(), p_kind, left(nullif(trim(p_note), ''), 500))
    returning id into v_id;
    return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPCs do paciente
-- ----------------------------------------------------------------------------

-- Solicitação aberta + avaliações validadas e compartilhadas. Nunca devolve
-- `ai_estimate` nem avaliações não validadas.
create or replace function public.portal_body_assessments()
returns table(
    id uuid, kind text, status text, request_note text, created_at timestamptz, assessed_at timestamptz,
    height_cm numeric, weight_kg numeric, arm_cm numeric, forearm_cm numeric, waist_cm numeric,
    hip_cm numeric, thigh_cm numeric, calf_cm numeric, body_fat_pct numeric,
    nutritionist_note text, suggested_height_cm numeric
)
language sql stable security definer set search_path = public
as $$
    with me as (select public.current_patient_id() as pid),
    last_height as (
        select coalesce(
            (select b.height_cm from public.body_assessments b, me
              where b.patient_id = me.pid and b.height_cm is not null
              order by b.created_at desc limit 1),
            (select case when h < 3 then round(h * 100, 1) else round(h, 1) end
               from (select nullif(regexp_replace(replace(c.anthropometry_json->>'height', ',', '.'), '[^0-9.]', '', 'g'), '')::numeric as h
                       from public.consultations c, me
                      where c.patient_id = me.pid and c.anthropometry_json ? 'height'
                      order by c.created_at desc limit 1) x
              where h between 0.5 and 250)
        ) as cm
    )
    select b.id, b.kind, b.status, b.request_note, b.created_at, b.assessed_at,
           case when b.status = 'validada' then b.height_cm end,
           case when b.status = 'validada' then b.weight_kg end,
           case when b.status = 'validada' then b.arm_cm end,
           case when b.status = 'validada' then b.forearm_cm end,
           case when b.status = 'validada' then b.waist_cm end,
           case when b.status = 'validada' then b.hip_cm end,
           case when b.status = 'validada' then b.thigh_cm end,
           case when b.status = 'validada' then b.calf_cm end,
           case when b.status = 'validada' then b.body_fat_pct end,
           case when b.status = 'validada' then b.nutritionist_note end,
           (select cm from last_height)
    from public.body_assessments b, me
    where b.patient_id = me.pid
      and (b.status in ('solicitada', 'enviada') or (b.status = 'validada' and b.shared_with_patient))
    order by b.created_at desc;
$$;

-- Envia a avaliação solicitada.
create or replace function public.portal_submit_body_assessment(
    p_id uuid, p_height_cm numeric, p_weight_kg numeric,
    p_arm_cm numeric, p_forearm_cm numeric, p_waist_cm numeric,
    p_hip_cm numeric, p_thigh_cm numeric, p_calf_cm numeric,
    p_photo_paths jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
    v_b public.body_assessments;
    v_pose text;
    v_path text;
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_b from public.body_assessments where id = p_id and patient_id = v_pid for update;
    if v_b.id is null or v_b.status <> 'solicitada' then
        raise exception 'Esta avaliação não está mais aberta.';
    end if;

    if p_height_cm is null or p_height_cm not between 100 and 230 then
        raise exception 'Informe sua altura em centímetros (ex.: 165).';
    end if;
    if p_weight_kg is null or p_weight_kg not between 25 and 350 then
        raise exception 'Informe seu peso em quilos (ex.: 72,5).';
    end if;
    if v_b.kind in ('fita', 'completa') and (p_waist_cm is null or p_hip_cm is null) then
        raise exception 'Informe pelo menos a cintura e o quadril.';
    end if;
    if exists (select 1 from unnest(array[p_arm_cm, p_forearm_cm, p_waist_cm, p_hip_cm, p_thigh_cm, p_calf_cm]) v
               where v is not null and v not between 10 and 250) then
        raise exception 'Confira as medidas: elas devem estar em centímetros.';
    end if;

    if v_b.kind in ('fotos', 'completa') then
        foreach v_pose in array array['front', 'side', 'back'] loop
            v_path := p_photo_paths->>v_pose;
            if v_path is null
               or split_part(v_path, '/', 1) <> v_pid::text
               or split_part(v_path, '/', 2) <> p_id::text
               or not exists (select 1 from storage.objects o where o.bucket_id = 'body-photos' and o.name = v_path) then
                raise exception 'Envie as três fotos: frente, lado e costas.';
            end if;
        end loop;
    end if;

    update public.body_assessments set
        status = 'enviada', assessed_at = now(),
        height_cm = p_height_cm, weight_kg = p_weight_kg,
        arm_cm = p_arm_cm, forearm_cm = p_forearm_cm, waist_cm = p_waist_cm,
        hip_cm = p_hip_cm, thigh_cm = p_thigh_cm, calf_cm = p_calf_cm,
        photo_paths = case when v_b.kind in ('fotos', 'completa')
                           then jsonb_build_object('front', p_photo_paths->>'front', 'side', p_photo_paths->>'side', 'back', p_photo_paths->>'back')
                           else '{}'::jsonb end
    where id = p_id;
end;
$$;

-- portal_context ganha o sexo biológico (as faixas do relatório corporal dependem dele).
create or replace function public.portal_context()
returns jsonb language sql stable security definer set search_path = public
as $$
    select case when p.id is null then null else jsonb_build_object(
        'patient_id', p.id,
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

-- ----------------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.request_body_assessment(uuid, text, text) from public, anon;
revoke execute on function public.portal_body_assessments()                 from public, anon;
revoke execute on function public.portal_submit_body_assessment(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb) from public, anon;
grant execute on function public.request_body_assessment(uuid, text, text)  to authenticated;
grant execute on function public.portal_body_assessments()                  to authenticated;
grant execute on function public.portal_submit_body_assessment(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb) to authenticated;

commit;
