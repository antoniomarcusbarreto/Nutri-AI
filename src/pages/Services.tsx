import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Clock, DollarSign, Lock, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ServiceRow } from '../types/clinical';
import { PageHeader, Card, Button, EmptyState } from '../components/ui';

export const Services: React.FC = () => {
  const { clinic, userRole, isReadOnly } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
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
        setServices(data as ServiceRow[]);
      }
      setLoading(false);
    };

    fetchServices();
  }, [clinic]);

  const canManageServices = userRole === 'owner' || userRole === 'nutritionist';
  const isButtonDisabled = isReadOnly || !canManageServices;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Serviços e Procedimentos"
        description="Gerencie os tipos de consultas e serviços oferecidos."
        actions={
          <Button
            disabled={isButtonDisabled}
            leftIcon={isButtonDisabled ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            title={!canManageServices ? 'Secretárias não podem criar serviços' : isReadOnly ? 'Sistema em modo somente leitura' : ''}
          >
            Novo Serviço
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-sm text-slate-500">
            Carregando serviços...
          </div>
        ) : services.length === 0 ? (
          <EmptyState
            className="col-span-full"
            icon={<Briefcase />}
            title="Nenhum serviço cadastrado"
            description="Cadastre os tipos de consulta e procedimentos que a clínica oferece."
          />
        ) : (
          services.map((service) => (
            <Card
              key={service.id}
              as="article"
              padding="none"
              radius="2xl"
              interactive
              className="overflow-hidden group"
            >
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
                <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Editar serviço ${service.name}`}
                    className="p-2 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-white transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir serviço ${service.name}`}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
