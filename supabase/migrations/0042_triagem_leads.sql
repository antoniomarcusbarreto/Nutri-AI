-- ============================================================================
-- Migration 0042 — Triagem de novos pacientes (leads)
-- ============================================================================
--
-- O nutricionista divulga um link público (/n/<slug>) nas redes sociais. A
-- pessoa interessada preenche um formulário curto (contato, objetivo, saúde,
-- preferências) e o pedido cai na tela "Triagem" do nutricionista dono do link.
--
-- Regras (decididas pelo dono do produto):
--   * Nada vira paciente sozinho: o nutricionista aceita com um clique
--     (accept_lead), que cadastra o paciente e preenche a ficha de saúde. Se
--     a pessoa já for paciente dele, o lead é ligado ao cadastro existente.
--   * Formulário fixo (sem perguntas configuráveis).
--   * A agenda não aparece no formulário: depois de aceitar, o nutricionista
--     manda o convite do portal e o paciente marca pela agenda online.
--   * O lead tem dados de saúde: só o nutricionista dono do link lê (a
--     secretária não, mesma regra da ficha de saúde — migration 0029).
--   * A triagem por IA (edge function lead-triage) organiza e aponta pontos
--     de atenção; não diagnostica. Grava em leads.ai_triage.
--
-- Escrita pública só pela RPC submit_lead (SECURITY DEFINER, com limite por
-- IP). anon não tem nenhum acesso direto às tabelas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Link público de cada nutricionista
-- ----------------------------------------------------------------------------
create table if not exists public.lead_forms (
    nutritionist_id uuid primary key references public.profiles(id) on delete cascade,
    clinic_id       uuid not null references public.clinics(id) on delete cascade,
    slug            text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
    enabled         boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

alter table public.lead_forms enable row level security;

drop policy if exists lead_forms_own_select on public.lead_forms;
drop policy if exists lead_forms_own_insert on public.lead_forms;
drop policy if exists lead_forms_own_update on public.lead_forms;

create policy lead_forms_own_select on public.lead_forms
    for select to authenticated using (nutritionist_id = auth.uid());
create policy lead_forms_own_insert on public.lead_forms
    for insert to authenticated
    with check (nutritionist_id = auth.uid()
                and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));
create policy lead_forms_own_update on public.lead_forms
    for update to authenticated
    using (nutritionist_id = auth.uid())
    with check (nutritionist_id = auth.uid()
                and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

revoke all on public.lead_forms from anon;

-- ----------------------------------------------------------------------------
-- 2. Leads
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
    id                   uuid primary key default gen_random_uuid(),
    clinic_id            uuid not null references public.clinics(id) on delete cascade,
    nutritionist_id      uuid not null references public.profiles(id) on delete cascade,
    status               text not null default 'novo'
                         check (status in ('novo', 'em_contato', 'convertido', 'descartado')),

    -- Contato
    name                 text not null,
    phone                text not null,
    phone_digits         text not null,  -- só dígitos, sem o 55 (comparação com pacientes)
    email                text,
    birth_date           date,
    biological_sex       text check (biological_sex in ('F', 'M')),
    modality             text check (modality in ('presencial', 'online', 'tanto_faz')),
    city                 text,

    -- Objetivo
    goal                 text not null
                         check (goal in ('emagrecimento', 'ganho_massa', 'saude', 'gestacao',
                                         'esporte', 'comportamento', 'outro')),
    goal_details         text,
    deadline             text,
    had_nutritionist     boolean,

    -- Saúde (triagem rápida)
    conditions           text[] not null default '{}',
    medications          text,
    pregnancy            text check (pregnancy in ('nao', 'gestante', 'amamentando')),
    allergies            text,
    restrictions         text,
    weight_kg            numeric(5, 1) check (weight_kg is null or weight_kg between 20 and 400),
    height_cm            numeric(5, 1) check (height_cm is null or height_cm between 80 and 250),
    health_notes         text,

    -- Logística e origem
    preferred_days       smallint[] not null default '{}',
    preferred_periods    text[] not null default '{}',
    source               text check (source in ('instagram', 'facebook', 'tiktok', 'google',
                                                'indicacao', 'outro')),
    source_detail        text,  -- ?origem= do link (ex.: um post específico)

    -- Consentimentos (LGPD: dado de saúde exige consentimento específico)
    consent_health_at    timestamptz not null,
    consent_whatsapp     boolean not null default false,

    -- Triagem e desfecho
    ai_triage            jsonb,
    ai_triaged_at        timestamptz,
    converted_patient_id uuid references public.patients(id) on delete set null,
    handled_at           timestamptz,

    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index if not exists leads_owner_status_idx on public.leads (nutritionist_id, status, created_at desc);
create index if not exists leads_phone_idx on public.leads (nutritionist_id, phone_digits);

alter table public.leads enable row level security;

drop policy if exists leads_own_select on public.leads;
drop policy if exists leads_own_update on public.leads;
drop policy if exists leads_own_delete on public.leads;

create policy leads_own_select on public.leads
    for select to authenticated
    using (nutritionist_id = auth.uid()
           and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));
create policy leads_own_update on public.leads
    for update to authenticated
    using (nutritionist_id = auth.uid()
           and public.acting_member_of(clinic_id, array['owner', 'nutritionist']))
    with check (nutritionist_id = auth.uid());
-- Excluir = apagar os dados da pessoa (pedido de exclusão, spam).
create policy leads_own_delete on public.leads
    for delete to authenticated
    using (nutritionist_id = auth.uid()
           and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

-- Inserção só pela RPC pública; a equipe muda só o andamento e a triagem.
revoke all on public.leads from anon;
revoke insert, update on public.leads from authenticated;
grant select, delete on public.leads to authenticated;
grant update (status, ai_triage, ai_triaged_at, handled_at, updated_at) on public.leads to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Helpers
-- ----------------------------------------------------------------------------

-- Só dígitos, sem o código do país (55).
create or replace function public._phone_digits(p_phone text)
returns text language sql immutable set search_path = public
as $$
    select case
        when d ~ '^55\d{10,11}$' then substr(d, 3)
        else d
    end
    from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

-- Paciente que já corresponde ao lead (campo calculado do PostgREST:
-- `select('*, matched_patient_id:lead_patient_match')`). SECURITY INVOKER:
-- o RLS de patients vale, então só aparece paciente que o usuário enxerga.
-- Critério determinístico: WhatsApp, e-mail ou nome + data de nascimento,
-- entre os pacientes do próprio nutricionista.
create or replace function public.lead_patient_match(l public.leads)
returns uuid language sql stable set search_path = public
as $$
    select coalesce(l.converted_patient_id, (
        select p.id from public.patients p
        where p.clinic_id = l.clinic_id
          and p.nutritionist_id = l.nutritionist_id
          and (
              (length(l.phone_digits) >= 10 and public._phone_digits(p.phone) = l.phone_digits)
              or (l.email is not null and lower(trim(p.email)) = lower(l.email))
              or (l.birth_date is not null and p.birth_date = l.birth_date
                  and lower(trim(p.name)) = lower(trim(l.name)))
          )
        order by (p.status = 'ativo') desc, p.created_at
        limit 1
    ));
$$;

revoke execute on function public.lead_patient_match(public.leads) from anon;

-- Texto curto do objetivo (vai para patients.main_goal ao aceitar).
create or replace function public._lead_goal_label(p_goal text)
returns text language sql immutable set search_path = public
as $$
    select case p_goal
        when 'emagrecimento' then 'Emagrecimento'
        when 'ganho_massa'   then 'Ganho de massa muscular'
        when 'saude'         then 'Saúde e exames'
        when 'gestacao'      then 'Gestação / amamentação'
        when 'esporte'       then 'Performance esportiva'
        when 'comportamento' then 'Relação com a comida'
        else 'Outro'
    end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPCs públicas (anon)
-- ----------------------------------------------------------------------------

-- Cabeçalho do formulário: quem é o nutricionista. null = link inválido/desligado.
create or replace function public.get_lead_form_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
    v jsonb;
begin
    select jsonb_build_object(
               'nutritionist_name', pr.full_name,
               'crn',               pr.crn,
               'avatar_url',        pr.avatar_url,
               'clinic_name',       c.name,
               'clinic_city',       c.city,
               'clinic_state',      c.state
           )
      into v
      from public.lead_forms f
      join public.profiles pr on pr.id = f.nutritionist_id
      join public.clinics c on c.id = f.clinic_id
     where f.slug = lower(trim(p_slug))
       and f.enabled
       and public.is_account_active(f.nutritionist_id);
    return v;
end;
$$;

revoke all on function public.get_lead_form_public(text) from public;
grant execute on function public.get_lead_form_public(text) to anon, authenticated;

-- Envio do formulário. Sempre responde true para não revelar nada (inclusive
-- se a pessoa já é paciente). Mesma pessoa (WhatsApp) com lead aberto nos
-- últimos 7 dias: atualiza o existente em vez de duplicar.
create or replace function public.submit_lead(p_slug text, p_data jsonb)
returns boolean language plpgsql volatile security definer set search_path = public
as $$
declare
    v_form     public.lead_forms;
    v_name     text := left(trim(coalesce(p_data->>'name', '')), 120);
    v_phone    text := left(trim(coalesce(p_data->>'phone', '')), 30);
    v_digits   text := public._phone_digits(p_data->>'phone');
    v_email    text := nullif(lower(left(trim(coalesce(p_data->>'email', '')), 160)), '');
    v_birth    date;
    v_goal     text := p_data->>'goal';
    v_existing uuid;
begin
    perform public.enforce_public_rate_limit('lead_submit:' || public.client_ip(), 5, interval '1 hour');

    -- Campo isca: robô preencheu, finge sucesso.
    if coalesce(p_data->>'website', '') <> '' then
        return true;
    end if;

    select * into v_form from public.lead_forms
     where slug = lower(trim(p_slug)) and enabled;
    if not found or not public.is_account_active(v_form.nutritionist_id) then
        raise exception 'Este link não está mais disponível.' using errcode = 'P0002';
    end if;
    perform public.enforce_public_rate_limit('lead_form:' || v_form.slug, 60, interval '1 hour');

    if char_length(v_name) < 2 then
        raise exception 'Informe seu nome.' using errcode = '22023';
    end if;
    if length(v_digits) not between 10 and 11 then
        raise exception 'Informe um WhatsApp válido, com DDD.' using errcode = '22023';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'E-mail inválido.' using errcode = '22023';
    end if;
    if v_goal is null or v_goal not in ('emagrecimento', 'ganho_massa', 'saude', 'gestacao',
                                        'esporte', 'comportamento', 'outro') then
        raise exception 'Escolha seu objetivo principal.' using errcode = '22023';
    end if;
    if coalesce(p_data->'consent_health' = 'true'::jsonb, false) is not true then
        raise exception 'É preciso autorizar o uso dos dados de saúde.' using errcode = '22023';
    end if;
    begin
        v_birth := nullif(p_data->>'birth_date', '')::date;
    exception when others then
        v_birth := null;
    end;
    if v_birth is not null and (v_birth < date '1900-01-01' or v_birth > current_date) then
        v_birth := null;
    end if;

    select id into v_existing from public.leads
     where nutritionist_id = v_form.nutritionist_id
       and phone_digits = v_digits
       and status in ('novo', 'em_contato')
       and created_at > now() - interval '7 days'
     order by created_at desc
     limit 1;

    if v_existing is not null then
        update public.leads set
            name              = v_name,
            phone             = v_phone,
            email             = coalesce(v_email, email),
            birth_date        = coalesce(v_birth, birth_date),
            biological_sex    = case when p_data->>'biological_sex' in ('F', 'M') then p_data->>'biological_sex' else biological_sex end,
            modality          = case when p_data->>'modality' in ('presencial', 'online', 'tanto_faz') then p_data->>'modality' else modality end,
            city              = coalesce(nullif(left(trim(p_data->>'city'), 80), ''), city),
            goal              = v_goal,
            goal_details      = nullif(left(trim(p_data->>'goal_details'), 1000), ''),
            deadline          = nullif(left(trim(p_data->>'deadline'), 120), ''),
            had_nutritionist  = case p_data->>'had_nutritionist' when 'true' then true when 'false' then false end,
            conditions        = array(select x from jsonb_array_elements_text(coalesce(p_data->'conditions', '[]')) x
                                       where x in ('diabetes', 'hipertensao', 'colesterol', 'tireoide', 'sop', 'renal', 'gastro', 'outra')),
            medications       = nullif(left(trim(p_data->>'medications'), 500), ''),
            pregnancy         = case when p_data->>'pregnancy' in ('nao', 'gestante', 'amamentando') then p_data->>'pregnancy' end,
            allergies         = nullif(left(trim(p_data->>'allergies'), 500), ''),
            restrictions      = nullif(left(trim(p_data->>'restrictions'), 500), ''),
            weight_kg         = case when (p_data->>'weight_kg') ~ '^\d{2,3}([.,]\d)?$'
                                     and replace(p_data->>'weight_kg', ',', '.')::numeric between 20 and 400
                                     then replace(p_data->>'weight_kg', ',', '.')::numeric end,
            height_cm         = case when (p_data->>'height_cm') ~ '^\d{2,3}([.,]\d)?$'
                                     and replace(p_data->>'height_cm', ',', '.')::numeric between 80 and 250
                                     then replace(p_data->>'height_cm', ',', '.')::numeric end,
            health_notes      = nullif(left(trim(p_data->>'health_notes'), 1000), ''),
            preferred_days    = array(select x::smallint from jsonb_array_elements_text(coalesce(p_data->'preferred_days', '[]')) x
                                       where x in ('0', '1', '2', '3', '4', '5', '6')),
            preferred_periods = array(select x from jsonb_array_elements_text(coalesce(p_data->'preferred_periods', '[]')) x
                                       where x in ('manha', 'tarde', 'noite')),
            source            = case when p_data->>'source' in ('instagram', 'facebook', 'tiktok', 'google', 'indicacao', 'outro') then p_data->>'source' else source end,
            source_detail     = coalesce(nullif(left(trim(p_data->>'source_detail'), 80), ''), source_detail),
            consent_health_at = now(),
            consent_whatsapp  = coalesce(p_data->'consent_whatsapp' = 'true'::jsonb, false),
            -- Respostas mudaram: a triagem antiga não vale mais.
            ai_triage         = null,
            ai_triaged_at     = null,
            status            = 'novo',
            updated_at        = now()
        where id = v_existing;
        return true;
    end if;

    insert into public.leads (
        clinic_id, nutritionist_id, name, phone, phone_digits, email, birth_date, biological_sex,
        modality, city, goal, goal_details, deadline, had_nutritionist, conditions, medications,
        pregnancy, allergies, restrictions, weight_kg, height_cm, health_notes, preferred_days,
        preferred_periods, source, source_detail, consent_health_at, consent_whatsapp
    ) values (
        v_form.clinic_id, v_form.nutritionist_id, v_name, v_phone, v_digits, v_email, v_birth,
        case when p_data->>'biological_sex' in ('F', 'M') then p_data->>'biological_sex' end,
        case when p_data->>'modality' in ('presencial', 'online', 'tanto_faz') then p_data->>'modality' end,
        nullif(left(trim(p_data->>'city'), 80), ''),
        v_goal,
        nullif(left(trim(p_data->>'goal_details'), 1000), ''),
        nullif(left(trim(p_data->>'deadline'), 120), ''),
        case p_data->>'had_nutritionist' when 'true' then true when 'false' then false end,
        array(select x from jsonb_array_elements_text(coalesce(p_data->'conditions', '[]')) x
               where x in ('diabetes', 'hipertensao', 'colesterol', 'tireoide', 'sop', 'renal', 'gastro', 'outra')),
        nullif(left(trim(p_data->>'medications'), 500), ''),
        case when p_data->>'pregnancy' in ('nao', 'gestante', 'amamentando') then p_data->>'pregnancy' end,
        nullif(left(trim(p_data->>'allergies'), 500), ''),
        nullif(left(trim(p_data->>'restrictions'), 500), ''),
        case when (p_data->>'weight_kg') ~ '^\d{2,3}([.,]\d)?$'
              and replace(p_data->>'weight_kg', ',', '.')::numeric between 20 and 400
             then replace(p_data->>'weight_kg', ',', '.')::numeric end,
        case when (p_data->>'height_cm') ~ '^\d{2,3}([.,]\d)?$'
              and replace(p_data->>'height_cm', ',', '.')::numeric between 80 and 250
             then replace(p_data->>'height_cm', ',', '.')::numeric end,
        nullif(left(trim(p_data->>'health_notes'), 1000), ''),
        array(select x::smallint from jsonb_array_elements_text(coalesce(p_data->'preferred_days', '[]')) x
               where x in ('0', '1', '2', '3', '4', '5', '6')),
        array(select x from jsonb_array_elements_text(coalesce(p_data->'preferred_periods', '[]')) x
               where x in ('manha', 'tarde', 'noite')),
        case when p_data->>'source' in ('instagram', 'facebook', 'tiktok', 'google', 'indicacao', 'outro') then p_data->>'source' end,
        nullif(left(trim(p_data->>'source_detail'), 80), ''),
        now(),
        coalesce(p_data->'consent_whatsapp' = 'true'::jsonb, false)
    );
    return true;
end;
$$;

revoke all on function public.submit_lead(text, jsonb) from public;
grant execute on function public.submit_lead(text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Aceitar o lead (um clique do nutricionista)
-- ----------------------------------------------------------------------------
-- p_patient_id null: cadastra o paciente novo. Preenchido: liga o lead a um
-- paciente que já existe (completa só o que estiver vazio, nunca sobrescreve).
-- Devolve o id do paciente.
create or replace function public.accept_lead(p_lead_id uuid, p_patient_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare
    l            public.leads;
    v_patient    uuid := p_patient_id;
    v_pathology  text;
begin
    select * into l from public.leads where id = p_lead_id for update;
    if not found or l.nutritionist_id <> auth.uid()
       or not public.acting_member_of(l.clinic_id, array['owner', 'nutritionist']) then
        raise exception 'Pedido não encontrado.' using errcode = '42501';
    end if;
    if l.status = 'convertido' then
        raise exception 'Este pedido já foi aceito.' using errcode = '22023';
    end if;

    -- Patologias: condições marcadas + gestação + observação livre.
    v_pathology := nullif(concat_ws(E'\n',
        nullif(array_to_string(array(
            select case c
                when 'diabetes'    then 'Diabetes'
                when 'hipertensao' then 'Hipertensão'
                when 'colesterol'  then 'Colesterol/triglicerídeos alterados'
                when 'tireoide'    then 'Tireoide'
                when 'sop'         then 'SOP'
                when 'renal'       then 'Doença renal'
                when 'gastro'      then 'Problema gastrointestinal'
                else 'Outra condição'
            end from unnest(l.conditions) c), ', '), ''),
        case l.pregnancy when 'gestante' then 'Gestante' when 'amamentando' then 'Amamentando' end,
        l.health_notes
    ), '');

    if v_patient is not null then
        if not exists (select 1 from public.patients where id = v_patient and clinic_id = l.clinic_id)
           or not public.can_access_patient(v_patient) then
            raise exception 'Paciente não encontrado.' using errcode = '42501';
        end if;
        update public.patients set
            phone          = coalesce(nullif(trim(phone), ''), l.phone),
            email          = coalesce(nullif(trim(email), ''), l.email),
            birth_date     = coalesce(birth_date, l.birth_date),
            biological_sex = coalesce(biological_sex, l.biological_sex),
            main_goal      = coalesce(nullif(trim(main_goal), ''), public._lead_goal_label(l.goal)),
            status         = 'ativo'
        where id = v_patient;
    else
        insert into public.patients (clinic_id, nutritionist_id, name, phone, email, birth_date,
                                     biological_sex, main_goal, status, whatsapp_opt_out)
        values (l.clinic_id, l.nutritionist_id, l.name, l.phone, l.email, l.birth_date,
                l.biological_sex, public._lead_goal_label(l.goal), 'ativo', not l.consent_whatsapp)
        returning id into v_patient;
    end if;

    -- Ficha de saúde: só completa campos vazios.
    insert into public.patient_health (patient_id, allergies, dietary_restrictions, pathologies, medications, updated_at)
    values (v_patient, l.allergies, l.restrictions, v_pathology, l.medications, now())
    on conflict (patient_id) do update set
        allergies            = coalesce(nullif(trim(patient_health.allergies), ''), excluded.allergies),
        dietary_restrictions = coalesce(nullif(trim(patient_health.dietary_restrictions), ''), excluded.dietary_restrictions),
        pathologies          = coalesce(nullif(trim(patient_health.pathologies), ''), excluded.pathologies),
        medications          = coalesce(nullif(trim(patient_health.medications), ''), excluded.medications),
        updated_at           = now();

    update public.leads set
        status = 'convertido', converted_patient_id = v_patient,
        handled_at = now(), updated_at = now()
    where id = l.id;

    return v_patient;
end;
$$;

revoke all on function public.accept_lead(uuid, uuid) from public;
grant execute on function public.accept_lead(uuid, uuid) to authenticated;

commit;

-- Reverter (manual):
--   drop function public.accept_lead(uuid, uuid), public.submit_lead(text, jsonb),
--     public.get_lead_form_public(text), public._lead_goal_label(text),
--     public.lead_patient_match(public.leads), public._phone_digits(text);
--   drop table public.leads, public.lead_forms;
