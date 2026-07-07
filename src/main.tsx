import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Configuração global de mensagens de validação em Português (Brasil)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'invalid',
    (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!target || !target.validity) return;

      // Se o elemento já possui um erro customizado que não seja o nosso padrão, não sobrescrevemos
      if (target.validity.customError && 
          target.validationMessage !== 'Por favor, preencha este campo.' &&
          target.validationMessage !== 'Por favor, insira um endereço de e-mail válido.' &&
          target.validationMessage !== 'Por favor, insira uma URL válida.' &&
          !target.validationMessage.startsWith('Por favor, insira pelo menos') &&
          !target.validationMessage.startsWith('Por favor, insira no máximo') &&
          !target.validationMessage.startsWith('O valor deve ser maior ou igual a') &&
          !target.validationMessage.startsWith('O valor deve ser menor ou igual a') &&
          target.validationMessage !== 'Por favor, selecione um valor válido.' &&
          target.validationMessage !== 'Por favor, insira um valor válido.'
      ) {
        return;
      }

      if (target.validity.valueMissing) {
        target.setCustomValidity('Por favor, preencha este campo.');
      } else if (target.validity.typeMismatch) {
        if (target.type === 'email') {
          target.setCustomValidity('Por favor, insira um endereço de e-mail válido.');
        } else if (target.type === 'url') {
          target.setCustomValidity('Por favor, insira uma URL válida.');
        }
      } else if (target.validity.patternMismatch) {
        target.setCustomValidity(target.title || 'Por favor, insira no formato correto.');
      } else if (target.validity.tooShort) {
        target.setCustomValidity(`Por favor, insira pelo menos ${(target as HTMLInputElement).minLength} caracteres.`);
      } else if (target.validity.tooLong) {
        target.setCustomValidity(`Por favor, insira no máximo ${(target as HTMLInputElement).maxLength} caracteres.`);
      } else if (target.validity.rangeUnderflow) {
        target.setCustomValidity(`O valor deve ser maior ou igual a ${(target as HTMLInputElement).min}.`);
      } else if (target.validity.rangeOverflow) {
        target.setCustomValidity(`O valor deve ser menor ou igual a ${(target as HTMLInputElement).max}.`);
      } else if (target.validity.stepMismatch) {
        target.setCustomValidity('Por favor, selecione um valor válido.');
      } else if (target.validity.badInput) {
        target.setCustomValidity('Por favor, insira um valor válido.');
      }
    },
    true
  );

  const clearValidity = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (target && typeof target.setCustomValidity === 'function') {
      target.setCustomValidity('');
    }
  };

  window.addEventListener('input', clearValidity, true);
  window.addEventListener('change', clearValidity, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

