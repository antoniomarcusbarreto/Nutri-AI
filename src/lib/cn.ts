import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes condicionais (clsx) e resolve conflitos de utilitários Tailwind
 * mantendo a última (tailwind-merge). Usado pelos primitivos de `components/ui`
 * para que um `className` de chamada consiga sobrescrever o default do primitivo
 * (ex.: `<Card radius="2xl" />` ou `className="rounded-2xl"` vencer `rounded-3xl`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
