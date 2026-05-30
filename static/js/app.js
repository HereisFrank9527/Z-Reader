let currentTab = 'search';
let searchResults = [];
let currentDownloadBook = null;

const pageTitles = {
    search: '搜索书籍',
    sources: '书源管理',
    tasks: '下载任务',
    files: '文件管理'
};

const sourceStatusText = {
    success: '正常',
    warning: '无结果',
    error: '错误',
    disabled: '禁用'
};

const taskStatusText = {
    pending: '等待中',
    downloading: '下载中',
    completed: '已完成',
    failed: '失败'
};

document.addEventListener('DOMContentLoaded', function() {
    loadSources();
    loadSourcesForSearch();
    document.getElementById('search-keyword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchBooks();
    });
});

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setPageTitle(tabName) {
    const title = document.getElementById('page-title');
    if (title) title.textContent = pageTitles[tabName] || 'Z Reader';
}

function switchTab(tabName, event) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`${tabName}-tab`).classList.add('active');
    const activeBtn = event?.target || document.querySelector(`.tab-btn[onclick*="'${tabName}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    currentTab = tabName;
    setPageTitle(tabName);

    if (tabName === 'sources') loadSources();
    if (tabName === 'tasks') refreshTasks();
    if (tabName === 'files') refreshFiles();
}

function emptyState(text) {
    return `<p class="empty-state">${escapeHtml(text)}</p>`;
}

function progressCard(title, status, id) {
    return `
        <div class="progress-card">
            <div class="progress-title">${title}</div>
            <div class="progress-bar">
                <div class="progress-fill" id="${id}" style="width: 0%"></div>
            </div>
            <div class="progress-status">${status}</div>
        </div>
    `;
}

function renderSummary(summary, title = '检查结果汇总', timestamp = null) {
    const items = [
        ['总计', summary.total],
        ['正常', summary.success],
        ['无结果', summary.warning],
        ['错误', summary.error],
        ['禁用', summary.disabled]
    ];

    return `
        <div class="summary-card">
            <div class="summary-title">${escapeHtml(title)}</div>
            <div class="summary-grid">
                ${items.map(([label, value]) => `
                    <div class="summary-item">
                        <strong>${value}</strong>
                        <span>${label}</span>
                    </div>
                `).join('')}
            </div>
            ${timestamp ? `<div class="summary-time">检查时间: ${new Date(timestamp).toLocaleString()}</div>` : ''}
        </div>
    `;
}

async function loadSources() {
    const loadingEl = document.getElementById('sources-loading');
    const summaryEl = document.getElementById('check-summary');
    const listEl = document.getElementById('sources-list');

    loadingEl.style.display = 'block';
    summaryEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
        const sourcesResult = await (await fetch('/api/sources')).json();
        loadingEl.style.display = 'none';

        if (!sourcesResult.success) {
            showToast(sourcesResult.message, 'error');
            return;
        }

        try {
            const cacheResult = await (await fetch('/api/sources/check/cached')).json();
            if (cacheResult.success && cacheResult.data) {
                const checkData = cacheResult.data;
                summaryEl.innerHTML = renderSummary(checkData.summary, '上次检查结果', checkData.timestamp);
                summaryEl.style.display = 'block';
                renderCheckResults(checkData.results);
                return;
            }
        } catch {
            // No cached data. Fall back to the source list.
        }

        renderSources(sourcesResult.data);
    } catch (error) {
        loadingEl.style.display = 'none';
        showToast('加载书源失败: ' + error.message, 'error');
    }
}

function renderSources(sources) {
    const listEl = document.getElementById('sources-list');
    if (!sources.length) {
        listEl.innerHTML = emptyState('暂无书源');
        return;
    }

    listEl.innerHTML = sources.map(source => `
        <div class="source-card" id="source-${source.id}">
            <div class="source-name">${source.id}. ${escapeHtml(source.name)}</div>
            <div class="source-url">${escapeHtml(source.url)}</div>
            ${source.comment ? `<div class="source-comment">${escapeHtml(source.comment)}</div>` : ''}
            <div class="badge-row">
                <span class="source-badge ${source.search_enabled ? 'badge-success' : 'badge-warning'}">
                    ${source.search_enabled ? '支持搜索' : '不支持搜索'}
                </span>
                ${source.has_crawl_config ? '<span class="source-badge badge-success">限流配置</span>' : ''}
            </div>
        </div>
    `).join('');
}

async function checkAllSources() {
    const loadingEl = document.getElementById('sources-loading');
    const summaryEl = document.getElementById('check-summary');
    const listEl = document.getElementById('sources-list');

    loadingEl.style.display = 'block';
    summaryEl.style.display = 'none';
    listEl.innerHTML = '<div class="check-progress">' + progressCard('正在检查书源', '准备中', 'check-progress-bar') + '</div>';

    try {
        const response = await fetch('/api/sources/check/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('检查请求失败');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let total = 0;
        const allResults = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                const data = JSON.parse(line.slice(6));

                if (data.type === 'start') {
                    total = data.total;
                    updateProgress('check-progress-bar', 0, `总计 ${total} 个书源`);
                } else if (data.type === 'checking') {
                    setProgressStatus(`正在检查: ${data.source}`);
                } else if (data.type === 'result') {
                    allResults.push(data.result);
                    const percent = total ? (data.completed / total) * 100 : 0;
                    updateProgress('check-progress-bar', percent, `${data.source}: ${sourceStatusText[data.result.status] || data.result.status} (${data.completed}/${total})`);
                    renderCheckResults(allResults);
                } else if (data.type === 'complete') {
                    loadingEl.style.display = 'none';
                    summaryEl.innerHTML = renderSummary(data.summary, '检查结果汇总');
                    summaryEl.style.display = 'block';
                    showToast('书源检查完成，结果已保存', 'success');
                } else if (data.type === 'error') {
                    loadingEl.style.display = 'none';
                    showToast('检查失败: ' + data.message, 'error');
                }
            }
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        showToast('检查书源失败: ' + error.message, 'error');
    }
}

function updateProgress(barId, percent, status) {
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    setProgressStatus(status);
}

function setProgressStatus(status) {
    const el = document.querySelector('.check-progress .progress-status, .search-progress .progress-status');
    if (el) el.textContent = status;
}

function renderCheckResults(results) {
    const listEl = document.getElementById('sources-list');
    const progressDiv = listEl.querySelector('.check-progress');
    let html = progressDiv ? `<div class="check-progress">${progressDiv.innerHTML}</div>` : '';

    if (!results.length) {
        listEl.innerHTML = html + emptyState('暂无书源');
        return;
    }

    html += results.map(source => {
        const status = sourceStatusText[source.status] || source.status;
        const badgeClass = source.status === 'success' ? 'badge-success'
            : source.status === 'warning' ? 'badge-warning'
            : source.status === 'error' ? 'badge-danger'
            : 'badge-secondary';

        return `
            <div class="source-card status-${source.status}">
                <div class="source-name">
                    ${source.id}. ${escapeHtml(source.name)}
                    <span class="source-badge ${badgeClass}">${status}${source.book_count ? ` (${source.book_count}本)` : ''}</span>
                </div>
                <div class="source-url">${escapeHtml(source.url)}</div>
                ${source.message ? `<div class="source-comment">${escapeHtml(source.message)}</div>` : ''}
            </div>
        `;
    }).join('');

    listEl.innerHTML = html;
}

async function loadSourcesForSearch() {
    try {
        const result = await (await fetch('/api/sources')).json();
        if (!result.success) return;

        const selectEl = document.getElementById('search-source');
        selectEl.innerHTML = '<option value="">所有书源</option>';

        let checkData = null;
        try {
            const cacheResult = await (await fetch('/api/sources/check/cached')).json();
            if (cacheResult.success && cacheResult.data) checkData = cacheResult.data;
        } catch {
            checkData = null;
        }

        result.data.forEach(source => {
            if (!source.search_enabled) return;
            if (checkData) {
                const sourceResult = checkData.results.find(r => r.id === source.id);
                if (sourceResult && sourceResult.status !== 'success') return;
            }
            selectEl.innerHTML += `<option value="${source.id}">${escapeHtml(source.name)}</option>`;
        });
    } catch (error) {
        console.error('加载书源失败:', error);
    }
}

async function searchBooks() {
    const keyword = document.getElementById('search-keyword').value.trim();
    const sourceId = document.getElementById('search-source').value;
    const loadingEl = document.getElementById('search-loading');
    const resultsEl = document.getElementById('search-results');

    if (!keyword) {
        showToast('请输入搜索关键词', 'error');
        return;
    }

    loadingEl.style.display = 'block';
    resultsEl.innerHTML = '<div class="search-progress">' + progressCard('正在搜索', `关键词: ${escapeHtml(keyword)}`, 'search-progress-bar') + '</div>';

    try {
        const response = await fetch('/api/search/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword,
                source_id: sourceId ? parseInt(sourceId) : null
            })
        });
        if (!response.ok) throw new Error('搜索请求失败');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalSources = 0;
        let allBooks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                const data = JSON.parse(line.slice(6));

                if (data.type === 'start') {
                    totalSources = data.total;
                    updateProgress('search-progress-bar', 0, `总计 ${totalSources} 个书源`);
                } else if (data.type === 'searching') {
                    setProgressStatus(`正在搜索: ${data.source}`);
                } else if (data.type === 'result') {
                    const percent = totalSources ? (data.completed / totalSources) * 100 : 0;
                    updateProgress('search-progress-bar', percent, `${data.source}: 找到 ${data.count} 本 (${data.completed}/${totalSources})`);
                    allBooks = data.all_books || allBooks.concat(data.books);
                    searchResults = allBooks;
                    renderSearchResults(allBooks);
                } else if (data.type === 'error_source') {
                    const percent = totalSources ? (data.completed / totalSources) * 100 : 0;
                    updateProgress('search-progress-bar', percent, `${data.source}: 搜索失败 (${data.completed}/${totalSources})`);
                } else if (data.type === 'complete') {
                    loadingEl.style.display = 'none';
                    allBooks = data.books;
                    searchResults = allBooks;
                    updateProgress('search-progress-bar', 100, `搜索完成，共找到 ${data.total_books} 本书`);
                    renderSearchResults(allBooks);
                } else if (data.type === 'error') {
                    loadingEl.style.display = 'none';
                    showToast('搜索失败: ' + data.message, 'error');
                }
            }
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        showToast('搜索失败: ' + error.message, 'error');
    }
}

function openReader(index) {
    const book = searchResults[index];
    if (!book) {
        showToast('无效的书籍索引', 'error');
        return;
    }
    window.open(`/reader/${book.source_id}/${encodeURIComponent(book.url)}`, '_blank');
}

function renderSearchResults(books) {
    const resultsEl = document.getElementById('search-results');
    let booksContainer = resultsEl.querySelector('.books-container');
    if (!booksContainer) {
        booksContainer = document.createElement('div');
        booksContainer.className = 'books-container';
        resultsEl.appendChild(booksContainer);
    }

    if (!books.length) {
        booksContainer.innerHTML = emptyState('未找到相关书籍');
        return;
    }

    booksContainer.innerHTML = books.map((book, index) => `
        <div class="result-item">
            <div class="result-header">
                <div>
                    <div class="result-title">${escapeHtml(book.book_name)}</div>
                    <div class="result-author">作者: ${escapeHtml(book.author)}</div>
                </div>
                <div class="action-row">
                    <button class="btn btn-secondary" onclick="openReader(${index})">阅读</button>
                    <button class="btn btn-primary" onclick="openDownloadModal(${index})">下载</button>
                </div>
            </div>
            <div class="result-meta">
                <span>书源: ${escapeHtml(book.source_name)}</span>
                ${book.category ? `<span>分类: ${escapeHtml(book.category)}</span>` : ''}
                ${book.status ? `<span>状态: ${escapeHtml(book.status)}</span>` : ''}
                ${book.word_count ? `<span>字数: ${escapeHtml(book.word_count)}</span>` : ''}
            </div>
            ${book.latest_chapter ? `<div class="latest-chapter">最新: ${escapeHtml(book.latest_chapter)}</div>` : ''}
        </div>
    `).join('');
}

function openDownloadModal(index) {
    const book = searchResults[index];
    currentDownloadBook = book;

    document.getElementById('download-url').value = book.url;
    document.getElementById('download-book-name').value = book.book_name;
    document.getElementById('download-author').value = book.author;
    document.getElementById('download-source-id').value = book.source_id;
    document.getElementById('download-start').value = 1;
    document.getElementById('download-end').value = -1;
    document.getElementById('download-modal').classList.add('active');
}

function closeDownloadModal() {
    document.getElementById('download-modal').classList.remove('active');
    currentDownloadBook = null;
}

async function startDownload() {
    const bookUrl = document.getElementById('download-url').value;
    const sourceId = parseInt(document.getElementById('download-source-id').value);
    const startChapter = parseInt(document.getElementById('download-start').value);
    const endChapter = parseInt(document.getElementById('download-end').value);
    const format = document.getElementById('download-format').value;

    try {
        const result = await (await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                book_url: bookUrl,
                source_id: sourceId,
                start_chapter: startChapter,
                end_chapter: endChapter,
                format
            })
        })).json();

        if (result.success) {
            showToast('下载任务已创建', 'success');
            closeDownloadModal();
            switchTab('tasks');
            setTimeout(() => refreshTasks(), 500);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('创建下载任务失败: ' + error.message, 'error');
    }
}

async function refreshTasks() {
    const listEl = document.getElementById('tasks-list');
    try {
        const result = await (await fetch('/api/tasks')).json();
        if (result.success) renderTasks(result.data);
        else showToast(result.message, 'error');
    } catch (error) {
        showToast('获取任务列表失败: ' + error.message, 'error');
    }
}

function renderTasks(tasks) {
    const listEl = document.getElementById('tasks-list');
    if (!tasks.length) {
        listEl.innerHTML = emptyState('暂无下载任务');
        return;
    }

    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    listEl.innerHTML = tasks.map(task => `
        <div class="task-item">
            <div class="task-header">
                <div>
                    <div class="task-title">
                        ${escapeHtml(task.book_name || '未知书籍')}
                        ${task.author ? `<span>(${escapeHtml(task.author)})</span>` : ''}
                    </div>
                    <div class="task-meta">书源: ${escapeHtml(task.source_name)} | 创建于: ${new Date(task.created_at).toLocaleString()}</div>
                </div>
                <span class="task-status status-${task.status}">${taskStatusText[task.status] || task.status}</span>
            </div>
            ${task.status === 'downloading' ? `
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${task.progress}%"></div>
                </div>
                <div class="task-meta">${task.downloaded_chapters}/${task.total_chapters} 章节</div>
            ` : ''}
            ${task.error ? `<div class="error-text">错误: ${escapeHtml(task.error)}</div>` : ''}
            <div class="action-row">
                <button class="btn btn-danger" onclick="deleteTask('${task.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

async function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;

    try {
        const result = await (await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })).json();
        if (result.success) {
            showToast('任务已删除', 'success');
            refreshTasks();
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除任务失败: ' + error.message, 'error');
    }
}

async function refreshFiles() {
    const listEl = document.getElementById('files-list');
    try {
        const result = await (await fetch('/api/files')).json();
        if (result.success) renderFiles(result.data);
        else showToast(result.message, 'error');
    } catch (error) {
        showToast('获取文件列表失败: ' + error.message, 'error');
    }
}

function renderFiles(files) {
    const listEl = document.getElementById('files-list');
    if (!files.length) {
        listEl.innerHTML = emptyState('暂无已下载文件');
        return;
    }

    listEl.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.name)}</div>
                <div class="file-meta">大小: ${formatFileSize(file.size)} | 修改于: ${new Date(file.modified_at).toLocaleString()}</div>
            </div>
            <a href="/api/files/${encodeURIComponent(file.name)}" download class="btn btn-primary">下载</a>
        </div>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

setInterval(() => {
    if (currentTab === 'tasks') refreshTasks();
}, 5000);
