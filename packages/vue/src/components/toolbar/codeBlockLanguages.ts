/** Languages offered by the code-block picker (all bundled in lowlight/common). */
export interface CodeBlockLanguage {
  id: string
  label: string
  /** Locale key for labels that need translation; proper names omit it. */
  labelKey?: string
}

export const CODE_BLOCK_LANGUAGES: CodeBlockLanguage[] = [
  { id: 'plaintext', label: 'Plain text', labelKey: 'toolbar.plainText' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'csharp', label: 'C#' },
]
