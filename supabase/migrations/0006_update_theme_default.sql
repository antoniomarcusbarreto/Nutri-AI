-- Migration 0006: Update default theme color to white

-- Remove the old check constraint first
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_theme_color_check;

-- Change the default value to 'white'
ALTER TABLE public.profiles 
ALTER COLUMN theme_color SET DEFAULT 'white';

-- Add the new check constraint
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_theme_color_check 
CHECK (theme_color IN ('teal', 'blue', 'white', 'dark'));
