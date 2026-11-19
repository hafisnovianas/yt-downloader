const form = document.getElementById('form');
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');
const thumbnailEl = document.getElementById('thumbnail');
const titleEl = document.getElementById('title');
const authorEl = document.getElementById('author');
const detailsEl = document.getElementById('details');
const audioBtn = document.getElementById('audio-btn');
const videoBtn = document.getElementById('video-btn');
const extractStatus = document.getElementById('extract-status');

let currentVideo = null;

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  resultEl.hidden = true;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function setLoading(loading) {
  fetchBtn.disabled = loading;
  urlInput.disabled = loading;
  fetchBtn.textContent = loading ? 'Memproses...' : 'Ambil Info';
}

/**
 * Ekstrak stream audio AAC dari kontainer MP4/M4A ke format ADTS (.aac) murni.
 * Berjalan di sisi client dalam milidetik tanpa re-encoding (lossless).
 */
function extractAacFromMp4(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(buf.buffer);

  function parseBoxes(start, end) {
    const boxes = [];
    let o = start;
    while (o < end) {
      if (o + 8 > end) break;
      let size = view.getUint32(o);
      const type = String.fromCharCode(...buf.slice(o + 4, o + 8));
      if (size === 1) {
        size = Number(view.getBigUint64(o + 8));
      } else if (size === 0) {
        size = end - o;
      }
      if (size < 8) break;
      boxes.push({ type, size, start: o, end: o + size });
      o += size;
    }
    return boxes;
  }

  const top = parseBoxes(0, buf.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error('Format MP4 tidak memiliki moov header.');

  const moovBoxes = parseBoxes(moov.start + 8, moov.end);
  const traks = moovBoxes.filter((b) => b.type === 'trak');

  let sounTrak = null;
  for (const trak of traks) {
    const mdia = parseBoxes(trak.start + 8, trak.end).find((b) => b.type === 'mdia');
    if (!mdia) continue;
    const hdlr = parseBoxes(mdia.start + 8, mdia.end).find((b) => b.type === 'hdlr');
    if (!hdlr) continue;
    const handler = String.fromCharCode(...buf.slice(hdlr.start + 16, hdlr.start + 20));
    if (handler === 'soun') {
      sounTrak = trak;
      break;
    }
  }

  if (!sounTrak) throw new Error('Tidak ditemukan track audio di dalam file.');

  const mdia = parseBoxes(sounTrak.start + 8, sounTrak.end).find((b) => b.type === 'mdia');
  const minf = parseBoxes(mdia.start + 8, mdia.end).find((b) => b.type === 'minf');
  const stbl = parseBoxes(minf.start + 8, minf.end).find((b) => b.type === 'stbl');
  const stblBoxes = parseBoxes(stbl.start + 8, stbl.end);

  // Parse AudioSpecificConfig di dalam esds
  let profile = 1;
  let sampleRateIdx = 4;
  let channelConfig = 2;

  let esdsPos = -1;
  for (let i = sounTrak.start; i < sounTrak.end - 4; i++) {
    if (buf[i] === 0x65 && buf[i + 1] === 0x73 && buf[i + 2] === 0x64 && buf[i + 3] === 0x73) {
      esdsPos = i;
      break;
    }
  }

  if (esdsPos > 0) {
    let ascOffset = esdsPos;
    while (ascOffset < esdsPos + 60) {
      if (buf[ascOffset] === 0x05) {
        ascOffset += 2;
        break;
      }
      ascOffset++;
    }
    const asc0 = buf[ascOffset];
    const asc1 = buf[ascOffset + 1];
    profile = (asc0 >> 3) - 1;
    sampleRateIdx = ((asc0 & 0x07) << 1) | (asc1 >> 7);
    channelConfig = (asc1 >> 3) & 0x0f;
  }

  const stsz = stblBoxes.find((b) => b.type === 'stsz');
  if (!stsz) throw new Error('Tabel stsz audio tidak ditemukan.');

  const sampleSize = view.getUint32(stsz.start + 12);
  const sampleCount = view.getUint32(stsz.start + 16);
  const sampleSizes = [];
  for (let i = 0; i < sampleCount; i++) {
    sampleSizes.push(sampleSize > 0 ? sampleSize : view.getUint32(stsz.start + 20 + i * 4));
  }

  const stco = stblBoxes.find((b) => b.type === 'stco') || stblBoxes.find((b) => b.type === 'co64');
  if (!stco) throw new Error('Tabel stco audio tidak ditemukan.');

  const is64 = stco.type === 'co64';
  const chunkCount = view.getUint32(stco.start + 12);
  const chunkOffsets = [];
  for (let i = 0; i < chunkCount; i++) {
    chunkOffsets.push(
      is64
        ? Number(view.getBigUint64(stco.start + 16 + i * 8))
        : view.getUint32(stco.start + 16 + i * 4)
    );
  }

  const stsc = stblBoxes.find((b) => b.type === 'stsc');
  const stscCount = view.getUint32(stsc.start + 12);
  const stscEntries = [];
  for (let i = 0; i < stscCount; i++) {
    stscEntries.push({
      firstChunk: view.getUint32(stsc.start + 16 + i * 12),
      samplesPerChunk: view.getUint32(stsc.start + 20 + i * 12),
    });
  }

  const sampleOffsets = [];
  let currentSampleIdx = 0;
  for (let c = 1; c <= chunkCount; c++) {
    let spc = 0;
    for (let e = stscEntries.length - 1; e >= 0; e--) {
      if (c >= stscEntries[e].firstChunk) {
        spc = stscEntries[e].samplesPerChunk;
        break;
      }
    }
    let offsetInChunk = chunkOffsets[c - 1];
    for (let s = 0; s < spc && currentSampleIdx < sampleCount; s++) {
      sampleOffsets.push(offsetInChunk);
      offsetInChunk += sampleSizes[currentSampleIdx];
      currentSampleIdx++;
    }
  }

  let totalAacSize = 0;
  for (const s of sampleSizes) totalAacSize += s + 7;
  const aacBuf = new Uint8Array(totalAacSize);
  let aacOffset = 0;

  for (let i = 0; i < sampleCount; i++) {
    const rawLen = sampleSizes[i];
    const frameLen = rawLen + 7;
    // 7-byte ADTS header
    aacBuf[aacOffset] = 0xff;
    aacBuf[aacOffset + 1] = 0xf1;
    aacBuf[aacOffset + 2] =
      ((profile & 0x03) << 6) | ((sampleRateIdx & 0x0f) << 2) | ((channelConfig >> 2) & 0x01);
    aacBuf[aacOffset + 3] = ((channelConfig & 0x03) << 6) | ((frameLen >> 11) & 0x03);
    aacBuf[aacOffset + 4] = (frameLen >> 3) & 0xff;
    aacBuf[aacOffset + 5] = ((frameLen & 0x07) << 5) | 0x1f;
    aacBuf[aacOffset + 6] = 0xfc;

    const srcOffset = sampleOffsets[i];
    aacBuf.set(buf.subarray(srcOffset, srcOffset + rawLen), aacOffset + 7);
    aacOffset += frameLen;
  }

  return aacBuf;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  clearError();
  resultEl.hidden = true;
  setLoading(true);

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || `Error ${res.status}`);
      return;
    }

    currentVideo = data;

    // Tampilkan info video
    thumbnailEl.src = data.thumbnail || '';
    titleEl.textContent = data.title;
    authorEl.textContent = data.author;

    const parts = [];
    if (data.duration) parts.push(formatDuration(data.duration));
    if (data.audio?.size) parts.push(formatBytes(data.audio.size));
    parts.push('360p / AAC');
    detailsEl.textContent = parts.join(' · ');

    const safeTitle = (data.title || 'video').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);

    // Siapkan tombol unduh video langsung (MP4)
    videoBtn.href = `/api/download?v=${data.videoId}`;
    videoBtn.download = `${safeTitle}.mp4`;

    extractStatus.hidden = true;
    resultEl.hidden = false;
  } catch (err) {
    showError('Gagal terhubung ke server.');
  } finally {
    setLoading(false);
  }
});

// Handler unduh audio murni (AAC)
audioBtn.addEventListener('click', async () => {
  if (!currentVideo) return;

  const safeTitle = (currentVideo.title || 'audio').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);

  audioBtn.disabled = true;
  extractStatus.hidden = false;
  extractStatus.textContent = '⏳ Mengunduh stream dari server...';

  try {
    const res = await fetch(`/api/download?v=${currentVideo.videoId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentLength = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;

      if (contentLength > 0) {
        const percent = Math.min(100, Math.round((receivedLength / contentLength) * 100));
        extractStatus.textContent = `⏳ Mengunduh stream... ${percent}%`;
      } else {
        const mb = (receivedLength / (1024 * 1024)).toFixed(1);
        extractStatus.textContent = `⏳ Mengunduh stream... ${mb} MB`;
      }
    }

    extractStatus.textContent = '🎵 Mengekstrak audio murni (AAC)... 100%';

    // Satukan chunks menjadi satu ArrayBuffer
    const combined = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    const arrayBuffer = combined.buffer;

    let audioBlob;
    let extension = 'aac';

    try {
      const aacBytes = extractAacFromMp4(arrayBuffer);
      audioBlob = new Blob([aacBytes], { type: 'audio/aac' });
    } catch (parseErr) {
      console.warn('Demuxer fallback:', parseErr);
      // Fallback jika file sudah merupakan audio murni
      audioBlob = new Blob([arrayBuffer], { type: 'audio/mp4' });
      extension = 'm4a';
    }

    const blobUrl = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${safeTitle}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    extractStatus.textContent = '✅ Audio murni berhasil diunduh!';
    setTimeout(() => {
      extractStatus.hidden = true;
    }, 3500);
  } catch (err) {
    extractStatus.textContent = `❌ Gagal memproses audio: ${err.message}`;
  } finally {
    audioBtn.disabled = false;
  }
});
