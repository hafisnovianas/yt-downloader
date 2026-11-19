# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Inisialisasi proyek YT Audio Downloader versi web menggunakan Cloudflare Workers + Hono.
- Core library `src/lib/innertube.js`: integrasi YouTube Innertube Player API dengan fallback multi-client (ANDROID, IOS, WEB_EMBEDDED), diport dari versi bot Telegram.
- Pemilih stream audio `src/lib/audio-picker.js`: prioritas adaptive audio → progressive → cipher detection.
- Rate limiter `src/lib/rate-limit.js`: middleware berbasis Cloudflare D1, 10 request per IP per 15 menit dengan IP hashing SHA-256.
- API endpoint `POST /api/info`: ambil metadata video dan info stream audio terbaik.
- API endpoint `GET /api/download?v={id}`: proxy streaming audio dari YouTube langsung ke browser tanpa buffering penuh.
- Logging download asinkron ke D1 via `waitUntil()` agar tidak memblokir stream.
- Frontend vanilla HTML/CSS/JS: dark theme, input URL, tampilan info video + thumbnail, tombol download.
- Skema database D1 (`src/db/schema.sql`): tabel `downloads` dan `rate_limits`.
- Konfigurasi Wrangler (`wrangler.jsonc`) dengan Workers Static Assets untuk serve file `public/`.
