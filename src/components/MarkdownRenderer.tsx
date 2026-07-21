import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWikiStore } from '../store/useWikiStore'

interface MarkdownRendererProps {
  content: string
  currentPath?: string | null
}

interface WikiLinkInfo {
  raw: string
  target: string
  label: string
}

/** Extract all [[wikilink]] references from markdown content */
function extractWikiLinks(content: string): WikiLinkInfo[] {
  const links: WikiLinkInfo[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]
    const pipeIdx = raw.indexOf('|')
    const target = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw.trim()
    const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim()
    links.push({ raw, target, label })
  }
  return links
}

function resolveRelativePath(basePath: string, target: string): string {
  const parts = basePath.split('/')
  parts.pop()

  if (target.startsWith('./')) {
    target = target.slice(2)
  }

  while (target.startsWith('../')) {
    if (parts.length > 0) parts.pop()
    target = target.slice(3)
  }

  return parts.length > 0 ? [...parts, target].join('/') : target
}

function resolveWikiPath(target: string, currentPath?: string | null): string {
  const pageName = target.endsWith('.md') ? target : `${target}.md`

  if (pageName.startsWith('wiki/')) return pageName

  if (currentPath && (pageName.startsWith('./') || pageName.startsWith('../'))) {
    return resolveRelativePath(currentPath, pageName)
  }

  return `wiki/${pageName}`
}

export function MarkdownRenderer({ content, currentPath }: MarkdownRendererProps) {
  const navigateToPage = useWikiStore((s) => s.navigateToPage)
  const wikiManager = useWikiStore((s) => s.wikiManager)

  // Track which wikilink targets exist (for red-link styling)
  const [pageExists, setPageExists] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    const checkExistence = async () => {
      const links = extractWikiLinks(content)
      if (links.length === 0) {
        setPageExists({})
        return
      }

      const existence: Record<string, boolean> = {}
      const wm = wikiManager
      if (!wm) {
        // No wiki manager yet — assume all exist (default style)
        for (const link of links) {
          existence[link.target] = true
        }
        setPageExists(existence)
        return
      }

      for (const link of links) {
        if (cancelled) return
        const wikiPath = resolveWikiPath(link.target, currentPath)
        try {
          const page = await wm.readPage(wikiPath)
          existence[link.target] = page !== null
        } catch {
          existence[link.target] = false
        }
      }

      if (!cancelled) {
        setPageExists(existence)
      }
    }

    checkExistence()

    return () => {
      cancelled = true
    }
  }, [content, wikiManager, currentPath])

  const handleWikiLink = async (raw: string) => {
    const pipeIdx = raw.indexOf('|')
    const pageName = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw.trim()
    const wikiPath = resolveWikiPath(pageName, currentPath)
    navigateToPage(wikiPath)
  }

  const components = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith('wiki://')) {
        const raw = href.slice(7)
        const pipeIdx = raw.indexOf('|')
        const target = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw.trim()
        const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim()
        const exists = pageExists[target]
        return (
          <a
            href="#"
            data-wikilink={resolveWikiPath(target, currentPath)}
            className={`wikilink ${exists === false ? 'wikilink-red' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              handleWikiLink(raw)
            }}
          >
            {label}
          </a>
        )
      }
      if (
        href &&
        !href.startsWith('http://') &&
        !href.startsWith('https://') &&
        !href.startsWith('mailto:')
      ) {
        const resolvedHref = currentPath
          ? resolveRelativePath(currentPath, href)
          : href
        return (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigateToPage(resolvedHref)
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
  }

  // Transform [[wikilinks]] into custom markdown links with wiki:// protocol
  // This way the markdown parser handles nesting correctly
  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_: string, raw: string) => {
      const pipeIdx = raw.indexOf('|')
      const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim()
      return `[${label}](wiki://${raw})`
    },
  )

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
