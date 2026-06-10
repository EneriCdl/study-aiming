# Study Aiming - 学习路线可视化

> ✦ 我来带你一步步走！

AI 驱动的个性化学习路线规划工具，帮助学生和自学者系统化地规划学习路径。

🔗 **在线体验**：https://enericdl.github.io/study-aiming/

## ✨ 核心功能

### 🌌 粒子动画系统
- 全局 Canvas 粒子背景，三种状态自动切换
- 首页：自由漂浮星空粒子
- 仪表盘：粒子聚合为 3D 旋转土星
- 路线图：土星解体为背景星尘

### 🤖 AI 学习规划
- 支持 8 种 AI 服务商：OpenAI、DeepSeek、Claude、Gemini、小米 MiMo、通义千问、智谱 GLM、自定义
- 根据学习内容复杂度动态生成 3-10 个阶段
- 每阶段包含：详细目标、预计耗时、核心知识点、实战任务、推荐资源、阶段测验
- 自动生成 4 个专属成就徽章

### 📊 学习仪表盘
- 计划切换器：多计划快速切换
- 任务管理：添加/完成/删除任务
- 学习进度：实时进度条和统计
- 月度热力图：完整日历视图，高亮今天
- 连续天数：学习打卡记录
- 成就徽章墙：4 个计划专属徽章

### 📋 学习路线图
- 多计划管理：卡片网格展示所有计划
- 时间轴详情：每个阶段可展开查看详情
- 阶段内容：目标、耗时、知识点标签、实战任务、推荐资源
- 测验系统：AI 生成针对性选择题，答案随机分布
- 进度联动：任务勾选实时更新总进度

### 📄 文档导入
- 支持 .docx / .txt / .json 格式
- 智能解析：自动识别阶段标题、目标、知识点、任务、资源
- 使用 mammoth.js 解析 Word 文档

### 🔒 数据安全
- 所有数据存储在浏览器 localStorage，不上传服务器
- API Key 仅本地保存，支持一键清除

## 🚀 使用方法

1. 访问 https://enericdl.github.io/study-aiming/
2. 点击右上角 ⚙ 设置，配置 AI API Key
3. 点击「开始规划学习路线」或「导入学习文档」
4. 在仪表盘查看学习进度，在路线图管理学习计划

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 结构层 | HTML5 语义化标签 |
| 表现层 | CSS3（变量、Grid、Flexbox、动画） |
| 逻辑层 | 原生 JavaScript（ES6+ Class 模块化） |
| 动画层 | Canvas 2D API（粒子系统 + 3D 投影） |
| 数据层 | localStorage 本地持久化 |
| AI 集成 | REST API（支持 OpenAI 兼容/Claude/Gemini） |
| 文档解析 | mammoth.js（Word 文档） |
| 部署 | GitHub Pages 静态托管 |

## 📁 项目结构

```
study-aiming/
├── index.html              # 首页
├── css/
│   └── style.css           # 全局样式（暗色主题 + 紫色系）
├── js/
│   ├── particles.js        # 粒子系统引擎（状态机 + 3D 投影）
│   └── app.js              # 主应用逻辑（存储/AI/UI/路由）
├── pages/
│   ├── dashboard.html      # 学习仪表盘
│   ├── roadmap.html        # 学习路线图
│   └── quiz.html           # 阶段测验
├── docs/
│   └── API安全性说明.doc    # API Key 安全说明文档
└── README.md
```

## 📊 代码统计

| 文件 | 行数 |
|------|------|
| HTML | ~600 |
| CSS | ~1100 |
| JavaScript | ~1900 |
| **总计** | **~3600** |

## 📄 License

MIT
