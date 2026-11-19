/**
 * Rate limiter middleware berbasis Cloudflare D1.
 * 10 request per IP per 15 menit.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_REQUESTS = 10;

async function hashIP(ip) {
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function rateLimitMiddleware(c, next) {
  const db = c.env.DB;
  if (!db) return next(); // Skip jika D1 belum di-binding (dev tanpa DB)

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const ipHash = await hashIP(ip);
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare('SELECT count, window_start FROM rate_limits WHERE ip_hash = ?')
    .bind(ipHash)
    .first();

  if (!row) {
    await db
      .prepare('INSERT INTO rate_limits (ip_hash, count, window_start) VALUES (?, 1, ?)')
      .bind(ipHash, now)
      .run();
    return next();
  }

  // Window expired — reset
  if (now - row.window_start > WINDOW_SECONDS) {
    await db
      .prepare('UPDATE rate_limits SET count = 1, window_start = ? WHERE ip_hash = ?')
      .bind(now, ipHash)
      .run();

    // Probabilistic cleanup: 1% chance hapus entry lama (> 1 jam)
    if (Math.random() < 0.01) {
      c.executionCtx.waitUntil(
        db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 3600).run()
      );
    }

    return next();
  }

  // Limit tercapai
  if (row.count >= MAX_REQUESTS) {
    const retryAfter = row.window_start + WINDOW_SECONDS - now;
    return c.json(
      { error: 'Terlalu banyak permintaan. Coba lagi nanti.', retryAfter },
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  // Increment counter
  await db
    .prepare('UPDATE rate_limits SET count = count + 1 WHERE ip_hash = ?')
    .bind(ipHash)
    .run();

  return next();
}

/**
 * Hash IP untuk logging (privacy-safe).
 */
export { hashIP };
