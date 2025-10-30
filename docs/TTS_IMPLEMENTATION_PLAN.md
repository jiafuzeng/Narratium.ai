# TTS 功能实现方案

## 一、核心发现

### 1. 说话内容高亮实现原理

在 `components/ChatHtmlBubble.tsx` 中找到了关键实现：

**位置**: 第 98-104 行的 `convertMarkdown` 函数

```typescript
// 将引号内容包裹为 <talk> 标签
str = str.replace(/(<[^>]+>)|(["""][^"""]+["""])/g, (_match, tag, quote) => {
  if (tag) return tag;
  return `<talk>${quote}</talk>`;
});
str = str.replace(/(<[^>]+>)|(["""][^""]+["""])/g, (_match, tag, quote) => {
  if (tag) return tag;
  return `<talk>${quote}</talk>`;
});
```

**工作原理**:
- 匹配中英文引号：`""`、`""`、`""`
- 将引号及其内容转换为 `<talk>标签内容</talk>`
- 后续通过 `replaceTags` 函数为 `<talk>` 标签添加颜色和 `data-tag="talk"` 属性

### 2. 播放按钮位置

在 `components/CharacterChatPanel.tsx` 第 1109-1140 行，"重新生成"按钮旁边是添加播放按钮的理想位置。

### 3. RunningHub TTS API 流程

- **工作流 ID**: `1983506334995914754`
- **API 端点**: `https://www.runninghub.cn/task/openapi/create`
- **查询结果**: `https://www.runninghub.cn/task/openapi/outputs`
- **上传音频**: `https://www.runninghub.cn/task/openapi/upload`

---

## 二、详细实现方案

### 架构设计

```
用户看到消息 → 自动提取<talk>内容 → 调用TTS API → 生成音频 → 自动播放
                                    ↓
                           用户点击播放按钮 → 播放已缓存的音频
```

---

## 三、具体实现步骤

### 步骤 1: 创建 TTS 服务模块

**文件**: `lib/api/tts-service.ts`

**功能**:
- 从HTML内容中提取 `<talk>` 标签内容
- 调用 RunningHub TTS API 创建任务
- 轮询查询任务结果
- 缓存生成的音频URL

**关键方法**:
- `extractSpeechContent()`: 提取说话内容
- `createTTSTask()`: 创建TTS任务
- `queryTaskResult()`: 查询任务状态
- `generateSpeech()`: 完整的TTS流程
- `uploadReferenceAudio()`: 上传参考音频

---

### 步骤 2: 创建 TTS Hook

**文件**: `hooks/useTTS.ts`

**功能**:
- 管理每个消息的TTS状态（生成中、播放中、错误等）
- 控制音频播放（播放、停止）
- 提供状态查询接口

**关键方法**:
- `generateAndPlay()`: 生成并播放语音
- `play()`: 播放缓存的语音
- `stop()`: 停止播放
- `getState()`: 获取消息的TTS状态

---

### 步骤 3: 修改 CharacterChatPanel 组件

**文件**: `components/CharacterChatPanel.tsx`

**修改点**:
1. 导入 `useTTS` Hook
2. 添加TTS配置状态（API Key、启用开关）
3. 添加自动生成语音的 Effect
4. 在按钮区域添加播放按钮

**播放按钮位置**: 在"重新生成"按钮后面（第 1140 行之后）

---

### 步骤 4: 添加 TTS 设置界面

**文件**: `components/ModelSidebar.tsx` 或创建新的设置模态框

**设置项**:
- TTS 启用开关
- RunningHub API Key 输入
- 工作流 ID 配置（可选，默认使用 1983506334995914754）

---

## 四、API 调用流程

### 1. 创建 TTS 任务

```http
POST https://www.runninghub.cn/task/openapi/create
Content-Type: application/json
Host: www.runninghub.cn

{
  "apiKey": "your-api-key",
  "workflowId": "1983506334995914754",
  "nodeInfoList": [
    {
      "nodeId": "102",
      "fieldName": "multi_line_prompt",
      "fieldValue": "要转换的文本内容"
    },
    {
      "nodeId": "101",
      "fieldName": "audio",
      "fieldValue": "参考音频文件名（可选）"
    }
  ]
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "taskId": "1910246754753896450",
    "taskStatus": "QUEUED"
  }
}
```

### 2. 查询任务结果

```http
POST https://www.runninghub.cn/task/openapi/outputs
Content-Type: application/json
Host: www.runninghub.cn

{
  "apiKey": "your-api-key",
  "taskId": "1910246754753896450"
}
```

**响应（成功）**:
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "fileUrl": "https://rh-images.xiaoyaoyou.com/.../audio.mp3",
      "fileType": "audio",
      "nodeId": "173"
    }
  ]
}
```

### 3. 上传参考音频（可选）

```http
POST https://www.runninghub.cn/task/openapi/upload
Content-Type: multipart/form-data
Host: www.runninghub.cn

{
  "apiKey": "your-api-key",
  "file": <audio_file>,
  "fileType": "audio"
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "fileName": "api/7a2f4c8d1e5b9g3h6j0k2l7m4n8p1q3r5s9t0u2v4w6x8y0z1.mp3",
    "fileType": "audio"
  }
}
```

---

## 五、工作流节点说明

根据 `docs/workflow/index TTS2情绪控制_api_1013.json`:

- **节点 101** (`LoadAudio`): 加载参考音频
- **节点 102** (`MultiLinePromptIndex`): 输入要转换的文本
- **节点 103** (`IndexTTS2Run`): TTS 核心处理节点
  - 支持情绪控制参数：`emo_alpha`, `emo_vector`, `emo_text`
  - 支持随机性参数：`use_random`
- **节点 173** (`SaveAudioMP3`): 保存生成的音频

**可调参数**:
- `top_k`: 30
- `top_p`: 0.8
- `temperature`: 0.8
- `num_beams`: 3
- `max_mel_tokens`: 1500
- `emo_alpha`: 情绪强度（0-1）

---

## 六、性能优化建议

### 1. 缓存机制
- ✅ 已实现：使用 Map 缓存 messageId → audioUrl
- 避免重复生成相同内容的语音

### 2. 批量处理
- 如果一条消息有多段说话，合并为一次请求
- 减少 API 调用次数

### 3. 预加载
- 可以提前为即将显示的消息生成语音
- 提升用户体验

### 4. 错误处理
- 网络失败时自动重试（最多3次）
- 超时时间设置为60秒
- 清晰的错误提示

---

## 七、用户体验优化

### 1. 进度显示
- 显示生成进度百分比
- 三种状态图标：加载中、播放中、未播放

### 2. 音频控制
- 播放/停止切换
- 音量控制（可选）
- 播放速度调节（可选）

### 3. 自动播放
- 新消息到达后自动生成并播放
- 可以在设置中关闭自动播放

### 4. 队列管理
- 多条消息时的播放队列
- 当前播放完成后自动播放下一条

---

## 八、高级功能（可选）

### 1. 角色专属声音
- 为每个角色上传参考音频
- 保存在角色配置中
- 生成时自动使用角色的参考音频

### 2. 情绪控制
- 根据消息内容分析情绪
- 调整 `emo_alpha` 参数
- 不同情绪使用不同的语调

### 3. 语音库
- 预设多种声音风格
- 用户可选择喜欢的声音
- 支持自定义声音

---

## 九、注意事项

### 1. API 配额
- RunningHub API 可能有调用限制
- 需要合理控制调用频率
- 建议添加调用次数统计

### 2. 音频大小
- 每次请求的文本长度建议控制在500字以内
- 过长的文本可能导致生成失败或超时

### 3. 网络延迟
- 首次生成可能需要等待10-30秒
- 提供清晰的等待提示
- 支持取消正在进行的任务

### 4. 浏览器兼容
- 确保目标浏览器支持 HTML5 Audio API
- 测试不同浏览器的音频播放

### 5. CORS 问题
- 音频 URL 需要支持跨域访问
- RunningHub 返回的 URL 应该已经配置了 CORS

---

## 十、测试流程

### 1. 配置测试
- [ ] 在设置中输入 RunningHub API Key
- [ ] 启用 TTS 功能
- [ ] 验证配置保存到 localStorage

### 2. 功能测试
- [ ] 发送包含引号对话的消息
- [ ] 验证自动提取说话内容
- [ ] 验证自动生成并播放语音
- [ ] 测试手动播放按钮
- [ ] 测试停止播放功能

### 3. 异常测试
- [ ] 测试无引号内容的消息
- [ ] 测试 API Key 错误
- [ ] 测试网络断开
- [ ] 测试生成超时

### 4. 性能测试
- [ ] 测试多条消息的缓存
- [ ] 测试快速连续生成
- [ ] 测试内存占用

---

## 十一、后续扩展

### 1. 多语言支持
- 支持中英文TTS
- 自动识别语言

### 2. 实时流式TTS
- 边生成边播放
- 降低首次播放延迟

### 3. 语音克隆
- 上传角色声音样本
- 克隆角色的说话方式

### 4. 批量导出
- 导出对话的完整音频
- 生成音频文件供下载

---

## 十二、实施计划

### 第一阶段：基础功能（1-2天）
1. ✅ 创建 TTS 服务模块
2. ✅ 创建 TTS Hook
3. ✅ 添加播放按钮
4. ✅ 实现基础播放功能

### 第二阶段：用户体验（1天）
1. 添加设置界面
2. 实现自动播放
3. 添加进度显示
4. 完善错误处理

### 第三阶段：优化和测试（1天）
1. 性能优化
2. 全面测试
3. 修复bug
4. 完善文档

### 第四阶段：高级功能（可选）
1. 角色专属声音
2. 情绪控制
3. 批量导出
4. 更多自定义选项

---

## 十三、相关文件清单

### 新增文件
- `lib/api/tts-service.ts` - TTS 服务核心
- `hooks/useTTS.ts` - TTS React Hook
- `docs/TTS_IMPLEMENTATION_PLAN.md` - 本文档

### 修改文件
- `components/CharacterChatPanel.tsx` - 添加TTS功能和播放按钮
- `components/ModelSidebar.tsx` - 添加TTS设置界面
- `app/i18n/locales/zh.json` - 添加中文翻译
- `app/i18n/locales/en.json` - 添加英文翻译

### 参考文件
- `components/ChatHtmlBubble.tsx` - 说话内容提取逻辑
- `docs/workflow/index TTS2情绪控制_api_1013.json` - TTS工作流配置
- `docs/runninghub api文档/` - RunningHub API 文档

---

## 十四、常见问题

### Q1: 为什么音频生成这么慢？
A: TTS 生成需要时间，通常10-30秒。可以通过缓存和预加载优化。

### Q2: 如何为不同角色设置不同声音？
A: 上传角色的参考音频，保存在角色配置中，生成时使用。

### Q3: API 调用失败怎么办？
A: 检查 API Key 是否正确，网络是否正常，查看错误提示。

### Q4: 可以离线使用吗？
A: 不可以，TTS 需要调用 RunningHub 云端 API。

### Q5: 音频可以下载吗？
A: 可以，右键点击播放按钮旁的下载按钮（待实现）。

---

**文档版本**: 1.0
**创建日期**: 2025-10-30
**最后更新**: 2025-10-30
