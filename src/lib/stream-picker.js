/**
 * Pemilihan stream audio terbaik dari YouTube streamingData.
 * Diport dari versi bot Telegram.
 */

/**
 * Pilih stream audio terbaik.
 * Prioritas: audio murni adaptiveFormats → format progresif → cipher.
 */
export function pickBestAudio(streamingData) {
  const adaptive = streamingData?.adaptiveFormats || [];
  const formats = streamingData?.formats || [];

  // 1. Audio murni di adaptiveFormats dengan URL langsung
  const audioStreams = adaptive.filter((f) => f.mimeType?.startsWith('audio/'));
  const directAudio = audioStreams.filter((f) => f.url && !f.signatureCipher && !f.cipher);
  if (directAudio.length > 0) {
    directAudio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const picked = directAudio[0];
    return {
      url: picked.url,
      itag: picked.itag,
      mimeType: picked.mimeType,
      bitrate: picked.bitrate,
      contentLength: picked.contentLength ? Number(picked.contentLength) : null,
    };
  }

  // 2. Format progresif (itag 18 dll) dengan URL langsung
  const directProg = formats.filter((f) => f.url && !f.signatureCipher && !f.cipher);
  if (directProg.length > 0) {
    directProg.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
    const picked = directProg[0];
    return {
      url: picked.url,
      itag: picked.itag,
      mimeType: picked.mimeType || 'video/mp4',
      bitrate: picked.audioBitrate || 128000,
      contentLength: picked.contentLength ? Number(picked.contentLength) : null,
    };
  }

  // 3. Audio terkunci cipher
  const cipherAudio = audioStreams.find((f) => f.signatureCipher || f.cipher);
  if (cipherAudio) {
    return {
      url: null,
      itag: cipherAudio.itag,
      mimeType: cipherAudio.mimeType,
      bitrate: cipherAudio.bitrate,
      contentLength: cipherAudio.contentLength ? Number(cipherAudio.contentLength) : null,
    };
  }

  return null;
}

/**
 * Tentukan ekstensi file berdasarkan mimeType.
 */
export function audioExtension(mimeType) {
  if (!mimeType) return 'mp4';
  if (mimeType.startsWith('video/')) return 'mp4';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'mp4';
}
