/**
 * WikiMarkdown — renders a markdown string using react-markdown with
 * PostHog-styled component overrides.
 */

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

interface Props {
  content: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-sans font-extrabold text-2xl text-ph-ink mt-6 mb-3 leading-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-sans font-bold text-lg text-ph-ink mt-5 mb-2 leading-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-sans font-semibold text-base text-ph-ink mt-4 mb-1.5">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-sans font-semibold text-sm text-ph-ink mt-3 mb-1">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="font-body text-[15px] text-ph-body leading-relaxed mb-3">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 text-[15px] text-ph-body font-body">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-[15px] text-ph-body font-body">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ph-blue-link hover:underline"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // block code has className like "language-ts"
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <pre className="bg-ph-code-bg text-[#EEEFE9] font-mono text-[13px] p-4 rounded-ph border border-[#3A3C32] overflow-x-auto mb-3 leading-relaxed">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="font-mono text-[12px] bg-ph-surface-soft text-ph-ink px-1.5 py-0.5 rounded-ph-sm border border-ph-border">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <div className="border-l-4 border-ph-yellow bg-yellow-50 px-4 py-3 rounded-r-ph my-4 text-[13px] text-ph-body">
      {children}
    </div>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-[13px] border-collapse border border-ph-border rounded-ph">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-ph-surface-soft">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-sans font-semibold text-ph-ink border-b border-ph-border text-[12px] tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-ph-body border-b border-ph-border-soft">
      {children}
    </td>
  ),
  hr: () => (
    <hr className="border-0 border-t border-ph-border-soft my-6" />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ph-ink">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-ph-body">{children}</em>
  ),
};

export function WikiMarkdown({ content }: Props) {
  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
}
