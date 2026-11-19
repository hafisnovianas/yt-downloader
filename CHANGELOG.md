# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Menghilangkan kegagalan unduhan akibat isolate cache miss dengan meneruskan stream URL dari rute info langsung ke rute download.
- Mengatasi kegagalan unduhan (HTTP 502) akibat blokir bot YouTube dengan menambahkan in-memory stream cache antara rute info dan download.

### Added
- Dukungan runtime Node.js (`src/server.js` via `@hono/node-server` & `dotenv`) untuk deployment ke VPS Ubuntu dengan PM2.
- Middleware CORS (`hono/cors`) pada `/api/*` agar API siap diakses oleh aplikasi eksternal lintas origin.
- Workflow CI/CD GitHub Actions (`.github/workflows/deploy.yml`) untuk auto-deploy ke VPS via SCP dan PM2.
- Penyimpanan otomatis link YouTube terakhir yang digunakan pada `localStorage` (`yt_last_url`).
- Fitur proteksi PIN rahasia (`ACCESS_PIN`) via middleware backend untuk membatasi akses publik.
- Dialog modal PIN di frontend dengan penyimpanan sesi otomatis di `localStorage`.
- Template konfigurasi secret `.env.example` untuk panduan deployment VPS.

### Removed
- Konfigurasi dan dependensi Cloudflare Workers (`wrangler.jsonc` dan `wrangler`).
- Dependensi Cloudflare D1 (tabel `downloads` dan `rate_limits`).
- Modul middleware rate limiter berbasis database (`src/lib/rate-limit.js`).

### Changed
- Pembacaan `ACCESS_PIN` menggunakan `process.env` pada runtime Node.js.
- Penyelarasan nama Worker pada `wrangler.jsonc` menjadi `yt-downloader` agar sesuai dengan CI dashboard Cloudflare.
- Refaktor arsitektur menjadi murni *stateless* tanpa database untuk kemudahan deployment.
- Penyelarasan nama proyek dan branding menjadi **YT Downloader** (`yt-downloader-web`) serta modul internal `src/lib/stream-picker.js`.

## [0.2.0] - 2026-11-19
### Added
- Fitur 2 opsi unduhan di antarmuka web: **Unduh Audio Murni (AAC)** dan **Unduh Video (360p MP4)**.
- Modul demuxer biner client-side (`extractAacFromMp4`) di `public/app.js` untuk memotong trek video H.264 dan menghasilkan berkas audio murni tanpa render ulang.
- Indikator progres unduhan persentase real-time (`0% – 100%`) saat data streaming diterima dari server.

### Changed
- Standarisasi ekstensi dan MIME type berkas unduhan video langsung menjadi `video/mp4` (`.mp4`).

### Initial Release
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
