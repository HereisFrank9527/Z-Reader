import iconv from 'iconv-lite';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectEncoding(headers, bytes) {
  const contentType = headers.get('content-type') || '';
  const headerMatch = contentType.match(/charset=([^;\s]+)/i);
  if (headerMatch) return normalizeEncoding(headerMatch[1]);

  const head = iconv.decode(Buffer.from(bytes.slice(0, 4096)), 'utf8');
  const metaMatch = head.match(/charset=["']?\s*([-\w]+)/i);
  if (metaMatch) return normalizeEncoding(metaMatch[1]);

  const utf8 = iconv.decode(Buffer.from(bytes), 'utf8');
  return utf8.includes('\uFFFD') ? 'gb18030' : 'utf8';
}

function normalizeEncoding(value) {
  const enc = value.toLowerCase();
  if (enc === 'gbk' || enc === 'gb2312') return 'gb18030';
  return enc;
}

function cookieHeader(cookies = {}) {
  return Object.entries(cookies)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

export class HttpClient {
  constructor(options = {}) {
    this.timeout = options.timeout ?? 30000;
    this.retries = options.retries ?? 2;
    this.minInterval = options.minInterval ?? 0;
    this.maxInterval = options.maxInterval ?? 0;
  }

  async request(url, options = {}) {
    if (this.maxInterval > 0) {
      const delay = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
      await sleep(delay);
    }

    let lastError;
    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const headers = {
          'user-agent': UA,
          ...options.headers
        };
        if (options.cookies) {
          const cookies = cookieHeader(options.cookies);
          if (cookies) headers.cookie = cookies;
        }

        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body: options.body,
          signal: controller.signal,
          redirect: 'follow'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

        const bytes = new Uint8Array(await response.arrayBuffer());
        const encoding = detectEncoding(response.headers, bytes);
        return {
          url: response.url,
          status: response.status,
          text: iconv.decode(Buffer.from(bytes), encoding),
          headers: response.headers
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.retries - 1) await sleep(500 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  post(url, data = {}, options = {}) {
    const body = new URLSearchParams(data).toString();
    return this.request(url, {
      ...options,
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(options.headers || {})
      }
    });
  }
}
