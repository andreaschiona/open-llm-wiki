# Andrej Karpathy: Killed RAG. Or Did He? The LLM Wiki Pattern

> Andrej Karpathy has proposed a new pattern for building personal knowledge bases with LLMs. Instead of traditional RAG, he suggests using LLMs to compile and maintain a structured wiki. This document compiles his key ideas and the broader discussion around them.

## Overview

On April 3, 2026, Andrej Karpathy (co-founder of OpenAI, former AI Director at Tesla) posted on X about a pattern he calls "LLM Knowledge Bases" or "LLM Wiki." The core insight is that for personal-scale knowledge management, the traditional RAG (Retrieval-Augmented Generation) approach is suboptimal because it requires rediscovering knowledge from scratch on every query.

Karpathy's alternative: instead of retrieving from raw documents at query time, the LLM incrementally builds and maintains a persistent wiki — a structured, interlinked collection of markdown files that sits between the user and the raw sources.

The post received over 1.2 million views and sparked significant discussion about the future of personal knowledge management with AI.

## The Pattern

### Three Layers

Karpathy describes three layers in his system:

1. **Raw Sources**: A collection of original materials (articles, papers, transcripts, notes, images, datasets) stored in a `raw/` directory. These sources are never modified after ingestion. They are the ground truth.

2. **The Wiki**: The LLM reads raw sources and produces structured markdown files — summary pages, encyclopedic articles for concepts/entities, cross-references, and a master index. A single source can touch 10-15 wiki pages at once. Contradictions are flagged.

3. **The Schema**: A configuration document (Karpathy uses CLAUDE.md) that instructs the agent on wiki structure, page format, behavior during ingest, and conflict handling. It's the "operating constitution."

### Three Operations

1. **Ingest**: A new source is placed in `raw/`. The LLM reads it, writes a summary, updates the master index, and **revises every page** of related concepts/entities throughout the entire wiki.

2. **Query**: A question comes in → the LLM searches the index, loads relevant pages, synthesizes an answer from pre-compiled knowledge. If the answer has value, it becomes a new wiki page. Questions make the wiki smarter.

3. **Lint**: Periodic maintenance — scans for contradictions, stale claims, orphan pages, missing concepts, data gaps. The wiki heals itself.

## Key Insights

### Knowledge Compilation vs Retrieval

The fundamental difference between LLM Wiki and RAG:

- **RAG**: Stateless. Every query starts from scratch. The LLM has to find and piece together relevant fragments across documents every time.
- **LLM Wiki**: Stateful. Knowledge is compiled at ingest time. Cross-references already exist. Contradictions are already flagged. Synthesis already reflects everything read.

Karpathy describes this as "compilation at ingest instead of retrieval at query" — the difference between a search engine and an encyclopedia.

### The Maintenance Problem

Karpathy notes that humans abandon wikis because the maintenance burden grows faster than the value. Updating cross-references, keeping summaries current, noting contradictions, maintaining consistency across dozens of pages — this is the "bookkeeping" that kills personal wikis.

LLMs solve this because they don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero.

Karpathy cites Vannevar Bush and the Memex (1945) as inspiration — the vision of a personal knowledge machine is almost a century old, but the LLM finally makes it practical.

### Scale

The pattern works well at moderate scale (100-1000 documents). Karpathy mentions his wiki on a single research topic has grown to ~100 articles and 400,000 words, and he rarely touches it directly. No vector database is needed at this scale.

For enterprise scale with millions of documents, RAG is still the right approach. But for personal knowledge bases, research, and small teams, the LLM Wiki pattern is demonstrably superior.

## LLM Wiki vs RAG

| Aspect | RAG | LLM Wiki |
|--------|-----|----------|
| Primary operation | Retrieval at query | Compilation at ingest |
| State | Stateless (starts fresh each query) | Stateful (knowledge accumulates) |
| Information unit | Document chunk | Structured article |
| Maintenance | N/A | Periodic lint |
| Scale | Millions of documents | Hundreds/thousands |
| Chunking | Required (destroys context) | Not needed |

Karpathy does not claim RAG is dead — it solves real problems at enterprise scales where LLM Wiki cannot operate. But for personal knowledge bases, research, and small teams, the LLM Wiki pattern is demonstrably superior.

## Future: Fine-tuning from the Wiki

Karpathy hints at an endpoint: generating synthetic training data from the wiki to fine-tune models. Knowledge moves from the context window to the model weights. The wiki becomes a dataset waiting to become a model.

## Related Concepts

- Vannevar Bush's Memex (1945)
- Zettelkasten method
- Personal knowledge management (PKM)
- Retrieval-Augmented Generation (RAG)
- AI agents and tool use
- Synthetic data generation

## Discussion

The post generated extensive discussion. Key themes:

- **"RAG is not dead"**: Many commenters noted that RAG and LLM Wiki solve different problems at different scales. LLM Wiki is a personal tool, not an enterprise platform.
- **"This is just compilers"**: Some drew parallels to compilation vs interpretation in programming languages.
- **"The schema is key"**: The CLAUDE.md configuration file is what makes the system work — without clear instructions, the LLM produces inconsistent results.
- **"Missing features"**: Comments noted the absence of RBAC, ACID transactions, audit trails, and concurrency control — features that are essential for enterprise but unnecessary for personal use.

## Sources

- Karpathy's original X post, April 3, 2026
- Karpathy's "LLM Knowledge Bases" gist on GitHub
- Various commentary and analysis posts
