import { logger } from './logger'

const REPO_OWNER = 'andreaschiona'
const REPO_NAME = 'open-llm-wiki'

async function getGitHubToken(): Promise<string | null> {
  try {
    const { useConfigStore } = await import('../../store/useConfigStore')
    const store = useConfigStore.getState()
    if (store.githubToken) return store.githubToken
  } catch { /* store not available */ }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GITHUB_TOKEN) {
    return import.meta.env.VITE_GITHUB_TOKEN as string
  }
  try {
    return localStorage.getItem('github_token')
  } catch {
    return null
  }
}

export async function reportError(error: Error, context?: Record<string, unknown>): Promise<void> {
  const title = `[auto] ${error.message}`
  const body = [
    `**Time:** ${new Date().toISOString()}`,
    `**Error:** \`${error.message}\``,
    `**Stack:**`,
    '```',
    error.stack || 'N/A',
    '```',
    context ? `**Context:**\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`` : '',
  ].join('\n')

  logger.error('ErrorReporter', `Attempting to create GitHub issue: ${title}`)

  const token = await getGitHubToken()
  if (!token) {
    logger.warn('ErrorReporter', 'No GitHub token available — set VITE_GITHUB_TOKEN env or localStorage github_token')
    return
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title,
        body,
        labels: ['bug', 'auto-reported'],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      logger.error('ErrorReporter', `GitHub API error ${res.status}: ${errText}`)
    } else {
      const data = await res.json()
      logger.info('ErrorReporter', `Issue created: ${data.html_url}`)
    }
  } catch (err) {
    logger.error('ErrorReporter', 'Failed to create GitHub issue', err)
  }
}
