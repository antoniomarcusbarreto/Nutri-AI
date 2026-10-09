-- ============================================================================
-- Migration 0033 — Ficha de saúde (pré-consulta) passa para o Portal do Paciente
-- ============================================================================
--
-- Antes: a equipe copiava um link público /ficha/:token e o paciente preenchia
-- sem login (RPCs anônimas get_patient_by_token / update_patient_clinical_data).
-- Agora: o paciente preenche a ficha dentro do portal, logado. O link público
-- deixa de existir — quem tinha o token não lê nem altera mais dados de saúde.
--
-- Front-end: /portal/ficha (PortalHealthForm), Dashboard e Pacientes sem o
-- botão de copiar link. Publicar JUNTO com o front.
-- ============================================================================

begin;

-- O paciente grava a própria ficha (só com o acesso vigente).
create or replace function public.portal_save_health(
    p_allergies text, p_dietary_restrictions text, p_pathologies text, p_medications text,
    p_physical_activity_level text, p_profession text, p_sleep_quality text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
begin
    if v_pid is null or not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    if nullif(trim(p_physical_activity_level), '') is null
       or nullif(trim(p_profession), '') is null
       or nullif(trim(p_sleep_quality), '') is null then
        raise exception 'Preencha atividade física, rotina de trabalho e sono.';
    end if;

    insert into public.patient_health (patient_id, allergies, dietary_restrictions, pathologies, medications,
                                       physical_activity_level, profession, sleep_quality, updated_at)
    values (v_pid, left(trim(p_allergies), 1000), left(trim(p_dietary_restrictions), 1000), left(trim(p_pathologies), 1000),
            left(trim(p_medications), 1000), left(trim(p_physical_activity_level), 100), left(trim(p_profession), 500),
            left(trim(p_sleep_quality), 500), now())
    on conflict (patient_id) do update set
        allergies               = excluded.allergies,
        dietary_restrictions    = excluded.dietary_restrictions,
        pathologies             = excluded.pathologies,
        medications             = excluded.medications,
        physical_activity_level = excluded.physical_activity_level,
        profession              = excluded.profession,
        sleep_quality           = excluded.sleep_quality,
        updated_at              = now();
end;
$$;

revoke execute on function public.portal_save_health(text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.portal_save_health(text, text, text, text, text, text, text) to authenticated;

-- Fim do link público da ficha.
drop function if exists public.get_patient_by_token(uuid);
drop function if exists public.update_patient_clinical_data(uuid, text, text, text, text, text, text, text);

commit;
