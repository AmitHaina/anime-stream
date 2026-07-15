# AnimeStream

A Netflix-style demo player built on top of `anime.uniquestream.net`'s public API. It exists to
demonstrate one thing: the site's video "encryption" is not real DRM — the AES-128 decryption key is
handed to the client in plain sight, in the API response itself.

## What this proves

- Every episode's metadata endpoint returns a `media_id` field.
- `media_id` **is** the raw AES-128-CBC key (hex-decoded) used to encrypt every HLS video/audio segment
  for that episode.
- The segment IV is just a big-endian counter, seeded from the fragment's HLS sequence number.
- The manifest does include a standard `#EXT-X-KEY` tag, but it points at a decoy `key.bin` — a red
  herring for generic HLS downloaders. The real key never needs fetching; it's already in the metadata
  response.

This app fetches the encrypted segments and decrypts them client-side using nothing but the browser's
built-in Web Crypto API and the `media_id` field — no license server, no key exchange, no DRM.

## Requirements

- Node.js 18+ (no npm dependencies — uses only Node's built-in `http`/`https`)
- A modern browser (uses `hls.js` via CDN + native Web Crypto)

## Install & run

```bash
git clone https://github.com/AmitHaina/anime-stream.git
cd anime-stream
npm start
```

The server picks a random free port and prints it:

```
anime-stream demo running at http://localhost:<port>
```

Open that URL in your browser.

To pin a specific port instead of a random one:

```bash
PORT=5000 npm start
```

## Usage

1. **Home page** — search for a title or browse the "Popular" row. Click any poster.
2. **Series page** — pick a season, then click an episode to start watching.
3. **Watch page** — video plays automatically; switch subtitle language with the pill buttons above the
   player.

## How it works

- `server.js` — a small static file server that also proxies two things the browser can't reach
  directly (both upstream services omit `Access-Control-Allow-Origin`, so they must be same-origin
  proxied):
  - `/api/*` → the site's own API (`anime.uniquestream.net`)
  - `/cdn/<host>/*` → the video CDN (`*.mediacache.cc`), with the manifest's decoy `EXT-X-KEY` tag
    stripped before it reaches the browser
- `public/watch.js` — the actual proof of concept: a custom `hls.js` fragment loader (`fLoader`) that
  fetches each encrypted segment and decrypts it in-browser with `crypto.subtle.decrypt`, using
  `media_id` as the AES key and the fragment's sequence number as the IV counter.

## Disclaimer

Built for reverse-engineering research and demonstration purposes only. All video content is fetched
live from the target site's own public API/CDN — this project stores nothing and hosts no content
itself.
