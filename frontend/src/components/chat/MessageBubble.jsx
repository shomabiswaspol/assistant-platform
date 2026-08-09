import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Bot, User, Copy, Check } from 'lucide-react';
import { useState, useRef } from 'react';
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

function extractLanguage(className) {
  const match = /language-(\w+)/.exec(className || '');
  return match ? match[1] : null;
}

// UI redesign (2026-08-09): per-code-block language label + copy button
// (previously there was only one copy button for the whole message).
// Overrides react-markdown's <pre> rendering — rehype-highlight puts the
// `language-xxx` class on the inner <code>, so we read it off the first
// child rather than the <pre> node itself. Code blocks keep a fixed dark
// chrome regardless of app theme (same convention as ChatGPT/VS
// Code/GitHub) — swapping highlight.js's theme with the app's light/dark
// toggle would need a second, hand-scoped stylesheet with no easy way to
// visually verify it in this environment, so left as-is deliberately.
function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const language = extractLanguage(codeElement?.props?.className);

  function copy() {
    const text = preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-700/50">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
        <span className="font-mono">{language || 'text'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-slate-100 hover:bg-slate-700/60"
          title="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre ref={preRef} {...props} className="!my-0 !rounded-none overflow-x-auto p-3 text-sm">
        {children}
      </pre>
    </div>
  );
}

// Wraps GFM tables in a horizontal-scroll container — wide tables were
// previously unconstrained and could overflow a narrow mobile bubble.
function Table({ children, ...props }) {
  return (
    <div className="overflow-x-auto my-2">
      <table {...props}>{children}</table>
    </div>
  );
}

const MARKDOWN_COMPONENTS = { pre: CodeBlock, table: Table };

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
        <div className={clsx('md-content text-sm leading-relaxed break-words', isUser && '[&_a]:text-white [&_code]:bg-brand-600')}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, rehypeHighlightOptions]]}
            components={MARKDOWN_COMPONENTS}
          >
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
