import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, DOWNLOAD_DIR, STATIC_DIR, TEMPLATES_DIR } from './paths.js';
import { getRule, loadRules, sourceSummary } from './rules.js';
import { loadCheckResults, loadTasks, saveCheckResults, saveTasks } from './store.js';
import { parseBook, parseChapter, parseToc, relevance, searchRule } from './parsers.js';
import { runDownload } from './downloader.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const readerCache = new Map();
const packageInfo = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'));

app.use(express.json({ limit: '1mb' }));
app.use('/static', express.static(STATIC_DIR));

function jsonError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}

function sse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function renderTemplate(text, values) {
  let html = text;
  for (const [key, value] of Object.entries(values)) {
    html = html.replaceAll(`{{ ${key} }}`, String(value));
    html = html.replaceAll(`{{${key}}}`, String(value));
  }
  return html;
}

function renderIndexTemplate(text, announcement) {
  return text
    .replace(/{% if announcement %}([\s\S]*?){% endif %}/, announcement ? '$1' : '')
    .replace('{{ announcement|safe }}', announcement);
}

function markdownToHtml(markdown) {
  if (!markdown) return '';
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .split(/\n{2,}/)
    .map((block) => /^<h[1-3]>/.test(block) ? block.replace(/\n/g, '<br>') : `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function sourceCheck(rule, id, keyword = '斗破苍穹') {
  const result = {
    id,
    name: rule.name,
    url: rule.url,
    status: 'unknown',
    message: '',
    book_count: 0
  };

  if (!rule.search || rule.search.disabled) {
    return { ...result, status: 'disabled', message: '无搜索配置' };
  }

  try {
    const books = await searchRule(rule, keyword, id, 5, { timeout: 5000, retries: 1 });
    if (books.length) {
      return { ...result, status: 'success', book_count: books.length, message: `正常 - 找到 ${books.length} 本书` };
    }
    return { ...result, status: 'warning', message: '无搜索结果' };
  } catch (error) {
    return { ...result, status: 'error', message: String(error.message || error).slice(0, 100) };
  }
}

function summarizeChecks(results) {
  return {
    total: results.length,
    success: results.filter((item) => item.status === 'success').length,
    error: results.filter((item) => item.status === 'error').length,
    warning: results.filter((item) => item.status === 'warning').length,
    disabled: results.filter((item) => item.status === 'disabled').length
  };
}

async function sortedSearch(keyword, sourceId = null, onSource = null) {
  const rules = await loadRules();
  const selected = sourceId ? [{ rule: rules[Number(sourceId) - 1], id: Number(sourceId) }] : rules.map((rule, index) => ({ rule, id: index + 1 }));
  const books = [];

  for (const item of selected) {
    if (!item.rule?.search || item.rule.search.disabled) continue;
    const sourceBooks = await searchRule(item.rule, keyword, item.id, 20, { timeout: 8000, retries: 2 });
    books.push(...sourceBooks);
    books.sort((a, b) => relevance(b, keyword) - relevance(a, keyword));
    if (onSource) await onSource(item.rule, sourceBooks, books);
  }

  books.sort((a, b) => relevance(b, keyword) - relevance(a, keyword));
  return books;
}

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'icon.ico'));
});

app.get('/', async (_req, res) => {
  const template = await fs.readFile(path.join(TEMPLATES_DIR, 'index.html'), 'utf8');
  let announcement = '';
  try {
    announcement = markdownToHtml(await fs.readFile(path.join(TEMPLATES_DIR, 'index.md'), 'utf8'));
  } catch {
    announcement = '';
  }
  res.type('html').send(renderIndexTemplate(template, announcement));
});

app.get('/api/sources', async (_req, res) => {
  try {
    const rules = await loadRules();
    res.json({ success: true, data: rules.map((rule, index) => sourceSummary(rule, index + 1)), total: rules.length });
  } catch (error) {
    jsonError(res, `获取书源失败: ${error.message}`);
  }
});

app.get('/api/version', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: packageInfo.name,
      version: packageInfo.version,
      repository: 'https://github.com/HereisFrank9527/Z-Reader',
      release: `https://github.com/HereisFrank9527/Z-Reader/releases/tag/v${packageInfo.version}`
    }
  });
});

app.post('/api/sources/check', async (_req, res) => {
  try {
    const rules = await loadRules();
    const results = [];
    for (let i = 0; i < rules.length; i += 1) results.push(await sourceCheck(rules[i], i + 1));
    const summary = summarizeChecks(results);
    await saveCheckResults(results, summary);
    res.json({ success: true, data: results, summary });
  } catch (error) {
    jsonError(res, `检查书源失败: ${error.message}`);
  }
});

app.get('/api/sources/check/cached', async (_req, res) => {
  const cached = await loadCheckResults();
  if (!cached) return res.json({ success: false, message: '暂无缓存结果', cached: false });
  return res.json({ success: true, data: cached, cached: true });
});

app.post('/api/sources/check/stream', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const rules = await loadRules();
    const results = [];
    sse(res, { type: 'start', total: rules.length });
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      sse(res, { type: 'checking', source: rule.name });
      const result = await sourceCheck(rule, i + 1);
      results.push(result);
      sse(res, { type: 'result', source: rule.name, result, completed: i + 1, total: rules.length });
    }
    const summary = summarizeChecks(results);
    await saveCheckResults(results, summary);
    sse(res, { type: 'complete', summary, results });
  } catch (error) {
    sse(res, { type: 'error', message: `检查书源失败: ${error.message}` });
  } finally {
    res.end();
  }
});

app.post('/api/search', async (req, res) => {
  const keyword = String(req.body.keyword || '').trim();
  const sourceId = req.body.source_id || null;
  if (!keyword) return jsonError(res, '请输入搜索关键词', 400);
  try {
    const books = await sortedSearch(keyword, sourceId);
    res.json({ success: true, data: books, total: books.length, keyword });
  } catch (error) {
    jsonError(res, `搜索失败: ${error.message}`);
  }
});

app.post('/api/search/stream', async (req, res) => {
  const keyword = String(req.body.keyword || '').trim();
  const sourceId = req.body.source_id || null;
  if (!keyword) return jsonError(res, '请输入搜索关键词', 400);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const rules = await loadRules();
    if (sourceId && (sourceId < 1 || sourceId > rules.length)) {
      sse(res, { type: 'error', message: `无效的书源 ID: ${sourceId}` });
      return;
    }
    const selected = sourceId ? [rules[Number(sourceId) - 1]] : rules;
    const total = selected.filter((rule) => rule.search && !rule.search.disabled).length;
    let completed = 0;
    const allBooks = [];
    sse(res, { type: 'start', total, keyword });
    for (const rule of selected) {
      if (!rule.search || rule.search.disabled) continue;
      sse(res, { type: 'searching', source: rule.name });
      try {
        const originalId = rules.indexOf(rule) + 1;
        const books = await searchRule(rule, keyword, originalId, 20, { timeout: 8000, retries: 2 });
        allBooks.push(...books);
        allBooks.sort((a, b) => relevance(b, keyword) - relevance(a, keyword));
        completed += 1;
        sse(res, { type: 'result', source: rule.name, books, count: books.length, completed, total, all_books: allBooks });
      } catch (error) {
        completed += 1;
        sse(res, { type: 'error_source', source: rule.name, error: error.message, completed, total });
      }
    }
    allBooks.sort((a, b) => relevance(b, keyword) - relevance(a, keyword));
    sse(res, { type: 'complete', total_books: allBooks.length, books: allBooks });
  } catch (error) {
    sse(res, { type: 'error', message: error.message });
  } finally {
    res.end();
  }
});

app.post('/api/reader/book', async (req, res) => {
  const bookUrl = String(req.body.book_url || '').trim();
  const sourceId = req.body.source_id;
  if (!bookUrl || !sourceId) return jsonError(res, '请提供书籍 URL 和书源 ID', 400);

  const key = `book:${sourceId}:${bookUrl}`;
  if (readerCache.has(key)) return res.json({ success: true, data: readerCache.get(key), cached: true });

  try {
    const { rule } = await getRule(sourceId);
    const book = await parseBook(rule, bookUrl);
    const chapters = await parseToc(rule, bookUrl);
    const data = { ...book, chapters };
    readerCache.set(key, data);
    res.json({ success: true, data, cached: false });
  } catch (error) {
    jsonError(res, `获取书籍信息失败: ${error.message}`);
  }
});

app.post('/api/reader/chapter', async (req, res) => {
  const chapterUrl = String(req.body.chapter_url || '').trim();
  const sourceId = req.body.source_id;
  if (!chapterUrl || !sourceId) return jsonError(res, '请提供章节 URL 和书源 ID', 400);

  const key = `chapter:${sourceId}:${chapterUrl}`;
  if (readerCache.has(key)) return res.json({ success: true, data: readerCache.get(key), cached: true });

  try {
    const { rule } = await getRule(sourceId);
    const chapter = await parseChapter(rule, { url: chapterUrl, title: '', index: 0 });
    readerCache.set(key, chapter);
    res.json({ success: true, data: chapter, cached: false });
  } catch (error) {
    jsonError(res, `获取章节内容失败: ${error.message}`);
  }
});

app.get('/reader/:sourceId/:bookUrl(*)', async (req, res) => {
  try {
    const { rule } = await getRule(req.params.sourceId);
    const template = await fs.readFile(path.join(TEMPLATES_DIR, 'reader.html'), 'utf8');
    res.type('html').send(renderTemplate(template, {
      source_id: req.params.sourceId,
      book_url: decodeURIComponent(req.params.bookUrl).replace(/'/g, "\\'"),
      source_name: rule.name
    }));
  } catch (error) {
    res.status(404).send(error.message);
  }
});

app.post('/api/download', async (req, res) => {
  const payload = {
    book_url: String(req.body.book_url || '').trim(),
    source_id: Number(req.body.source_id),
    start_chapter: Number(req.body.start_chapter || 1),
    end_chapter: Number(req.body.end_chapter ?? -1),
    format: req.body.format === 'epub' ? 'epub' : 'txt'
  };
  if (!payload.book_url) return jsonError(res, '请提供书籍 URL', 400);
  if (!payload.source_id) return jsonError(res, '请指定书源 ID', 400);

  try {
    const { rule } = await getRule(payload.source_id);
    const task = {
      id: String(Date.now()),
      book_url: payload.book_url,
      source_id: payload.source_id,
      source_name: rule.name,
      book_name: '',
      author: '',
      start_chapter: payload.start_chapter,
      end_chapter: payload.end_chapter,
      format: payload.format,
      status: 'pending',
      progress: 0,
      total_chapters: 0,
      downloaded_chapters: 0,
      error: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const tasks = await loadTasks();
    tasks.push(task);
    await saveTasks(tasks);
    runDownload(task.id, rule, payload);
    res.json({ success: true, data: { task_id: task.id }, message: '下载任务已创建' });
  } catch (error) {
    jsonError(res, `创建下载任务失败: ${error.message}`);
  }
});

app.get('/api/tasks', async (_req, res) => {
  const tasks = await loadTasks();
  res.json({ success: true, data: tasks, total: tasks.length });
});

app.get('/api/tasks/:taskId', async (req, res) => {
  const task = (await loadTasks()).find((item) => item.id === req.params.taskId);
  if (!task) return jsonError(res, '任务不存在', 404);
  return res.json({ success: true, data: task });
});

app.delete('/api/tasks/:taskId', async (req, res) => {
  const tasks = await loadTasks();
  const next = tasks.filter((task) => task.id !== req.params.taskId);
  if (next.length === tasks.length) return jsonError(res, '任务不存在', 404);
  await saveTasks(next);
  return res.json({ success: true, message: '任务已删除' });
});

app.get('/api/files', async (_req, res) => {
  try {
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(DOWNLOAD_DIR, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(txt|epub)$/i.test(entry.name)) continue;
      const filePath = path.join(DOWNLOAD_DIR, entry.name);
      const stat = await fs.stat(filePath);
      files.push({
        name: entry.name,
        size: stat.size,
        created_at: stat.birthtime.toISOString(),
        modified_at: stat.mtime.toISOString()
      });
    }
    files.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    res.json({ success: true, data: files, total: files.length });
  } catch (error) {
    jsonError(res, `获取文件列表失败: ${error.message}`);
  }
});

app.get('/api/files/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  res.download(path.join(DOWNLOAD_DIR, filename), filename, (error) => {
    if (error && !res.headersSent) jsonError(res, '文件不存在', 404);
  });
});

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, '::', () => {
    console.log(`Z Reader Lite: http://localhost:${port}`);
  });
}

export default app;
