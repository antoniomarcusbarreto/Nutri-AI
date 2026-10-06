import React from 'react';
import { Link } from 'react-router-dom';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle } from 'lucide-react';
import type { CopilotMessage as Msg } from './CopilotProvider';

/** Só links internos do app viram link; qualquer outro vira texto. */
const isInternal = (href?: string) => !!href && href.startsWith('/') && !href.startsWith('//');

function markdownComponents(onNavigate?: () => void): Components {
  return {
    a: ({ href, children }) =>
      isInternal(href) ? (
        <Link
          to={href!}
          onClick={onNavigate}
          className="font-medium text-[#5024fc] underline decoration-[#5024fc]/30 underline-offset-2 hover:decoration-[#5024fc]"
        >
          {children}
        </Link>
      ) : (
        <span>{children}</span>
      ),
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
    h1: ({ children }) => <p className="mt-3 mb-1 font-semibold text-slate-900">{children}</p>,
    h2: ({ children }) => <p className="mt-3 mb-1 font-semibold text-slate-900">{children}</p>,
    h3: ({ children }) => <p className="mt-3 mb-1 font-semibold text-slate-900">{children}</p>,
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs tabular-nums">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-50 text-slate-500">{children}</thead>,
    th: ({ children }) => <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">{children}</th>,
    td: ({ children }) => <td className="border-t border-slate-100 px-2.5 py-1.5 whitespace-nowrap">{children}</td>,
    code: ({ children }) => <code className="rounded bg-slate-100 px-1 text-[0.8em]">{children}</code>,
    img: () => null,
  };
}

export const CopilotMessage: React.FC<{ message: Msg; onNavigate?: () => void }> = ({ message, onNavigate }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#5024fc] px-3.5 py-2 text-sm text-white">
          {message.text}
        </p>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700" role="alert">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{message.text}</p>
      </div>
    );
  }

  return (
    <div className="text-sm leading-relaxed text-slate-700">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents(onNavigate)} skipHtml>
        {message.text}
      </Markdown>
      {message.steps && message.steps.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">Consultei: {message.steps.join(', ')}</p>
      )}
    </div>
  );
};
