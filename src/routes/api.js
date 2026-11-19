import { Hono } from 'hono';
import { extractVideoId, fetchPlayerData } from '../lib/innertube.js';
import { pickBestAudio, audioExtension } from '../lib/stream-picker.js';

const api = new Hono();

// In-Memory Stream Cache (menghindari duplikasi pemanggilan Innertube antara /info dan /download)
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 menit
const streamCache = new Map();

function getCachedStream(videoId) {
  const item = streamCache.get(videoId);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    streamCache.delete(videoId);
    return null;
  }
  return item;
}

function setCachedStream(videoId, data, audio) {
  if (streamCache.size > 200) {
    const oldest = streamCache.keys().next().value;
    streamCache.delete(oldest);
  }
  streamCache.set(videoId, { data, audio, timestamp: Date.now() });
}

// Middleware Proteksi PIN Akses
api.use('*', async (c, next) => {
  const configuredPin = c.env.ACCESS_PIN;
  if (!configuredPin) {
    return next(); // Tanpa proteksi jika ACCESS_PIN tidak diatur di environment
  }

  const clientPin = c.req.header('x-access-pin') || c.req.query('pin');
  if (clientPin !== configuredPin) {
    return c.json(
      { error: 'PIN akses tidak valid atau belum dimasukkan.', needPin: true },
      401
    );
  }

  return next();
});

/**
 * POST /api/info
 * Input:  { "url": "https://youtu.be/..." }
 * Output: metadata video + info stream audio terbaik
 */
api.post('/info', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body request tidak valid.' }, 400);
  }

  const videoId = extractVideoId(body?.url);
  if (!videoId) {
    return c.json({ error: 'URL YouTube tidak valid.' }, 400);
  }

  const player = await fetchPlayerData(videoId);
  if (!player.ok) {
    return c.json({ error: player.reason }, 502);
  }

  const { data, clientUsed } = player;
  const audio = pickBestAudio(data.streamingData);

  if (!audio) {
    return c.json({ error: 'Tidak ada stream audio yang tersedia untuk video ini.' }, 404);
  }

  if (!audio.url) {
    return c.json(
      { error: 'Audio terkunci di balik Signature Cipher. Coba video lain yang bukan musik resmi/VEVO.' },
      403
    );
  }

  // Simpan data stream ke cache agar rute /download tidak perlu request ulang ke YouTube
  setCachedStream(videoId, data, audio);

  const details = data.videoDetails || {};
  const thumbnails = details.thumbnail?.thumbnails || [];

  return c.json({
    videoId,
    title: details.title || 'Unknown',
    author: details.author || '',
    duration: Number(details.lengthSeconds || 0),
    thumbnail: thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '',
    audio: {
      itag: audio.itag,
      mimeType: audio.mimeType,
      bitrate: audio.bitrate,
      size: audio.contentLength,
      streamUrl: audio.url,
    },
    clientUsed,
  });
});

/**
 * GET /api/download?v={videoId}&stream={base64url}&title={title}
 * Proxy streaming: fetch audio dari YouTube → pipe langsung ke browser.
 * Jika param `stream` tersedia (dari /api/info), langsung proxy tanpa panggil Innertube.
 */
api.get('/download', async (c) => {
  const videoId = c.req.query('v');
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return c.json({ error: 'Video ID tidak valid.' }, 400);
  }

  const streamParam = c.req.query('stream');
  let audioUrl;
  let mimeType = 'video/mp4';
  let title = c.req.query('title') || 'audio';

  if (streamParam) {
    // Decode stream URL dari base64url yang dikirim frontend
    try {
      let b64 = streamParam.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      audioUrl = atob(b64);
    } catch {
      return c.json({ error: 'Parameter stream tidak valid.' }, 400);
    }

    // Validasi: hanya izinkan URL googlevideo.com
    if (!audioUrl.includes('.googlevideo.com/')) {
      return c.json({ error: 'URL stream tidak valid.' }, 400);
    }
  } else {
    // Fallback: panggil Innertube jika stream URL tidak tersedia
    const cached = getCachedStream(videoId);
    let data;
    let audio;

    if (cached) {
      data = cached.data;
      audio = cached.audio;
    } else {
      const player = await fetchPlayerData(videoId);
      if (!player.ok) {
        return c.json({ error: player.reason }, 502);
      }
      data = player.data;
      audio = pickBestAudio(data.streamingData);
      if (audio?.url) {
        setCachedStream(videoId, data, audio);
      }
    }

    if (!audio?.url) {
      return c.json({ error: 'Audio tidak tersedia untuk diunduh.' }, 404);
    }

    audioUrl = audio.url;
    mimeType = audio.mimeType?.split(';')[0] || 'video/mp4';
    title = data.videoDetails?.title || 'audio';
  }

  const ext = audioExtension(mimeType);
  const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
  const filename = `${safeTitle}.${ext}`;

  // Fetch audio dari YouTube
  const audioRes = await fetch(audioUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
    },
  });

  if (!audioRes.ok) {
    return c.json({ error: `Download gagal: HTTP ${audioRes.status}` }, 502);
  }

  // Streaming proxy — pipe langsung ke browser
  const headers = {
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };

  const contentLength = audioRes.headers.get('content-length');
  if (contentLength) {
    headers['Content-Length'] = contentLength;
  }

  return new Response(audioRes.body, { headers });
});

export { api as apiRoutes };
