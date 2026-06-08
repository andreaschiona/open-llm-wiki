export async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => boolean | void
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (onLine(line) === false) return
    }
  }
}

export function getReader(res: Response): ReadableStreamDefaultReader<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')
  return reader
}
