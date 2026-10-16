-- ============================================================================
-- Migration 0044 — Teleconsulta (fase 2: consentimento, transcrição e resumo)
-- ============================================================================
--
-- Regras (decididas pelo dono do produto, 2026-10-16):
--   * Só transcreve com o ACEITE do paciente, registrado por consulta
--     (teleconsult_consents: histórico só de inclusão — aceite, recusa e
--     revogação, com a versão do termo). Sem aceite = consulta normal.
--   * O banco é quem garante: um trecho de transcrição só entra se a última
--     decisão do paciente for "aceito". Revogou no meio, parou de gravar.
--   * O texto é capturado pelo navegador do nutricionista e vai entrando como
--     RASCUNHO (status em_andamento → rascunho). Ao fim da chamada o
--     nutricionista revisa a transcrição e o resumo da IA, corrige o resumo
--     e escolhe "Salvar no histórico" (status salva) ou "Descartar" (apaga).
--   * Não guardamos áudio nem vídeo, só texto e resumo.
--   * Quem vê: só o nutricionista da consulta. Depois de salva, ele pode
--     compartilhar UMA transcrição com outro owner/nutricionista da mesma
--     clínica (e revogar). Secretária e paciente nunca leem o conteúdo.
--     Quem tem patient_access_grants sobre o paciente NÃO vê transcrições.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Consentimento (só inclusão)
-- ----------------------------------------------------------------------------
create table if not exists public.teleconsult_consents (
    id             uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references public.appointments(id) on delete cascade,
    patient_id     uuid not null references public.patients(id) on delete cascade,
    clinic_id      uuid not null references public.clinics(id) on delete cascade,
    decision       text not null check (decision in ('aceito', 'recusado', 'revogado')),
    terms_version  text not null check (length(terms_version) between 1 and 32),
    decided_at     timestamptz not null default now(),
    user_agent     text check (user_agent is null or length(user_agent) <= 400)
);
create index if not exists teleconsult_consents_appt_idx on public.teleconsult_consents (appointment_id, decided_at desc);

alter table public.teleconsult_consents enable row level security;
revoke all on public.teleconsult_consents from anon, authenticated;
grant select on public.teleconsult_consents to authenticated;

drop policy if exists teleconsult_consents_select on public.teleconsult_consents;
create policy teleconsult_consents_select on public.teleconsult_consents for select to authenticated
    using (patient_id = public.current_patient_id()
        or exists (select 1 from public.appointments a
                   where a.id = appointment_id and a.nutritionist_id = auth.uid()
                     and public.acting_member_of(a.clinic_id, array['owner', 'nutritionist'])));

-- Última decisão do paciente para a consulta é "aceito"?
create or replace function public.teleconsult_has_consent(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select coalesce((select c.decision = 'aceito' from public.teleconsult_consents c
                     where c.appointment_id = p_appointment_id
                     order by c.decided_at desc, c.id desc limit 1), false);
$$;

-- Estado atual do termo (paciente da consulta ou nutricionista responsável).
create or replace function public.teleconsult_consent_state(p_appointment_id uuid)
returns table(decision text, terms_version text, decided_at timestamptz)
language sql stable security definer set search_path = public
as $$
    select c.decision, c.terms_version, c.decided_at
    from public.teleconsult_consents c
    join public.appointments a on a.id = c.appointment_id
    where c.appointment_id = p_appointment_id
      and (a.patient_id = public.current_patient_id()
           or (a.nutritionist_id = auth.uid() and public.acting_member_of(a.clinic_id, array['owner', 'nutritionist'])))
    order by c.decided_at desc, c.id desc
    limit 1;
$$;

-- O paciente aceita, recusa ou revoga (portal).
create or replace function public.portal_teleconsult_consent(
    p_appointment_id uuid, p_decision text, p_version text, p_user_agent text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments;
begin
    select * into v_appt from public.appointments
    where id = p_appointment_id and patient_id = public.current_patient_id();
    if v_appt.id is null then
        raise exception 'Consulta não encontrada.' using errcode = '42501';
    end if;
    if v_appt.modality <> 'online' or v_appt.status not in ('pendente', 'confirmado') then
        raise exception 'Esta consulta não está aberta para teleconsulta.';
    end if;
    if p_decision not in ('aceito', 'recusado', 'revogado') then
        raise exception 'Decisão inválida.';
    end if;
    if not public.clinic_has_feature(v_appt.clinic_id, 'teleconsulta_transcricao') then
        raise exception 'A transcrição não está disponível.';
    end if;
    if p_decision = 'revogado' and not public.teleconsult_has_consent(p_appointment_id) then
        return; -- nada a revogar
    end if;
    insert into public.teleconsult_consents (appointment_id, patient_id, clinic_id, decision, terms_version, user_agent)
    values (v_appt.id, v_appt.patient_id, v_appt.clinic_id, p_decision, left(coalesce(p_version, ''), 32),
            left(nullif(trim(p_user_agent), ''), 400));
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Transcrição, trechos e compartilhamento
-- ----------------------------------------------------------------------------
create table if not exists public.teleconsult_transcripts (
    id                   uuid primary key default gen_random_uuid(),
    appointment_id       uuid not null unique references public.appointments(id) on delete cascade,
    clinic_id            uuid not null references public.clinics(id) on delete cascade,
    patient_id           uuid not null references public.patients(id) on delete cascade,
    nutritionist_id      uuid not null references public.profiles(id) on delete cascade,
    consent_id           uuid references public.teleconsult_consents(id) on delete set null,
    status               text not null default 'em_andamento' check (status in ('em_andamento', 'rascunho', 'salva')),
    started_at           timestamptz not null default now(),
    ended_at             timestamptz,
    saved_at             timestamptz,
    summary              jsonb,
    summary_model        text,
    summary_generated_at timestamptz,
    created_at           timestamptz not null default now()
);
create index if not exists teleconsult_transcripts_patient_idx on public.teleconsult_transcripts (patient_id, started_at desc);
create index if not exists teleconsult_transcripts_owner_idx on public.teleconsult_transcripts (nutritionist_id, status);

-- id vem do navegador (uuid por trecho): reenviar um lote não duplica.
create table if not exists public.teleconsult_transcript_segments (
    id            uuid primary key,
    transcript_id uuid not null references public.teleconsult_transcripts(id) on delete cascade,
    speaker       text not null check (speaker in ('nutricionista', 'paciente', 'outro')),
    text          text not null check (length(text) between 1 and 4000),
    spoken_at     timestamptz not null,
    created_at    timestamptz not null default now()
);
create index if not exists teleconsult_segments_transcript_idx on public.teleconsult_transcript_segments (transcript_id, spoken_at);

create table if not exists public.teleconsult_transcript_shares (
    id            uuid primary key default gen_random_uuid(),
    transcript_id uuid not null references public.teleconsult_transcripts(id) on delete cascade,
    clinic_id     uuid not null references public.clinics(id) on delete cascade,
    shared_by     uuid not null references public.profiles(id) on delete cascade,
    grantee_id    uuid not null references public.profiles(id) on delete cascade,
    created_at    timestamptz not null default now(),
    revoked_at    timestamptz,
    check (shared_by <> grantee_id)
);
create unique index if not exists teleconsult_shares_active_key
    on public.teleconsult_transcript_shares (transcript_id, grantee_id) where revoked_at is null;

-- Quem lê a transcrição: o nutricionista da consulta (inclusive rascunho) ou,
-- depois de salva, um profissional com compartilhamento ativo.
create or replace function public.can_read_teleconsult(p_transcript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.teleconsult_transcripts t
        where t.id = p_transcript_id
          and public.acting_member_of(t.clinic_id, array['owner', 'nutritionist'])
          and (t.nutritionist_id = auth.uid()
               or (t.status = 'salva' and exists (
                       select 1 from public.teleconsult_transcript_shares s
                       where s.transcript_id = t.id and s.grantee_id = auth.uid() and s.revoked_at is null)))
    );
$$;

create or replace function public.is_teleconsult_owner(p_transcript_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.teleconsult_transcripts t
        where t.id = p_transcript_id and t.nutritionist_id = auth.uid()
          and public.acting_member_of(t.clinic_id, array['owner', 'nutritionist'])
    );
$$;

alter table public.teleconsult_transcripts enable row level security;
alter table public.teleconsult_transcript_segments enable row level security;
alter table public.teleconsult_transcript_shares enable row level security;

revoke all on public.teleconsult_transcripts from anon, authenticated;
revoke all on public.teleconsult_transcript_segments from anon, authenticated;
revoke all on public.teleconsult_transcript_shares from anon, authenticated;

-- Transcrição: lê quem pode; o dono só mexe no resumo e apaga (Descartar /
-- Excluir). Criar, finalizar e salvar passam pelas RPCs abaixo.
grant select, delete on public.teleconsult_transcripts to authenticated;
grant update (summary, summary_model, summary_generated_at) on public.teleconsult_transcripts to authenticated;

drop policy if exists teleconsult_transcripts_select on public.teleconsult_transcripts;
create policy teleconsult_transcripts_select on public.teleconsult_transcripts for select to authenticated
    using (public.can_read_teleconsult(id));
drop policy if exists teleconsult_transcripts_update on public.teleconsult_transcripts;
create policy teleconsult_transcripts_update on public.teleconsult_transcripts for update to authenticated
    using (public.is_teleconsult_owner(id)) with check (public.is_teleconsult_owner(id));
drop policy if exists teleconsult_transcripts_delete on public.teleconsult_transcripts;
create policy teleconsult_transcripts_delete on public.teleconsult_transcripts for delete to authenticated
    using (public.is_teleconsult_owner(id));

-- Trechos: lê quem lê a transcrição; só o dono insere, só durante a chamada
-- e só com o aceite do paciente valendo.
grant select, insert on public.teleconsult_transcript_segments to authenticated;

drop policy if exists teleconsult_segments_select on public.teleconsult_transcript_segments;
create policy teleconsult_segments_select on public.teleconsult_transcript_segments for select to authenticated
    using (public.can_read_teleconsult(transcript_id));
drop policy if exists teleconsult_segments_insert on public.teleconsult_transcript_segments;
create policy teleconsult_segments_insert on public.teleconsult_transcript_segments for insert to authenticated
    with check (exists (
        select 1 from public.teleconsult_transcripts t
        where t.id = transcript_id and t.status = 'em_andamento'
          and public.is_teleconsult_owner(t.id)
          and public.teleconsult_has_consent(t.appointment_id)
    ));

-- Compartilhamentos: cada lado vê os seus. Escrita só pelas RPCs.
grant select on public.teleconsult_transcript_shares to authenticated;

drop policy if exists teleconsult_shares_select on public.teleconsult_transcript_shares;
create policy teleconsult_shares_select on public.teleconsult_transcript_shares for select to authenticated
    using (grantee_id = auth.uid() or public.is_teleconsult_owner(transcript_id));

-- ----------------------------------------------------------------------------
-- 3. RPCs do nutricionista
-- ----------------------------------------------------------------------------

-- Começa (ou retoma) a transcrição da consulta. Exige o aceite do paciente.
create or replace function public.start_teleconsult_transcript(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments;
    v_t    public.teleconsult_transcripts;
    v_consent uuid;
    v_id   uuid;
begin
    select * into v_appt from public.appointments where id = p_appointment_id;
    if v_appt.id is null or v_appt.nutritionist_id <> auth.uid()
       or not public.acting_member_of(v_appt.clinic_id, array['owner', 'nutritionist']) then
        raise exception 'Só o nutricionista responsável pode transcrever esta consulta.' using errcode = '42501';
    end if;
    if not public.clinic_has_feature(v_appt.clinic_id, 'teleconsulta_transcricao') then
        raise exception 'A transcrição não está disponível no seu plano.' using errcode = '42501';
    end if;
    if not public.teleconsult_has_consent(p_appointment_id) then
        raise exception 'O paciente não autorizou a transcrição.' using errcode = '42501';
    end if;
    select id into v_consent from public.teleconsult_consents
    where appointment_id = p_appointment_id order by decided_at desc, id desc limit 1;

    select * into v_t from public.teleconsult_transcripts where appointment_id = p_appointment_id for update;
    if v_t.id is not null then
        if v_t.status = 'salva' then
            raise exception 'A transcrição desta consulta já foi salva no histórico.';
        end if;
        update public.teleconsult_transcripts
        set status = 'em_andamento', ended_at = null, consent_id = v_consent
        where id = v_t.id;
        return v_t.id;
    end if;

    insert into public.teleconsult_transcripts (appointment_id, clinic_id, patient_id, nutritionist_id, consent_id)
    values (v_appt.id, v_appt.clinic_id, v_appt.patient_id, v_appt.nutritionist_id, v_consent)
    returning id into v_id;
    return v_id;
end;
$$;

-- Fim da chamada: vira rascunho para revisão. Sem nenhum trecho, apaga e
-- devolve false (não há o que revisar).
create or replace function public.finish_teleconsult_transcript(p_transcript_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
    if not public.is_teleconsult_owner(p_transcript_id) then
        raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.teleconsult_transcript_segments where transcript_id = p_transcript_id) then
        delete from public.teleconsult_transcripts where id = p_transcript_id and status <> 'salva';
        return false;
    end if;
    update public.teleconsult_transcripts
    set status = 'rascunho', ended_at = coalesce(ended_at, now())
    where id = p_transcript_id and status = 'em_andamento';
    return true;
end;
$$;

-- "Salvar no histórico" (ou atualizar o resumo de uma já salva).
create or replace function public.save_teleconsult_transcript(p_transcript_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = public
as $$
begin
    if not public.is_teleconsult_owner(p_transcript_id) then
        raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    if p_summary is not null and jsonb_typeof(p_summary) <> 'object' then
        raise exception 'Resumo inválido.';
    end if;
    update public.teleconsult_transcripts
    set summary = coalesce(p_summary, summary),
        status = 'salva',
        ended_at = coalesce(ended_at, now()),
        saved_at = coalesce(saved_at, now())
    where id = p_transcript_id;
end;
$$;

create or replace function public.share_teleconsult_transcript(p_transcript_id uuid, p_grantee_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_t public.teleconsult_transcripts;
begin
    if not public.is_teleconsult_owner(p_transcript_id) then
        raise exception 'Só o nutricionista da consulta pode compartilhar.' using errcode = '42501';
    end if;
    select * into v_t from public.teleconsult_transcripts where id = p_transcript_id;
    if v_t.status <> 'salva' then
        raise exception 'Salve a transcrição no histórico antes de compartilhar.';
    end if;
    if p_grantee_id = v_t.nutritionist_id or not public.is_clinic_professional(v_t.clinic_id, p_grantee_id) then
        raise exception 'Escolha um nutricionista ativo da clínica.';
    end if;
    insert into public.teleconsult_transcript_shares (transcript_id, clinic_id, shared_by, grantee_id)
    values (v_t.id, v_t.clinic_id, auth.uid(), p_grantee_id)
    on conflict (transcript_id, grantee_id) where revoked_at is null do nothing;
end;
$$;

create or replace function public.revoke_teleconsult_share(p_share_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_transcript uuid;
begin
    select transcript_id into v_transcript from public.teleconsult_transcript_shares where id = p_share_id;
    if v_transcript is null or not public.is_teleconsult_owner(v_transcript) then
        raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    update public.teleconsult_transcript_shares set revoked_at = now()
    where id = p_share_id and revoked_at is null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.teleconsult_has_consent(uuid)                              from public, anon;
revoke execute on function public.teleconsult_consent_state(uuid)                            from public, anon;
revoke execute on function public.portal_teleconsult_consent(uuid, text, text, text)         from public, anon;
revoke execute on function public.can_read_teleconsult(uuid)                                 from public, anon;
revoke execute on function public.is_teleconsult_owner(uuid)                                 from public, anon;
revoke execute on function public.start_teleconsult_transcript(uuid)                         from public, anon;
revoke execute on function public.finish_teleconsult_transcript(uuid)                        from public, anon;
revoke execute on function public.save_teleconsult_transcript(uuid, jsonb)                   from public, anon;
revoke execute on function public.share_teleconsult_transcript(uuid, uuid)                   from public, anon;
revoke execute on function public.revoke_teleconsult_share(uuid)                             from public, anon;

grant execute on function public.teleconsult_has_consent(uuid)                               to authenticated;
grant execute on function public.teleconsult_consent_state(uuid)                             to authenticated;
grant execute on function public.portal_teleconsult_consent(uuid, text, text, text)          to authenticated;
grant execute on function public.can_read_teleconsult(uuid)                                  to authenticated;
grant execute on function public.is_teleconsult_owner(uuid)                                  to authenticated;
grant execute on function public.start_teleconsult_transcript(uuid)                          to authenticated;
grant execute on function public.finish_teleconsult_transcript(uuid)                         to authenticated;
grant execute on function public.save_teleconsult_transcript(uuid, jsonb)                    to authenticated;
grant execute on function public.share_teleconsult_transcript(uuid, uuid)                    to authenticated;
grant execute on function public.revoke_teleconsult_share(uuid)                              to authenticated;

commit;
