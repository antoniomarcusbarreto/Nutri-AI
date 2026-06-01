import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Users, Settings, LogOut, Apple, Shield, DollarSign, FileText, Activity, ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { signOut, clinic, profile, userRole } = useAuth();

  interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<any>;
    roles?: ('owner' | 'nutritionist' | 'secretary')[];
  }

  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Acompanhamento', href: '/acompanhamento', icon: Activity },
    { name: 'Agenda', href: '/agenda', icon: Calendar },
    { name: 'Consultas', href: '/consultas', icon: FileText },
    { name: 'Exames', href: '/exames', icon: ClipboardList, roles: ['owner', 'nutritionist'] },
    { name: 'Financeiro', href: '/financeiro', icon: DollarSign },
    { name: 'Pacientes', href: '/pacientes', icon: Users },
    { name: 'Planos Alimentares', href: '/planos', icon: Apple },
  ];

  const classNames = (...classes: string[]) => {
    return classes.filter(Boolean).join(' ');
  };

  const getSidebarTheme = () => {
    const themeColor = profile?.theme_color || 'white';

    if (themeColor === 'blue') {
      return {
        container: 'bg-blue-800 border-r-0 text-white',
        border: 'border-b border-blue-700/20',
        logoText: 'text-white',
        logoIcon: 'text-blue-200',
        activeItem: 'bg-blue-700/60 text-white',
        inactiveItem: 'text-blue-100 hover:bg-blue-700/40 hover:text-white',
        itemIconActive: 'text-white',
        itemIconInactive: 'text-blue-300 group-hover:text-white'
      };
    }

    if (themeColor === 'teal') {
      return {
        container: 'bg-[#115e59] border-r-0 text-white', // teal-800 (Turquesa original)
        border: 'border-b border-teal-700/20',
        logoText: 'text-white',
        logoIcon: 'text-teal-200',
        activeItem: 'bg-teal-700/60 text-white',
        inactiveItem: 'text-teal-100 hover:bg-teal-700/40 hover:text-white',
        itemIconActive: 'text-white',
        itemIconInactive: 'text-teal-300 group-hover:text-white'
      };
    }

    if (themeColor === 'dark') {
      return {
        container: 'bg-[#1a1a1a] border-r border-[#333333] text-slate-100', // Grafite e preto profundo
        border: 'border-b border-[#333333]/60',
        logoText: 'text-slate-100 font-extrabold',
        logoIcon: 'text-primary-400',
        activeItem: 'bg-[#242424] text-primary-400 font-bold border-l-4 border-primary-500 rounded-r-xl rounded-l-none',
        inactiveItem: 'text-slate-400 hover:bg-[#242424]/60 hover:text-primary-400 transition-all',
        itemIconActive: 'text-primary-400',
        itemIconInactive: 'text-slate-500 group-hover:text-primary-400 transition-all'
      };
    }

    // Default 'white' / Claro
    return {
      container: 'bg-white border-r border-slate-200 text-slate-700',
      border: 'border-b border-slate-100',
      logoText: 'text-slate-900',
      logoIcon: 'text-primary-600',
      activeItem: 'bg-primary-50 text-primary-700',
      inactiveItem: 'text-slate-700 hover:bg-slate-50 hover:text-primary-600',
      itemIconActive: 'text-primary-600',
      itemIconInactive: 'text-slate-400 group-hover:text-primary-600'
    };
  };

  const theme = getSidebarTheme();

  return (
    <div className={`flex h-full w-64 flex-col ${theme.container} transition-colors duration-200`}>
      <div className={`flex h-16 shrink-0 items-center px-6 ${theme.border}`}>
        <Apple className={`h-8 w-8 ${theme.logoIcon}`} />
        <span className={`ml-3 text-xl font-semibold ${theme.logoText} tracking-tight`}>NutriAI</span>
      </div>
      <nav className="flex flex-1 flex-col px-4 pt-6 pb-4">
        <ul role="list" className="flex flex-1 flex-col justify-between h-full">
          {/* Top navigation items */}
          <div className="space-y-1">
            {/* If superadmin, show Painel Master as the top primary item! */}
            {profile?.is_superadmin && (
              <li>
                <Link
                  to="/admin"
                  className={classNames(
                    location.pathname.startsWith('/admin') ? theme.activeItem : theme.inactiveItem,
                    'group flex gap-x-3 rounded-md p-3 text-sm font-medium leading-6 transition-colors duration-200'
                  )}
                >
                  <Shield
                    className={classNames(
                      location.pathname.startsWith('/admin') ? theme.itemIconActive : theme.itemIconInactive,
                      'h-5 w-5 shrink-0 transition-colors duration-200'
                    )}
                    aria-hidden="true"
                  />
                  Painel Master
                </Link>
              </li>
            )}

            {/* If normal clinic user, show clinic-specific items */}
            {clinic && navigation
              .filter(item => !item.roles || (userRole && item.roles.includes(userRole)))
              .map((item) => {
                const isActive = location.pathname.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={classNames(
                      isActive ? theme.activeItem : theme.inactiveItem,
                      'group flex gap-x-3 rounded-md p-3 text-sm font-medium leading-6 transition-colors duration-200'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        isActive ? theme.itemIconActive : theme.itemIconInactive,
                        'h-5 w-5 shrink-0 transition-colors duration-200'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </div>

          {/* Bottom navigation items */}
          <div className="space-y-1 mt-auto border-t pt-4 border-slate-200/20">
            <li>
              <Link
                to="/settings"
                className={classNames(
                  location.pathname.startsWith('/settings') ? theme.activeItem : theme.inactiveItem,
                  'group flex gap-x-3 rounded-md p-3 text-sm font-medium leading-6 transition-colors duration-200'
                )}
              >
                <Settings className={classNames(
                  location.pathname.startsWith('/settings') ? theme.itemIconActive : theme.itemIconInactive,
                  'h-5 w-5 shrink-0 transition-colors duration-200'
                )} aria-hidden="true" />
                Configurações
              </Link>
            </li>
            <li>
              <button
                onClick={signOut}
                className="w-full group flex gap-x-3 rounded-md p-3 text-sm font-medium leading-6 text-red-600 hover:bg-red-50 transition-colors duration-200"
              >
                <LogOut className="h-5 w-5 shrink-0 text-red-500 group-hover:text-red-600" aria-hidden="true" />
                Sair
              </button>
            </li>
          </div>
        </ul>
      </nav>
    </div>
  );
};
