type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: unknown
}

class Logger {
  private entries: LogEntry[] = []
  private maxEntries = 1000

  private log(
    level: LogLevel,
    module: string,
    message: string,
    data?: unknown,
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${module}]`
    switch (level) {
      case 'error':
        console.error(prefix, message, data ?? '')
        break
      case 'warn':
        console.warn(prefix, message, data ?? '')
        break
      default:
        console.log(prefix, message, data ?? '')
    }
  }

  info(module: string, message: string, data?: unknown) {
    this.log('info', module, message, data)
  }
  warn(module: string, message: string, data?: unknown) {
    this.log('warn', module, message, data)
  }
  error(module: string, message: string, data?: unknown) {
    this.log('error', module, message, data)
  }
  debug(module: string, message: string, data?: unknown) {
    this.log('debug', module, message, data)
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }
  getRecent(count = 50): LogEntry[] {
    return this.entries.slice(-count)
  }
}

export const logger = new Logger()
