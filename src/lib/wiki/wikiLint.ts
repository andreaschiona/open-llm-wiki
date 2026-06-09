import { WikiManager } from './wikiManager'
import type { LintIssue, LintResult, LintFixResult } from '../../types'

export class WikiLint {
  private wikiManager: WikiManager
  private onProgress?: (step: string, current: number, total: number) => void

  constructor(
    wikiManager: WikiManager,
    onProgress?: (step: string, current: number, total: number) => void,
  ) {
    this.wikiManager = wikiManager
    this.onProgress = onProgress
  }

  async runLint(): Promise<LintResult> {
    const issues: LintIssue[] = []

    const brokenLinkIssues = await this.checkBrokenLinks()
    issues.push(...brokenLinkIssues)

    const duplicateIssues = await this.checkDuplicates()
    issues.push(...duplicateIssues)

    const contradictionIssues = await this.checkContradictions()
    issues.push(...contradictionIssues)

    const schemaIssues = await this.checkSchema()
    issues.push(...schemaIssues)

    const totalFiles = (await this.wikiManager.listAllWikiFiles()).length

    const stats = {
      totalFiles,
      brokenLinks: brokenLinkIssues.length,
      duplicates: duplicateIssues.length,
      contradictions: contradictionIssues.length,
      schemaViolations: schemaIssues.length,
    }

    return {
      passed: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
      stats,
    }
  }

  private async checkBrokenLinks(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const files = await this.wikiManager.listAllWikiFiles()
    const existingPaths = new Set<string>()

    for (const f of files) {
      const clean = f.replace(/\.md$/i, '').toLowerCase()
      existingPaths.add(clean)
      existingPaths.add(f.toLowerCase())
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      this.onProgress?.('broken-links', i + 1, files.length)
      const page = await this.wikiManager.readPage(file)
      if (!page) continue

      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g
      let match: RegExpExecArray | null
      while ((match = wikiLinkRegex.exec(page.content)) !== null) {
        const target = match[1].trim()
        const targetSlug = target
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        const targetPath = `pages/${targetSlug}`
        if (
          !existingPaths.has(targetPath) &&
          !existingPaths.has(targetPath + '.md')
        ) {
          issues.push({
            type: 'broken-link',
            severity: 'error',
            file,
            message: `Broken wiki link: [[${target}]]`,
            detail: `Target page "${target}" (${targetPath}.md) does not exist in wiki/pages/`,
          })
        }
      }

      const mdLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g
      while ((match = mdLinkRegex.exec(page.content)) !== null) {
        const target = match[2].trim()
        const targetLower = target.toLowerCase()
        if (!existingPaths.has(targetLower)) {
          issues.push({
            type: 'broken-link',
            severity: 'error',
            file,
            message: `Broken markdown link: [${match[1]}](${target})`,
            detail: `Target file "${target}" does not exist`,
          })
        }
      }
    }

    return issues
  }

  private async checkDuplicates(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const files = await this.wikiManager.listAllWikiFiles()

    const titles = new Map<string, string[]>()
    for (const file of files) {
      const page = await this.wikiManager.readPage(file)
      if (!page) continue
      const title = page.meta.title.toLowerCase().trim()
      if (!titles.has(title)) {
        titles.set(title, [])
      }
      titles.get(title)!.push(file)
    }

    for (const [title, paths] of titles) {
      if (paths.length > 1) {
        issues.push({
          type: 'duplicate',
          severity: 'warning',
          file: paths[0],
          message: `Duplicate page title: "${title}"`,
          detail: `Pages with same title: ${paths.join(', ')}. Consider merging.`,
        })
      }
    }

    const nameClusters = new Map<string, string[]>()
    for (const file of files) {
      const baseName = file.split('/').pop()?.replace(/\.md$/i, '') || ''
      const slug = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (!nameClusters.has(slug)) {
        nameClusters.set(slug, [])
      }
      nameClusters.get(slug)!.push(file)
    }

    for (const [, paths] of nameClusters) {
      if (paths.length > 1) {
        issues.push({
          type: 'duplicate',
          severity: 'info',
          file: paths[0],
          message: `Similar file names detected`,
          detail: `Files with similar names: ${paths.join(', ')}. These may be duplicates.`,
        })
      }
    }

    return issues
  }

  private async checkContradictions(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const files = await this.wikiManager.listAllWikiFiles()

    for (let i = 0; i < files.length; i++) {
      this.onProgress?.('contradictions', i + 1, files.length)
      const pageA = await this.wikiManager.readPage(files[i])
      if (!pageA) continue

      for (let j = i + 1; j < files.length; j++) {
        const pageB = await this.wikiManager.readPage(files[j])
        if (!pageB) continue

        const conflicts = this.detectConflicts(pageA.content, pageB.content)
        for (const conflict of conflicts) {
          issues.push({
            type: 'contradiction',
            severity: 'warning',
            file: files[i],
            message: conflict,
            detail: `Between "${files[i]}" and "${files[j]}"`,
          })
        }
      }
    }

    return issues
  }

  private detectConflicts(contentA: string, contentB: string): string[] {
    const conflicts: string[] = []

    const numbersA = this.extractAssertiveNumbers(contentA)
    const numbersB = this.extractAssertiveNumbers(contentB)

    for (const [concept, valA] of numbersA) {
      if (numbersB.has(concept)) {
        const valB = numbersB.get(concept)!
        if (valA !== valB) {
          conflicts.push(`Contradictory "${concept}": "${valA}" vs "${valB}"`)
        }
      }
    }

    const negRegex = /(?:non|not|never|no)\s+(\w+(?:\s+\w+){0,3})/gi
    const negA = new Set(
      [...contentA.matchAll(negRegex)].map((m) => m[1].toLowerCase()),
    )
    const posA = new Set(
      [
        ...contentA.matchAll(/(?:è|e'?|is|was|are)\s+(\w+(?:\s+\w+){0,3})/gi),
      ].map((m) => m[1].toLowerCase()),
    )

    for (const neg of negA) {
      if (posA.has(neg)) continue
      if (contentB.toLowerCase().includes(neg)) {
        const negInB =
          contentB.toLowerCase().includes(`not ${neg}`) ||
          contentB.toLowerCase().includes(`non ${neg}`)
        if (!negInB) {
          const posInB = new Set(
            [
              ...contentB.matchAll(
                /(?:è|e'?|is|was|are)\s+(\w+(?:\s+\w+){0,3})/gi,
              ),
            ].map((m) => m[1].toLowerCase()),
          )
          if (posInB.has(neg)) {
            conflicts.push(
              `Possible contradiction: page A negates "${neg}" while page B affirms it`,
            )
          }
        }
      }
    }

    return conflicts
  }

  async runLintAndFix(): Promise<LintResult> {
    const issues: LintIssue[] = []
    const fixes: LintFixResult = { fixed: 0, details: [] }

    const brokenLinkIssues = await this.checkBrokenLinks()
    issues.push(...brokenLinkIssues)

    const duplicateIssues = await this.checkDuplicates()
    issues.push(...duplicateIssues)

    const contradictionIssues = await this.checkContradictions()
    issues.push(...contradictionIssues)

    const schemaIssues = await this.checkSchema()
    issues.push(...schemaIssues)

    const totalFiles = (await this.wikiManager.listAllWikiFiles()).length

    const stats = {
      totalFiles,
      brokenLinks: brokenLinkIssues.length,
      duplicates: duplicateIssues.length,
      contradictions: contradictionIssues.length,
      schemaViolations: schemaIssues.length,
    }

    const fixableIssues = issues.filter(
      (i) =>
        i.type === 'schema-violation' &&
        (i.message === 'Missing H1 title' ||
          i.message === 'No tags defined' ||
          i.message === 'Contains TODO/FIXME markers'),
    )

    const fixedFiles = new Set<string>()
    for (const issue of fixableIssues) {
      if (fixedFiles.has(issue.file)) continue
      fixedFiles.add(issue.file)

      const page = await this.wikiManager.readPage(issue.file)
      if (!page) continue

      let newContent = page.content
      let fileChanged = false

      if (
        issue.message === 'Missing H1 title' &&
        !newContent.match(/^#\s+.+/m)
      ) {
        const title =
          issue.file.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled'
        newContent = `# ${title}\n\n${newContent}`
        fileChanged = true
        fixes.details.push(`Added H1 title "${title}" to ${issue.file}`)
      }

      if (issue.message === 'No tags defined') {
        const tagsLine = page.content.match(/^tags:\s*(.+)$/m)
        if (!tagsLine) {
          newContent = newContent.replace(/^---\s*\n/, '')
          const titleMatch = newContent.match(/^(#\s+.+)/m)
          if (titleMatch) {
            newContent = newContent.replace(
              titleMatch[0],
              `${titleMatch[0]}\ntags: untagged`,
            )
          } else {
            newContent = `tags: untagged\n${newContent}`
          }
          fileChanged = true
          fixes.details.push(`Added missing tags metadata to ${issue.file}`)
        }
      }

      if (issue.message === 'Contains TODO/FIXME markers') {
        newContent = newContent.replace(/^(.*?TODO.*?)$/gim, '<!-- $1 -->')
        newContent = newContent.replace(/^(.*?FIXME.*?)$/gim, '<!-- $1 -->')
        fileChanged = true
        fixes.details.push(`Commented out TODO/FIXME markers in ${issue.file}`)
      }

      if (fileChanged) {
        await this.wikiManager.writePage(issue.file, newContent)
        fixes.fixed++
      }
    }

    const remaining = issues.filter((i) => !fixableIssues.includes(i))

    return {
      passed: remaining.length === 0,
      issues: remaining,
      checkedAt: new Date().toISOString(),
      stats,
      fixes: fixes.fixed > 0 ? fixes : undefined,
    }
  }

  private extractAssertiveNumbers(content: string): Map<string, string> {
    const map = new Map<string, string>()
    const pattern =
      /(?:population|popolazione|count|numero|amount|importo|value|valore|total|totale|cost|costo|price|prezzo|size|dimensione|year|anno|version|versione)[:\s]+([\d,]+(?:\.\d+)?)/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const key = match[0].split(/[:]/)[0].trim().toLowerCase()
      map.set(key, match[1])
    }
    return map
  }

  private async checkSchema(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const files = await this.wikiManager.listAllWikiFiles()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      this.onProgress?.('schema', i + 1, files.length)
      const page = await this.wikiManager.readPage(file)
      if (!page) continue

      if (!page.content.startsWith('# ') && !page.content.startsWith('# ')) {
        if (!page.content.match(/^#\s+.+/m)) {
          issues.push({
            type: 'schema-violation',
            severity: 'error',
            file,
            message: 'Missing H1 title',
            detail:
              'Every wiki page must start with a single H1 (# Title) heading',
          })
        }
      }

      if (
        !page.meta.title ||
        page.meta.title === file.split('/').pop()?.replace('.md', '')
      ) {
        issues.push({
          type: 'schema-violation',
          severity: 'warning',
          file,
          message: 'Title does not match content H1',
          detail: 'The parsed title should match the H1 heading in the file',
        })
      }

      const tags = page.meta.tags
      if (tags.length === 0) {
        issues.push({
          type: 'schema-violation',
          severity: 'info',
          file,
          message: 'No tags defined',
          detail:
            'Consider adding tags as metadata (tags: tag1, tag2) for better discoverability',
        })
      }

      if (page.content.includes('TODO') || page.content.includes('FIXME')) {
        issues.push({
          type: 'schema-violation',
          severity: 'warning',
          file,
          message: 'Contains TODO/FIXME markers',
          detail: 'File has unresolved placeholders that should be addressed',
        })
      }
    }

    return issues
  }
}
