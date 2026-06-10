/**
 * Study Aiming - 主应用
 * Dashboard任务管理 | 多计划路线图 | API集成
 */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function showToast(msg, type = 'info') {
    const c = $('#toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100px)'; t.style.transition = 'all 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ==================== Storage ====================
  const Storage = {
    KEY: 'study_aiming_data',
    getDefault() {
      return {
        plans: [],               // [{id, title, description, icon, createdAt, stages:[]}]
        activePlanId: null,      // 当前查看的计划ID
        tasks: [],               // Dashboard 独立任务
        progress: { heatmap: {}, streak: 0, lastDate: null, activityLog: [] },
        settings: { apiProvider: 'openai', apiKey: '', endpoint: '', modelName: 'gpt-3.5-turbo' },
      };
    },
    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        if (!raw) return this.getDefault();
        const d = JSON.parse(raw);
        if (!d.plans) d.plans = [];
        if (!d.tasks) d.tasks = [];
        if (!d.progress) d.progress = { heatmap: {}, streak: 0, lastDate: null };
        if (!d.progress.heatmap) d.progress.heatmap = {};
        if (!Array.isArray(d.progress.activityLog)) d.progress.activityLog = [];
        if (!d.settings) d.settings = this.getDefault().settings;
        return d;
      } catch { return this.getDefault(); }
    },
    save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },
  };

  // ==================== AI ====================
  // 模型预设配置（2025年6月更新）
  const MODEL_PRESETS = {
    openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'] },
    deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder', 'deepseek-v3', 'deepseek-r1'] },
    xiaomi_mimo: { name: 'Xiaomi MiMo', endpoint: 'https://api.xiaomi.com/v1/chat/completions', models: ['mimo-v2-pro', 'mimo-v2', 'mimo-v1', 'mimo-lite'] },
    claude: { name: 'Claude (Anthropic)', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
    gemini: { name: 'Gemini (Google)', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'] },
    qwen: { name: '通义千问 (Qwen)', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen2.5-72b-instruct', 'qwen2.5-coder-32b-instruct', 'qwq-32b'] },
    zhipu: { name: '智谱 (GLM)', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4-plus', 'glm-4-0520', 'glm-4', 'glm-4-flash', 'glm-4-long', 'glm-3-turbo', 'codegeex-4'] },
    custom: { name: '自定义', endpoint: '', models: [] },
  };

  const AI = {
    getEndpoint(provider, custom) {
      return provider === 'custom' ? (custom || '') : (MODEL_PRESETS[provider]?.endpoint || '');
    },
    validateKey(key) { return key && key.length > 20; },
    splitMessages(messages) {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const chat = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
      return { system, chat };
    },
    async call(messages) {
      const s = app.data.settings;
      if (!s.apiKey) throw new Error('请先配置 API Key');
      const ep = this.getEndpoint(s.apiProvider, s.endpoint);
      if (!ep) throw new Error('请配置有效的 API 端点');
      const model = String(s.modelName || MODEL_PRESETS[s.apiProvider]?.models?.[0] || 'gpt-4o-mini').trim();
      if (!model) throw new Error('请填写模型名称');

      if (s.apiProvider === 'claude') return this.callClaude(ep, s.apiKey, model, messages);
      if (s.apiProvider === 'gemini') return this.callGemini(ep, s.apiKey, model, messages);
      return this.callOpenAICompatible(ep, s.apiKey, model, messages);
    },
    async callOpenAICompatible(ep, apiKey, model, messages) {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 6500 }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`API 调用失败 (${res.status}): ${e}`); }
      const r = await res.json();
      return r.choices?.[0]?.message?.content || '';
    },
    async callClaude(ep, apiKey, model, messages) {
      const { system, chat } = this.splitMessages(messages);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, system, messages: chat, temperature: 0.7, max_tokens: 6500 }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`API 调用失败 (${res.status}): ${e}`); }
      const r = await res.json();
      return (r.content || []).map(p => p.text || '').join('').trim();
    },
    async callGemini(ep, apiKey, model, messages) {
      const { system, chat } = this.splitMessages(messages);
      const base = ep.replace(/\/$/, '');
      const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const contents = chat.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body = { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 6500 } };
      if (system) body.systemInstruction = { parts: [{ text: system }] };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`API 调用失败 (${res.status}): ${e}`); }
      const r = await res.json();
      return r.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    },
    async testConnection() {
      const r = await this.call([{ role: 'user', content: '回复OK' }]);
      return r.includes('OK') || r.length > 0;
    },
    async generatePlan(topic, level, target, hours, urgency, extra) {
      const systemPrompt = `你是一个资深的学习规划专家。你必须严格返回JSON格式，不要包含任何Markdown标记。

## 内容合理性判断（首要规则）
如果用户输入的学习内容明显不合理、不可能实现、或是在开玩笑（如穿越、徒手打败霸王龙、学会飞等），则只生成1-2个简短阶段，任务写”请重新输入合理的学习目标”即可，不要浪费token。

## 时间紧迫度对内容的影响（必须严格遵守）
- **非常紧迫**：每个阶段只写2-3个核心任务，不要详细描述，目标一句话概括，知识点3-5个，资源1-2个。阶段可以多但必须简明扼要。
- **比较紧迫**：每个阶段写3-4个任务，目标2-3句话，知识点4-6个，资源2-3个。精简但完整。
- **时间适中**：正常详细程度，每阶段3-5个任务，目标详细描述，知识点5-8个，资源3个。
- **剩余时间很多**：尽可能详细，每阶段4-6个任务，目标深度描述，知识点8-10个，资源3-5个，可以包含拓展内容。

## 阶段数量规则（根据学习内容复杂度动态调整）
- 简单主题（如”Excel基础”、”PPT制作”）：2-3个阶段
- 中等主题（如”Python编程”、”数据分析”）：4-5个阶段
- 复杂主题（如”机器学习”、”全栈开发”、”考研数学”）：5-7个阶段
- 超复杂主题（如”深度学习研究”、”系统架构设计”）：7-10个阶段
- 不合理内容：1-2个阶段

## 每个阶段必须包含的内容
1. **title**: 阶段标题，体现具体学习内容
2. **duration**: 预计耗时（如”2-3周，每周10小时”），根据用户每日投入时间计算
3. **goal**: 阶段目标，根据紧迫度调整详细程度
4. **topics**: 核心知识点数组，根据紧迫度调整数量
5. **tasks**: 实战任务数组，根据紧迫度调整数量和详细程度
6. **resources**: 推荐资源数组，必须是真实存在的
7. **quiz**: 阶段测验，3道选择题，每题4个选项

## 测验出题规则
- 题目必须与学习内容直接相关，不能问”哪项成果最能证明本阶段目标已经达成”这类废话
- 必须出考察具体知识点的题目（如代码输出、概念辨析、案例分析）
- answerIndex 为正确选项下标（0-3），正确答案必须随机分布在A/B/C/D

## 成就徽章规则（必须恰好生成4个专属徽章）
- 第1个：入门类（unlockAt=2左右）
- 第2个：进阶类（完成约1/3任务解锁）
- 第3个：实战类（完成约2/3任务解锁）
- 第4个：大师类（完成全部任务解锁）

## JSON格式（严格遵守）
{
  "title": "学习计划标题",
  "description": "一句话简介（30字内）",
  "icon": "合适的emoji",
  "stages": [
    {
      "title": "阶段标题",
      "duration": "X-Y周，每周N小时",
      "goal": "详细的阶段目标描述...",
      "topics": ["具体知识点1", "具体知识点2", "..."],
      "tasks": [
        {"id": "t1", "text": "具体可执行的任务描述", "completed": false},
        {"id": "t2", "text": "具体可执行的任务描述", "completed": false},
        {"id": "t3", "text": "具体可执行的任务描述", "completed": false}
      ],
      "resources": [
        {"name": "资源名称", "url": "https://..."},
        {"name": "资源名称", "url": "#"}
      ],
      "quiz": {
        "questions": [
          {
            "question": "专业阶段测验题干，必要时包含短代码片段",
            "options": ["选项A", "选项B", "选项C", "选项D"],
            "answerIndex": 0,
            "explanation": "90字内解析，说明关键考点"
          }
        ],
        "completed": false
      }
    }
  ],
  "achievements": [
    {"name": "徽章名称", "icon": "emoji", "desc": "解锁条件描述", "unlockAt": 3},
    {"name": "徽章名称", "icon": "emoji", "desc": "解锁条件描述", "unlockAt": 8},
    {"name": "徽章名称", "icon": "emoji", "desc": "解锁条件描述", "unlockAt": 15}
  ]
}`;

      const urgencyMap = {
        relaxed: '剩余时间很多（可以深入学习）',
        normal: '时间适中（正常节奏）',
        urgent: '比较紧迫（需要高效学习）',
        critical: '非常紧迫（只学核心内容，精简快速）',
      };
      const urgencyText = urgencyMap[urgency] || urgencyMap.normal;

      const userPrompt = `请为以下学习需求生成学习计划：

📚 学习内容：${topic}
👤 当前水平：${level}
🎯 目标水平：${target}
⏰ 每日可投入时间：${hours}小时
⚡ 时间紧迫程度：${urgencyText}
${extra ? '📝 补充说明：' + extra : ''}

请根据内容复杂度自动决定阶段数量，根据紧迫程度调整每个阶段的详细程度。
资源必须是真实存在的，测验题目必须考察具体知识点。`;

      const content = await this.call([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      let json = content;
      const m = content.match(/\{[\s\S]*\}/);
      if (m) json = m[0];
      try {
        const plan = JSON.parse(json);
        if (!plan.stages || plan.stages.length < 2) throw new Error('阶段数量不足');
        // 为每个任务生成唯一ID
        plan.stages.forEach((s, i) => {
          (s.tasks || []).forEach((t, j) => {
            if (!t.id) t.id = `t${i}_${j}`;
          });
        });
        return plan;
      } catch { throw new Error('AI 返回格式异常，请重试'); }
    },
  };

  // ==================== RoadmapManager ====================
  const RoadmapManager = {
    cleanFileTitle(name) {
      return String(name || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    },
    isStageHeading(t) {
      return /^\d{1,2}(?:\.\d{1,2})*\s+/.test(t)
        || /^\d{1,2}[.、)）]\s*/.test(t)
        || /^[一二三四五六七八九十]+[.、)）]/.test(t)
        || /^第[一二三四五六七八九十\d]+(?:章节|阶段|部分|章|节)/.test(t);
    },
    cleanStageTitle(t) {
      return t
        .replace(/^\d{1,2}(?:\.\d{1,2})*\s*/, '')
        .replace(/^\d{1,2}[.、)）]\s*/, '')
        .replace(/^[一二三四五六七八九十]+[.、)）]\s*/, '')
        .replace(/^第[一二三四五六七八九十\d]+(?:章节|阶段|部分|章|节)[：:\s]*/, '')
        .trim();
    },
    inferTitle(lines, fallbackTitle) {
      const firstTitle = lines.find((line, i) =>
        i < 6
        && line.length <= 42
        && !this.isStageHeading(line)
        && !/^[-•·*]\s/.test(line)
        && !/^【.+】/.test(line)
      );
      return firstTitle && !this.isGenericTitle(firstTitle) ? firstTitle : (fallbackTitle || firstTitle || '');
    },
    isGenericTitle(title) {
      return /^(学习计划|学习路线|学习规划|导入的学习计划|导入的计划)$/i.test(String(title || '').trim());
    },
    summarizeTitleFromStages(stages, fallbackTitle) {
      if (fallbackTitle && !this.isGenericTitle(fallbackTitle)) return fallbackTitle;
      const first = stages?.[0]?.title || '';
      return first ? first.replace(/^第[一二三四五六七八九十\d]+(?:章节|阶段|部分|章|节)[：:\s]*/, '').trim() : (fallbackTitle || '导入的学习计划');
    },
    splitTaskText(text, prefix = '') {
      const normalized = String(text || '')
        .replace(/^[:：\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return [];

      const parts = normalized
        .split(/(?:[。；;]\s*|\n+|(?=\s*[（(]?\d+[)）.、]\s+)|(?=\s*[-•·*]\s+))/)
        .map(s => s.replace(/^[-•·*\d.)）(\s、]+/, '').trim())
        .filter(s => s.length >= 4);
      const source = parts.length ? parts : [normalized];
      return source.slice(0, 8).map(s => prefix ? `${prefix}：${s}` : s);
    },
    extractLabeledTasks(text) {
      const taskLabels = /实践|实战|任务|题目|作业|练习|项目|输出|验收|完成标准|底线标准|你要做到|AI\s*实战/i;
      const tasks = [];
      const matches = [...String(text || '').matchAll(/【([^】]+)】([^【]*)/g)];
      matches.forEach(m => {
        const label = m[1].trim();
        if (taskLabels.test(label)) tasks.push(...this.splitTaskText(m[2], label));
      });
      const colon = String(text || '').match(/^(实践题目|实战题目|实践任务|实战任务|练习题|练习任务|作业|项目|输出成果|任务|AI\s*实战用法|你要做到的事|底线标准|完成标准|验收标准)[：:]\s*(.+)$/i);
      if (colon) tasks.push(...this.splitTaskText(colon[2], colon[1].trim()));
      return this.uniqueTasks(tasks);
    },
    uniqueTasks(tasks) {
      const seen = new Set();
      return tasks.filter(t => {
        const key = t.replace(/\s+/g, '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    clipText(text, max = 56) {
      const s = String(text || '').replace(/\s+/g, ' ').trim();
      return s.length > max ? s.slice(0, max - 3) + '...' : s;
    },
    // 打乱数组并返回 { shuffled, correctIndex }
    shuffleOptions(options, correctIndex) {
      const arr = options.map((o, i) => ({ text: o, isCorrect: i === correctIndex }));
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return {
        shuffled: arr.map(a => a.text),
        correctIndex: arr.findIndex(a => a.isCorrect),
      };
    },

    buildFallbackQuiz(stage, stageIndex) {
      const title = String(stage.title || `阶段 ${stageIndex + 1}`).trim();
      const topics = Array.isArray(stage.topics) ? stage.topics.map(t => String(t).trim()).filter(Boolean) : [];
      const tasks = Array.isArray(stage.tasks) ? stage.tasks.map(t => String(t.text || t.title || t).trim()).filter(Boolean) : [];
      const goal = String(stage.goal || '').trim();
      const firstTask = this.clipText(tasks[0] || `完成「${title}」的阶段实战产出`, 64);
      const firstTopic = this.clipText(topics[0] || title, 48);
      const secondTopic = this.clipText(topics[1] || '', 56);
      const thirdTopic = this.clipText(topics[2] || '', 56);
      const source = `${title} ${topics.join(' ')} ${tasks.join(' ')} ${goal}`.toLowerCase();

      // 构建通用题目模板，根据内容动态填充
      const makeQ = (question, correct, wrongs, explanation) => {
        const options = [correct, ...wrongs];
        const { shuffled, correctIndex } = this.shuffleOptions(options, 0);
        return { question, options: shuffled, answerIndex: correctIndex, explanation };
      };

      // 根据学习内容生成针对性题目
      if (/python|编程|代码|程序|脚本/i.test(source)) {
        return [
          makeQ(
            `阅读代码：x = [1, 2]; y = x; y.append(3); print(x) 的输出是？`,
            '[1, 2, 3]',
            ['[1, 2]', '3', '报错 NameError'],
            'Python 中列表是可变对象，赋值传递的是引用，y 和 x 指向同一对象。'
          ),
          makeQ(
            'Python 中 def func(a, b=[]) 这种默认参数写法会导致什么问题？',
            '多次调用共享同一个列表对象',
            ['每次调用都创建新列表', '语法错误无法运行', '参数类型自动转为元组'],
            '默认参数在函数定义时求值，可变对象会被所有调用共享。'
          ),
          makeQ(
            `调试 Python 程序时遇到 TypeError，最有效的第一步是？`,
            '查看 traceback 定位异常类型和行号',
            ['直接删除报错代码', '重启 Python 解释器', '用 try-except 包裹所有代码'],
            'traceback 提供异常链和精确行号，是定位问题的首要依据。'
          ),
        ];
      }

      if (/数学|微积分|线性代数|概率|矩阵|方程/i.test(source)) {
        const topicA = firstTopic || '矩阵运算';
        const topicB = secondTopic || '线性方程组';
        return [
          makeQ(
            `关于「${topicA}」，以下哪项描述是正确的？`,
            topicA + '是本阶段需要掌握的核心概念',
            ['可以跳过直接学习后续内容', '只需要背公式不需要理解', '考试不会考这个知识点'],
            `「${topicA}」是本阶段的核心知识点，需要理解其定义和应用场景。`
          ),
          makeQ(
            `学习「${topicB}」时，最有效的学习方法是？`,
            '先理解概念定义，再通过习题巩固',
            ['只看视频不做题', '直接背诵解题步骤', '跳过基础直接做难题'],
            '数学学习需要理解+练习结合，先懂原理再动手才能真正掌握。'
          ),
          makeQ(
            `完成本阶段学习后，以下哪种做法最能检验掌握程度？`,
            '独立完成课后习题并能解释解题思路',
            ['看一遍答案觉得自己会了', '能背诵定义就算掌握', '做过一道题就够了'],
            '能独立解题并讲解思路，说明真正理解了知识点。'
          ),
        ];
      }

      if (/英语|单词|听力|口语|阅读|写作|雅思|托福/i.test(source)) {
        const topicA = firstTopic || '词汇积累';
        return [
          makeQ(
            `学习英语「${topicA}」时，以下哪种方法最有效？`,
            '在语境中学习，结合例句记忆',
            ['只背单词表不做阅读', '只看美剧不记笔记', '每天抄写100遍单词'],
            '语境记忆比孤立背诵更牢固，能同时掌握用法和搭配。'
          ),
          makeQ(
            `提高英语听力的最佳练习方式是？`,
            '精听+泛听结合，反复听同一材料直到听懂',
            ['只听一遍听不懂就换', '只听慢速材料', '不需要听只需要看字幕'],
            '精听训练辨音能力，泛听培养语感，两者缺一不可。'
          ),
          makeQ(
            `本阶段的实战任务中，哪项最能体现英语能力提升？`,
            tasks[0] || '完成一篇英语写作练习',
            ['只背了50个单词', '看了3集美剧', '下载了学习APP'],
            '实际输出（写作/口语）比被动输入更能检验学习效果。'
          ),
        ];
      }

      // 通用题目：根据实际内容生成
      const q1 = tasks.length > 0 ? tasks[0] : `完成「${title}」的核心学习任务`;
      const q2 = topics.length > 0 ? topics[0] : title;
      const q3 = topics.length > 1 ? topics[1] : (goal ? goal.substring(0, 50) : '整理学习笔记');

      return [
        makeQ(
          `在「${title}」阶段中，以下哪项是需要完成的实战任务？`,
          q1,
          ['跳过练习直接看答案', '只收藏资源不做任务', '随便写两行代码应付'],
          `「${q1}」是本阶段的具体实战任务，完成它才能真正掌握所学内容。`
        ),
        makeQ(
          `学习「${q2}」时，应该重点关注什么？`,
          '理解核心概念并能实际应用',
          ['只背定义不需要理解', '看一遍视频就算完成', '跳过基础直接做项目'],
          `「${q2}」是本阶段核心知识点，需要理解原理并能在实践中运用。`
        ),
        makeQ(
          `完成「${title}」阶段后，以下哪种行为说明学习效果最好？`,
          `能向他人讲解「${q3}」的关键要点`,
          ['记住了几个名词', '能看懂但说不出来', '做题全靠蒙对'],
          '能教授他人说明真正理解，这是检验学习效果的金标准。'
        ),
      ];
    },

    normalizeQuestion(questionData, fallbackQuestion, questionIndex) {
      const q = questionData && typeof questionData === 'object' ? questionData : {};
      let question = String(q.question || q.title || q.text || fallbackQuestion?.question || '').trim();
      const rawOptions = Array.isArray(q.options) ? q.options
        : Array.isArray(q.choices) ? q.choices
        : Array.isArray(q.items) ? q.items
        : (fallbackQuestion?.options || []);
      let options = rawOptions
        .map(o => String(o || '').trim())
        .filter(Boolean);
      const answerText = String(q.answer || q.correctAnswer || q.correct || '').trim();
      let answerIndex = Number(q.answerIndex ?? q.correctIndex ?? q.correctAnswerIndex);

      if (!Number.isInteger(answerIndex) && answerText) {
        const letter = answerText.match(/^[A-D]$/i);
        if (letter) answerIndex = letter[0].toUpperCase().charCodeAt(0) - 65;
        else answerIndex = options.findIndex(o => o === answerText || o.includes(answerText) || answerText.includes(o));
      }
      if (!Number.isInteger(answerIndex) || answerIndex < 0) answerIndex = fallbackQuestion?.answerIndex ?? 0;

      if (answerText && !options.includes(answerText) && answerIndex >= options.length && options.length < 4) {
        options.push(answerText);
      }

      const distractors = [
        '只停留在理论阅读，不完成实践验证',
        '跳过本阶段目标，直接进入后续内容',
        '仅记录学习时长，不检查具体产出',
        '复制现成答案，不理解关键步骤',
      ];
      let di = 0;
      while (options.length < 4) {
        const next = distractors[di++ % distractors.length];
        if (!options.includes(next)) options.push(next);
      }
      options = options.slice(0, 4);
      answerIndex = Math.max(0, Math.min(options.length - 1, answerIndex));
      question = question || fallbackQuestion?.question || `第 ${questionIndex + 1} 题`;

      return {
        id: q.id || `q${questionIndex}`,
        question,
        options,
        answerIndex,
        explanation: String(q.explanation || q.analysis || q.reason || q['解析'] || fallbackQuestion?.explanation || `正确答案是「${options[answerIndex]}」。`).trim(),
      };
    },
    normalizeQuiz(rawQuiz, stage, stageIndex) {
      const raw = rawQuiz && typeof rawQuiz === 'object' && !Array.isArray(rawQuiz) ? rawQuiz : {};
      const rawQuestions = Array.isArray(rawQuiz) ? rawQuiz : (Array.isArray(raw.questions) ? raw.questions : []);
      const fallback = this.buildFallbackQuiz(stage, stageIndex);
      let questions = rawQuestions
        .map((q, i) => this.normalizeQuestion(q, fallback[i], i))
        .filter(Boolean);
      const stageSource = `${stage?.title || ''} ${stage?.goal || ''} ${(stage?.topics || []).join(' ')} ${(stage?.tasks || []).map(t => t.text || t.title || '').join(' ')}`;
      const quizSource = questions.map(q => `${q.question} ${q.options.join(' ')}`).join(' ');
      const pythonQuizLooksGeneric = /python/i.test(stageSource)
        && questions.length > 0
        && !/(print|def |class |append|traceback|except|lambda|list|dict|tuple|set|输出|代码|异常|作用域|列表|字典|函数|默认参数|可变对象|切片|复杂度)/i.test(quizSource);
      if (pythonQuizLooksGeneric) {
        questions = fallback.map((q, i) => this.normalizeQuestion(q, null, i));
      }

      fallback.forEach((q, i) => {
        if (questions.length < 3) questions.push(this.normalizeQuestion(q, null, questions.length || i));
      });

      const score = Number(raw.score);
      return {
        questions: questions.slice(0, 5),
        completed: !!raw.completed || !!raw.passed,
        score: Number.isFinite(score) ? score : 0,
        completedAt: raw.completedAt || null,
        answers: Array.isArray(raw.answers) ? raw.answers.map(a => {
          const n = Number(a);
          return Number.isInteger(n) ? n : null;
        }) : [],
      };
    },
    normalizeStage(stage, stageIndex) {
      const goal = String(stage.goal || '').trim();
      const importedTasks = (stage.tasks || [])
        .map((t, j) => ({ id: t.id || `t${stageIndex}_${j}`, text: String(t.text || t.title || '').trim(), completed: !!t.completed }))
        .filter(t => t.text);
      const extractedTasks = importedTasks.length ? [] : this.extractLabeledTasks(goal);
      const fallbackTasks = importedTasks.length || extractedTasks.length ? [] : [`完成「${stage.title || `阶段 ${stageIndex + 1}`}」学习并自检达标`];
      const tasks = [...importedTasks, ...extractedTasks.map(text => ({ text, completed: false })), ...fallbackTasks.map(text => ({ text, completed: false }))];

      const normalizedStage = {
        ...stage,
        title: String(stage.title || `阶段 ${stageIndex + 1}`).trim(),
        duration: stage.duration || '',
        goal,
        topics: stage.topics || [],
        resources: stage.resources || [],
        tasks: tasks.map((t, j) => ({ id: t.id || `t${stageIndex}_${j}`, text: t.text, completed: !!t.completed })),
      };
      return {
        ...normalizedStage,
        quiz: this.normalizeQuiz(stage.quiz, normalizedStage, stageIndex),
      };
    },
    normalizePlanData(planData, fallbackTitle) {
      const stages = (planData.stages || []).map((s, i) => this.normalizeStage(s, i));
      const title = this.summarizeTitleFromStages(stages, planData.title || fallbackTitle);
      return { ...planData, title, description: planData.description || '从文档导入', icon: planData.icon || '📄', stages };
    },
    parseText(text, fallbackTitle = '') {
      const lines = text.replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
      const stages = [];
      let cur = null;
      let taskMode = false;
      let topicMode = false;
      let resourceMode = false;
      const title = this.inferTitle(lines, fallbackTitle);
      const pushTask = value => {
        const items = this.splitTaskText(value);
        items.forEach(item => cur?.tasks.push({ id: 't' + Date.now() + Math.random(), text: item, completed: false }));
      };
      lines.forEach(line => {
        const t = line.trim();
        if (t === title) return;
        if (this.isStageHeading(t)) {
          if (cur) stages.push(cur);
          cur = { title: this.cleanStageTitle(t), duration: '', goal: '', topics: [], tasks: [], resources: [] };
          taskMode = false; topicMode = false; resourceMode = false;
        } else if (cur) {
          // 识别各类标签行
          const isTaskHeading = /^(实践|实战|任务|题目|作业|练习|项目|输出|验收|完成标准|底线标准|动手做|实操)[：:\s]*$/i.test(t);
          const isTopicHeading = /^(核心知识点|知识点|知识要点|学习要点|重点|关键概念|核心技术)[：:\s]*$/i.test(t);
          const isResourceHeading = /^(推荐资源|学习资源|参考资料|推荐资料|延伸阅读|参考)[：:\s]*$/i.test(t);
          const isDurationLine = /^(时间|时长|耗时|周期|预计)[：:]/i.test(t);
          const isGoalLine = /^(目标|核心目标|学习目标|本阶段目标|阶段目标)[：:]/i.test(t);
          const isTaskLine = /^[-•·*]\s/.test(t) || /^\d+[)）]\.?\s/.test(t);
          const labeledTasks = this.extractLabeledTasks(t);

          if (isTaskHeading) {
            taskMode = true; topicMode = false; resourceMode = false;
          } else if (isTopicHeading) {
            topicMode = true; taskMode = false; resourceMode = false;
          } else if (isResourceHeading) {
            resourceMode = true; taskMode = false; topicMode = false;
          } else if (isDurationLine) {
            cur.duration = t.replace(/^(时间|时长|耗时|周期|预计)[：:]\s*/, '');
          } else if (isGoalLine) {
            // 核心目标行：提取并格式化
            const goalText = t.replace(/^(目标|核心目标|学习目标|本阶段目标|阶段目标)[：:]\s*/, '');
            cur.goal += (cur.goal ? '\n' : '') + goalText;
          } else if (isTaskLine || taskMode) {
            pushTask(t.replace(/^[-•·*]\s|^\d+[)）]\.?\s*/, ''));
          } else if (topicMode) {
            // 知识点：用顿号/逗号分隔，或整行作为一个知识点
            const items = t.split(/[、，,；;]+/).map(s => s.trim()).filter(Boolean);
            items.forEach(item => {
              if (!cur.topics.includes(item)) cur.topics.push(item);
            });
          } else if (resourceMode) {
            // 资源：整行作为一个资源
            cur.resources.push({ name: t, url: '#' });
          } else if (labeledTasks.length) {
            labeledTasks.forEach(task => cur.tasks.push({ id: 't' + Date.now() + Math.random(), text: task, completed: false }));
          } else {
            // 普通内容行：根据上下文判断归属
            if (cur.tasks.length > 0 && !cur.goal) {
              // 如果已有任务但没有目标，这行可能是目标描述
              cur.goal += (cur.goal ? '\n' : '') + t;
            } else if (cur.tasks.length === 0) {
              // 还没有任务，这行是目标/描述
              cur.goal += (cur.goal ? '\n' : '') + t;
            }
            // 否则忽略（可能是任务后面的补充说明）
          }
        }
      });
      if (cur) stages.push(cur);
      if (stages.length === 0) stages.push({ title: '学习内容', duration: '待定', goal: text.substring(0, 300), topics: [], tasks: [{ id: 't1', text: '完成学习', completed: false }], resources: [] });
      return this.normalizePlanData({ title: title || fallbackTitle || '导入的学习计划', description: '从文档导入', icon: '📄', stages }, fallbackTitle);
    },
    importFile(file) {
      return new Promise((resolve, reject) => {
        const fallbackTitle = this.cleanFileTitle(file.name);
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.json')) {
          const r = new FileReader();
          r.onload = e => {
            try { resolve(this.normalizePlanData(JSON.parse(e.target.result), fallbackTitle)); }
            catch { reject(new Error('JSON 格式无效')); }
          };
          r.readAsText(file);
        } else if (fileName.endsWith('.txt')) {
          const r = new FileReader();
          r.onload = e => resolve(this.parseText(e.target.result, fallbackTitle));
          r.readAsText(file);
        } else if (fileName.endsWith('.docx')) {
          const r = new FileReader();
          r.onload = async e => {
            try {
              const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
              if (!result.value?.trim()) throw new Error('文档内容为空');
              resolve(this.parseText(result.value, fallbackTitle));
            } catch (err) { reject(new Error('docx 解析失败：' + err.message)); }
          };
          r.readAsArrayBuffer(file);
        } else { reject(new Error('不支持的文件格式')); }
      });
    },
  };

  // ==================== Main App ====================
  let app;

  class App {
    constructor() {
      this.data = Storage.load();
      this.particleSystem = null;
      this.currentSection = 0;
      this.sections = [];
      this.viewingPlanId = null;  // 当前查看的计划ID
      this.pendingImportPlan = null;
      this.editingPlanId = null;
      this.page = document.body.dataset.page || 'home';
      app = this;
      window.app = this;
      this.normalizeData();
      this.init();
    }

    normalizeData() {
      this.data.plans = (this.data.plans || []).map(plan => RoadmapManager.normalizePlanData(plan, plan.title));
      Storage.save(this.data);
    }

    init() {
      this.particleSystem = new ParticleSystem();
      requestAnimationFrame(() => {
        this.sections = [$('#hero'), $('#dashboard'), $('#roadmap'), $('#quizPage')].filter(Boolean);
        this.setupScroll();
        this.setupEvents();
        this.setInitialScene();
        if ($('#dashboard')) this.renderDashboard();
        if ($('#planGrid')) {
          // 检查URL参数是否有planId，有则直接显示详情
          const urlParams = new URLSearchParams(window.location.search);
          const showPlanId = urlParams.get('planId');
          if (showPlanId && this.data.plans.find(p => p.id === showPlanId)) {
            this.showPlanDetail(showPlanId);
          } else {
            this.renderPlanGallery();
          }
        }
        if ($('#quizPage')) this.renderQuizPage();
      });
    }

    // ---- Scroll ----
    setupScroll() {
      const sceneMap = [
        () => this.particleSystem.setHeroScene(),
        () => this.particleSystem.setDashboardScene(),
        () => this.particleSystem.setRoadmapScene(),
      ];
      if (this.sections.length > 1) {
        const obs = new IntersectionObserver(entries => {
          entries.forEach(e => {
            if (e.isIntersecting && e.intersectionRatio > 0.3) {
              const i = this.sections.indexOf(e.target);
              if (i !== -1 && i !== this.currentSection) {
                this.currentSection = i;
                sceneMap[i]?.();
              }
            }
          });
        }, { threshold: [0.3, 0.6] });
        this.sections.forEach(s => obs.observe(s));
      }

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const p = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
          const fill = $('.scroll-progress-fill');
          const glow = $('.scroll-progress-glow');
          if (fill) fill.style.height = (p * 100) + '%';
          if (glow) glow.style.opacity = p > 0.01 ? '0.8' : '0';
          this.updateActiveNav();
        });
      });
      this.setupPageFlowNavigation();
    }

    setInitialScene() {
      const fromPage = sessionStorage.getItem('study_aiming_from_page');
      sessionStorage.removeItem('study_aiming_from_page');

      if ($('#dashboard')) {
        if (fromPage === 'roadmap' || fromPage === 'quiz') this.particleSystem.setRoadmapScene();
        else this.particleSystem.setHeroScene();
        requestAnimationFrame(() => this.particleSystem.setDashboardScene());
      } else if ($('#roadmap') || $('#quizPage')) {
        if (fromPage === 'dashboard') this.particleSystem.setDashboardScene();
        else this.particleSystem.setHeroScene();
        requestAnimationFrame(() => this.particleSystem.setRoadmapScene());
      } else {
        this.particleSystem.setHeroScene();
      }
      this.updateActiveNav();
    }

    updateActiveNav() {
      const activePage = this.page === 'quiz' ? 'roadmap' : this.page;
      $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === activePage));
    }

    getHomeUrl() { return this.page === 'home' ? 'index.html' : '../index.html'; }
    getDashboardUrl() { return this.page === 'home' ? 'pages/dashboard.html' : 'dashboard.html'; }
    getRoadmapUrl() { return this.page === 'home' ? 'pages/roadmap.html' : 'roadmap.html'; }
    getQuizUrl(planId, stageIndex) {
      const base = this.page === 'home' ? 'pages/quiz.html' : 'quiz.html';
      return `${base}?planId=${encodeURIComponent(planId)}&stage=${encodeURIComponent(stageIndex)}`;
    }
    recordPageTransition(targetPage) {
      if (!targetPage || targetPage === this.page) return;
      sessionStorage.setItem('study_aiming_from_page', this.page);
    }
    goToPage(url, targetPage) {
      this.recordPageTransition(targetPage);
      window.location.href = url;
    }
    setupPageFlowNavigation() {
      if (this.page === 'quiz') return;
      const nextMap = {
        home: { url: this.getDashboardUrl(), page: 'dashboard' },
        dashboard: { url: this.getRoadmapUrl(), page: 'roadmap' },
      };
      const prevMap = {
        dashboard: { url: this.getHomeUrl(), page: 'home' },
        roadmap: { url: this.getDashboardUrl(), page: 'dashboard' },
      };
      const shouldIgnore = target => target instanceof Element && !!target.closest('input, textarea, select, button, .modal-overlay.active, .task-list, .modal');
      const atBottom = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return max <= 2 || window.scrollY >= max - 4;
      };
      const atTop = () => window.scrollY <= 2;
      let navigating = false;
      const navigate = target => {
        if (!target || navigating) return;
        navigating = true;
        this.goToPage(target.url, target.page);
      };

      window.addEventListener('wheel', e => {
        if (shouldIgnore(e.target)) return;
        if (e.deltaY > 28 && atBottom()) {
          const target = nextMap[this.page];
          if (target) {
            e.preventDefault();
            navigate(target);
          }
        } else if (e.deltaY < -28 && atTop()) {
          const target = prevMap[this.page];
          if (target) {
            e.preventDefault();
            navigate(target);
          }
        }
      }, { passive: false });

      let startY = null;
      window.addEventListener('touchstart', e => {
        if (shouldIgnore(e.target) || e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
      }, { passive: true });
      window.addEventListener('touchend', e => {
        if (startY === null) return;
        const endY = e.changedTouches[0]?.clientY ?? startY;
        const delta = startY - endY;
        startY = null;
        if (Math.abs(delta) < 70) return;
        if (delta > 0 && atBottom()) navigate(nextMap[this.page]);
        if (delta < 0 && atTop()) navigate(prevMap[this.page]);
      }, { passive: true });
    }

    // ---- Events ----
    setupEvents() {
      $$('.nav-link').forEach(l => {
        l.addEventListener('click', e => {
          const href = l.getAttribute('href') || '';
          if (!href.startsWith('#')) {
            this.recordPageTransition(l.dataset.page);
            return;
          }
          e.preventDefault();
          document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
        });
      });
      $$('.scroll-hint').forEach(l => {
        l.addEventListener('click', () => this.recordPageTransition(l.dataset.page));
      });
      $$('a[data-page]:not(.nav-link):not(.scroll-hint)').forEach(l => {
        l.addEventListener('click', () => this.recordPageTransition(l.dataset.page));
      });

      // Hero
      $('#btnStart')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImport')?.addEventListener('click', () => this.openModal('importModal'));

      // Settings
      $('#btnSettings')?.addEventListener('click', () => this.openSettings());
      $('#closeSettings')?.addEventListener('click', () => this.closeModal('settingsModal'));
      $('#apiProvider')?.addEventListener('change', e => {
        const provider = e.target.value;
        $('#customEndpointGroup').style.display = provider === 'custom' ? 'block' : 'none';
        this.updateModelDropdown(provider);
      });
      $('#btnSaveSettings')?.addEventListener('click', () => this.saveSettings());
      $('#btnTestApi')?.addEventListener('click', () => this.testApi());

      // Create plan
      $('#closeCreate')?.addEventListener('click', () => this.closeModal('createModal'));
      $('#btnGenerateRoadmap')?.addEventListener('click', () => this.generatePlan());

      // Import
      $('#closeImport')?.addEventListener('click', () => this.closeImportModal());
      $('#btnConfirmImport')?.addEventListener('click', () => this.confirmImport());
      this.setupFileUpload();

      // Gallery
      $('#btnNewPlan')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImportPlan')?.addEventListener('click', () => this.openModal('importModal'));

      // Detail
      $('#btnBackToList')?.addEventListener('click', () => this.showPlanGallery());
      $('#btnDeletePlan')?.addEventListener('click', () => this.deleteCurrentPlan());
      $('#closeStage')?.addEventListener('click', () => this.closeModal('stageModal'));
      $('#closeEditPlan')?.addEventListener('click', () => this.closeEditPlanModal());
      $('#btnSavePlanEdit')?.addEventListener('click', () => this.savePlanEdit());

      // Tasks
      $('#btnAddTask')?.addEventListener('click', () => this.showTaskInput());
      $('#btnConfirmTask')?.addEventListener('click', () => this.addTask());
      $('#btnCancelTask')?.addEventListener('click', () => this.hideTaskInput());
      $('#taskInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') this.addTask(); });

      // Dashboard plan selector
      $('#planSelector')?.addEventListener('change', e => {
        this.data.activePlanId = e.target.value;
        Storage.save(this.data);
        this.renderDashboard();
      });
      $('#btnGoToPlans')?.addEventListener('click', () => {
        window.location.href = this.getRoadmapUrl();
      });

      // Reset
      $('#btnResetAll')?.addEventListener('click', () => this.resetAll());

      // Modal overlay close
      $$('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));
    }

    openModal(id) { document.getElementById(id)?.classList.add('active'); }
    closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
    escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    safeUrl(url) {
      const raw = String(url || '').trim();
      if (!raw || raw === '#') return '#';
      try {
        const u = new URL(raw, window.location.href);
        return ['http:', 'https:'].includes(u.protocol) ? u.href : '#';
      } catch {
        return '#';
      }
    }

    // ==================== Dashboard ====================
    // 获取当前激活的计划
    getActivePlan() {
      const plans = this.data.plans || [];
      if (plans.length === 0) return null;
      const activeId = this.data.activePlanId;
      return plans.find(p => p.id === activeId) || plans[0];
    }

    // 渲染计划切换器
    renderPlanSwitcher() {
      const plans = this.data.plans || [];
      const switcher = $('#planSwitcher');
      const selector = $('#planSelector');

      if (plans.length <= 1) {
        switcher.style.display = 'none';
        return;
      }

      switcher.style.display = 'flex';
      const activePlan = this.getActivePlan();
      selector.innerHTML = plans.map(p =>
        `<option value="${p.id}" ${p.id === activePlan?.id ? 'selected' : ''}>${this.escHtml(p.icon || '📘')} ${this.escHtml(p.title)}</option>`
      ).join('');
    }

    showTaskInput() { $('#taskInputRow').style.display = 'flex'; $('#taskInput').focus(); }
    hideTaskInput() { $('#taskInputRow').style.display = 'none'; $('#taskInput').value = ''; }

    addTask() {
      const title = $('#taskInput').value.trim();
      if (!title) return;
      const plan = this.getActivePlan();
      if (!plan) { showToast('请先选择一个学习计划', 'error'); return; }

      // 添加到计划的额外任务中（非计划内任务）
      if (!plan.extraTasks) plan.extraTasks = [];
      plan.extraTasks.push({ id: 'ext_' + Date.now(), text: title, completed: false });

      Storage.save(this.data);
      $('#taskInput').value = '';
      this.renderDashboard();
      showToast('任务已添加', 'success');
    }

    togglePlanTask(taskId) {
      const plan = this.getActivePlan();
      if (!plan) return;

      // 在计划任务中查找
      for (let si = 0; si < plan.stages.length; si++) {
        const stage = plan.stages[si];
        const task = stage.tasks?.find(t => t.id === taskId);
        if (task) {
          if (!this.isStageUnlocked(plan, si)) {
            showToast('请先完成上一阶段任务', 'info');
            return;
          }
          task.completed = !task.completed;
          if (task.completed) {
            this.recordStudyActivity(task, { kind: 'stage', planId: plan.id, stageIndex: si });
          }
          Storage.save(this.data);
          this.renderDashboard();
          return;
        }
      }

      // 在额外任务中查找
      const extTask = plan.extraTasks?.find(t => t.id === taskId);
      if (extTask) {
        extTask.completed = !extTask.completed;
        if (extTask.completed) {
          this.recordStudyActivity(extTask, { kind: 'extra', planId: plan.id });
        }
        Storage.save(this.data);
        this.renderDashboard();
      }
    }

    deletePlanTask(taskId) {
      const plan = this.getActivePlan();
      if (!plan) return;
      const before = (plan.extraTasks || []).length;
      plan.extraTasks = (plan.extraTasks || []).filter(t => t.id !== taskId);
      if (plan.extraTasks.length === before) {
        showToast('计划内任务不能在仪表盘删除', 'info');
        return;
      }
      Storage.save(this.data);
      this.renderDashboard();
    }

    updateStreak() {
      const today = localDateKey();
      const yesterday = localDateKey(new Date(Date.now() - 86400000));
      const p = this.data.progress;
      if (p.lastDate === today) return;
      p.streak = (p.lastDate === yesterday) ? (p.streak || 0) + 1 : 1;
      p.lastDate = today;
    }

    recordStudyActivity(task, meta = {}) {
      const now = new Date();
      const today = localDateKey(now);
      const progress = this.data.progress;
      if (!progress.heatmap) progress.heatmap = {};
      if (!Array.isArray(progress.activityLog)) progress.activityLog = [];

      progress.heatmap[today] = (progress.heatmap[today] || 0) + 1;
      progress.activityLog.push({
        at: now.toISOString(),
        date: today,
        hour: now.getHours(),
        taskId: task?.id || '',
        taskText: String(task?.text || task?.title || '').slice(0, 120),
        kind: meta.kind || '',
        planId: meta.planId || this.getActivePlan()?.id || '',
        stageIndex: Number.isInteger(meta.stageIndex) ? meta.stageIndex : null,
      });
      progress.activityLog = progress.activityLog.slice(-240);
      this.updateStreak();
    }

    getStageInfo(pct) {
      if (pct >= 70) return { label: '精通阶段', icon: '🏆' };
      if (pct >= 30) return { label: '进阶阶段', icon: '🌠' };
      return { label: '入门阶段', icon: '⭐' };
    }

    isStageUnlocked(plan, stageIndex) {
      if (stageIndex <= 0) return true;
      const prev = plan.stages?.[stageIndex - 1];
      const tasks = prev?.tasks || [];
      return tasks.length > 0 && tasks.every(t => t.completed);
    }

    buildAchievementBadges(plan, allTasks, completedTasks) {
      const log = Array.isArray(this.data.progress.activityLog) ? this.data.progress.activityLog : [];
      const stages = plan?.stages || [];
      const planAchievements = plan?.achievements || [];
      const quizDone = stages.reduce((sum, s) => sum + (s.quiz?.completed ? 1 : 0), 0);

      // 通用徽章（时间相关）
      const universalBadges = [
        {
          name: '早起鸟',
          icon: '☀',
          unlocked: log.some(a => Number(a.hour) < 8),
          desc: '早上 8 点前完成一次学习打卡',
          status: log.some(a => Number(a.hour) < 8) ? '已解锁' : '未解锁',
        },
        {
          name: '夜猫子',
          icon: '☾',
          unlocked: log.some(a => Number(a.hour) >= 22 || Number(a.hour) <= 1),
          desc: '22 点后完成一次深夜学习',
          status: log.some(a => Number(a.hour) >= 22 || Number(a.hour) <= 1) ? '已解锁' : '未解锁',
        },
        {
          name: '闯关学者',
          icon: '✓',
          unlocked: quizDone > 0,
          desc: '完成任一阶段测验',
          status: quizDone > 0 ? `已通过 ${quizDone} 次` : '未解锁',
        },
      ];

      // 计划专属徽章（AI生成）
      const planBadges = planAchievements.map(a => {
        const unlocked = completedTasks >= a.unlockAt;
        return {
          name: a.name,
          icon: a.icon,
          unlocked,
          desc: a.desc,
          status: unlocked ? '已解锁' : `${completedTasks}/${a.unlockAt}`,
        };
      });

      return [...planBadges, ...universalBadges];
    }

    renderAchievements(plan, allTasks = [], completedTasks = 0) {
      const grid = $('#achievementGrid');
      const summary = $('#achievementSummary');
      if (!grid) return;
      const badges = this.buildAchievementBadges(plan, allTasks, completedTasks);
      const unlocked = badges.filter(b => b.unlocked).length;
      if (summary) summary.textContent = `${unlocked}/${badges.length}`;
      grid.innerHTML = badges.map(b => `
        <div class="achievement-badge ${b.unlocked ? 'unlocked' : 'locked'}" title="${this.escHtml(b.desc)}">
          <div class="achievement-icon">${b.unlocked ? this.escHtml(b.icon) : '🔒'}</div>
          <div class="achievement-name">${this.escHtml(b.name)}</div>
          <div class="achievement-desc">${this.escHtml(b.desc)}</div>
          <div class="achievement-status">${this.escHtml(b.status)}</div>
        </div>
      `).join('');
    }

    renderDashboard() {
      if (!$('#dashboard')) return;
      const plan = this.getActivePlan();
      const emptyEl = $('#dashboardEmpty');
      const contentEl = $('#dashboardContent');

      // 无计划 → 显示空状态
      if (!plan) {
        emptyEl.style.display = 'block';
        contentEl.style.display = 'none';
        $('#planSwitcher').style.display = 'none';
        this.renderHeatmap();
        this.renderAchievements(null, [], 0);
        return;
      }

      // 有计划 → 显示内容
      emptyEl.style.display = 'none';
      contentEl.style.display = 'block';
      this.renderPlanSwitcher();

      // 获取计划内所有任务
      const stageTasks = plan.stages?.flatMap((s, si) => (s.tasks || []).map(t => ({ ...t, _kind: 'stage', _stageIndex: si }))) || [];
      const extraTasks = (plan.extraTasks || []).map(t => ({ ...t, _kind: 'extra' }));
      const allTasks = [...stageTasks, ...extraTasks];
      const total = allTasks.length;
      const completed = allTasks.filter(t => t.completed).length;
      const pct = total > 0 ? Math.round(completed / total * 100) : 0;
      const stage = this.getStageInfo(pct);

      // 更新统计卡片
      $('#statTotalTasks').textContent = total;
      $('#statCompleted').textContent = completed;
      $('#statStreak').textContent = this.data.progress.streak || 0;
      $('#statStage').textContent = stage.label;
      $('#stageIcon').textContent = stage.icon;
      $('#streakIcon').className = (this.data.progress.streak || 0) > 0 ? 'streak-fire' : '';

      // 更新进度条
      $('#mainProgressFill').style.width = pct + '%';
      $('#mainProgressText').textContent = pct + '%';
      const current = allTasks.find(t => !t.completed);
      $('#currentTask').textContent = current ? current.text : (total > 0 ? '所有任务已完成！🎉' : '暂无学习任务');

      // 渲染任务列表
      const list = $('#taskList');
      if (total === 0) {
        list.innerHTML = '<div class="task-empty">暂无任务，点击「+ 添加任务」开始</div>';
      } else {
        list.innerHTML = allTasks.map(t => `
          <div class="task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}">
            <div class="task-check">${t.completed ? '✓' : ''}</div>
            <span class="task-title">${this.escHtml(t.text || t.title)}</span>
            ${t._kind === 'extra' ? `<span class="task-delete" data-id="${t.id}">✕</span>` : ''}
          </div>
        `).join('');
        list.querySelectorAll('.task-check').forEach(el => el.addEventListener('click', () => this.togglePlanTask(el.closest('.task-item').dataset.id)));
        list.querySelectorAll('.task-delete').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); this.deletePlanTask(el.dataset.id); }));
      }

      this.renderHeatmap();
      this.renderAchievements(plan, allTasks, completed);
    }

    renderHeatmap() {
      const grid = $('#heatmapGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const hm = this.data.progress.heatmap || {};
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const today = now.getDate();

      // 热力图按周一开头显示，getDay() 的周日需要挪到最后一列。
      const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
      // 当月总天数（下个月0号 = 本月最后一天）
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // 前置空白占位（1号之前的空格）
      for (let i = 0; i < firstDayOfWeek; i++) {
        const blank = document.createElement('div');
        blank.className = 'heatmap-cell heatmap-blank';
        grid.appendChild(blank);
      }

      // 渲染每一天
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const count = hm[dateStr] || 0;
        const isToday = day === today;
        const isFuture = day > today;

        const cell = document.createElement('div');
        let cls = 'heatmap-cell';
        if (isFuture) {
          cls += ' heatmap-future';
        } else if (count >= 4) {
          cls += ' level-4';
        } else if (count >= 3) {
          cls += ' level-3';
        } else if (count >= 2) {
          cls += ' level-2';
        } else if (count >= 1) {
          cls += ' level-1';
        }
        if (isToday) cls += ' heatmap-today';

        cell.className = cls;
        cell.title = isFuture ? `${dateStr}（待学习）` : `${dateStr}: ${count} 个任务`;
        grid.appendChild(cell);
      }

      const totalCells = firstDayOfWeek + daysInMonth;
      const trailingBlanks = (7 - (totalCells % 7)) % 7;
      for (let i = 0; i < trailingBlanks; i++) {
        const blank = document.createElement('div');
        blank.className = 'heatmap-cell heatmap-blank';
        grid.appendChild(blank);
      }
    }

    // ==================== Settings ====================
    // 更新模型下拉框
    updateModelDropdown(provider, selectedModel) {
      const input = $('#modelName');
      const list = $('#modelPresetList');
      const models = MODEL_PRESETS[provider]?.models || [];
      list.innerHTML = models.map(m => `<option value="${this.escHtml(m)}"></option>`).join('');
      input.placeholder = models.length ? '选择或输入模型名称' : '请输入模型名称';
      input.value = selectedModel || models[0] || '';
    }

    openSettings() {
      const s = this.data.settings;
      const provider = s.apiProvider || 'openai';
      $('#apiProvider').value = provider;
      $('#apiKey').value = s.apiKey || '';
      $('#apiEndpoint').value = s.endpoint || '';
      $('#customEndpointGroup').style.display = provider === 'custom' ? 'block' : 'none';
      // 更新模型下拉框
      this.updateModelDropdown(provider, s.modelName);
      this.updateApiStatus();
      this.openModal('settingsModal');
    }

    updateApiStatus() {
      const key = this.data.settings.apiKey;
      const dot = $('#apiStatusDot');
      const text = $('#apiStatusText');
      const testBtn = $('#btnTestApi');
      if (AI.validateKey(key)) {
        dot.className = 'api-status-dot connected';
        text.textContent = '已配置 API Key';
        testBtn.style.display = 'inline-flex';
      } else {
        dot.className = 'api-status-dot';
        text.textContent = '未连接';
        testBtn.style.display = 'none';
      }
    }

    saveSettings() {
      const key = $('#apiKey').value.trim();
      if (!AI.validateKey(key)) { showToast('API Key 格式不正确', 'error'); return; }
      this.data.settings = { apiProvider: $('#apiProvider').value, apiKey: key, endpoint: $('#apiEndpoint').value, modelName: $('#modelName').value };
      Storage.save(this.data);
      this.updateApiStatus();
      showToast('设置已保存', 'success');
    }

    async testApi() {
      const btn = $('#btnTestApi');
      btn.disabled = true; btn.textContent = '测试中...';
      try {
        await AI.testConnection();
        $('#apiStatusDot').className = 'api-status-dot connected';
        $('#apiStatusText').textContent = '已连接 ✓';
        showToast('API 连接成功！', 'success');
      } catch (e) {
        $('#apiStatusDot').className = 'api-status-dot error';
        $('#apiStatusText').textContent = '连接失败';
        showToast('连接失败：' + e.message, 'error');
      } finally { btn.disabled = false; btn.textContent = '测试连接'; }
    }

    // ==================== Plan Management ====================
    openCreateModal() {
      if (!AI.validateKey(this.data.settings.apiKey)) {
        showToast('请先在设置中配置 API Key', 'error');
        this.openSettings();
        return;
      }
      this.openModal('createModal');
    }

    // 进度模拟（先快后慢）
    startProgress() {
      const progressEl = $('#generateProgress');
      const fillEl = $('#progressFill');
      const labelEl = $('#progressLabel');
      const pctEl = $('#progressPct');
      progressEl.style.display = 'block';

      const stages = [
        { pct: 15, label: '正在分析学习目标...' },
        { pct: 35, label: '检索相关课程资源...' },
        { pct: 55, label: '构建知识图谱路径...' },
        { pct: 75, label: '设计实战任务...' },
        { pct: 90, label: '优化学习时间表...' },
      ];

      let current = 0;
      this._progressTimer = setInterval(() => {
        if (current < stages.length) {
          const s = stages[current];
          fillEl.style.width = s.pct + '%';
          labelEl.textContent = s.label;
          pctEl.textContent = s.pct + '%';
          current++;
        }
      }, 800);

      return { fillEl, labelEl, pctEl, progressEl };
    }

    stopProgress(success) {
      clearInterval(this._progressTimer);
      const fillEl = $('#progressFill');
      const labelEl = $('#progressLabel');
      const pctEl = $('#progressPct');
      const progressEl = $('#generateProgress');

      if (success) {
        fillEl.style.width = '100%';
        pctEl.textContent = '100%';
        labelEl.textContent = '生成完成！';
        setTimeout(() => {
          progressEl.style.display = 'none';
          fillEl.style.width = '0%';
        }, 600);
      } else {
        progressEl.style.display = 'none';
        fillEl.style.width = '0%';
      }
    }

    async generatePlan() {
      const topic = $('#learnTopic').value.trim();
      if (!topic) { showToast('请输入学习内容', 'error'); return; }
      const btn = $('#btnGenerateRoadmap');
      const status = $('#aiStatus');
      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loading').style.display = 'inline';
      status.className = 'ai-status';

      // 启动进度模拟
      this.startProgress();

      try {
        const planData = await AI.generatePlan(topic, $('#currentLevel').value, $('#targetLevel').value, $('#dailyHours').value, $('#urgency').value, $('#extraInfo').value.trim());
        const newPlanId = 'plan_' + Date.now();
        const plan = {
          id: newPlanId,
          title: planData.title || topic,
          description: planData.description || 'AI 生成的学习计划',
          icon: planData.icon || '📘',
          createdAt: localDateKey(),
          stages: (planData.stages || []).map((s, i) => ({
            ...s,
            id: 's' + i,
            tasks: (s.tasks || []).map((t, j) => ({ id: t.id || 't' + i + '_' + j, text: t.text || t.title || '', completed: false })),
            resources: s.resources || [],
            topics: s.topics || [],
            duration: s.duration || '',
            goal: s.goal || '',
            quiz: RoadmapManager.normalizeQuiz(s.quiz, s, i),
          })),
          achievements: (planData.achievements || []).map((a, i) => ({
            id: 'ach_' + i,
            name: a.name || '成就',
            icon: a.icon || '✦',
            desc: a.desc || '完成学习任务',
            unlockAt: a.unlockAt || 3,
          })),
        };
        // 如果AI没有返回成就，生成默认4个成就
        if (!plan.achievements.length) {
          const totalTasks = plan.stages.reduce((s, st) => s + (st.tasks?.length || 0), 0);
          plan.achievements = [
            { id: 'ach_0', name: '初学者', icon: '🌱', desc: '完成第一个任务', unlockAt: 1 },
            { id: 'ach_1', name: '探索者', icon: '🔍', desc: `完成 ${Math.max(2, Math.ceil(totalTasks * 0.25))} 个任务`, unlockAt: Math.max(2, Math.ceil(totalTasks * 0.25)) },
            { id: 'ach_2', name: '坚持者', icon: '🔥', desc: `完成 ${Math.ceil(totalTasks * 0.6)} 个任务`, unlockAt: Math.ceil(totalTasks * 0.6) },
            { id: 'ach_3', name: '大师', icon: '🏆', desc: `完成全部 ${totalTasks} 个任务`, unlockAt: totalTasks },
          ];
        }
        this.data.plans.push(plan);
        this.data.activePlanId = plan.id;
        Storage.save(this.data);

        // 完成进度
        this.stopProgress(true);
        await new Promise(r => setTimeout(r, 600));

        this.closeModal('createModal');

        // 跳转到计划详情页
        if ($('#planDetail')) {
          // 当前在路线图页面，直接显示详情
          this.showPlanDetail(newPlanId);
        } else {
          // 当前在其他页面，跳转到路线图页面并带上planId参数
          window.location.href = `${this.getRoadmapUrl()}?planId=${encodeURIComponent(newPlanId)}`;
        }
        showToast('学习计划已生成！', 'success');
      } catch (e) {
        this.stopProgress(false);
        status.textContent = e.message;
        status.className = 'ai-status error';
      } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loading').style.display = 'none';
      }
    }

    setupFileUpload() {
      const area = $('#uploadArea');
      const input = $('#fileInput');
      area?.addEventListener('click', () => input?.click());
      area?.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
      area?.addEventListener('dragleave', () => area.classList.remove('dragover'));
      area?.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dragover'); if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]); });
      input?.addEventListener('change', e => { if (e.target.files.length) this.handleFile(e.target.files[0]); });
    }

    async handleFile(file) {
      try {
        const planData = await RoadmapManager.importFile(file);
        const plan = {
          id: 'plan_' + Date.now(),
          title: planData.title || '导入的计划',
          description: planData.description || '从文档导入',
          icon: planData.icon || '📄',
          createdAt: localDateKey(),
          stages: (planData.stages || []).map((s, i) => ({
            ...s, id: 's' + i,
            tasks: (s.tasks || []).map((t, j) => ({ id: t.id || 't' + i + '_' + j, text: t.text || t.title || '', completed: false })),
            resources: s.resources || [], topics: s.topics || [], duration: s.duration || '', goal: s.goal || '',
            quiz: RoadmapManager.normalizeQuiz(s.quiz, s, i),
          })),
        };
        const preview = $('#importPreview');
        let txt = `📌 ${plan.title}\n\n`;
        plan.stages.forEach((s, i) => { txt += `阶段 ${i + 1}: ${s.title}\n`; s.tasks.forEach(t => { txt += `  • ${t.text}\n`; }); txt += '\n'; });
        $('#previewContent').textContent = txt.substring(0, 800);
        preview.style.display = 'block';
        this.pendingImportPlan = plan;
      } catch (e) { showToast('导入失败：' + e.message, 'error'); }
    }

    confirmImport() {
      if (!this.pendingImportPlan) {
        showToast('请先选择要导入的文件', 'error');
        return;
      }
      this.data.plans.push(this.pendingImportPlan);
      this.data.activePlanId = this.pendingImportPlan.id;
      Storage.save(this.data);
      this.pendingImportPlan = null;
      this.closeModal('importModal');
      $('#importPreview').style.display = 'none';
      $('#fileInput').value = '';
      if ($('#planGrid')) this.renderPlanGallery();
      this.renderDashboard();
      if (!$('#planGrid')) {
        window.location.href = this.getRoadmapUrl();
        return;
      }
      showToast('学习计划已导入！', 'success');
    }

    closeImportModal() {
      this.pendingImportPlan = null;
      $('#importPreview').style.display = 'none';
      $('#fileInput').value = '';
      this.closeModal('importModal');
    }

    // ==================== Plan Gallery ====================
    renderPlanGallery() {
      const plans = this.data.plans;
      const grid = $('#planGrid');
      const empty = $('#emptyState');
      if (!grid || !empty) return;

      if (plans.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      grid.innerHTML = plans.map(plan => {
        const totalTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
        const doneTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.filter(t => t.completed).length || 0), 0);
        const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;
        const stagesDone = plan.stages.filter(s => s.tasks?.length > 0 && s.tasks.every(t => t.completed)).length;

        return `
          <div class="plan-card" data-id="${plan.id}">
            <button class="plan-card-edit" data-id="${plan.id}" title="编辑计划" aria-label="编辑计划">✎</button>
            <div class="plan-card-icon">${this.escHtml(plan.icon || '📘')}</div>
            <div class="plan-card-title">${this.escHtml(plan.title)}</div>
            <div class="plan-card-desc">${this.escHtml(plan.description || '')}</div>
            <div class="plan-card-meta">
              <span style="font-size:0.8rem;color:var(--text-muted)">${plan.createdAt}</span>
              <span style="font-size:0.8rem;color:var(--purple-light)">${pct}%</span>
            </div>
            <div class="plan-card-progress-bar"><div class="plan-card-progress-fill" style="width:${pct}%"></div></div>
            <div class="plan-card-stats">
              <span>已完成 ${stagesDone}/${plan.stages.length} 阶段</span>
              <span>${doneTasks}/${totalTasks} 任务</span>
            </div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.plan-card').forEach(el => {
        el.addEventListener('click', () => this.showPlanDetail(el.dataset.id));
      });
      grid.querySelectorAll('.plan-card-edit').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.openEditPlan(btn.dataset.id);
        });
      });
    }

    openEditPlan(planId) {
      const plan = this.data.plans.find(p => p.id === planId);
      if (!plan) return;
      if (!$('#editPlanModal')) return;
      this.editingPlanId = planId;
      $('#editPlanIcon').value = plan.icon || '';
      $('#editPlanTitle').value = plan.title || '';
      $('#editPlanDescription').value = plan.description || '';
      this.openModal('editPlanModal');
    }

    closeEditPlanModal() {
      this.editingPlanId = null;
      this.closeModal('editPlanModal');
    }

    savePlanEdit() {
      const plan = this.data.plans.find(p => p.id === this.editingPlanId);
      if (!plan) return;
      const title = $('#editPlanTitle').value.trim();
      if (!title) { showToast('请输入计划名称', 'error'); return; }

      plan.icon = $('#editPlanIcon').value.trim() || '📘';
      plan.title = title;
      plan.description = $('#editPlanDescription').value.trim();
      Storage.save(this.data);
      this.renderPlanGallery();
      this.renderDashboard();
      if (this.viewingPlanId === plan.id) this.renderPlanDetailHero(plan);
      this.closeEditPlanModal();
      showToast('计划信息已更新', 'success');
    }

    // ==================== Plan Detail ====================
    showPlanDetail(planId) {
      const plan = this.data.plans.find(p => p.id === planId);
      if (!plan) return;
      if (!$('#planGallery') || !$('#planDetail')) return;
      this.viewingPlanId = planId;

      // 切换视图
      $('#planGallery').style.display = 'none';
      $('#planDetail').style.display = 'block';

      this.renderPlanDetailHero(plan);
      this.renderPlanDetailTimeline(plan);
    }

    showPlanGallery() {
      this.viewingPlanId = null;
      if (!$('#planDetail') || !$('#planGallery')) return;
      $('#planDetail').style.display = 'none';
      $('#planGallery').style.display = 'block';
      this.renderPlanGallery();
    }

    deleteCurrentPlan() {
      if (!confirm('确定要删除此学习计划吗？')) return;
      this.data.plans = this.data.plans.filter(p => p.id !== this.viewingPlanId);
      if (this.data.activePlanId === this.viewingPlanId) {
        this.data.activePlanId = this.data.plans[0]?.id || null;
      }
      Storage.save(this.data);
      this.showPlanGallery();
      this.renderDashboard();
      showToast('计划已删除', 'info');
    }

    renderPlanDetailHero(plan) {
      const totalTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
      const doneTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.filter(t => t.completed).length || 0), 0);
      const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

      $('#detailHero').innerHTML = `
        <div class="detail-hero-icon">${this.escHtml(plan.icon || '📘')}</div>
        <div class="detail-hero-title">${this.escHtml(plan.title)}</div>
        <div class="detail-hero-desc">${this.escHtml(plan.description || '')}</div>
        <div class="detail-hero-stats">
          <div class="detail-stat"><span class="detail-stat-value">${plan.stages.length}</span><span class="detail-stat-label">阶段</span></div>
          <div class="detail-stat"><span class="detail-stat-value">${totalTasks}</span><span class="detail-stat-label">任务</span></div>
          <div class="detail-stat"><span class="detail-stat-value">${pct}%</span><span class="detail-stat-label">完成度</span></div>
          <div class="detail-stat"><span class="detail-stat-value">${plan.createdAt}</span><span class="detail-stat-label">创建时间</span></div>
        </div>
      `;
    }

    renderPlanDetailTimeline(plan) {
      const timeline = $('#detailTimeline');
      // 记录当前展开的阶段索引，重渲染后恢复
      const expandedBefore = new Set();
      timeline.querySelectorAll('.stage-block.expanded').forEach(el => {
        const si = el.dataset.si;
        if (si !== undefined) expandedBefore.add(si);
      });

      timeline.innerHTML = plan.stages.map((stage, si) => {
        const tasks = stage.tasks || [];
        const done = tasks.filter(t => t.completed).length;
        const pct = tasks.length > 0 ? Math.round(done / tasks.length * 100) : 0;
        const isComplete = tasks.length > 0 && done === tasks.length;
        const isUnlocked = this.isStageUnlocked(plan, si);
        const statusClass = isComplete ? 'completed' : isUnlocked ? 'active' : 'locked';
        const quiz = RoadmapManager.normalizeQuiz(stage.quiz, stage, si);
        const quizDone = !!quiz.completed;
        const quizReady = isUnlocked && isComplete;
        const quizAccessible = quizDone || quizReady;
        const quizPanelClass = quizDone ? 'done' : quizReady ? 'ready' : 'locked';
        const quizActionText = quizDone ? '查看测验结果' : '参加本阶段测验';
        const quizMeta = quizDone
          ? `已完成，得分 ${quiz.score || 0}/${quiz.questions.length}`
          : quizReady
            ? `${quiz.questions.length} 道选择题，完成后显示答案解析`
            : '完成本阶段实战任务后解锁';

        return `
          <div class="stage-block ${statusClass}" data-si="${si}">
            <div class="stage-dot"></div>
            <div class="stage-card">
              <div class="stage-card-header" data-si="${si}">
                <span class="stage-card-title">${this.escHtml(stage.title || `阶段 ${si + 1}`)}</span>
                <span class="stage-card-toggle">▼</span>
              </div>
              <div class="stage-card-body">
                ${stage.duration || stage.goal ? `
                <div class="stage-goal-block">
                  ${stage.duration ? `
                  <div class="stage-goal-row">
                    <span class="stage-goal-label">⏱️ 预计耗时</span>
                    <span class="stage-goal-progress" data-si="${si}">${done}/${tasks.length}</span>
                  </div>
                  <div class="stage-goal-value">${this.escHtml(stage.duration)}</div>
                  ` : ''}
                  ${stage.goal ? `
                  <div class="stage-goal-row" style="margin-top:12px">
                    <span class="stage-goal-label">🎯 核心目标</span>
                  </div>
                  <div class="stage-goal-value">${this.escHtml(stage.goal)}</div>
                  ` : ''}
                </div>
                ` : ''}

                ${stage.topics?.length ? `
                <div class="stage-section">
                  <div class="stage-section-label">🧠 核心知识点</div>
                  <div class="stage-topics">${stage.topics.map(t => `<span class="stage-topic">${this.escHtml(t)}</span>`).join('')}</div>
                </div>
                ` : ''}

                ${tasks.length ? `
                <div class="stage-section">
                  <div class="stage-section-label">🛠️ 实战任务</div>
                  <div class="stage-tasks">${tasks.map(t => `
                    <div class="stage-task-item ${t.completed ? 'done' : ''} ${isUnlocked ? '' : 'locked'}" data-si="${si}" data-tid="${t.id}" data-locked="${isUnlocked ? 'false' : 'true'}">
                      <div class="stage-task-check">${t.completed ? '✓' : ''}</div>
                      <span class="stage-task-text">${this.escHtml(t.text)}</span>
                      <span class="stage-task-status ${t.completed ? 'completed' : 'pending'}">${t.completed ? '已完成' : '未完成'}</span>
                    </div>
                  `).join('')}</div>
                </div>
                ` : ''}

                ${stage.resources?.length ? `
                <div class="stage-section">
                  <div class="stage-section-label">📚 推荐资源</div>
                  <div class="stage-resources">${stage.resources.map(r => `
                    <a class="resource-link" href="${this.safeUrl(r.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                      <span class="resource-link-icon">🔗</span>
                      <span>${this.escHtml(r.name)}</span>
                    </a>
                  `).join('')}</div>
                </div>
                ` : ''}

                <div class="stage-quiz-panel ${quizPanelClass}">
                  <div class="stage-quiz-copy">
                    <div class="stage-quiz-title">🧩 阶段测验</div>
                    <div class="stage-quiz-meta">${this.escHtml(quizMeta)}</div>
                  </div>
                  ${quizAccessible ? `
                    <a class="btn btn-sm ${quizDone ? 'btn-outline' : 'btn-primary'} stage-quiz-action" href="${this.getQuizUrl(plan.id, si)}" data-page="quiz" onclick="event.stopPropagation()">${quizActionText}</a>
                  ` : `
                    <button class="btn btn-sm btn-outline stage-quiz-action" disabled>完成任务后解锁</button>
                  `}
                </div>

                <div class="stage-progress-mini">
                  <div class="stage-progress-mini-bar"><div class="stage-progress-mini-fill" style="width:${pct}%"></div></div>
                  <span class="stage-progress-mini-text">${done}/${tasks.length}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // 恢复之前展开的阶段
      expandedBefore.forEach(si => {
        const block = timeline.querySelector(`.stage-block[data-si="${si}"]`);
        if (block) block.classList.add('expanded');
      });

      // 折叠/展开
      timeline.querySelectorAll('.stage-card-header').forEach(el => {
        el.addEventListener('click', () => {
          el.closest('.stage-block').classList.toggle('expanded');
        });
      });

      timeline.querySelectorAll('.stage-quiz-action[href]').forEach(el => {
        el.addEventListener('click', () => this.recordPageTransition(el.dataset.page));
      });

      // 任务勾选
      timeline.querySelectorAll('.stage-task-item').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation(); // 阻止事件冒泡
          if (el.dataset.locked === 'true') {
            showToast('请先完成上一阶段任务', 'info');
            return;
          }
          const si = parseInt(el.dataset.si);
          const tid = el.dataset.tid;
          const plan = this.data.plans.find(p => p.id === this.viewingPlanId);
          if (!plan) return;
          const task = plan.stages[si]?.tasks.find(t => t.id === tid);
          if (!task) return;
          task.completed = !task.completed;
          if (task.completed) {
            this.recordStudyActivity(task, { kind: 'stage', planId: plan.id, stageIndex: si });
          }
          Storage.save(this.data);
          this.renderPlanDetailHero(plan);
          this.renderPlanDetailTimeline(plan);
          // 仅在仪表盘页面时刷新仪表盘
          if (this.page === 'dashboard') this.renderDashboard();
        });
      });
    }

    // ==================== Quiz Page ====================
    getQuizContext() {
      const params = new URLSearchParams(window.location.search);
      const planId = params.get('planId') || this.data.activePlanId;
      const stageIndex = Math.max(0, parseInt(params.get('stage') || '0', 10) || 0);
      const plan = this.data.plans.find(p => p.id === planId);
      const stage = plan?.stages?.[stageIndex];
      if (!plan || !stage) return null;
      stage.quiz = RoadmapManager.normalizeQuiz(stage.quiz, stage, stageIndex);
      return { plan, stage, stageIndex, quiz: stage.quiz };
    }

    renderQuizPage() {
      if (!$('#quizPage')) return;
      const ctx = this.getQuizContext();
      const state = $('#quizState');
      const form = $('#quizForm');
      const result = $('#quizResult');
      const back = $('#quizBackLink');
      if (back) back.href = 'roadmap.html';

      if (!ctx) {
        $('#quizTitle').textContent = '未找到阶段测验';
        $('#quizSubtitle').textContent = '请返回路线图，重新选择要参加测验的阶段。';
        $('#quizMeta').innerHTML = '';
        state.style.display = 'block';
        state.innerHTML = '<h3>测验不可用</h3><p>当前链接没有匹配到学习计划或阶段。</p>';
        form.style.display = 'none';
        result.classList.remove('active');
        return;
      }

      const { plan, stage, stageIndex, quiz } = ctx;
      const tasks = stage.tasks || [];
      const done = tasks.filter(t => t.completed).length;
      const unlocked = this.isStageUnlocked(plan, stageIndex);
      const ready = quiz.completed || (unlocked && tasks.length > 0 && done === tasks.length);
      const completedAt = quiz.completedAt ? `完成于 ${quiz.completedAt}` : '尚未完成';

      $('#quizTitle').textContent = `${stage.title || `阶段 ${stageIndex + 1}`} · 阶段测验`;
      $('#quizSubtitle').textContent = stage.goal || '完成本阶段实战任务后，用选择题检查关键知识点和任务验收能力。';
      $('#quizMeta').innerHTML = `
        <span class="quiz-meta-pill">${this.escHtml(plan.title || '学习计划')}</span>
        <span class="quiz-meta-pill">阶段 ${stageIndex + 1}</span>
        <span class="quiz-meta-pill">${done}/${tasks.length} 个实战任务</span>
        <span class="quiz-meta-pill">${quiz.questions.length} 道选择题</span>
        <span class="quiz-meta-pill">${this.escHtml(completedAt)}</span>
      `;

      if (!ready) {
        state.style.display = 'block';
        state.innerHTML = `
          <h3>${unlocked ? '测验尚未解锁' : '请先完成上一阶段'}</h3>
          <p>${unlocked ? '完成本阶段所有实战任务后，再参加阶段测验。' : '上一阶段完成后，本阶段测验会随任务进度解锁。'}</p>
          <a class="btn btn-outline" href="roadmap.html">返回路线图</a>
        `;
        form.style.display = 'none';
        result.classList.remove('active');
        return;
      }

      state.style.display = 'none';
      form.style.display = 'flex';
      this.renderQuizQuestions(ctx);
      this.renderQuizResult(ctx);
      Storage.save(this.data);
    }

    renderQuizQuestions(ctx) {
      const { quiz } = ctx;
      const reviewed = !!quiz.completed;
      const answers = reviewed ? (quiz.answers || []) : new Array(quiz.questions.length).fill(null);
      const letters = ['A', 'B', 'C', 'D'];

      $('#quizForm').innerHTML = quiz.questions.map((q, qi) => {
        const selected = answers[qi];
        return `
          <div class="quiz-question-card glass-card ${reviewed ? 'reviewed' : ''}" data-qi="${qi}">
            <div class="quiz-question-head">
              <span class="quiz-question-index">第 ${qi + 1} 题</span>
              <span class="quiz-question-result">${reviewed ? (selected === q.answerIndex ? '回答正确' : '回答错误') : '单选题'}</span>
            </div>
            <div class="quiz-question-title">${this.escHtml(q.question)}</div>
            <div class="quiz-choice-list">
              ${q.options.map((opt, oi) => {
                const isCorrect = reviewed && oi === q.answerIndex;
                const isWrong = reviewed && oi === selected && selected !== q.answerIndex;
                const isSelected = !reviewed && oi === selected;
                const cls = `${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''} ${isSelected ? 'selected' : ''}`.trim();
                return `
                  <button type="button" class="quiz-choice ${cls}" data-qi="${qi}" data-oi="${oi}" ${reviewed ? 'disabled' : ''}>
                    <span class="quiz-choice-key">${letters[oi]}</span>
                    <span>${this.escHtml(opt)}</span>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="quiz-explanation">
              <strong>正确答案：${letters[q.answerIndex]} · ${this.escHtml(q.options[q.answerIndex])}</strong><br>
              ${this.escHtml(q.explanation || '暂无解析')}
            </div>
          </div>
        `;
      }).join('') + `
        <div class="quiz-actions glass-card">
          <span class="quiz-actions-note" id="quizAnswerProgress"></span>
          ${reviewed ? `
            <button type="button" class="btn btn-outline" id="btnResetQuiz">重新作答</button>
          ` : `
            <button type="button" class="btn btn-primary" id="btnSubmitQuiz">提交测验</button>
          `}
        </div>
      `;

      this.quizSelections = answers.slice();
      this.setupQuizAnswerEvents(ctx);
    }

    setupQuizAnswerEvents(ctx) {
      const updateProgress = () => {
        const picked = this.quizSelections.filter(v => Number.isInteger(v)).length;
        const total = ctx.quiz.questions.length;
        const progress = $('#quizAnswerProgress');
        const submit = $('#btnSubmitQuiz');
        if (progress) progress.textContent = ctx.quiz.completed ? `得分 ${ctx.quiz.score}/${total}` : `已选择 ${picked}/${total} 题`;
        if (submit) submit.disabled = picked !== total;
      };

      $$('.quiz-choice:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
          const qi = Number(btn.dataset.qi);
          const oi = Number(btn.dataset.oi);
          this.quizSelections[qi] = oi;
          const card = btn.closest('.quiz-question-card');
          card.querySelectorAll('.quiz-choice').forEach(c => c.classList.remove('selected'));
          btn.classList.add('selected');
          updateProgress();
        });
      });

      $('#btnSubmitQuiz')?.addEventListener('click', () => this.submitQuiz(ctx));
      $('#btnResetQuiz')?.addEventListener('click', () => this.resetQuiz(ctx));
      updateProgress();
    }

    renderQuizResult(ctx) {
      const result = $('#quizResult');
      if (!result) return;
      if (!ctx.quiz.completed) {
        result.classList.remove('active');
        result.innerHTML = '';
        return;
      }
      const total = ctx.quiz.questions.length;
      result.classList.add('active');
      result.innerHTML = `
        <strong>本次得分：${ctx.quiz.score}/${total}</strong>
        <p>下方已经标出你的选择、正确答案和每题解析。</p>
      `;
    }

    submitQuiz(ctx) {
      const total = ctx.quiz.questions.length;
      const picked = this.quizSelections.filter(v => Number.isInteger(v)).length;
      if (picked !== total) {
        showToast('请先完成所有题目', 'info');
        return;
      }
      const score = ctx.quiz.questions.reduce((sum, q, i) => sum + (this.quizSelections[i] === q.answerIndex ? 1 : 0), 0);
      ctx.quiz.answers = this.quizSelections.slice();
      ctx.quiz.score = score;
      ctx.quiz.completed = true;
      ctx.quiz.completedAt = localDateKey();
      this.recordStudyActivity(
        { id: `quiz_${ctx.stageIndex}`, text: `完成「${ctx.stage.title || `阶段 ${ctx.stageIndex + 1}`}」阶段测验` },
        { kind: 'quiz', planId: ctx.plan.id, stageIndex: ctx.stageIndex }
      );
      Storage.save(this.data);
      this.renderQuizPage();
      showToast(`测验完成：${score}/${total}`, 'success');
    }

    resetQuiz(ctx) {
      ctx.quiz.answers = [];
      ctx.quiz.score = 0;
      ctx.quiz.completed = false;
      ctx.quiz.completedAt = null;
      Storage.save(this.data);
      this.renderQuizPage();
    }

    resetAll() {
      if (!confirm('确定要重置所有数据吗？此操作不可撤销。')) return;
      localStorage.removeItem(Storage.KEY);
      this.data = Storage.getDefault();
      this.closeModal('settingsModal');
      this.showPlanGallery();
      this.renderDashboard();
      showToast('所有数据已重置', 'info');
    }
  }

  document.addEventListener('DOMContentLoaded', () => { new App(); });
})();
