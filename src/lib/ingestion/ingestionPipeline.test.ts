import { describe, it, expect } from 'vitest'

describe('IngestionPipeline — model input validation', () => {
  function validateFileInput(
    fileName: string,
    supportedInputs?: string[],
  ): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext && !['pdf', 'txt', 'md'].includes(ext)) {
      return `Unsupported file format: .${ext}`
    }
    const inputs = supportedInputs ?? ['text']
    if (ext === 'pdf' && !inputs.includes('pdf')) {
      return `Cannot read "${fileName}" (this model does not support pdf input)`
    }
    return null
  }

  it('should reject pdf when model supports only text', () => {
    const error = validateFileInput('doc.pdf', ['text'])
    expect(error).toBe(
      'Cannot read "doc.pdf" (this model does not support pdf input)',
    )
  })

  it('should accept pdf when model supports pdf', () => {
    const error = validateFileInput('doc.pdf', ['text', 'pdf'])
    expect(error).toBeNull()
  })

  it('should accept text files when model supports only text', () => {
    const error = validateFileInput('notes.txt', ['text'])
    expect(error).toBeNull()
  })

  it('should accept markdown files when model supports only text', () => {
    const error = validateFileInput('article.md', ['text'])
    expect(error).toBeNull()
  })

  it('should reject unsupported extensions', () => {
    const error = validateFileInput('image.png', ['text', 'pdf'])
    expect(error).toBe('Unsupported file format: .png')
  })

  it('should default to text-only when no supportedInputs configured', () => {
    const error = validateFileInput('doc.pdf')
    expect(error).toBe(
      'Cannot read "doc.pdf" (this model does not support pdf input)',
    )
  })

  it('should reject New_Backup_Policy_Catalogue_V2.0.pdf with text-only model', () => {
    const error = validateFileInput('New_Backup_Policy_Catalogue_V2.0.pdf', [
      'text',
    ])
    expect(error).toBe(
      'Cannot read "New_Backup_Policy_Catalogue_V2.0.pdf" (this model does not support pdf input)',
    )
  })
})
