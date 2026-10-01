/** Regra de senha do NutriAI (mesma das edge functions): 8+ caracteres, uma maiúscula e um número. */
export const PASSWORD_RULES = [
  { id: 'len', label: '8+ caracteres', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: '1 letra maiúscula', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', label: '1 número', test: (p: string) => /\d/.test(p) },
] as const;

export const isStrongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
