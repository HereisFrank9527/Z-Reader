import fs from 'node:fs/promises';
import path from 'node:path';
import yazl from 'yazl';
import { DOWNLOAD_DIR } from './paths.js';
import { parseBook, parseToc, parseChapter } from './parsers.js';
import { updateTask } from './store.js';

function safeName(name) {
  return String(name || 'unknown').replace(/[\\/:*?"<>|]/g, '_').trim() || 'unknown';
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function writeEpub(filename, book, chapters) {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('application/epub+zip'), 'mimetype', { compress: false });
  zip.addBuffer(Buffer.from(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`), 'META-INF/container.xml');

  const manifest = chapters.map((_, i) => `<item id="c${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n');
  zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" unique-identifier="bookid" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${Date.now()}</dc:identifier>
    <dc:title>${htmlEscape(book.book_name)}</dc:title>
    <dc:creator>${htmlEscape(book.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`), 'OEBPS/content.opf');

  chapters.forEach((chapter, i) => {
    const paragraphs = chapter.content.split('\n').filter(Boolean).map((p) => `<p>${htmlEscape(p)}</p>`).join('\n');
    zip.addBuffer(Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${htmlEscape(chapter.title)}</title></head>
<body><h1>${htmlEscape(chapter.title)}</h1>${paragraphs}</body></html>`), `OEBPS/chapter${i + 1}.xhtml`);
  });

  await new Promise((resolve, reject) => {
    const chunks = [];
    zip.outputStream.on('data', (chunk) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', async () => {
      try {
        await fs.writeFile(filename, Buffer.concat(chunks));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    zip.end();
  });
}

export async function runDownload(taskId, rule, payload) {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  await updateTask(taskId, { status: 'downloading' });

  try {
    const book = await parseBook(rule, payload.book_url);
    await updateTask(taskId, { book_name: book.book_name, author: book.author });

    const toc = await parseToc(rule, payload.book_url, payload.start_chapter, payload.end_chapter);
    await updateTask(taskId, { total_chapters: toc.length, downloaded_chapters: 0, progress: 0 });

    const chapters = [];
    for (let i = 0; i < toc.length; i += 1) {
      const chapter = await parseChapter(rule, toc[i]);
      chapters.push(chapter);
      await updateTask(taskId, {
        downloaded_chapters: i + 1,
        progress: toc.length ? Math.round(((i + 1) / toc.length) * 100) : 100
      });
    }

    const base = `${safeName(book.book_name)}-${safeName(book.author)}`;
    const format = payload.format === 'epub' ? 'epub' : 'txt';
    const filename = path.join(DOWNLOAD_DIR, `${base}.${format}`);

    if (format === 'epub') {
      await writeEpub(filename, book, chapters);
    } else {
      const text = [`${book.book_name}\n作者：${book.author}\n`, ...chapters.map((chapter) => `${chapter.title}\n\n${chapter.content}\n`)].join('\n\n');
      await fs.writeFile(filename, text, 'utf8');
    }

    await updateTask(taskId, { status: 'completed', progress: 100, file_name: path.basename(filename) });
  } catch (error) {
    await updateTask(taskId, { status: 'failed', error: error.message || String(error) });
  }
}
