import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWikiStore } from '../store/useWikiStore'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const navigateToPage = useWikiStore(s => s.navigateToPage)

  const handleWikiLink = (pageName: string) => {
    const slug = pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const categories = ['entities', 'concepts', 'summaries', 'queries']
    for (const cat of categories) {
      const path = `${cat}/${slug}.md`
      navigateToPage(path)
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
            onClick={(e) => { e.preventDefault(); handleWikiLink(pageName) }}
          >
            {pageName}
          </a>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    },
  }

  const processedContent = content.replace(/\[\[([^\]]+)\]\]/g, (_: string, name: string) => {
    return `[${name}]([[${name}]])`
  })

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
