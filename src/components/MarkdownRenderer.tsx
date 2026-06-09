import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWikiStore } from '../store/useWikiStore'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const navigateToPage = useWikiStore((s) => s.navigateToPage)

  const handleWikiLink = async (pageName: string) => {
    const slug = pageName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const wm = useWikiStore.getState().wikiManager
    if (!wm) return
    // Try direct path first (wiki/[wiki]/[article].md)
    const directPath = `wiki/${slug}.md`
    let page = await wm.readPage(directPath)
    if (page) {
      navigateToPage(directPath)
      return
    }
    // Search across all thematic wikis
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
        const pageName = href.slice(2, -2)
        return (
          <a
            href="#"
            className="wikilink"
            onClick={(e) => {
              e.preventDefault()
              handleWikiLink(pageName)
            }}
          >
            {pageName}
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
    (_: string, name: string) => {
      return `[${name}]([[${name}]])`
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
