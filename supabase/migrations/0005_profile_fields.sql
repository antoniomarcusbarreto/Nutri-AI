-- Migration 0005: Add profile fields and storage bucket

-- 1. Add fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create Avatars Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for avatars
-- Everyone can read avatars
CREATE POLICY "Avatar images are publicly accessible." 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'avatars' );

-- Users can upload their own avatar
CREATE POLICY "Users can upload their own avatar." 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'avatars' AND auth.uid() = owner );

-- Users can update their own avatar
CREATE POLICY "Users can update their own avatar." 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'avatars' AND auth.uid() = owner );

-- Users can delete their own avatar
CREATE POLICY "Users can delete their own avatar." 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'avatars' AND auth.uid() = owner );
