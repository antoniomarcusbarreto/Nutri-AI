import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

/**
 * Retorna todos os dias necessários para preencher a grade de 7 colunas (Domingo a Sábado)
 * do mês da data especificada, incluindo dias de transição (padding) dos meses anterior e posterior.
 */
export const getDaysInMonth = (date: Date): Date[] => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
};

/**
 * Retorna os 7 dias da semana (Domingo a Sábado) à qual a data informada pertence.
 */
export const getDaysInWeek = (date: Date): Date[] => {
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
};
