-- Migration: Add user preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark')),
ADD COLUMN IF NOT EXISTS theme_color text DEFAULT 'teal' CHECK (theme_color IN ('teal', 'blue'));
