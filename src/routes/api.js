import { Hono } from 'hono';
import { extractVideoId, fetchPlayerData } from '../lib/innertube.js';
import { pickBestAudio, audioExtension } from '../lib/audio-picker.js';

const api = new Hono();

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
    },
    clientUsed,
  });
});

/**
 * GET /api/download?v={videoId}
 * Proxy streaming: fetch audio dari YouTube → pipe langsung ke browser.
 */
api.get('/download', async (c) => {
  const videoId = c.req.query('v');
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return c.json({ error: 'Video ID tidak valid.' }, 400);
  }

  const player = await fetchPlayerData(videoId);
  if (!player.ok) {
    return c.json({ error: player.reason }, 502);
  }

  const { data } = player;
  const audio = pickBestAudio(data.streamingData);

  if (!audio?.url) {
    return c.json({ error: 'Audio tidak tersedia untuk diunduh.' }, 404);
  }

  const title = data.videoDetails?.title || 'audio';
  const ext = audioExtension(audio.mimeType);
  const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
  const filename = `${safeTitle}.${ext}`;

  // Fetch audio dari YouTube
  const audioRes = await fetch(audio.url, {
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
    'Content-Type': audio.mimeType?.split(';')[0] || 'video/mp4',
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
