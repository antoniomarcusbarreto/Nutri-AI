import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Clock, DollarSign, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const Services: React.FC = () => {
  const { clinic, userRole, isReadOnly } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinic) return;

    const fetchServices = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('clinic_id', clinic.id)
        .order('name');
        
      if (!error && data) {
        setServices(data);
      }
      setLoading(false);
    };

    fetchServices();
  }, [clinic]);

  const canManageServices = userRole === 'owner' || userRole === 'nutritionist';
  const isButtonDisabled = isReadOnly || !canManageServices;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Serviços e Procedimentos</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os tipos de consultas e serviços oferecidos.</p>
        </div>
        <button 
          disabled={isButtonDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!canManageServices ? 'Secretárias não podem criar serviços' : isReadOnly ? 'Sistema em modo somente leitura' : ''}
        >
          {isButtonDisabled ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
          Novo Serviço
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-sm text-slate-500">
            Carregando serviços...
          </div>
        ) : services.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-slate-500">
            Nenhum serviço cadastrado.
          </div>
        ) : (
          services.map((service) => (
            <div key={service.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 leading-tight">{service.name}</h3>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize">
                    {service.modality}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span>{service.duration_minutes} minutos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                    <span>R$ {service.price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {/* Only show actions if user has permission */}
              {canManageServices && !isReadOnly && (
                <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-slate-400 hover:text-primary-600 transition-colors">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button className="text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
