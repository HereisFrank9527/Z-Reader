import * as cheerio from 'cheerio';

function stripTbody(selector) {
  return selector
    .replace(/>\s*tbody\s*>/gi, '>')
    .replace(/\s+tbody\s+/gi, ' ')
    .replace(/>\s*tbody\s+/gi, '> ')
    .replace(/\s+tbody\s*>/gi, ' >');
}

function textOf($, elem) {
  return $(elem).text().replace(/\s+/g, ' ').trim();
}

function applyMiniJs(expr, value) {
  let result = value;
  const replacePattern = /\.replace\(['"]([^'"]*)['"],\s*['"]([^'"]*)['"]\)/g;
  for (const match of expr.matchAll(replacePattern)) {
    result = result.replaceAll(match[1], match[2]);
  }
  return result;
}

export class Selector {
  constructor(html, baseUrl = '') {
    this.html = html;
    this.baseUrl = baseUrl;
    this.$ = cheerio.load(html, { decodeEntities: true });
  }

  elements(selector) {
    if (!selector || selector.startsWith('/') || selector.startsWith('//')) return [];
    let result = this.$(selector).toArray();
    if (result.length === 0 && /tbody/i.test(selector)) {
      result = this.$(stripTbody(selector)).toArray();
    }
    return result;
  }

  select(selector, attr = null) {
    if (!selector) return [];
    let query = selector;
    let jsExpr = null;
    if (query.includes('@js:')) {
      [query, jsExpr] = query.split('@js:');
      query = query.trim();
    }

    return this.elements(query)
      .map((elem) => {
        let value = attr ? this.$(elem).attr(attr) : textOf(this.$, elem);
        if (!value && !attr && elem.type === 'text') value = elem.data;
        if (value && jsExpr) value = applyMiniJs(jsExpr, value);
        return value ? String(value).trim() : '';
      })
      .filter(Boolean);
  }

  selectOne(selector, attr = null) {
    return this.select(selector, attr)[0] || '';
  }

  extractContent(selector, paragraphTagClosed = false, paragraphTag = null, filterTags = '') {
    const elem = this.elements(selector)[0];
    if (!elem) return '';

    const $content = cheerio.load(this.$.html(elem), { decodeEntities: true });
    const root = $content.root();

    for (const tag of String(filterTags || '').split(/\s+/).filter(Boolean)) {
      root.find(tag).remove();
    }
    root.find('script,style,iframe,noscript').remove();

    let paragraphs = [];
    if (paragraphTagClosed) {
      for (const tag of ['p', 'div', 'section']) {
        const found = root.find(tag).toArray();
        if (found.length) {
          paragraphs = found.map((node) => textOf($content, node));
          break;
        }
      }
      if (!paragraphs.length) {
        paragraphs = root.children().toArray().map((node) => textOf($content, node));
      }
    } else {
      const html = root.html() || '';
      if (paragraphTag) {
        let pattern = paragraphTag.replace(/<br>/gi, '<br\\s*/?>').replace(/<br\/>/gi, '<br\\s*/?>');
        const regex = new RegExp(pattern, 'i');
        paragraphs = html.split(regex).map((part) => cheerio.load(part).text().trim());
      } else if ((html.match(/<br\s*\/?>/gi) || []).length > 3) {
        paragraphs = html.split(/<br\s*\/?>+/i).map((part) => cheerio.load(part).text().trim());
      } else {
        paragraphs = root.text().split('\n').map((line) => line.trim());
      }
    }

    return paragraphs.filter((p) => p && p.trim()).join('\n');
  }
}
