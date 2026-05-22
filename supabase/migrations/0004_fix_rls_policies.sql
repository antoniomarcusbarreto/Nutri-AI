-- Fix Infinite Recursion and missing policies

-- 1. Create a security definer function to avoid infinite recursion on clinic_members
create or replace function public.get_my_clinics()
returns setof uuid
language sql
security definer
set search_path = public
as $$
    select clinic_id from public.clinic_members where user_id = auth.uid();
$$;

-- 2. Drop recursive and broken policies
drop policy if exists "Membros veem a equipe da clínica" on public.clinic_members;
drop policy if exists "Membros veem sua clínica" on public.clinics;

-- 3. Fix Clinics Policies
-- SELECT: Owner always sees their clinic, or members see their clinic using the helper function
create policy "Usuários veem clínicas onde são owner ou membro"
    on public.clinics for select using (
        owner_id = auth.uid() OR 
        id in (select public.get_my_clinics())
    );

-- INSERT: User can create a clinic as long as they are the owner
create policy "Usuários criam suas próprias clínicas"
    on public.clinics for insert with check (
        owner_id = auth.uid()
    );

-- UPDATE: Only owner can update the clinic
create policy "Owners atualizam suas clínicas"
    on public.clinics for update using (
        owner_id = auth.uid()
    );

-- 4. Fix Clinic Members Policies
-- SELECT: Members can see everyone in their clinics without triggering recursion
create policy "Membros veem a equipe da clínica"
    on public.clinic_members for select using (
        clinic_id in (select public.get_my_clinics())
    );

-- INSERT: Only the clinic owner can add members (including themselves during signup)
create policy "Owners podem adicionar membros"
    on public.clinic_members for insert with check (
        exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );

-- UPDATE: Only owner can edit members
create policy "Owners podem atualizar membros"
    on public.clinic_members for update using (
        exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );

-- DELETE: Only owner can remove members
create policy "Owners podem remover membros"
    on public.clinic_members for delete using (
        exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );
