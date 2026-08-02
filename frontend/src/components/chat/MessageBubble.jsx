import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Bot, User, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

// rehype-highlight bundles ALL highlight.js languages by default (~500kB).
// Pin to a common subset — coding-assistant replies rarely need the full
// 190-language set, and this cuts the shipped bundle drastically.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

const HLJS_LANGUAGES = { javascript, typescript, python, bash, json, xml, css, sql, yaml, dockerfile };
const rehypeHighlightOptions = { languages: HLJS_LANGUAGES };

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 rounded p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function MessageBubble({ role, content, provider, model, createdAt }) {
  const isUser = role === 'user';
  return (
    <div className={clsx('flex gap-3 py-3', isUser && 'flex-row-reverse')}>
      <div
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        )}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={clsx('group relative max-w-[75%] rounded-2xl px-4 py-2.5', isUser
        ? 'bg-brand-500 text-white rounded-tr-sm'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-sm')}
      >
        {!isUser && <CopyButton text={content} />}
        <div className={clsx('md-content text-sm leading-relaxed', isUser && '[&_a]:text-white [&_code]:bg-brand-600')}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, rehypeHighlightOptions]]}>
            {content}
          </ReactMarkdown>
        </div>
        {(provider || createdAt) && (
          <div className={clsx('mt-1 flex items-center gap-2 text-[11px]', isUser ? 'text-brand-100' : 'text-slate-400 dark:text-slate-500')}>
            {provider && (
              <span className={clsx('rounded px-1.5 py-0.5', isUser ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700')}>
                {provider}{model ? ` / ${model}` : ''}
              </span>
            )}
            {createdAt && <span>{new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
