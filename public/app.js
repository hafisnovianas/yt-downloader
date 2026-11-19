const form = document.getElementById('form');
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');
const thumbnailEl = document.getElementById('thumbnail');
const titleEl = document.getElementById('title');
const authorEl = document.getElementById('author');
const detailsEl = document.getElementById('details');
const downloadBtn = document.getElementById('download-btn');

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

    // Tampilkan info video
    thumbnailEl.src = data.thumbnail || '';
    titleEl.textContent = data.title;
    authorEl.textContent = data.author;

    const parts = [];
    if (data.duration) parts.push(formatDuration(data.duration));
    if (data.audio?.size) parts.push(formatBytes(data.audio.size));
    if (data.audio?.mimeType) parts.push(data.audio.mimeType.split(';')[0]);
    detailsEl.textContent = parts.join(' · ');

    downloadBtn.href = `/api/download?v=${data.videoId}`;
    resultEl.hidden = false;
  } catch (err) {
    showError('Gagal terhubung ke server.');
  } finally {
    setLoading(false);
  }
});
