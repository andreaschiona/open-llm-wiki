# Open LLM Wiki

A desktop knowledge management application powered by LLMs. Browse, ingest, and query your personal wiki through a local chat interface.

Built with [Tauri 2](https://v2.tauri.app/), React, and TypeScript.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            React Frontend (TypeScript)               │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │ │
│  │  │  Wiki    │ │  Chat    │ │   Ingestion      │    │ │
│  │  │ Browser  │ │Interface │ │     Panel        │    │ │
│  │  └────┬─────┘ └────┬─────┘ └───────┬──────────┘    │ │
│  │       │             │               │               │ │
│  │  ┌────▼─────────────▼───────────────▼──────────┐    │ │
│  │  │           Zustand Stores                    │    │ │
│  │  │  (useWikiStore, useChatStore, useConfigStore)│    │ │
│  │  └────────────────┬────────────────────────────┘    │ │
│  │                   │                                  │ │
│  │  ┌────────────────▼────────────────────────────┐    │ │
│  │  │            Library Layer                    │    │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │    │ │
│  │  │  │  Wiki    │ │   LLM    │ │ Ingestion  │  │    │ │
│  │  │  │ Manager  │ │ Provider │ │  Pipeline  │  │    │ │
│  │  │  └──────────┘ └──────────┘ └────────────┘  │    │ │
│  │  └────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────┘ │
│                           │                               │
│              ┌────────────▼────────────┐                  │
│              │   Tauri Commands (Rust)  │                  │
│              │  read_file, write_file,  │                  │
│              │  list_directory, etc.    │                  │
│              └────────────┬────────────┘                  │
│                           │                               │
│              ┌────────────▼────────────┐                  │
│              │    OS Filesystem        │                  │
│              │  wiki/  raw/  config/   │                  │
│              └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Key Components

- **Frontend:** React 18 + TypeScript + Vite, styled with Tailwind CSS
- **State Management:** Zustand stores for wiki, chat, and configuration state
- **Backend:** Tauri 2 (Rust) providing filesystem commands via IPC
- **Wiki Layer:** Markdown-based wiki with structured categories (entities, concepts, summaries, queries), full-text search via Fuse.js, and a change log
- **Chat Interface:** Context-aware QA using retrieved wiki content as LLM context
- **Ingestion Pipeline:** Fetches web pages (HTML→Markdown) and PDFs, extracts entities/concepts via LLM, and saves structured wiki pages
- **LLM Providers:** Abstraction layer supporting OpenAI-compatible APIs, Ollama (local), OpenRouter, and Google Gemini

## Installation

### Download

Prebuilt installers are available on the [Releases page](https://github.com/andreaschiona/open-llm-wiki/releases):

| Platform | Format |
|----------|--------|
| Windows | `.msi` / `.exe` |
| macOS | `.dmg` (Intel & Apple Silicon) |
| Linux | `.deb` / `.AppImage` |

### Build from Source

#### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) toolchain (install via `rustup`)
- Platform-specific system dependencies:

<details>
<summary>Linux (Debian/Ubuntu)</summary>

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```
</details>

<details>
<summary>macOS</summary>

Xcode Command Line Tools are required:
```bash
xcode-select --install
```
</details>

<details>
<summary>Windows</summary>

- [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- WebView2 (included in Windows 10 1803+)
</details>

#### Build Commands

```bash
# Install JavaScript dependencies
npm install

# Build the desktop application
npm run tauri build
```

The distributable will be placed in `src-tauri/target/release/bundle/`.

### Development

```bash
npm install
npm run tauri dev
```

## LLM Provider Setup

On first launch, the app automatically configures a default provider:

1. **Ollama (local):** If Ollama is running on `localhost:11434`, it is set as default
2. **OpenRouter (cloud):** Falls back to OpenRouter free tier (requires an API key)

You can also manually configure providers in the Settings panel:

| Provider | Type | URL | Free Tier |
|----------|------|-----|-----------|
| OpenAI | `openai` | `https://api.openai.com/v1` | No |
| Ollama | `ollama` | `http://localhost:11434` | Yes (local) |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | Yes (limited) |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | Yes (60 req/min) |

## Project Structure

```
open-llm-wiki/
├── src/                    # React frontend
│   ├── components/         # UI components (Sidebar, WikiBrowser, ChatInterface, etc.)
│   ├── lib/
│   │   ├── wiki/           # Wiki manager, index, log
│   │   ├── llm/            # LLM providers (OpenAI, Ollama, OpenRouter, Gemini)
│   │   ├── ingestion/      # URL/PDF ingestion pipeline
│   │   ├── config/         # Provider configuration manager
│   │   └── utils/          # Logger, utilities
│   ├── store/              # Zustand state stores
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend (Tauri)
│   └── src/                # Tauri commands (filesystem API)
├── wiki/                   # Wiki content (Markdown files)
│   ├── index.md
│   ├── log.md
│   ├── entities/
│   ├── concepts/
│   ├── summaries/
│   └── queries/
├── raw/                    # Raw source materials
│   ├── web-pages/
│   └── pdfs/
├── config/                 # Runtime configuration
└── .github/workflows/      # CI/CD (lint, CodeQL, release)
```

## Usage

### Wiki Browser
Navigate your wiki through a file tree. Pages are written in Markdown with support for `[[wikilinks]]` and GFM syntax.

### Chat
Ask questions about your wiki content. The chat retrieves relevant context from your wiki pages and generates answers with source citations.

### Ingestion
- **URL Ingestion:** Enter a URL → fetches the page → converts to Markdown → LLM summarizes → saves to wiki
- **PDF Ingestion:** Upload a PDF → extracts text → LLM analyzes → saves entities and summary

### Settings
Configure LLM providers, test connections, and select models.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri 2 (Rust) |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Markdown | react-markdown, remark-gfm, rehype-highlight |
| Search | Fuse.js |
| PDF | pdfjs-dist |
| HTML→Markdown | Turndown |
| LLM APIs | OpenAI, Ollama, OpenRouter, Gemini |
| CI/CD | GitHub Actions |

## License

MIT
