# Z Reader Lite

[![Release](https://img.shields.io/github/v/release/HereisFrank9527/Z-Reader?include_prereleases&label=release)](https://github.com/HereisFrank9527/Z-Reader/releases)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)
[![Online](https://img.shields.io/badge/demo-z.dgtsr.top-0f766e.svg)](https://z.dgtsr.top)

Z Reader Lite 是一个基于 Node.js 的小说搜索、在线阅读和下载工具。核心思路很简单：用 `rules/main-rules.json` 描述书源规则，服务端按规则抓取、解析、聚合结果，前端提供搜索、阅读、任务和文件管理。

体验 [Z-Reader](https://z.dgtsr.top)

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

## Release 路径

当前 Node.js 重构版从 `v2.0.0` 开始发布正式版本。建议版本规则：

- `v2.0.x`: 书源修复、样式微调、兼容性补丁
- `v2.x.0`: 新功能，例如更多书源管理能力、导入导出、后台任务优化
- `v3.0.0`: 接口、规则格式或数据结构发生破坏性变化

发布步骤：

```bash
npm version patch   # 或 minor / major
git push origin main --follow-tags
gh release create v$(node -p "require('./package.json').version") --generate-notes
```

应用通过 `/api/version` 读取 `package.json` 的当前版本，并在首页右上角显示。

## 规则

主规则文件是 `rules/main-rules.json`。每个书源可配置：

- `search`: 搜索入口和结果字段
- `book`: 书籍详情字段
- `toc`: 章节目录字段
- `chapter`: 正文抽取和过滤规则

## 注意

本项目仅供学习交流。下载内容请遵守目标站点规则和相关法律法规。

## 捐赠

如果这个工具帮到了你，可以请作者喝杯咖啡。

<img src="static/pic.jpg" alt="捐赠二维码" width="260">

## 许可证

本项目使用 [GPL-3.0](LICENSE) 协议。
