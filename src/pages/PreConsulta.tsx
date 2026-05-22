import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ClipboardList, CheckCircle } from 'lucide-react';

export const PreConsulta = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');

  const [formData, setFormData] = useState({
    allergies: '',
    dietary_restrictions: '',
    pathologies: '',
    medications: '',
    physical_activity_level: '',
    profession: '',
    sleep_quality: ''
  });

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!token) {
        setError('Token inválido.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_patient_by_token', {
          p_token: token
        });

        if (rpcError) throw rpcError;

        if (data && data.length > 0) {
          const patient = data[0];
          setPatientName(patient.name);
          setFormData({
            allergies: patient.allergies || '',
            dietary_restrictions: patient.dietary_restrictions || '',
            pathologies: patient.pathologies || '',
            medications: patient.medications || '',
            physical_activity_level: patient.physical_activity_level || '',
            profession: patient.profession || '',
            sleep_quality: patient.sleep_quality || ''
          });
        } else {
          setError('Ficha não encontrada ou token expirado.');
        }
      } catch (err) {
        console.error(err);
        setError('Ocorreu um erro ao carregar a ficha.');
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('update_patient_clinical_data', {
        p_token: token,
        p_allergies: formData.allergies,
        p_dietary_restrictions: formData.dietary_restrictions,
        p_pathologies: formData.pathologies,
        p_medications: formData.medications,
        p_physical_activity_level: formData.physical_activity_level,
        p_profession: formData.profession,
        p_sleep_quality: formData.sleep_quality
      });

      if (rpcError) throw rpcError;

      if (data) {
        setSuccess(true);
      } else {
        setError('Não foi possível salvar os dados. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setError('Ocorreu um erro ao salvar a ficha.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Erro ao acessar ficha</h2>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Tudo certo, {patientName}!</h2>
          <p className="text-slate-600">Sua ficha foi preenchida com sucesso e enviada ao profissional. Pode fechar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 bg-primary-600 text-white text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-90" />
            <h1 className="text-2xl font-bold mb-2">Ficha de Anamnese (Pré-Consulta)</h1>
            <p className="text-primary-100">Olá, {patientName}! Por favor, preencha os dados abaixo para adiantar o seu atendimento.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
            {/* Seção 1: Dados Clínicos */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2 mb-4">Dados Clínicos e Restrições</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Alergias e Intolerâncias Alimentares</label>
                  <p className="text-xs text-slate-500 mb-2">Ex: Glúten, Lactose, Oleaginosas, Frutos do Mar.</p>
                  <textarea
                    rows={2}
                    value={formData.allergies}
                    onChange={e => setFormData({...formData, allergies: e.target.value})}
                    placeholder="Se não possuir, deixe em branco ou escreva 'Nenhuma'"
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Restrições Culturais ou Opções Alimentares</label>
                  <p className="text-xs text-slate-500 mb-2">Ex: Vegano, Vegetariano, Kosher, Halal.</p>
                  <input
                    type="text"
                    value={formData.dietary_restrictions}
                    onChange={e => setFormData({...formData, dietary_restrictions: e.target.value})}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Patologias ou Doenças Crônicas</label>
                  <p className="text-xs text-slate-500 mb-2">Ex: Diabetes Tipo 1/2, Hipertensão, Gastrite, Síndrome do Intestino Irritável.</p>
                  <textarea
                    rows={2}
                    value={formData.pathologies}
                    onChange={e => setFormData({...formData, pathologies: e.target.value})}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Uso de Medicamentos / Suplementos Atuais</label>
                  <textarea
                    rows={2}
                    value={formData.medications}
                    onChange={e => setFormData({...formData, medications: e.target.value})}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2: Hábitos e Estilo de Vida */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-2 mb-4">Hábitos e Estilo de Vida</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Atividade Física *</label>
                  <select
                    required
                    value={formData.physical_activity_level}
                    onChange={e => setFormData({...formData, physical_activity_level: e.target.value})}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="" disabled>Selecione...</option>
                    <option value="Sedentário">Sedentário (Nenhuma atividade física)</option>
                    <option value="Levemente Ativo">Levemente Ativo (Exercício leve 1-3 dias/semana)</option>
                    <option value="Moderadamente Ativo">Moderadamente Ativo (Exercício moderado 3-5 dias/semana)</option>
                    <option value="Muito Ativo">Muito Ativo (Exercício intenso 6-7 dias/semana)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Profissão / Rotina de Trabalho *</label>
                  <p className="text-xs text-slate-500 mb-2">Fica mais tempo sentado, em pé, caminhando?</p>
                  <input
                    type="text"
                    required
                    value={formData.profession}
                    onChange={e => setFormData({...formData, profession: e.target.value})}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Qualidade do Sono *</label>
                  <p className="text-xs text-slate-500 mb-2">Quantas horas por noite? Acorda descansado?</p>
                  <input
                    type="text"
                    required
                    value={formData.sleep_quality}
                    onChange={e => setFormData({...formData, sleep_quality: e.target.value})}
                    placeholder="Ex: 6h por noite, acordo cansado"
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-8 py-3 text-base font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-500 transition-colors disabled:opacity-50"
              >
                {saving ? 'Enviando...' : 'Finalizar Ficha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
