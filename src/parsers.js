import { URL, URLSearchParams } from 'node:url';
import { Selector } from './selector.js';
import { HttpClient } from './http.js';

export function absoluteUrl(base, href) {
  if (!href) return '';
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function extractId(url) {
  return url.match(/\/(\d+_\d+|\d+)\/?$/)?.[1] || '';
}

function parseLooseMap(value, keyword = '') {
  if (!value || value === '{}') return {};
  let text = String(value).trim();

  if (text.startsWith('{')) {
    text = text.slice(1, -1);
  }

  const result = {};
  for (const pair of text.split(',')) {
    const [rawKey, ...rawValue] = pair.split(':');
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim().replace(/^['"]|['"]$/g, '');
    let itemValue = rawValue.join(':').trim().replace(/^['"]|['"]$/g, '');
    itemValue = itemValue.replaceAll('%s', keyword);
    if (itemValue) result[key] = itemValue;
  }
  return result;
}

function buildSearchUrl(rule, keyword) {
  const search = rule.search;
  if (search.url.includes('%s')) {
    return search.url.replaceAll('%s', encodeURIComponent(keyword));
  }
  return search.url;
}

function getMetaAware(selector, query, attr = null) {
  if (!query) return '';
  const useAttr = attr || (query.startsWith('meta[') ? 'content' : null);
  return selector.selectOne(query, useAttr).trim();
}

function cleanParagraphs(content, filterTxt = '') {
  let paragraphs = content.split('\n').map((p) => p.trim()).filter(Boolean);
  if (filterTxt) {
    let regex = null;
    try {
      regex = new RegExp(filterTxt, 'gms');
    } catch {
      regex = null;
    }
    if (regex) {
      paragraphs = paragraphs.map((p) => p.replace(regex, '').trim()).filter((p) => p.length >= 3 || /^[\u4e00-\u9fff]{1,2}$/.test(p));
    }
  }
  return paragraphs
    .map((p) => p.replace(/&nbsp;/g, '').replace(/&[a-z]+;/gi, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function relevance(book, keyword) {
  const key = keyword.toLowerCase();
  const name = String(book.book_name || '').toLowerCase();
  const author = String(book.author || '').toLowerCase();
  let score = 0;
  if (key === name) score += 100;
  else if (name.startsWith(key)) score += 80;
  else if (name.includes(key)) score += 60;
  if (key === author) score += 70;
  else if (author.includes(key)) score += 50;
  score += ((name.split(key).length - 1) + (author.split(key).length - 1)) * 10;
  return score;
}

export async function searchRule(rule, keyword, sourceId, maxResults = 20, options = {}) {
  if (!rule.search || rule.search.disabled) return [];
  const client = new HttpClient({ timeout: options.timeout ?? 8000, retries: options.retries ?? 2 });
  const search = rule.search;
  const cookies = parseLooseMap(search.cookies || '{}');
  const url = buildSearchUrl(rule, keyword);
  const response = String(search.method || 'GET').toUpperCase() === 'POST'
    ? await client.post(url, parseLooseMap(search.data || '{}', keyword), { cookies })
    : await client.get(url, { cookies });

  const selector = new Selector(response.text, rule.url);
  const results = [];
  for (const elem of selector.elements(search.result)) {
    const $ = selector.$;
    const itemHtml = $.html(elem);
    const item = new Selector(itemHtml, rule.url);
    const bookName = item.selectOne(search.bookName || search.book_name);
    const author = item.selectOne(search.author);
    if (!bookName || !author) continue;

    const link = item.elements(search.bookName || search.book_name)[0];
    const href = link ? item.$(link).attr('href') : '';
    const book = {
      source_name: rule.name,
      source_id: sourceId,
      book_name: bookName.trim(),
      author: author.trim(),
      url: absoluteUrl(rule.url, href),
      category: search.category ? item.selectOne(search.category) : '',
      latest_chapter: search.latestChapter ? item.selectOne(search.latestChapter) : '',
      word_count: search.wordCount ? item.selectOne(search.wordCount) : '',
      status: search.status ? item.selectOne(search.status) : ''
    };
    results.push(book);
    if (results.length >= maxResults) break;
  }
  return results;
}

export async function parseBook(rule, bookUrl) {
  if (!rule.book) throw new Error(`书源 ${rule.name} 没有配置书籍规则`);
  const client = new HttpClient({ timeout: rule.book.timeout || 8000, retries: 2 });
  const response = await client.get(bookUrl);
  const baseUri = rule.book.baseUri || bookUrl;
  const selector = new Selector(response.text, baseUri);
  const bookName = getMetaAware(selector, rule.book.bookName);
  const author = getMetaAware(selector, rule.book.author);
  if (!bookName || !author) throw new Error('获取书籍信息失败');

  const cover = getMetaAware(selector, rule.book.coverUrl, rule.book.coverUrl?.startsWith('meta[') ? 'content' : 'src');
  return {
    book_name: bookName,
    author,
    intro: getMetaAware(selector, rule.book.intro),
    category: getMetaAware(selector, rule.book.category),
    cover_url: cover ? absoluteUrl(baseUri, cover) : '',
    latest_chapter: getMetaAware(selector, rule.book.latestChapter),
    status: getMetaAware(selector, rule.book.status),
    word_count: getMetaAware(selector, rule.book.wordCount),
    url: bookUrl
  };
}

export async function parseToc(rule, bookUrl, startChapter = 1, endChapter = -1) {
  if (!rule.toc) return [];
  const toc = rule.toc;
  const client = new HttpClient({ timeout: 8000, retries: 2 });
  let tocUrl = toc.url || bookUrl;

  if (toc.url && toc.url.includes('%s')) {
    const id = extractId(bookUrl);
    tocUrl = id ? toc.url.replaceAll('%s', id) : bookUrl;
  }
  if (toc.url && !/^https?:\/\//i.test(tocUrl)) tocUrl = absoluteUrl(bookUrl, tocUrl);

  const response = await client.get(tocUrl);
  let baseUri = toc.baseUri || tocUrl;
  if (baseUri.includes('%s')) {
    const id = extractId(bookUrl);
    baseUri = id ? baseUri.replaceAll('%s', id) : tocUrl;
  }

  const selector = new Selector(response.text, baseUri);
  let chapters = selector.elements(toc.item)
    .map((elem) => {
      const title = selector.$(elem).text().trim();
      const href = selector.$(elem).attr('href');
      return title && href ? { title, url: absoluteUrl(baseUri, href) } : null;
    })
    .filter(Boolean);

  if (toc.isDesc) chapters = chapters.reverse();
  chapters = chapters.map((chapter, index) => ({ ...chapter, index: index + 1 }));

  const start = Math.max(1, Number(startChapter) || 1);
  const end = Number(endChapter) === -1 ? chapters.length : Number(endChapter) || chapters.length;
  return chapters.slice(start - 1, end);
}

export async function parseChapter(rule, chapter) {
  if (!rule.chapter) return chapter;
  const client = new HttpClient({ timeout: 10000, retries: 2 });
  const cfg = rule.chapter;
  const contents = [];
  let currentUrl = chapter.url;
  let title = chapter.title || '';

  for (let page = 0; currentUrl && page < 50; page += 1) {
    const response = await client.get(currentUrl);
    const selector = new Selector(response.text, currentUrl);
    if (!title && cfg.title) title = selector.selectOne(cfg.title);
    const content = selector.extractContent(cfg.content, cfg.paragraphTagClosed, cfg.paragraphTag, cfg.filterTag);
    if (content) contents.push(content);

    if (cfg.pagination && cfg.nextPage) {
      const next = selector.selectOne(cfg.nextPage, 'href');
      const nextUrl = next ? absoluteUrl(currentUrl, next) : '';
      if (!nextUrl || nextUrl === currentUrl) break;
      currentUrl = nextUrl;
    } else {
      break;
    }
  }

  return {
    ...chapter,
    title: title.trim(),
    content: cleanParagraphs(contents.join('\n'), cfg.filterTxt).join('\n')
  };
}
