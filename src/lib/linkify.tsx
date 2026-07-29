import type { ReactNode } from "react";

const URL_RE =
  /https?:\/\/[^\s<>"'`)\]]+/gi;

export function linkifyText(text: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE);
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    let href = match[0];
    // Trim trailing punctuation commonly stuck to URLs
    href = href.replace(/[.,;:!?)]+$/g, "");
    nodes.push(
      <a
        key={`u-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-accent underline decoration-accent/40 hover:decoration-accent"
      >
        {href}
      </a>,
    );
    lastIndex = match.index + match[0].length;
    // adjust if we trimmed
    if (href.length < match[0].length) {
      const trimmed = match[0].slice(href.length);
      nodes.push(trimmed);
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
