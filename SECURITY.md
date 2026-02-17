# Security

## Reporting a vulnerability

If you believe you’ve found a security issue, please report it responsibly:

- **Do not** open a public GitHub issue for security-sensitive bugs.
- Email the maintainers (e.g. via the repository’s “Security” or “About” contact, or the address in the repo metadata) with a clear description and steps to reproduce.
- We will respond and work with you on a fix and disclosure timeline.

## Security-related considerations

- **API keys and tokens:** Do not commit real keys. Use environment variables or config that is gitignored; see `.env.example` and README for configuration.
- **CORS / exposure:** In production, set `LOOM_ALLOWED_ORIGINS` to specific origins instead of `*`.
- **Web API:** When `LOOM_WEB_API_KEY` is set, `/api/web/*` endpoints require the `X-LOOM-API-KEY` header.
- **Data:** Sessions, circuits, and ChromaDB data are stored locally (or in a Docker volume). Treat the data directory and any backups with appropriate care.

We do not have a formal bug bounty program at this time.
