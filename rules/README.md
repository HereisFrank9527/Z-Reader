# 书源规则说明

## 概述

书源规则是用于定义如何从不同小说网站获取数据的配置文件。每个书源规则包含搜索、书籍详情、目录和章节内容的解析规则。

## 规则结构

每个书源规则是一个JSON对象，包含以下主要部分：

```json
{
  "url": "网站基础URL",
  "name": "书源名称",
  "comment": "注释信息",
  "search": {
    // 搜索相关配置
  },
  "book": {
    // 书籍详情相关配置
  },
  "toc": {
    // 目录相关配置
  },
  "chapter": {
    // 章节内容相关配置
  }
}
```

## 字段说明

### 1. 基本信息

| 字段名 | 类型 | 描述 | 示例 |
|-------|------|------|------|
| url | string | 网站基础URL，用于构建完整链接 | `"https://www.example.com/"` |
| name | string | 书源名称，显示在前端界面 | `"示例小说网"` |
| comment | string | 注释信息，用于说明书源特点或问题 | `"搜索有限流，下载速度快"` |

### 2. 搜索配置 (search)

| 字段名 | 类型 | 描述 | 示例 |
|-------|------|------|------|
| url | string | 搜索页面URL，`%s` 表示搜索关键词占位符 | `"https://www.example.com/search?q=%s"` |
| method | string | 请求方法，`get` 或 `post` | `"post"` |
| data | string | POST请求的数据，`%s` 表示搜索关键词占位符 | `"{searchkey: %s}"` |
| cookies | string | 请求时使用的Cookie | `"session_id=abc123"` |
| result | string | 搜索结果列表的CSS选择器 | `".novelslist > ul > li"` |
| bookName | string | 书名的CSS选择器 | `"span.s2 > a"` |
| author | string | 作者的CSS选择器 | `"span.s4"` |
| category | string | 分类的CSS选择器 | `"span.s1"` |
| latestChapter | string | 最新章节的CSS选择器 | `"span.s3 > a"` |
| lastUpdateTime | string | 最后更新时间的CSS选择器 | `"span.s5"` |
| wordCount | string | 字数的CSS选择器 | `"span.s6"` |
| status | string | 状态的CSS选择器 | `"span.s7"` |
| pagination | boolean | 是否支持分页 | `true` |
| nextPage | string | 下一页链接的CSS选择器 | `"#next_page"` |

### 3. 书籍详情配置 (book)

| 字段名 | 类型 | 描述 | 示例 |
|-------|------|------|------|
| url | string | 书籍详情页URL模板，用于提取书籍ID | `"https://www.example.com/book/(.*?).html"` |
| bookName | string | 书名的CSS选择器或XPath | `"meta[property=\"og:novel:book_name\"]"` |
| author | string | 作者的CSS选择器或XPath | `"meta[property=\"og:novel:author\"]"` |
| intro | string | 简介的CSS选择器或XPath | `"#intro"` |
| category | string | 分类的CSS选择器或XPath | `"meta[property=\"og:novel:category\"]"` |
| coverUrl | string | 封面URL的CSS选择器或XPath | `".book-cover img"` |
| latestChapter | string | 最新章节的CSS选择器或XPath | `"meta[property=\"og:novel:latest_chapter_name\"]"` |
| lastUpdateTime | string | 最后更新时间的CSS选择器或XPath | `"meta[property=\"og:novel:update_time\"]"` |
| status | string | 状态的CSS选择器或XPath | `"meta[property=\"og:novel:status\"]"` |
| wordCount | string | 字数的CSS选择器或XPath | `"#word-count"` |

### 4. 目录配置 (toc)

| 字段名 | 类型 | 描述 | 示例 |
|-------|------|------|------|
| url | string | 目录页URL模板 | `"https://www.example.com/book/%s/chapters.html"` |
| baseUri | string | 目录项URL的基础URL | `"https://www.example.com/book/%s/"` |
| list | string | 目录列表的CSS选择器或XPath，支持JavaScript处理 | `"#chapter-list"` |
| item | string | 目录项的CSS选择器 | `"#chapter-list > ul > li > a"` |
| pagination | boolean | 是否支持分页 | `true` |
| nextPage | string | 下一页链接的CSS选择器 | `"#next-page"` |

### 5. 章节内容配置 (chapter)

| 字段名 | 类型 | 描述 | 示例 |
|-------|------|------|------|
| title | string | 章节标题的CSS选择器 | `"h1.chapter-title"` |
| content | string | 章节内容的CSS选择器，支持JavaScript处理 | `"#content"` |
| paragraphTagClosed | boolean | 段落标签是否闭合 | `true` |
| paragraphTag | string | 段落分隔符 | `<br/>` |
| filterTxt | string | 要过滤的文本正则表达式 | `"\(本章完\)"` |
| filterTag | string | 要过滤的HTML标签 | `"script style"` |
| pagination | boolean | 是否支持分页 | `true` |
| nextPage | string | 下一页链接的CSS选择器 | `"#next-chapter"` |

## 特殊语法

### 1. JavaScript处理

使用 `@js:` 前缀表示需要执行JavaScript代码来处理结果：

```json
"author": "div.bookinfo > div.author@js:r=r.replace('作者：', '');"
```

### 2. 搜索关键词占位符

在搜索URL和POST数据中，使用 `%s` 表示搜索关键词的占位符：

```json
"url": "https://www.example.com/search?q=%s"
```

### 3. 正则表达式

在 `filterTxt` 字段中，可以使用正则表达式来过滤文本：

```json
"filterTxt": "\(本章完\)|请记住本站地址"
```

### 4. 分页处理

当网站支持分页时，可以使用 `pagination` 和 `nextPage` 字段来处理分页：

```json
"pagination": true,
"nextPage": "#next_page"
```

## 示例书源规则

```json
{
  "url": "https://www.example.com/",
  "name": "示例小说网",
  "comment": "这是一个示例书源",
  "search": {
    "url": "https://www.example.com/search?q=%s",
    "method": "get",
    "result": ".search-results > ul > li",
    "bookName": ".book-title > a",
    "author": ".book-author",
    "category": ".book-category",
    "latestChapter": ".book-latest-chapter > a",
    "lastUpdateTime": ".book-update-time"
  },
  "book": {
    "bookName": "h1.book-title",
    "author": ".book-info > .author",
    "intro": ".book-intro",
    "category": ".book-info > .category",
    "coverUrl": ".book-cover > img",
    "latestChapter": ".book-latest-chapter > a",
    "lastUpdateTime": ".book-update-time",
    "wordCount": ".book-word-count"
  },
  "toc": {
    "item": "#chapter-list > ul > li > a"
  },
  "chapter": {
    "title": "h1.chapter-title",
    "content": "#chapter-content",
    "paragraphTagClosed": true,
    "filterTxt": "\(本章完\)"
  }
}
```

## 注意事项

1. **CSS选择器**：请确保使用正确的CSS选择器来定位元素
2. **JavaScript处理**：复杂的页面可能需要使用JavaScript来处理数据
3. **分页处理**：对于支持分页的网站，请正确配置分页规则
4. **性能优化**：尽量使用简洁的选择器，避免使用复杂的XPath表达式
5. **错误处理**：如果遇到解析错误，可以通过添加注释来记录问题

## 调试技巧

1. 使用浏览器开发者工具检查页面结构
2. 测试CSS选择器是否能正确定位元素
3. 检查JavaScript代码是否能正确处理数据
4. 注意网站的反爬策略，可能需要调整请求头或添加延迟

## 更新日志

- 2025-12-12：创建初始版本

