import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWikiStore } from '../store/useWikiStore'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const navigateToPage = useWikiStore((s) => s.navigateToPage)

  const resolveTarget = (raw: string): string => {
    // [[path|label]] → path ; [[path]] → path
    const pipeIdx = raw.indexOf('|')
    return pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw.trim()
  }

  const displayLabel = (raw: string): string => {
    const pipeIdx = raw.indexOf('|')
    return pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim()
  }

  const handleWikiLink = async (raw: string) => {
    const pageName = resolveTarget(raw)
    const wm = useWikiStore.getState().wikiManager
    if (!wm) return
    // Try exact path first (handles [[wiki/indice_wiki]])
    const exactPath = pageName.endsWith('.md') ? pageName : `${pageName}.md`
    const wikiPath = `wiki/${exactPath}`
    let page = await wm.readPage(wikiPath)
    if (page) {
      navigateToPage(wikiPath)
      return
    }
    // Try as standalone article name in any thematic wiki
    const slug = pageName
      .split('/')
      .pop()!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const wikis = await wm.listThematicWikis()
    for (const wiki of wikis) {
      const path = `${wiki}/${slug}.md`
      page = await wm.readPage(path)
      if (page) {
        navigateToPage(`wiki/${path}`)
        return
      }
    }
  }

  const components = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith('[[') && href?.endsWith(']]')) {
        const raw = href.slice(2, -2)
        return (
          <a
            href="#"
            className="wikilink"
            onClick={(e) => {
              e.preventDefault()
              handleWikiLink(raw)
            }}
          >
            {displayLabel(raw)}
          </a>
        )
      }
      if (
        href &&
        !href.startsWith('http://') &&
        !href.startsWith('https://') &&
        !href.startsWith('mailto:')
      ) {
        return (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigateToPage(href)
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

  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_: string, raw: string) => {
      const pipeIdx = raw.indexOf('|')
      const label = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw.trim()
      return `[${label}]([[${raw}]])`
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
