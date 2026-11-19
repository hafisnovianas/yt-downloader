/**
 * YouTube Innertube Player API
 * Diport dari versi bot Telegram — tanpa dependency SDK.
 */

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

export const CLIENT_CONFIGS = [
  {
    name: 'ANDROID',
    userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
    buildPayload: (videoId) => ({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '21.26.364',
          androidSdkVersion: 30,
          osName: 'Android',
          osVersion: '11',
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  },
  {
    name: 'IOS',
    userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    buildPayload: (videoId) => ({
      videoId,
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '21.26.4',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  },
  {
    name: 'WEB_EMBEDDED',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    buildPayload: (videoId) => ({
      videoId,
      context: {
        client: {
          clientName: 'WEB_EMBEDDED_PLAYER',
          clientVersion: '2.20260708.00.00',
          hl: 'en',
          gl: 'US',
        },
        thirdParty: {
          embedUrl: 'https://www.google.com/',
        },
      },
    }),
  },
];

/**
 * Ekstrak videoId dari berbagai format URL YouTube.
 * Return null jika bukan URL YouTube valid.
 */
export function extractVideoId(text) {
  if (typeof text !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = text.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Panggil YouTube Innertube Player API.
 * Coba beberapa client config jika yang pertama diblokir.
 */
export async function fetchPlayerData(videoId) {
  let lastReason = 'Tidak diketahui';

  for (const client of CLIENT_CONFIGS) {
    const payload = client.buildPayload(videoId);

    let res;
    try {
      res = await fetch(INNERTUBE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      lastReason = `Koneksi gagal: ${err.message}`;
      continue;
    }

    if (!res.ok) {
      lastReason = `HTTP ${res.status} ${res.statusText}`;
      continue;
    }

    const data = await res.json();
    const status = data.playabilityStatus?.status;

    if (status === 'OK' && data.streamingData) {
      return { ok: true, data, clientUsed: client.name };
    }

    lastReason = data.playabilityStatus?.reason || `Status: ${status}`;

    if (status === 'LOGIN_REQUIRED' || status === 'UNPLAYABLE' || status === 'ERROR') {
      continue;
    }

    return { ok: false, reason: lastReason };
  }

  return { ok: false, reason: `Semua client config gagal. Terakhir: ${lastReason}` };
}
