# Z Reader Lite

Z Reader Lite 是一个基于 Node.js 的小说搜索、在线阅读和下载工具。核心思路很简单：用 `rules/main-rules.json` 描述书源规则，服务端按规则抓取、解析、聚合结果，前端提供搜索、阅读、任务和文件管理。

## 特性

- 规则驱动书源，不把站点逻辑写死在代码里
- 支持全书源或指定书源搜索
- 支持在线阅读章节目录和正文
- 支持 TXT / EPUB 下载任务
- 使用 JSON 文件保存任务和检查结果，无数据库依赖
- 现代化扁平 Web 界面，适配桌面和移动端

## 启动

```bash
npm install
npm start
```

访问：

```text
http://localhost:5000
```

开发模式：

```bash
npm run dev
```

## 目录结构

```text
Z-reader/
├── src/
│   ├── server.js       # Express Web/API 入口
│   ├── parsers.js      # 搜索、书籍、目录、章节解析
│   ├── selector.js     # CSS 选择器和正文抽取
│   ├── http.js         # 请求、重试、编码处理
│   ├── downloader.js   # TXT/EPUB 下载生成
│   ├── rules.js        # 规则加载
│   ├── store.js        # JSON 持久化
│   └── paths.js        # 路径常量
├── rules/              # 书源规则
├── static/             # 前端 JS/CSS/图标
├── templates/          # 页面模板
├── data/               # 任务和检查结果
└── downloads/          # 下载文件
```

## 数据文件

- `data/tasks.json`: 下载任务状态
- `data/check-results.json`: 书源检查缓存
- `downloads/`: 生成的 TXT / EPUB 文件

## 规则

主规则文件是 `rules/main-rules.json`。每个书源可配置：

- `search`: 搜索入口和结果字段
- `book`: 书籍详情字段
- `toc`: 章节目录字段
- `chapter`: 正文抽取和过滤规则

## 注意

本项目仅供学习交流。下载内容请遵守目标站点规则和相关法律法规。

## 许可证

GPL-3.0
