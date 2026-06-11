import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    env[parts[0].trim()] = parts[1].trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const selectedPatientId = '55279d7f-d449-4e47-997d-c82ad726a7ba';

async function run() {
  console.log('Logging in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'nutricionista01@nutricionista01.com',
    password: '123456'
  });

  if (authError) {
    console.error('Login failed:', authError);
    return;
  }
  console.log('Login successful! User ID:', authData.user.id);

  try {
    console.log('Running query with .headers()...');
    const { data: q2, error: e2 } = await supabase
      .from('patient_exams')
      .select('id, ai_feedback, exam_date, created_at, file_url')
      .eq('patient_id', selectedPatientId)
      .headers({ 'Cache-Control': 'no-cache' });
    console.log('Query completed successfully! Error:', e2);
    console.log('Result length:', q2 ? q2.length : null);
  } catch (err) {
    console.error('Error during query execution:', err);
  }
}

run();
