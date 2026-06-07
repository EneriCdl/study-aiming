/**
 * Study Aiming - 主应用
 * Dashboard任务管理 | 路线图时间轴 | API集成
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
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(100px)';
      t.style.transition = 'all 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }

  // ==================== Storage ====================
  const Storage = {
    KEY: 'study_aiming_data',
    getDefault() {
      return {
        roadmap: null,
        tasks: [],           // { id, title, completed, createdAt }
        progress: { heatmap: {}, streak: 0, lastDate: null },
        settings: { apiProvider: 'openai', apiKey: '', endpoint: '', modelName: 'gpt-3.5-turbo' },
      };
    },
    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        if (!raw) return this.getDefault();
        const d = JSON.parse(raw);
        // 兼容旧数据
        if (!d.tasks) d.tasks = [];
        if (!d.progress) d.progress = { heatmap: {}, streak: 0, lastDate: null };
        if (!d.settings) d.settings = this.getDefault().settings;
        return d;
      } catch { return this.getDefault(); }
    },
    save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },
  };

  // ==================== AI ====================
  const AI = {
    getEndpoint(provider, custom) {
      return { openai: 'https://api.openai.com/v1/chat/completions', deepseek: 'https://api.deepseek.com/v1/chat/completions', zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', custom: custom || '' }[provider] || '';
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
        body: JSON.stringify({ model: s.modelName || 'gpt-3.5-turbo', messages, temperature: 0.7, max_tokens: 4000 }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`API 调用失败 (${res.status}): ${e}`); }
      const r = await res.json();
      return r.choices?.[0]?.message?.content || '';
    },
    async testConnection() {
      const r = await this.call([{ role: 'user', content: '回复OK' }]);
      return r.includes('OK') || r.length > 0;
    },
    async generateRoadmap(topic, level, target, hours, extra) {
      const content = await this.call([
        { role: 'system', content: '你是一个专业的学习规划AI，只返回JSON格式数据。' },
        { role: 'user', content: `为以下学习需求生成详细路线：\n内容：${topic}\n当前：${level}\n目标：${target}\n每日时间：${hours}小时\n${extra ? '补充：' + extra : ''}\n\n严格返回JSON：\n{"title":"路线标题","stages":[{"title":"阶段名","description":"描述","tasks":[{"title":"任务名","description":"详细描述"}],"quiz":{"questions":[{"question":"问题","options":["A","B","C","D"],"answer":0}]}}]}\n要求：4-6阶段，每阶段2-4任务，每阶段1-2道选择题。` },
      ]);
      let json = content;
      const m = content.match(/\{[\s\S]*\}/);
      if (m) json = m[0];
      try { return JSON.parse(json); } catch { throw new Error('AI 返回格式异常，请重试'); }
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
        if (/^[\d一二三四五六七八九十]+[.、)）]/.test(t) || /^第[一二三四五六七八九十\d]+[章节阶段部分]/.test(t) || /^Stage|^Phase|^Chapter/i.test(t)) {
          if (cur) stages.push(cur);
          cur = { title: t.replace(/^[\d一二三四五六七八九十]+[.、)）]\s*/, ''), description: '', tasks: [], quiz: { questions: [] } };
        } else if (cur) {
          if (/^[-•·*]\s/.test(t) || /^\d+[)）]/.test(t)) {
            cur.tasks.push({ title: t.replace(/^[-•·*]\s|^\d+[)）]\s*/, ''), description: '', completed: false });
          } else { cur.description += (cur.description ? '\n' : '') + t; }
        }
      });
      if (cur) stages.push(cur);
      if (stages.length === 0 && lines.length > 0) {
        stages.push({ title: '学习内容', description: text.substring(0, 200), tasks: lines.slice(0, 10).map(l => ({ title: l.trim(), description: '', completed: false })), quiz: { questions: [] } });
      }
      return { title: '导入的学习路线', stages };
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
      this.quizAnswers = {};
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
        this.renderRoadmap();
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
      $('#btnCreateRoadmap')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImportDoc')?.addEventListener('click', () => this.openModal('importModal'));

      // Settings
      $('#btnSettings')?.addEventListener('click', () => this.openSettings());
      $('#closeSettings')?.addEventListener('click', () => this.closeModal('settingsModal'));
      $('#apiProvider')?.addEventListener('change', e => { $('#customEndpointGroup').style.display = e.target.value === 'custom' ? 'block' : 'none'; });
      $('#btnSaveSettings')?.addEventListener('click', () => this.saveSettings());
      $('#btnTestApi')?.addEventListener('click', () => this.testApi());

      // Create
      $('#closeCreate')?.addEventListener('click', () => this.closeModal('createModal'));
      $('#btnGenerateRoadmap')?.addEventListener('click', () => this.generateRoadmap());

      // Import
      $('#closeImport')?.addEventListener('click', () => this.closeModal('importModal'));
      this.setupFileUpload();

      // Stage
      $('#closeStage')?.addEventListener('click', () => this.closeModal('stageModal'));

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

    // ==================== Dashboard ====================
    showTaskInput() {
      $('#taskInputRow').style.display = 'flex';
      $('#taskInput').focus();
    }
    hideTaskInput() {
      $('#taskInputRow').style.display = 'none';
      $('#taskInput').value = '';
    }

    addTask() {
      const input = $('#taskInput');
      const title = input.value.trim();
      if (!title) return;
      this.data.tasks.push({ id: Date.now(), title, completed: false, createdAt: new Date().toISOString() });
      Storage.save(this.data);
      input.value = '';
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
      if (pct >= 70) return { label: '精通阶段', icon: '🏆', color: '#FFD54F' };
      if (pct >= 30) return { label: '进阶阶段', icon: '🌠', color: '#FFD54F' };
      return { label: '入门阶段', icon: '⭐', color: '#aaa' };
    }

    renderDashboard() {
      const tasks = this.data.tasks;
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed).length;
      const pct = total > 0 ? Math.round(completed / total * 100) : 0;
      const stage = this.getStageInfo(pct);

      // Stats
      $('#statTotalTasks').textContent = total;
      $('#statCompleted').textContent = completed;
      $('#statStreak').textContent = this.data.progress.streak || 0;
      $('#statStage').textContent = stage.label;
      $('#stageIcon').textContent = stage.icon;
      $('#streakIcon').className = (this.data.progress.streak || 0) > 0 ? 'streak-fire' : '';

      // Progress
      $('#mainProgressFill').style.width = pct + '%';
      $('#mainProgressText').textContent = pct + '%';
      const current = tasks.find(t => !t.completed);
      $('#currentTask').textContent = current ? current.title : (total > 0 ? '所有任务已完成！🎉' : '暂无学习任务，点击下方添加');

      // Task list
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

        list.querySelectorAll('.task-check').forEach(el => {
          el.addEventListener('click', () => this.toggleTask(parseInt(el.closest('.task-item').dataset.id)));
        });
        list.querySelectorAll('.task-delete').forEach(el => {
          el.addEventListener('click', e => { e.stopPropagation(); this.deleteTask(parseInt(el.dataset.id)); });
        });
      }

      // Heatmap
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

    escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ==================== Settings ====================
    openSettings() {
      const s = this.data.settings;
      $('#apiProvider').value = s.apiProvider || 'openai';
      $('#apiKey').value = s.apiKey || '';
      $('#apiEndpoint').value = s.endpoint || '';
      $('#modelName').value = s.modelName || '';
      $('#customEndpointGroup').style.display = s.apiProvider === 'custom' ? 'block' : 'none';
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
      if (!AI.validateKey(key)) {
        showToast('API Key 格式不正确（长度需大于20）', 'error');
        return;
      }
      this.data.settings = {
        apiProvider: $('#apiProvider').value,
        apiKey: key,
        endpoint: $('#apiEndpoint').value,
        modelName: $('#modelName').value,
      };
      Storage.save(this.data);
      this.updateApiStatus();
      showToast('设置已保存', 'success');
    }

    async testApi() {
      const btn = $('#btnTestApi');
      btn.disabled = true;
      btn.textContent = '测试中...';
      try {
        await AI.testConnection();
        const dot = $('#apiStatusDot');
        dot.className = 'api-status-dot connected';
        $('#apiStatusText').textContent = '已连接 ✓';
        showToast('API 连接成功！', 'success');
      } catch (e) {
        $('#apiStatusDot').className = 'api-status-dot error';
        $('#apiStatusText').textContent = '连接失败';
        showToast('连接失败：' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '测试连接';
      }
    }

    // ==================== Roadmap ====================
    openCreateModal() {
      if (!AI.validateKey(this.data.settings.apiKey)) {
        showToast('请先在设置中配置 API Key', 'error');
        this.openSettings();
        return;
      }
      this.openModal('createModal');
    }

    async generateRoadmap() {
      const topic = $('#learnTopic').value.trim();
      if (!topic) { showToast('请输入学习内容', 'error'); return; }
      const btn = $('#btnGenerateRoadmap');
      const status = $('#aiStatus');
      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loading').style.display = 'inline';
      status.className = 'ai-status';
      try {
        const roadmap = await AI.generateRoadmap(topic, $('#currentLevel').value, $('#targetLevel').value, $('#dailyHours').value, $('#extraInfo').value.trim());
        roadmap.stages.forEach(s => { s.completed = false; s.tasks.forEach(t => t.completed = false); });
        this.data.roadmap = roadmap;
        Storage.save(this.data);
        this.closeModal('createModal');
        this.renderRoadmap();
        showToast('学习路线已生成！', 'success');
        setTimeout(() => $('#roadmap')?.scrollIntoView({ behavior: 'smooth' }), 500);
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
        const roadmap = await RoadmapManager.importFile(file);
        roadmap.stages.forEach(s => { s.completed = false; s.tasks.forEach(t => { if (t.completed === undefined) t.completed = false; }); });
        const preview = $('#importPreview');
        const content = $('#previewContent');
        let txt = `📌 ${roadmap.title}\n\n`;
        roadmap.stages.forEach((s, i) => { txt += `阶段 ${i + 1}: ${s.title}\n`; s.tasks.forEach(t => { txt += `  • ${t.title}\n`; }); txt += '\n'; });
        content.textContent = txt.substring(0, 800);
        preview.style.display = 'block';
        $('#btnConfirmImport')?.addEventListener('click', () => {
          this.data.roadmap = roadmap;
          Storage.save(this.data);
          this.closeModal('importModal');
          this.renderRoadmap();
          showToast('学习路线已导入！', 'success');
        }, { once: true });
      } catch (e) { showToast('导入失败：' + e.message, 'error'); }
    }

    renderRoadmap() {
      const has = this.data.roadmap?.stages?.length > 0;
      const prompt = $('#noRoadmapPrompt');
      const timeline = $('#roadmapTimeline');
      if (!has) {
        prompt?.classList.remove('hidden');
        timeline.innerHTML = '';
        return;
      }
      prompt?.classList.add('hidden');
      const stages = this.data.roadmap.stages;

      timeline.innerHTML = stages.map((stage, si) => {
        const prevDone = si === 0 || stages[si - 1]?.completed;
        const allTasksDone = stage.tasks.length > 0 && stage.tasks.every(t => t.completed);
        const completedCount = stage.tasks.filter(t => t.completed).length;
        const pct = stage.tasks.length > 0 ? Math.round(completedCount / stage.tasks.length * 100) : 0;

        let statusClass, badgeText, badgeClass;
        if (stage.completed) { statusClass = 'completed'; badgeText = '已完成'; badgeClass = 'badge-completed'; }
        else if (prevDone) { statusClass = 'active'; badgeText = '进行中'; badgeClass = 'badge-active'; }
        else { statusClass = 'locked'; badgeText = '未解锁'; badgeClass = 'badge-locked'; }

        // 技能标签（从任务标题提取关键词）
        const tags = stage.tasks.slice(0, 5).map(t => t.title.split(/[、，,·\s]/)[0]).filter(Boolean).slice(0, 4);

        // 推荐资源
        const resources = [
          { icon: '📖', title: '官方文档', desc: '查阅权威资料' },
          { icon: '🎬', title: '视频教程', desc: '可视化学习' },
          { icon: '💻', title: '实战练习', desc: '动手巩固知识' },
        ];

        return `
          <div class="timeline-stage ${statusClass}" data-stage="${si}">
            <div class="timeline-dot"></div>
            <div class="timeline-card" data-stage="${si}">
              <div class="timeline-card-header">
                <span class="timeline-card-title">${this.escHtml(stage.title)}</span>
                <span class="timeline-card-badge ${badgeClass}">${badgeText}</span>
              </div>
              ${stage.description ? `<p class="timeline-desc">${this.escHtml(stage.description)}</p>` : ''}
              <div class="timeline-progress">
                <div class="timeline-progress-bar"><div class="timeline-progress-fill" style="width:${pct}%"></div></div>
                <span class="timeline-progress-text">${completedCount}/${stage.tasks.length} 任务完成</span>
              </div>
              ${tags.length ? `<div class="timeline-tags">${tags.map(t => `<span class="timeline-tag">#${this.escHtml(t)}</span>`).join('')}</div>` : ''}
              <div class="timeline-resources">
                <div class="resource-grid">
                  ${resources.map(r => `<div class="resource-card"><div class="resource-icon">${r.icon}</div><div class="resource-title">${r.title}</div><div class="resource-desc">${r.desc}</div></div>`).join('')}
                </div>
              </div>
              <div class="timeline-expand-hint">点击查看详情 ▾</div>
            </div>
          </div>
        `;
      }).join('');

      // Click events
      timeline.querySelectorAll('.timeline-card').forEach(el => {
        el.addEventListener('click', () => {
          const si = parseInt(el.dataset.stage);
          const stage = stages[si];
          const prevDone = si === 0 || stages[si - 1]?.completed;
          if (!prevDone) { showToast('请先完成上一阶段', 'info'); return; }
          this.showStageDetail(si);
        });
      });
    }

    // ==================== Stage Detail ====================
    generateAutoQuiz(stage) {
      const names = stage.tasks.map(t => t.title).filter(Boolean);
      const summary = names.length > 0 ? '「' + names.join('」「') + '」' : '本章节';
      return {
        questions: [
          { question: `请确认你已完成${summary}的全部学习内容`, options: ['是的，我已全部掌握', '还没有，我需要继续学习'], answer: 0 },
          { question: `你是否能够独立运用「${stage.title}」中的知识点？`, options: ['可以独立运用', '还需要更多练习', '尚未理解'], answer: 0 },
        ],
      };
    }

    showStageDetail(si) {
      const roadmap = this.data.roadmap;
      if (!roadmap?.stages[si]) return;
      const stage = roadmap.stages[si];
      const quiz = stage.quiz?.questions?.length > 0 ? stage.quiz : this.generateAutoQuiz(stage);

      $('#stageModalTitle').textContent = stage.title;
      const body = $('#stageModalBody');
      const done = stage.tasks.filter(t => t.completed).length;
      const total = stage.tasks.length;
      const allDone = done === total;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;

      let html = '';
      if (stage.description) html += `<p class="stage-desc">${stage.description}</p>`;

      html += '<h4 class="stage-section-title">📖 学习任务</h4><div class="stage-tasks">';
      stage.tasks.forEach((t, ti) => {
        html += `<div class="stage-task ${t.completed ? 'completed' : ''}" data-si="${si}" data-ti="${ti}"><div class="stage-task-check"></div><span class="stage-task-text">${this.escHtml(t.title)}</span></div>`;
      });
      html += `</div><div class="stage-progress"><div class="stage-progress-bar"><div class="stage-progress-fill" style="width:${pct}%"></div></div><span class="stage-progress-text">${done} / ${total}</span></div>`;

      if (stage.completed) {
        html += '<div class="stage-complete-msg">✦ 此阶段已完成，干得漂亮！</div>';
      } else if (allDone) {
        html += '<div class="quiz-section"><h4 class="stage-section-title">✦ 阶段测验</h4><p class="stage-desc">完成以下测验以解锁下一阶段</p>';
        quiz.questions.forEach((q, qi) => {
          const saved = this.quizAnswers[`${si}-${qi}`];
          html += `<div class="quiz-block"><div class="quiz-question">${qi + 1}. ${q.question}</div><div class="quiz-options">`;
          q.options.forEach((opt, oi) => { html += `<div class="quiz-option${saved === oi ? ' selected' : ''}" data-qi="${qi}" data-oi="${oi}">${opt}</div>`; });
          html += '</div></div>';
        });
        html += '<button class="btn btn-primary btn-full" id="btnSubmitQuiz" style="margin-top:16px">提交测验</button></div>';
      } else {
        html += '<p class="stage-hint">完成全部学习任务后，将自动进入阶段测验</p>';
      }

      body.innerHTML = html;

      // Events
      body.querySelectorAll('.stage-task').forEach(el => el.addEventListener('click', () => {
        const task = stage.tasks[parseInt(el.dataset.ti)];
        task.completed = !task.completed;
        if (task.completed) {
          const today = new Date().toISOString().split('T')[0];
          this.data.progress.heatmap[today] = (this.data.progress.heatmap[today] || 0) + 1;
          this.updateStreak();
        }
        Storage.save(this.data);
        this.renderDashboard();
        this.showStageDetail(si);
      }));

      body.querySelectorAll('.quiz-option').forEach(el => el.addEventListener('click', () => {
        const qi = parseInt(el.dataset.qi), oi = parseInt(el.dataset.oi);
        this.quizAnswers[`${si}-${qi}`] = oi;
        body.querySelectorAll(`.quiz-option[data-qi="${qi}"]`).forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
      }));

      body.querySelector('#btnSubmitQuiz')?.addEventListener('click', () => this.submitQuiz(si));
      this.openModal('stageModal');
    }

    submitQuiz(si) {
      const stage = this.data.roadmap.stages[si];
      const quiz = stage.quiz?.questions?.length > 0 ? stage.quiz : this.generateAutoQuiz(stage);
      let allAnswered = true, allCorrect = true;
      quiz.questions.forEach((q, qi) => {
        const ans = this.quizAnswers[`${si}-${qi}`];
        if (ans === undefined) allAnswered = false;
        else if (ans !== q.answer) allCorrect = false;
      });
      if (!allAnswered) { showToast('请回答所有问题', 'info'); return; }
      if (allCorrect) { this.completeStage(si); return; }

      showToast('部分答案不正确，请重试', 'error');
      const body = $('#stageModalBody');
      quiz.questions.forEach((q, qi) => {
        const ans = this.quizAnswers[`${si}-${qi}`];
        body.querySelectorAll(`.quiz-option[data-qi="${qi}"]`).forEach(opt => {
          opt.style.pointerEvents = 'none';
          if (parseInt(opt.dataset.oi) === q.answer) opt.classList.add('correct');
          else if (parseInt(opt.dataset.oi) === ans) opt.classList.add('wrong');
        });
      });
      const retry = document.createElement('button');
      retry.className = 'btn btn-outline btn-full';
      retry.textContent = '重新答题';
      retry.style.marginTop = '12px';
      retry.addEventListener('click', () => { quiz.questions.forEach((_, qi) => delete this.quizAnswers[`${si}-${qi}`]); this.showStageDetail(si); });
      body.appendChild(retry);
    }

    completeStage(si) {
      const stage = this.data.roadmap.stages[si];
      stage.completed = true;
      if (stage.quiz?.questions) stage.quiz.questions.forEach((_, qi) => delete this.quizAnswers[`${si}-${qi}`]);
      Storage.save(this.data);
      this.closeModal('stageModal');
      this.renderDashboard();
      this.renderRoadmap();
      showToast(`🎉 恭喜完成「${stage.title}」！`, 'success');
    }

    resetAll() {
      if (!confirm('确定要重置所有数据吗？此操作不可撤销。')) return;
      localStorage.removeItem(Storage.KEY);
      this.data = Storage.getDefault();
      this.closeModal('settingsModal');
      this.renderDashboard();
      this.renderRoadmap();
      showToast('所有数据已重置', 'info');
    }
  }

  document.addEventListener('DOMContentLoaded', () => { new App(); });
})();
