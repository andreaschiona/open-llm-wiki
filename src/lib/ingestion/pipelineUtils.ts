/**
 * Shared utilities for the ingestion pipeline.
 *
 * Extracted from the original IngestionPipeline god class to enable
 * isolated testing and reuse.
 */

import type { RoutingRule } from '../../types'

/**
 * Sanitise a string for use as a filename: lowercase, replace non-alphanumeric
 * sequences with hyphens, strip leading/trailing hyphens.
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Detect the raw-file category from a source URL or filename.
 */
export function detectRawCategory(source: string): string {
  const url = source.toLowerCase()
  const filename = source.split('/').pop()?.toLowerCase() || ''

  let hostname = ''
  try {
    hostname = new URL(source).hostname.toLowerCase()
  } catch {
    hostname = ''
  }
  const isGitHubHost =
    hostname === 'github.com' || hostname.endsWith('.github.com')

  if (filename.endsWith('.pdf')) return 'pdfs'
  if (
    filename.endsWith('.mp3') ||
    filename.endsWith('.wav') ||
    filename.endsWith('.ogg')
  )
    return 'audio'
  if (
    isGitHubHost ||
    filename.endsWith('.py') ||
    filename.endsWith('.js') ||
    filename.endsWith('.rs')
  )
    return 'code'
  if (
    filename.endsWith('.json') ||
    filename.endsWith('.csv') ||
    filename.endsWith('.sql')
  )
    return 'data'
  if (filename.endsWith('.txt') || filename.endsWith('.md')) return 'meetings'
  if (
    url.includes('chat') ||
    url.includes('slack') ||
    url.includes('discord')
  )
    return 'chat'
  return 'other'
}

/**
 * Detect the target thematic wiki from source URL and LLM-derived tags.
 *
 * Accepts an optional `rules` array of RoutingRule for configurable routing.
 * If rules are provided, the first matching rule determines the target.
 * If no rule matches (or no rules are provided), falls back to the built-in
 * heuristic for backward compatibility.
 */
export function detectTargetWiki(
  source: string,
  tags: string[],
  rules?: RoutingRule[],
): string {
  const sourceLower = source.toLowerCase()
  let hostname = ''
  try {
    hostname = new URL(source).hostname.toLowerCase()
  } catch {
    hostname = ''
  }
  const allTags = tags.map((t) => t.toLowerCase())

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      const pattern = rule.pattern.toLowerCase()
      if (
        allTags.some((t) => t.includes(pattern)) ||
        sourceLower.includes(pattern) ||
        hostname.includes(pattern)
      ) {
        return rule.target
      }
    }
  }

  // Built-in heuristic (backward compatibility)
  if (
    allTags.some((t) =>
      [
        'tool',
        'strumento',
        'framework',
        'platform',
        'ide',
        'cli',
        'libreria',
        'software',
      ].includes(t),
    ) ||
    hostname === 'github.com' ||
    hostname.endsWith('.github.com') ||
    sourceLower.includes('tool') ||
    sourceLower.includes('api')
  ) {
    return 'strumenti-ai'
  }
  if (
    allTags.some((t) =>
      [
        'news',
        'notizia',
        'release',
        'announcement',
        'update',
        'model',
        'benchmark',
      ].includes(t),
    )
  ) {
    return 'ai-news'
  }
  return 'concetti'
}

/**
 * Extract and normalise a file extension from a URL or local path.
 */
export function getExtension(source: string): string {
  const parts = source.split('.')
  return parts.length > 1
    ? `.${parts[parts.length - 1].split(/[/?#]/)[0].toLowerCase()}`
    : '.txt'
}
