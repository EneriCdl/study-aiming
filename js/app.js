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

  // ==================== Storage ====================
  const Storage = {
    KEY: 'study_aiming_data',
    getDefault() {
      return {
        plans: [],               // [{id, title, description, icon, createdAt, stages:[]}]
        activePlanId: null,      // 当前查看的计划ID
        tasks: [],               // Dashboard 独立任务
        progress: { heatmap: {}, streak: 0, lastDate: null },
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
      return MODEL_PRESETS[provider]?.endpoint || custom || '';
    },
    validateKey(key) { return key && key.length > 20; },
    async call(messages) {
      const s = app.data.settings;
      if (!s.apiKey) throw new Error('请先配置 API Key');
      const ep = this.getEndpoint(s.apiProvider, s.endpoint);
      if (!ep) throw new Error('请配置有效的 API 端点');
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.apiKey}` },
        body: JSON.stringify({ model: s.modelName || 'gpt-3.5-turbo', messages, temperature: 0.7, max_tokens: 6000 }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`API 调用失败 (${res.status}): ${e}`); }
      const r = await res.json();
      return r.choices?.[0]?.message?.content || '';
    },
    async testConnection() {
      const r = await this.call([{ role: 'user', content: '回复OK' }]);
      return r.includes('OK') || r.length > 0;
    },
    async generatePlan(topic, level, target, hours, extra) {
      const systemPrompt = `你是一个专业的学习规划AI。你必须严格返回JSON格式，不要包含任何Markdown标记（如\`\`\`json）。
必须包含至少4个学习阶段。每个阶段必须包含：具体的阶段目标(goal)、预计耗时(duration)、核心知识点(topics数组)、至少2个实战任务(tasks)、至少2个推荐资源(resources)。
资源必须是真实存在的文档/视频/书籍名称。
返回格式：
{"title":"计划标题","description":"一句话简介","icon":"🐍","stages":[{"title":"阶段标题","duration":"2周","goal":"具体目标","topics":["知识点1","知识点2"],"tasks":[{"id":"t1","text":"任务描述","completed":false}],"resources":[{"name":"资源名称","url":"#"}]}]}`;
      const userPrompt = `为以下学习需求生成详细计划：
学习内容：${topic}
当前水平：${level}
目标水平：${target}
每日可投入时间：${hours}小时
${extra ? '补充说明：' + extra : ''}`;
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
        return plan;
      } catch { throw new Error('AI 返回格式异常，请重试'); }
    },
  };

  // ==================== RoadmapManager ====================
  const RoadmapManager = {
    parseText(text) {
      const lines = text.split('\n').filter(l => l.trim());
      const stages = [];
      let cur = null;
      lines.forEach(line => {
        const t = line.trim();
        if (/^[\d一二三四五六七八九十]+[.、)）]/.test(t) || /^第[一二三四五六七八九十\d]+[章节阶段部分]/.test(t)) {
          if (cur) stages.push(cur);
          cur = { title: t.replace(/^[\d一二三四五六七八九十]+[.、)）]\s*/, ''), duration: '', goal: '', topics: [], tasks: [], resources: [] };
        } else if (cur) {
          if (/^[-•·*]\s/.test(t) || /^\d+[)）]/.test(t)) {
            cur.tasks.push({ id: 't' + Date.now() + Math.random(), text: t.replace(/^[-•·*]\s|^\d+[)）]\s*/, ''), completed: false });
          } else { cur.goal += (cur.goal ? '\n' : '') + t; }
        }
      });
      if (cur) stages.push(cur);
      if (stages.length === 0) stages.push({ title: '学习内容', duration: '待定', goal: text.substring(0, 200), topics: [], tasks: [{ id: 't1', text: '完成学习', completed: false }], resources: [] });
      return { title: '导入的学习计划', description: '从文档导入', icon: '📄', stages };
    },
    importFile(file) {
      return new Promise((resolve, reject) => {
        if (file.name.endsWith('.json')) {
          const r = new FileReader();
          r.onload = e => { try { resolve(JSON.parse(e.target.result)); } catch { reject(new Error('JSON 格式无效')); } };
          r.readAsText(file);
        } else if (file.name.endsWith('.txt')) {
          const r = new FileReader();
          r.onload = e => resolve(this.parseText(e.target.result));
          r.readAsText(file);
        } else if (file.name.endsWith('.docx')) {
          const r = new FileReader();
          r.onload = async e => {
            try {
              const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
              if (!result.value?.trim()) throw new Error('文档内容为空');
              resolve(this.parseText(result.value));
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
      app = this;
      this.init();
    }

    init() {
      this.particleSystem = new ParticleSystem();
      requestAnimationFrame(() => {
        this.sections = [$('#hero'), $('#dashboard'), $('#roadmap')];
        this.setupScroll();
        this.setupEvents();
        this.renderDashboard();
        this.renderPlanGallery();
      });
    }

    // ---- Scroll ----
    setupScroll() {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.intersectionRatio > 0.55) {
            const i = this.sections.indexOf(e.target);
            if (i !== -1 && i !== this.currentSection) {
              this.currentSection = i;
              [() => this.particleSystem.setHeroScene(), () => this.particleSystem.setDashboardScene(), () => this.particleSystem.setRoadmapScene()][i]();
            }
          }
        });
      }, { threshold: [0.55] });
      this.sections.forEach(s => obs.observe(s));

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const p = Math.min(1, window.scrollY / (document.documentElement.scrollHeight - window.innerHeight));
          const fill = $('.scroll-progress-fill');
          const glow = $('.scroll-progress-glow');
          if (fill) fill.style.height = (p * 100) + '%';
          if (glow) glow.style.opacity = p > 0.01 ? '0.8' : '0';
          $$('.nav-link').forEach((l, i) => l.classList.toggle('active', i === this.currentSection));
        });
      });
    }

    // ---- Events ----
    setupEvents() {
      $$('.nav-link').forEach(l => l.addEventListener('click', e => { e.preventDefault(); document.querySelector(l.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); }));

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
      $('#closeImport')?.addEventListener('click', () => this.closeModal('importModal'));
      this.setupFileUpload();

      // Gallery
      $('#btnNewPlan')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImportPlan')?.addEventListener('click', () => this.openModal('importModal'));

      // Detail
      $('#btnBackToList')?.addEventListener('click', () => this.showPlanGallery());
      $('#btnDeletePlan')?.addEventListener('click', () => this.deleteCurrentPlan());

      // Tasks
      $('#btnAddTask')?.addEventListener('click', () => this.showTaskInput());
      $('#btnConfirmTask')?.addEventListener('click', () => this.addTask());
      $('#btnCancelTask')?.addEventListener('click', () => this.hideTaskInput());
      $('#taskInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') this.addTask(); });

      // Reset
      $('#btnResetAll')?.addEventListener('click', () => this.resetAll());

      // Modal overlay close
      $$('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }));
    }

    openModal(id) { document.getElementById(id)?.classList.add('active'); }
    closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
    escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ==================== Dashboard ====================
    showTaskInput() { $('#taskInputRow').style.display = 'flex'; $('#taskInput').focus(); }
    hideTaskInput() { $('#taskInputRow').style.display = 'none'; $('#taskInput').value = ''; }

    addTask() {
      const title = $('#taskInput').value.trim();
      if (!title) return;
      this.data.tasks.push({ id: Date.now(), title, completed: false, createdAt: new Date().toISOString() });
      Storage.save(this.data);
      $('#taskInput').value = '';
      this.renderDashboard();
      showToast('任务已添加', 'success');
    }

    toggleTask(id) {
      const task = this.data.tasks.find(t => t.id === id);
      if (!task) return;
      task.completed = !task.completed;
      if (task.completed) {
        const today = new Date().toISOString().split('T')[0];
        this.data.progress.heatmap[today] = (this.data.progress.heatmap[today] || 0) + 1;
        this.updateStreak();
      }
      Storage.save(this.data);
      this.renderDashboard();
    }

    deleteTask(id) {
      this.data.tasks = this.data.tasks.filter(t => t.id !== id);
      Storage.save(this.data);
      this.renderDashboard();
    }

    updateStreak() {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const p = this.data.progress;
      if (p.lastDate === today) return;
      p.streak = (p.lastDate === yesterday) ? (p.streak || 0) + 1 : 1;
      p.lastDate = today;
    }

    getStageInfo(pct) {
      if (pct >= 70) return { label: '精通阶段', icon: '🏆' };
      if (pct >= 30) return { label: '进阶阶段', icon: '🌠' };
      return { label: '入门阶段', icon: '⭐' };
    }

    renderDashboard() {
      const tasks = this.data.tasks;
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed).length;
      const pct = total > 0 ? Math.round(completed / total * 100) : 0;
      const stage = this.getStageInfo(pct);

      $('#statTotalTasks').textContent = total;
      $('#statCompleted').textContent = completed;
      $('#statStreak').textContent = this.data.progress.streak || 0;
      $('#statStage').textContent = stage.label;
      $('#stageIcon').textContent = stage.icon;
      $('#streakIcon').className = (this.data.progress.streak || 0) > 0 ? 'streak-fire' : '';
      $('#mainProgressFill').style.width = pct + '%';
      $('#mainProgressText').textContent = pct + '%';
      const current = tasks.find(t => !t.completed);
      $('#currentTask').textContent = current ? current.title : (total > 0 ? '所有任务已完成！🎉' : '暂无学习任务，点击下方添加');

      const list = $('#taskList');
      if (total === 0) {
        list.innerHTML = '<div class="task-empty">暂无任务，点击「+ 添加任务」开始</div>';
      } else {
        list.innerHTML = tasks.map(t => `
          <div class="task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}">
            <div class="task-check">${t.completed ? '✓' : ''}</div>
            <span class="task-title">${this.escHtml(t.title)}</span>
            <span class="task-delete" data-id="${t.id}">✕</span>
          </div>
        `).join('');
        list.querySelectorAll('.task-check').forEach(el => el.addEventListener('click', () => this.toggleTask(parseInt(el.closest('.task-item').dataset.id))));
        list.querySelectorAll('.task-delete').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); this.deleteTask(parseInt(el.dataset.id)); }));
      }

      this.renderHeatmap();
    }

    renderHeatmap() {
      const grid = $('#heatmapGrid');
      if (!grid) return;
      grid.innerHTML = '';
      const hm = this.data.progress.heatmap || {};
      const today = new Date();
      for (let w = 4; w >= 0; w--) {
        for (let d = 0; d < 7; d++) {
          const dt = new Date(today);
          dt.setDate(dt.getDate() - (w * 7 + (6 - d)));
          const key = dt.toISOString().split('T')[0];
          const count = hm[key] || 0;
          const cell = document.createElement('div');
          cell.className = 'heatmap-cell' + (count >= 4 ? ' level-4' : count >= 3 ? ' level-3' : count >= 2 ? ' level-2' : count >= 1 ? ' level-1' : '');
          cell.title = `${key}: ${count} 个任务`;
          grid.appendChild(cell);
        }
      }
    }

    // ==================== Settings ====================
    // 更新模型下拉框
    updateModelDropdown(provider, selectedModel) {
      const select = $('#modelName');
      const models = MODEL_PRESETS[provider]?.models || [];
      select.innerHTML = models.length
        ? models.map(m => `<option value="${m}">${m}</option>`).join('')
        : '<option value="">请手动输入模型名称</option>';
      if (selectedModel && models.includes(selectedModel)) {
        select.value = selectedModel;
      }
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

    async generatePlan() {
      const topic = $('#learnTopic').value.trim();
      if (!topic) { showToast('请输入学习内容', 'error'); return; }
      const btn = $('#btnGenerateRoadmap');
      const status = $('#aiStatus');
      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loading').style.display = 'inline';
      status.className = 'ai-status';
      try {
        const planData = await AI.generatePlan(topic, $('#currentLevel').value, $('#targetLevel').value, $('#dailyHours').value, $('#extraInfo').value.trim());
        const plan = {
          id: 'plan_' + Date.now(),
          title: planData.title || topic,
          description: planData.description || 'AI 生成的学习计划',
          icon: planData.icon || '📘',
          createdAt: new Date().toISOString().split('T')[0],
          stages: (planData.stages || []).map((s, i) => ({
            ...s,
            id: 's' + i,
            tasks: (s.tasks || []).map((t, j) => ({ id: t.id || 't' + i + '_' + j, text: t.text || t.title || '', completed: false })),
            resources: s.resources || [],
            topics: s.topics || [],
            duration: s.duration || '',
            goal: s.goal || '',
          })),
        };
        this.data.plans.push(plan);
        Storage.save(this.data);
        this.closeModal('createModal');
        this.renderPlanGallery();
        showToast('学习计划已生成！', 'success');
      } catch (e) {
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
          createdAt: new Date().toISOString().split('T')[0],
          stages: (planData.stages || []).map((s, i) => ({
            ...s, id: 's' + i,
            tasks: (s.tasks || []).map((t, j) => ({ id: t.id || 't' + i + '_' + j, text: t.text || t.title || '', completed: false })),
            resources: s.resources || [], topics: s.topics || [], duration: s.duration || '', goal: s.goal || '',
          })),
        };
        const preview = $('#importPreview');
        let txt = `📌 ${plan.title}\n\n`;
        plan.stages.forEach((s, i) => { txt += `阶段 ${i + 1}: ${s.title}\n`; s.tasks.forEach(t => { txt += `  • ${t.text}\n`; }); txt += '\n'; });
        $('#previewContent').textContent = txt.substring(0, 800);
        preview.style.display = 'block';
        $('#btnConfirmImport')?.addEventListener('click', () => {
          this.data.plans.push(plan);
          Storage.save(this.data);
          this.closeModal('importModal');
          this.renderPlanGallery();
          showToast('学习计划已导入！', 'success');
        }, { once: true });
      } catch (e) { showToast('导入失败：' + e.message, 'error'); }
    }

    // ==================== Plan Gallery ====================
    renderPlanGallery() {
      const plans = this.data.plans;
      const grid = $('#planGrid');
      const empty = $('#emptyState');

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
            <div class="plan-card-icon">${plan.icon || '📘'}</div>
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
    }

    // ==================== Plan Detail ====================
    showPlanDetail(planId) {
      const plan = this.data.plans.find(p => p.id === planId);
      if (!plan) return;
      this.viewingPlanId = planId;

      // 切换视图
      $('#planGallery').style.display = 'none';
      $('#planDetail').style.display = 'block';

      this.renderPlanDetailHero(plan);
      this.renderPlanDetailTimeline(plan);
    }

    showPlanGallery() {
      this.viewingPlanId = null;
      $('#planDetail').style.display = 'none';
      $('#planGallery').style.display = 'block';
      this.renderPlanGallery();
    }

    deleteCurrentPlan() {
      if (!confirm('确定要删除此学习计划吗？')) return;
      this.data.plans = this.data.plans.filter(p => p.id !== this.viewingPlanId);
      Storage.save(this.data);
      this.showPlanGallery();
      showToast('计划已删除', 'info');
    }

    renderPlanDetailHero(plan) {
      const totalTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
      const doneTasks = plan.stages.reduce((sum, s) => sum + (s.tasks?.filter(t => t.completed).length || 0), 0);
      const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

      $('#detailHero').innerHTML = `
        <div class="detail-hero-icon">${plan.icon || '📘'}</div>
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

      timeline.innerHTML = plan.stages.map((stage, si) => {
        const tasks = stage.tasks || [];
        const done = tasks.filter(t => t.completed).length;
        const pct = tasks.length > 0 ? Math.round(done / tasks.length * 100) : 0;
        const isComplete = tasks.length > 0 && done === tasks.length;
        const prevDone = si === 0 || (plan.stages[si - 1].tasks?.length > 0 && plan.stages[si - 1].tasks.every(t => t.completed));
        const statusClass = isComplete ? 'completed' : prevDone ? 'active' : '';

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
                    <div class="stage-task-item ${t.completed ? 'done' : ''}" data-si="${si}" data-tid="${t.id}">
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
                    <a class="resource-link" href="${r.url || '#'}" target="_blank" onclick="event.stopPropagation()">
                      <span class="resource-link-icon">🔗</span>
                      <span>${this.escHtml(r.name)}</span>
                    </a>
                  `).join('')}</div>
                </div>
                ` : ''}

                <div class="stage-progress-mini">
                  <div class="stage-progress-mini-bar"><div class="stage-progress-mini-fill" style="width:${pct}%"></div></div>
                  <span class="stage-progress-mini-text">${done}/${tasks.length}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // 折叠/展开
      timeline.querySelectorAll('.stage-card-header').forEach(el => {
        el.addEventListener('click', () => {
          el.closest('.stage-block').classList.toggle('expanded');
        });
      });

      // 任务勾选
      timeline.querySelectorAll('.stage-task-item').forEach(el => {
        el.addEventListener('click', () => {
          const si = parseInt(el.dataset.si);
          const tid = el.dataset.tid;
          const plan = this.data.plans.find(p => p.id === this.viewingPlanId);
          if (!plan) return;
          const task = plan.stages[si]?.tasks.find(t => t.id === tid);
          if (!task) return;
          task.completed = !task.completed;
          if (task.completed) {
            const today = new Date().toISOString().split('T')[0];
            this.data.progress.heatmap[today] = (this.data.progress.heatmap[today] || 0) + 1;
            this.updateStreak();
          }
          Storage.save(this.data);
          this.renderPlanDetailHero(plan);
          this.renderPlanDetailTimeline(plan);
          this.renderDashboard();
        });
      });
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
