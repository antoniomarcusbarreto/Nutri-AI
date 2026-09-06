import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/lib/database.types.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Permite descartar variáveis/args prefixados com _ (ex.: destructure de
      // colunas privilegiadas que só queremos remover do objeto).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],

      // eslint-plugin-react-hooks v7: o flat/recommended liga o conjunto de
      // regras do React Compiler como `error`. Este projeto NÃO usa o React
      // Compiler — essas regras dão falso-positivo em padrões legítimos
      // (efeitos de fetch, reset de estado ao trocar de chave, "latest ref",
      // useMemo/useCallback manuais). Mantemos como `warn` (dívida sinalizada,
      // reversível quando o Compiler for adotado) e conservamos as clássicas
      // `rules-of-hooks` e `exhaustive-deps` como `error`.
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
])
