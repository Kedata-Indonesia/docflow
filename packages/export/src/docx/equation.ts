import { Math, TextRun } from 'docx'
import { latexToMath } from 'docx/math'

/**
 * Convert a LaTeX equation to native Word OMML (an editable equation). Returns
 * `null` when the construct is unsupported by docx's converter, so callers can
 * fall back to the italic source text instead of failing the whole export.
 */
export function equationToMath(latex: string): Math | null {
  const source = latex.trim()
  if (!source) return null
  try {
    return new Math({ children: [...latexToMath(source)] })
  } catch {
    return null
  }
}

/** Inline equation child: OMML when possible, italic LaTeX source otherwise. */
export function inlineEquationRuns(latex: string): (Math | TextRun)[] {
  const math = equationToMath(latex)
  return math ? [math] : [new TextRun({ text: latex, italics: true })]
}

/**
 * Display equation children: OMML when possible, plus the derived `(n)` number
 * (C2) as a tab-separated run. The paragraph uses a right tab stop so the
 * number sits at the right edge, matching the editor.
 */
export function displayEquationChildren(latex: string, number?: number): (Math | TextRun)[] {
  const math = equationToMath(latex)
  const children: (Math | TextRun)[] = math ? [math] : [new TextRun({ text: latex, italics: true })]
  if (number) children.push(new TextRun({ text: `\t(${number})` }))
  return children
}
