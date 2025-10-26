# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-10-26
### Added
- Endpoint `GET /api/v1/structures/search` con filtri `q`, `province`, `type`, `max_km`, paginazione e ordinamenti.
- Endpoint `GET /api/v1/structures/by-slug/{slug}`.
- Migrazione `20240320_0002_structure_geo` con `address`, `latitude`, `longitude` e indici.
- Script `scripts/seed.py` e dataset `data/structures_seed.csv`.
- Frontend: barra filtri e paginazione in `/structures`.
- Frontend: pagina dettaglio `/structures/:slug`.

### Changed
- Validazioni `Structure` e vincolo slug unico.
- Documentazione README e `docs/API.md`.

### Security
- N/A

[0.2.0]: https://github.com/<org>/<repo>/compare/0.1.0...0.2.0
