---
tags: ["rag", "llm-wiki", "karpathy", "architettura", "pattern", "knowledge-base"]
data_creazione: 2026-06-11
data_aggiornamento: 2026-06-11
fonti:
  - raw/other/andrej-karpathy-killed-rag-or-did-he-the-llm-wiki-pattern_COMPILED.md
---

# LLM Wiki Pattern

Pattern architetturale introdotto da Andrej Karpathy per costruire knowledge base personali gestite da LLM. L'agente non recupera documenti a ogni query (come nella RAG tradizionale), ma compila, mantiene e aggiorna continuamente una wiki strutturata in markdown, facendo accumulare la conoscenza nel tempo.

## Punti chiave

- Tre strati: raw (fonti immutabili), wiki (articoli markdown gestiti dall'LLM), schema (configurazione del comportamento agente)
- Nessun database vettoriale richiesto alla scala personale (100-1000 documenti)
- La conoscenza si accumula: ogni nuova fonte aggiorna articoli esistenti, incrocia riferimenti e flagga contraddizioni
- Tre operazioni fondamentali: Ingest, Query, Lint — formano un ciclo auto-rinforzante
- Karpathy cita Vannevar Bush e il Memex (1945): l'LLM risolve il problema di manutenzione che ha sempre ucciso le wiki personali
- Non è "RAG migliore": è compilazione all'ingest invece che retrieval alla query — differenza tra motore di ricerca e enciclopedia
- Limiti enterprise: niente RBAC, ACID, audit trail, controllo concorrenza — è arma personale, non piattaforma aziendale

## Architettura a tre strati

### Layer 1: Raw Sources

Collezione immutabile di materiali originali (articoli, paper, trascrizioni, appunti, immagini) in una directory `raw/`. Mai modificati dopo l'inserimento. Fonte di verità.

### Layer 2: The Wiki

L'LLM legge le fonti raw e produce file markdown strutturati: pagine riassunto, articoli enciclopedici per concetti/entità, cross-riferimenti, indice master. Una singola fonte può toccare 10-15 pagine wiki contemporaneamente. Le contraddizioni vengono flaggate.

### Layer 3: The Schema

Documento di configurazione (Karpathy usa CLAUDE.md) che istruisce l'agente su: struttura della wiki, formato pagine, comportamento durante l'ingest, gestione conflitti. È la "costituzione" operativa.

## Le tre operazioni

### Ingest

Nuova fonte inserita in `raw/`. L'LLM la legge, scrive un riassunto, aggiorna l'indice master, e **revisiona ogni pagina** di concetti/entità correlati in tutta la wiki.

### Query

Domanda → LLM cerca nell'indice, carica pagine rilevanti, sintetizza risposta da conoscenza pre-compilata. Se la risposta ha valore, diventa una nuova pagina wiki. Le domande rendono la wiki più intelligente.

### Lint

Manutenzione periodica: scansione per contraddizioni, claim stale, pagine orfane, concetti mancanti, gap dati. La wiki si auto-guarisce.

## LLM Wiki vs RAG

| Aspetto | RAG | LLM Wiki |
|---------|-----|----------|
| Operazione principale | Retrieval alla query | Compilazione all'ingest |
| Stato | Stateless (ogni query ricomincia) | Stateful (conoscenza si accumula) |
| Unità informativa | Chunk di documento | Articolo strutturato |
| Manutenzione | N/A | Lint periodico |
| Scala | Milioni di documenti | Centinaia/migliaia |
| Chunking | Necessario (distrugge contesto) | Non necessario |

RAG non è morto: risolve problemi reali a scale enterprise dove LLM Wiki non può operare. Ma per knowledge base personali, ricerca, piccoli team, il pattern LLM Wiki è dimostrabilmente superiore.

## Prospettiva futura: fine-tuning dal wiki

Karpathy accenna a un endpoint: generare dati sintetici di training dalla wiki per fare fine-tuning di modelli. La conoscenza si sposta dal context window ai pesi del modello. La wiki diventa un dataset in attesa di diventare modello.

## Articoli correlati

- [[opencode]]
- [[spec-kit]]
- [[trasformazione-brownfield-multi-repo]]
- [[confronto-ai-coding-agent]]

## Fonti

- raw/other/andrej-karpathy-killed-rag-or-did-he-the-llm-wiki-pattern_COMPILED.md
