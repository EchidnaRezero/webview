import { useMemo } from 'react';
import katex from 'katex';

export type SemanticTerm = 'q' | 'k' | 'v' | 'attn' | 'gate' | 'img' | 'txt';

const TERM_CLASSES: SemanticTerm[] = ['q', 'k', 'v', 'attn', 'gate', 'img', 'txt'];

interface MathFormulaProps {
  tex: string;
  display?: boolean;
  className?: string;
  activeTerm?: SemanticTerm | null;
  onHoverTerm?: (term: SemanticTerm | null) => void;
}

export function MathFormula({
  tex,
  display = false,
  className = '',
  activeTerm = null,
  onHoverTerm,
}: MathFormulaProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        trust: (context) => context.command === '\\htmlClass',
        strict: false,
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  const handleMouseMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (!onHoverTerm) return;
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      for (const term of TERM_CLASSES) {
        if (el.classList?.contains(`sem-${term}`)) {
          onHoverTerm(term);
          return;
        }
      }
      el = el.parentElement;
    }
    onHoverTerm(null);
  };

  return (
    <span
      className={`formula-sync ${className}`}
      data-active-term={activeTerm ?? undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHoverTerm?.(null)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
