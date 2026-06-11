import { describe, it, expect } from 'vitest'
import type { LLMProviderConfig } from '../../types'

function validateFileIngestion(
  config: LLMProviderConfig | undefined,
  fileName: string,
): void {
  if (!config) {
    throw new Error(
      'Provider LLM non configurato. Vai su Settings per configurare un provider con API key.',
    )
  }
  const supportedInputs = config.supportedInputs ?? ['text', 'pdf']
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' && !supportedInputs.includes('pdf')) {
    throw new Error(
      `Cannot read "${fileName}" (this model does not support pdf input)`,
    )
  }
}

describe('validateFileIngestion', () => {
  const baseConfig: LLMProviderConfig = {
    id: 'test',
    name: 'Test',
    type: 'openai',
    baseUrl: 'https://example.com',
    apiKey: '',
    defaultModel: 'gpt-4o-mini',
    models: [],
    isActive: true,
  }

  it('should not throw when supportedInputs includes pdf', () => {
    expect(() =>
      validateFileIngestion(
        { ...baseConfig, supportedInputs: ['text', 'pdf'] },
        'doc.pdf',
      ),
    ).not.toThrow()
  })

  it('should not throw when supportedInputs is undefined (defaults to text+pdf)', () => {
    expect(() =>
      validateFileIngestion({ ...baseConfig }, 'doc.pdf'),
    ).not.toThrow()
  })

  it('should throw when supportedInputs does not include pdf', () => {
    expect(() =>
      validateFileIngestion(
        { ...baseConfig, supportedInputs: ['text'] },
        'New_Backup_Policy_Catalogue_V2.0.pdf',
      ),
    ).toThrow(
      'Cannot read "New_Backup_Policy_Catalogue_V2.0.pdf" (this model does not support pdf input)',
    )
  })

  it('should throw when config is undefined', () => {
    expect(() => validateFileIngestion(undefined, 'doc.pdf')).toThrow(
      'Provider LLM non configurato',
    )
  })

  it('should include the exact filename in the error message', () => {
    const fileName = 'report.pdf'
    try {
      validateFileIngestion(
        { ...baseConfig, supportedInputs: ['text'] },
        fileName,
      )
    } catch (err) {
      expect((err as Error).message).toContain(fileName)
      expect((err as Error).message).toContain('does not support pdf input')
    }
  })
})
