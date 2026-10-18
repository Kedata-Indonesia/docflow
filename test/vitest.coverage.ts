/**
 * Shared Vitest coverage configuration (issue #174).
 *
 * Thresholds are per package and deliberately a few points below the measured
 * baseline when they were introduced. Raise them as coverage improves — never
 * lower them to make a red build green.
 */
export interface CoverageThresholds {
  lines: number
  statements: number
  branches: number
  functions: number
}

export function coverage(thresholds: CoverageThresholds) {
  return {
    provider: 'v8' as const,
    reporter: ['text-summary', 'json-summary'],
    include: ['src/**/*.{ts,vue}'],
    exclude: ['src/**/__tests__/**', 'src/**/*.d.ts'],
    thresholds,
  }
}
