import React, { createContext, useContext, useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 font-sans">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border ${
            toast.type === 'success' 
              ? 'bg-emerald-50 border-emerald-250 text-emerald-800' 
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-250 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-850'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-indigo-500 shrink-0" />
            )}
            <span className="text-sm font-bold text-slate-800">{toast.message}</span>
            <button 
              type="button"
              onClick={() => setToast(null)}
              className={`p-0.5 rounded-lg transition-colors ml-2 ${
                toast.type === 'success' 
                  ? 'hover:bg-emerald-100 text-emerald-500' 
                  : toast.type === 'error'
                  ? 'hover:bg-rose-100 text-rose-500'
                  : 'hover:bg-indigo-150 text-indigo-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
};
