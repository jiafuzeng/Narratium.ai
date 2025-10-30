# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Narratium.ai 是一个开源的 AI 角色扮演平台，用于创建、定制和与虚拟角色聊天。项目使用 Next.js 15、React 19、TypeScript 和 Zustand 状态管理构建，采用静态导出模式（output: "export"）。

## 常用命令

### 开发与构建
```bash
pnpm install           # 安装依赖（推荐使用 pnpm）
pnpm run dev          # 启动开发服务器（使用 Turbopack）
pnpm run build        # 构建生产版本
pnpm run preview      # 预览构建后的静态站点
```

### 代码质量
```bash
pnpm run lint         # 运行 ESLint 检查
pnpm run lint:fix     # 自动修复 ESLint 问题
pnpm test             # 运行 Vitest 测试
```

### 桌面应用打包（需要先全局安装 pake-cli）
```bash
pnpm pake-mac         # 打包 macOS 应用
pnpm pake-win         # 打包 Windows 应用
pnpm pake-linux       # 打包 Linux 应用
pnpm build:pwa        # 构建 PWA 版本
```

## 核心架构

### 目录结构

- **app/**: Next.js App Router 页面和布局
  - `page.tsx`: 主页面
  - `character/`: 角色相关页面
  - `character-cards/`: 角色卡片页面
  - `i18n/`: 国际化支持（中英文）

- **components/**: React 组件
  - 包含所有 UI 组件，如角色卡片、对话面板、编辑器、模态框等
  - 命名约定：PascalCase + 功能描述（如 `CharacterChatPanel.tsx`）

- **lib/**: 核心业务逻辑层
  - **core/**: 核心类和管理器
    - `character.ts`: Character 类，处理角色数据和系统提示
    - `config-manager.ts`: 配置管理
    - `memory-manager.ts`: 记忆管理
    - `prompt-assembler.ts`: 提示词组装
    - `preset-assembler.ts`: 预设组装
    - `regex-processor.ts`: 正则脚本处理
    - `world-book.ts`: 世界书管理

  - **data/**: 数据访问层
    - `local-storage.ts`: 本地存储基础操作
    - `roleplay/`: 角色扮演相关数据操作（角色记录、对话、历史等）
    - `agent/`: Agent 相关数据操作

  - **nodeflow/**: 工作流节点系统
    - 包含各种节点类型：Context、LLM、Memory、Output、Plugin、Preset、Regex、UserInput、WorldBook
    - `WorkflowEngine.ts`: 工作流执行引擎
    - `NodeContext.ts`: 节点上下文
    - `types.ts`: 节点类型定义

  - **workflow/**: 工作流定义
    - `BaseWorkflow.ts`: 工作流基类，包含验证逻辑
    - `examples/`: 工作流示例配置

  - **adapter/**: 数据适配器（如标签替换）
  - **models/**: TypeScript 类型定义和数据模型
  - **plugins/**: 插件系统核心逻辑
  - **prompts/**: 提示词模板
  - **tools/**: 工具函数（角色、搜索、反思等）

- **function/**: 功能模块
  - `character/`, `data/`, `dialogue/`, `preset/`, `regex/`, `worldbook/`

- **hooks/**: React 自定义 Hooks
- **contexts/**: React Context 定义
- **utils/**: 通用工具函数
- **types/**: 全局类型定义
- **public/plugins/**: 插件文件存放位置

### 关键架构模式

#### 1. 节点工作流系统
项目采用基于节点的工作流引擎，通过组合不同类型的节点来构建复杂的 AI 对话流程：
- **节点类型**：ENTRY（入口）、PROCESS（处理）、EXIT（出口）
- **工作流验证**：BaseWorkflow 类在构造时验证节点配置的完整性和连接有效性
- **执行流程**：WorkflowEngine 按照节点依赖关系顺序执行

#### 2. 角色系统
- Character 类从 CharacterRecord 构造，处理 SillyTavern 角色卡格式兼容
- 支持多语言（中英文）的系统提示词生成
- 世界书（WorldBook）集成：支持数组和对象两种格式
- 角色数据适配：通过 `adaptCharacterData` 进行标签替换和本地化

#### 3. 数据持久化
- 使用 `local-storage.ts` 进行浏览器本地存储
- 数据操作通过专门的 Operations 类（如 `LocalCharacterRecordOperations`）
- 记录包含元数据：`created_at`、`updated_at`

#### 4. 插件系统
- 插件目录：`public/plugins/`
- 注册文件：`public/plugins/plugin-registry.json`
- 每个插件包含 `manifest.json` 和 `main.js`
- 插件生命周期：`onLoad`、`onMessage`、`onResponse`
- 详见：`public/plugins/HOW_TO_ADD_PLUGINS.md`

#### 5. 静态导出模式
- Next.js 配置为 `output: "export"`，生成纯静态站点
- 图片优化被禁用（`unoptimized: true`）
- 支持 PWA（通过 next-pwa）

## 开发注意事项

### 角色数据处理
- 角色数据可能来自不同格式，需要处理 `data.data` 嵌套结构
- 使用 Character 类的 `getData()` 方法获取处理后的角色数据
- 系统提示词通过 `getSystemPrompt()` 生成，支持中英文

### 工作流开发
- 新工作流需继承 `BaseWorkflow` 类
- 必须实现 `getNodeRegistry()` 和 `getWorkflowConfig()`
- 工作流配置必须包含至少一个 ENTRY 节点和一个 EXIT 节点
- 节点的输入字段必须在之前的节点输出中定义

### 类型安全
- 项目启用 TypeScript strict 模式
- 路径别名：`@/*` 映射到项目根目录
- 所有模型定义在 `lib/models/` 目录

### 测试
- 使用 Vitest 进行测试
- 测试文件位于 `components/__tests__/`

### 国际化
- 支持中文和英文两种语言
- 语言相关代码使用 `language: "en" | "zh"` 参数
- LanguageProvider 在 `app/i18n/` 目录

### PWA 支持
- 在生产环境启用 PWA 功能
- 使用 NetworkFirst 缓存策略
- 最大缓存 200 个条目，30 天过期
