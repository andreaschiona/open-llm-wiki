import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'
import { useWikiStore } from '../store/useWikiStore'
import { useConfigStore } from '../store/useConfigStore'
import { createProvider } from '../lib/llm/providerFactory'
import { MarkdownRenderer } from './MarkdownRenderer'

const SAFETY_PATTERNS = [
  /user safety/i,
  /content.filter/i,
  /i'm sorry,? i cannot/i,
  /i cannot (answer|respond|complete)/i,
  /this (content|request) (violates|has been flagged)/i,
  /as an ai (assistant|model).*cannot/i,
  /i am (not able|unable) to/i,
  /request blocked/i,
]

function isSafetyBlocked(content: string): boolean {
  const short = content.length < 120
  return short && SAFETY_PATTERNS.some((p) => p.test(content))
}

export function ChatInterface() {
  const { messages, isStreaming, addMessage, clearMessages, setIsStreaming } =
    useChatStore()
  const { wikiIndex, wikiManager } = useWikiStore()
  const { getActiveProvider } = useConfigStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getContextFromWiki = async (query: string): Promise<string> => {
    const relevantEntries = wikiIndex.search(query)
    let context = ''

    for (const entry of relevantEntries.slice(0, 5)) {
      if (wikiManager) {
        const page = await wikiManager.readPage(entry.path)
        if (page) {
          context += `\n\n## ${entry.title}\n${page.content.slice(0, 2000)}`
        }
      }
    }

    return context
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return

    const userMsg = input.trim()
    setInput('')

    const activeConfig = getActiveProvider()
    if (!activeConfig) {
      addMessage({
        role: 'assistant',
        content:
          'No LLM provider configured. Go to Settings to set up a provider.',
        timestamp: new Date().toISOString(),
      })
      return
    }

    addMessage({
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString(),
    })

    setIsStreaming(true)

    try {
      const provider = createProvider(activeConfig)
      const wikiContext = await getContextFromWiki(userMsg)

      if (!wikiContext) {
        const allEntries = wikiIndex.getEntries()
        if (allEntries.length === 0) {
          addMessage({
            role: 'assistant',
            content:
              'Il wiki è vuoto. Aggiungi articoli tramite la sezione Ingestion prima di fare domande.',
            timestamp: new Date().toISOString(),
          })
          return
        }
      }

      const systemPrompt = `You are a Wiki assistant. Answer questions using the provided wiki context.
Always cite your sources using [Source: PageName] format.
If the answer isn't in the context, say so clearly.

Wiki context:
${wikiContext || 'No relevant wiki pages found.'}`

      let fullResponse = ''
      addMessage({
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      })

      const response = await provider.streamChat(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-10).map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            { role: 'user', content: userMsg },
          ],
          stream: true,
        },
        (chunk) => {
          fullResponse += chunk
          const msgs = useChatStore.getState().messages
          const lastIdx = msgs.length - 1
          if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
            useChatStore.setState({
              messages: msgs.map((m, i) =>
                i === lastIdx ? { ...m, content: fullResponse } : m,
              ),
            })
          }
        },
      )

      const finalContent = response.content
      if (finalContent && isSafetyBlocked(finalContent)) {
        const msgs = useChatStore.getState().messages
        const lastIdx = msgs.length - 1
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          useChatStore.setState({
            messages: msgs.map((m, i) =>
              i === lastIdx
                ? {
                    ...m,
                    content:
                      'Il provider LLM ha bloccato la risposta per motivi di sicurezza. Prova a riformulare la domanda o verifica che il contenuto del wiki non contenga informazioni problematiche.',
                  }
                : m,
            ),
          })
        }
        return
      }

      const finalMessages = useChatStore.getState().messages
      const lastIdx = finalMessages.length - 1
      if (lastIdx >= 0 && finalMessages[lastIdx].role === 'assistant') {
        useChatStore.setState({
          messages: finalMessages.map((m, i) =>
            i === lastIdx ? { ...m, content: finalContent } : m,
          ),
        })
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h2>Chat with Wiki</h2>
        <button className="btn-small" onClick={clearMessages}>
          Clear
        </button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask questions about your wiki content.</p>
            <p>
              The assistant will search the wiki for relevant context and cite
              its sources.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-role">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="chat-message-content">
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
            <div className="chat-message-time">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your wiki..."
          rows={2}
          disabled={isStreaming}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
