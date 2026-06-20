/**
 * CodeViewer — PostHog-styled syntax-highlighted file viewer.
 *
 * Props:
 *   path          string              Repo-relative file path shown in the header
 *   content?      string              Pre-loaded content (skip fetch if provided)
 *   language?     string              Language hint (auto-inferred from path if omitted)
 *   startLine?    number              First line to show in snippet mode (1-based, inclusive)
 *   endLine?      number              Last line to show in snippet mode (1-based, inclusive)
 *   highlightLines? number[]          Lines to highlight (1-based, relative to the full file)
 *   maxHeight?    string | number     CSS max-height for the scrollable code area (default "60vh")
 *   className?    string              Extra Tailwind/CSS classes for the outer wrapper
 *
 * Usage — full file (fetch from server):
 *   <CodeViewer path="src/lib/utils.ts" />
 *
 * Usage — snippet (lines 10–30, highlight line 15):
 *   <CodeViewer path="src/lib/utils.ts" startLine={10} endLine={30} highlightLines={[15]} />
 *
 * Usage — pre-loaded content (no network request):
 *   <CodeViewer path="src/lib/utils.ts" content={code} language="typescript" />
 */

import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { fetchFileContent } from "../lib/fileContent";
import type { FileContentResult } from "../lib/fileContent";

// ── Language normalisation ───────────────────────────────────────────────────
// react-syntax-highlighter (Prism) uses slightly different language keys.

const LANGUAGE_ALIASES: Record<string, string> = {
  tsx: "tsx",
  jsx: "jsx",
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  rust: "rust",
  go: "go",
  shell: "bash",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  dockerfile: "docker",
  makefile: "makefile",
  kotlin: "kotlin",
  swift: "swift",
  ruby: "ruby",
  php: "php",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  vue: "markup",
  text: "text",
};

function normaliseLang(lang: string): string {
  return LANGUAGE_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
}

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    sh: "shell",
    sql: "sql",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    kt: "kotlin",
    swift: "swift",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    vue: "vue",
  };
  return extMap[ext] ?? "text";
}

// ── PostHog dark olive theme for code blocks ─────────────────────────────────
// Matches: bg #23251D, text #EEEFE9, spec section 3.7

const posthogTheme: Record<string, React.CSSProperties> = {
  "code[class*=\"language-\"]": {
    color: "#EEEFE9",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: "13px",
    lineHeight: "1.6",
    background: "none",
  },
  "pre[class*=\"language-\"]": {
    background: "#23251D",
    color: "#EEEFE9",
    margin: 0,
    padding: 0,
    overflow: "auto",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  comment: { color: "#6C6E63", fontStyle: "italic" },
  prolog: { color: "#6C6E63" },
  doctype: { color: "#6C6E63" },
  cdata: { color: "#6C6E63" },
  punctuation: { color: "#BFC1B7" },
  property: { color: "#4DA3F5" },
  tag: { color: "#F54E00" },
  boolean: { color: "#F7A501" },
  number: { color: "#F7A501" },
  constant: { color: "#F7A501" },
  symbol: { color: "#F7A501" },
  deleted: { color: "#CD4239" },
  selector: { color: "#3DAE7E" },
  "attr-name": { color: "#4DA3F5" },
  string: { color: "#3DAE7E" },
  char: { color: "#3DAE7E" },
  builtin: { color: "#3DAE7E" },
  inserted: { color: "#3DAE7E" },
  operator: { color: "#BFC1B7" },
  entity: { color: "#F7A501", cursor: "help" },
  url: { color: "#4DA3F5" },
  variable: { color: "#EEEFE9" },
  atrule: { color: "#7C44A6" },
  "attr-value": { color: "#3DAE7E" },
  function: { color: "#4DA3F5" },
  "class-name": { color: "#F1A82C" },
  keyword: { color: "#7C44A6" },
  regex: { color: "#F7A501" },
  important: { color: "#F7A501", fontWeight: "bold" },
  bold: { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
};

// ── Badge ────────────────────────────────────────────────────────────────────

function LanguageBadge({ lang }: { lang: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide"
      style={{ background: "#2C2C2C", color: "#9B9C92", letterSpacing: "0.04em" }}
    >
      {lang}
    </span>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      className="rounded-b-ph overflow-hidden"
      style={{ background: "#23251D", padding: "16px 20px" }}
      aria-busy="true"
      aria-label="Loading file content…"
    >
      {[80, 60, 90, 45, 70].map((w, i) => (
        <div
          key={i}
          className="mb-2 rounded"
          style={{
            height: "13px",
            width: `${w}%`,
            background: "rgba(238,239,233,0.07)",
            animation: `pulse 1.4s ease-in-out ${i * 0.12}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Error / unavailable state ────────────────────────────────────────────────

function UnavailableState({ message }: { message: string }) {
  return (
    <div
      className="rounded-b-ph flex items-start gap-3 p-4"
      style={{ background: "#23251D", borderTop: "1px solid #3A3C32" }}
    >
      <span style={{ color: "#CD4239", fontSize: "16px", lineHeight: 1 }}>⚠</span>
      <p style={{ color: "#9B9C92", fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CodeViewerProps {
  /** Repo-relative file path, shown in header and used to fetch content. */
  path: string;
  /** Pre-loaded content. If provided, no network request is made. */
  content?: string;
  /** Language identifier. Inferred from `path` extension if omitted. */
  language?: string;
  /** First line to display in snippet mode (1-based, inclusive). */
  startLine?: number;
  /** Last line to display in snippet mode (1-based, inclusive). */
  endLine?: number;
  /** Lines to visually highlight (1-based, relative to the full file). */
  highlightLines?: number[];
  /** CSS max-height for the scrollable code area. Default: "60vh". */
  maxHeight?: string | number;
  /** Extra CSS classes on the outermost wrapper div. */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CodeViewer({
  path,
  content: contentProp,
  language: languageProp,
  startLine,
  endLine,
  highlightLines = [],
  maxHeight = "60vh",
  className = "",
}: CodeViewerProps) {
  const [fetchResult, setFetchResult] = useState<FileContentResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch content from server when no prop is provided.
  useEffect(() => {
    if (contentProp !== undefined) return;

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setFetchResult(null);

    fetchFileContent(path, { signal: controller.signal })
      .then((result) => {
        if (!cancelled) {
          setFetchResult(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchResult({
            path,
            content: "",
            language: "text",
            lines: 0,
            size: 0,
            unavailable: true,
            error: "Unexpected error loading file.",
          });
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, contentProp]);

  // Resolve content + language.
  const rawContent = contentProp ?? fetchResult?.content ?? "";
  const resolvedLanguage =
    languageProp ??
    fetchResult?.language ??
    langFromPath(path);
  const prismLang = normaliseLang(resolvedLanguage);
  const isUnavailable = fetchResult?.unavailable === true;
  const errorMessage = fetchResult?.error;

  // Apply snippet slicing (1-based line numbers).
  const allLines = rawContent.split("\n");
  const snippetMode = startLine !== undefined || endLine !== undefined;
  const sliceStart = snippetMode ? Math.max(0, (startLine ?? 1) - 1) : 0;
  const sliceEnd = snippetMode
    ? Math.min(allLines.length, endLine ?? allLines.length)
    : allLines.length;
  const displayedLines = allLines.slice(sliceStart, sliceEnd);
  const displayedContent = displayedLines.join("\n");

  // Build the highlighted-lines set for react-syntax-highlighter.
  // Convert from file-absolute line numbers → display-relative.
  const relativeHighlights = highlightLines
    .map((n) => n - sliceStart)
    .filter((n) => n >= 1 && n <= displayedLines.length);

  // File name for header.
  const fileName = path.split("/").pop() ?? path;

  return (
    <div
      className={`rounded-ph overflow-hidden ${className}`}
      style={{ border: "1px solid #3A3C32", background: "#23251D" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: "1px solid #3A3C32",
          background: "#1A1C14",
        }}
      >
        {/* File icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6C6E63"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>

        {/* Path */}
        <span
          className="flex-1 truncate"
          title={path}
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: "12px",
            color: "#C4C5BC",
            letterSpacing: "0",
          }}
        >
          {path}
        </span>

        {/* Snippet range indicator */}
        {snippetMode && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "11px",
              color: "#6C6E63",
              flexShrink: 0,
            }}
          >
            L{startLine ?? 1}–{endLine ?? allLines.length}
          </span>
        )}

        {/* Language badge */}
        <LanguageBadge lang={fileName.includes(".") ? resolvedLanguage : prismLang} />

        {/* Truncated warning */}
        {fetchResult?.truncated && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: "#FEF3C7", color: "#92400E" }}
          >
            truncated
          </span>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <LoadingSkeleton />
      ) : isUnavailable ? (
        <UnavailableState message={errorMessage ?? "File content unavailable."} />
      ) : (
        <div style={{ overflowX: "auto", maxHeight, overflowY: "auto" }}>
          <SyntaxHighlighter
            language={prismLang}
            style={posthogTheme}
            showLineNumbers
            startingLineNumber={snippetMode ? (startLine ?? 1) : 1}
            wrapLines
            lineProps={(lineNumber: number) => {
              const isHighlighted = relativeHighlights.includes(lineNumber);
              return {
                style: {
                  display: "block",
                  background: isHighlighted
                    ? "rgba(247,165,1,0.12)"
                    : "transparent",
                  borderLeft: isHighlighted
                    ? "3px solid #F7A501"
                    : "3px solid transparent",
                  paddingLeft: "16px",
                  paddingRight: "20px",
                },
              };
            }}
            lineNumberStyle={{
              minWidth: "3em",
              paddingRight: "1.5em",
              color: "#4B4B4B",
              userSelect: "none",
              textAlign: "right",
            }}
            customStyle={{
              margin: 0,
              padding: "16px 0",
              background: "#23251D",
              fontSize: "13px",
              lineHeight: "1.6",
              minHeight: "4rem",
            }}
          >
            {displayedContent}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
}
