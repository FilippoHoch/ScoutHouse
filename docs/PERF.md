# Performance improvements

## Cache HTTP API

- Gli endpoint pubblici `/api/v1/structures/search` e `/api/v1/structures/by-slug/{slug}` espongono header `ETag` e rispondono con `304 Not Modified` quando il client invia `If-None-Match` con un tag valido.
- Gli stessi endpoint impostano `Cache-Control: public, max-age=120, stale-while-revalidate=600` per suggerire ai client una cache breve con ri-validazione in background.
- La lunghezza minima per la compressione GZip è configurabile tramite variabile d’ambiente `GZIP_MIN_LENGTH` (default `1024`).
- I parametri `PUBLIC_CACHE_MAX_AGE` e `PUBLIC_CACHE_SWR` consentono di modulare le durate della cache senza modifiche al codice.

