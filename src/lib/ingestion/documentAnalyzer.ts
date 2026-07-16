/**
 * Document analysis module — sends raw content to an LLM for structured
 * extraction (summary, concepts, related pages, tags).
 *
 * Extracted from the original IngestionPipeline god class to allow
 * isolated testing with mocked LLM providers.
 */

import type { LLMProvider } from '../llm/provider'

export interface AnalysisResult {
  summary: string
  concepts: Array<{ name: string; description: string }>
  relatedPages: string[]
  tags: string[]
}

const SYSTEM_PROMPT = `You are an LLM Wiki analyst following established wiki conventions.

Analyze the document and return a JSON object with this exact structure:
{
  "summary": "A structured markdown summary (see format below)",
  "concepts": [
    { "name": "Concept Name", "description": "3-5 sentence informative description" }
  ],
  "relatedPages": ["Related Topic 1", "Related Topic 2"],
  "tags": ["tag1", "tag2", "tag3"]
}

The summary MUST use this structure:

## Overview
2-3 paragraphs capturing what this document is about, its scope, and significance.

## Key Facts
A bullet list of specific, verifiable facts. Include dates, numbers, names, concrete claims.

## Key Points
Organized by thematic section with headings (###) and bullet points. Preserve important quotes verbatim.

## Data & Statistics
If the document contains quantitative data, extract it into a list or table.

## Open Questions / Debates
List unresolved questions, conflicting viewpoints, or areas of uncertainty.

Rules:
- Extract ALL important concepts, entities, and definitions
- Be precise with numbers, dates, and facts
- Concepts should be encyclopedic and reusable across pages
- Tags should be lowercase and generic
- CRITICAL: IGNORE PDF technical internals (FlateDecode, DeviceRGB, XObject, PDF/A, font descriptors, compression filters). Extract only the document's actual subject matter.
- If the document is mostly PDF metadata, return summary as "This document appears to contain primarily technical PDF metadata rather than readable content." and concepts as [].`

/**
 * Send a raw document to the LLM and receive a structured analysis.
 */
export async function analyzeDocument(
  llmProvider: LLMProvider,
  rawContent: string,
  title: string,
): Promise<AnalysisResult> {
  const truncated = rawContent.slice(0, 15000)
  const response = await llmProvider.chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze this document titled "${title}":\n\n${truncated}`,
      },
    ],
    temperature: 0.2,
  })

  try {
    const json = response.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    return JSON.parse(json)
  } catch {
    return {
      summary: response.content,
      concepts: [],
      relatedPages: [],
      tags: [],
    }
  }
}
