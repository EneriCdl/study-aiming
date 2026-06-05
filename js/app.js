/**
 * Study Aiming - 主应用逻辑
 * 处理滚动、存储、AI集成、路线管理
 */

(function () {
  'use strict';

  // ==================== 工具函数 ====================
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function showToast(msg, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==================== 存储管理 ====================
  const Storage = {
    KEY: 'study_aiming_data',

    getDefault() {
      return {
        roadmap: null,
        progress: { completedTasks: [], heatmap: {}, streak: 0, lastDate: null },
        settings: { apiProvider: 'openai', apiKey: '', endpoint: '', modelName: 'gpt-3.5-turbo' },
      };
    },

    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        return raw ? { ...this.getDefault(), ...JSON.parse(raw) } : this.getDefault();
      } catch {
        return this.getDefault();
      }
    },

    save(data) {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    update(fn) {
      const data = this.load();
      fn(data);
      this.save(data);
      return data;
    },
  };

  // ==================== AI 集成 ====================
  const AI = {
    getEndpoint(provider, customEndpoint) {
      const endpoints = {
        openai: 'https://api.openai.com/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions',
        zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        custom: customEndpoint || '',
      };
      return endpoints[provider] || endpoints.openai;
    },

    async callAI(messages) {
      const data = Storage.load();
      const s = data.settings;
      if (!s.apiKey) throw new Error('请先在设置中配置 API Key');

      const endpoint = this.getEndpoint(s.apiProvider, s.endpoint);
      if (!endpoint) throw new Error('请配置有效的 API 端点');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${s.apiKey}`,
        },
        body: JSON.stringify({
          model: s.modelName || 'gpt-3.5-turbo',
          messages,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API 调用失败 (${res.status}): ${err}`);
      }

      const result = await res.json();
      return result.choices?.[0]?.message?.content || '';
    },

    async generateRoadmap(topic, currentLevel, targetLevel, dailyHours, extra) {
      const prompt = `你是一个学习路线规划专家。请为以下学习需求生成详细的学习路线：

学习内容：${topic}
当前水平：${currentLevel}
目标水平：${targetLevel}
每日可投入时间：${dailyHours} 小时
${extra ? '补充说明：' + extra : ''}

请严格按照以下JSON格式返回，不要包含任何其他文字：
{
  "title": "学习路线标题",
  "stages": [
    {
      "title": "阶段名称",
      "description": "阶段描述",
      "tasks": [
        { "title": "任务名称", "description": "任务详细描述" }
      ],
      "quiz": {
        "questions": [
          {
            "question": "问题内容",
            "options": ["选项A", "选项B", "选项C", "选项D"],
            "answer": 0
          }
        ]
      }
    }
  ]
}

要求：
1. 分为4-6个阶段，由浅入深
2. 每阶段2-4个任务
3. 每阶段末尾有1-2道检验题目（选择题）
4. 题目需要真正考察该阶段核心知识
5. 考虑用户的时间安排，适当调整内容量`;

      const content = await this.callAI([
        { role: 'system', content: '你是一个专业的学习规划AI，只返回JSON格式数据。' },
        { role: 'user', content: prompt },
      ]);

      // 提取JSON
      let jsonStr = content;
      const match = content.match(/\{[\s\S]*\}/);
      if (match) jsonStr = match[0];

      try {
        return JSON.parse(jsonStr);
      } catch {
        throw new Error('AI 返回格式异常，请重试');
      }
    },
  };

  // ==================== 路线图管理 ====================
  const RoadmapManager = {
    parseDocxContent(text) {
      // 简单解析文档内容为路线结构
      const lines = text.split('\n').filter(l => l.trim());
      const stages = [];
      let currentStage = null;

      lines.forEach(line => {
        const trimmed = line.trim();
        // 检测阶段标题（数字开头或特定关键词）
        if (/^[\d一二三四五六七八九十]+[.、、)）]/.test(trimmed) ||
            /^第[一二三四五六七八九十\d]+[章节阶段部分]/.test(trimmed) ||
            /^Stage|^Phase|^Chapter/i.test(trimmed)) {
          if (currentStage) stages.push(currentStage);
          currentStage = {
            title: trimmed.replace(/^[\d一二三四五六七八九十]+[.、)）]\s*/, ''),
            description: '',
            tasks: [],
            quiz: { questions: [] },
          };
        } else if (currentStage) {
          if (/^[-•·*]\s/.test(trimmed) || /^\d+[)）]/.test(trimmed)) {
            currentStage.tasks.push({
              title: trimmed.replace(/^[-•·*]\s|^\d+[)）]\s*/, ''),
              description: '',
              completed: false,
            });
          } else {
            currentStage.description += (currentStage.description ? '\n' : '') + trimmed;
          }
        }
      });
      if (currentStage) stages.push(currentStage);

      // 如果没有解析出结构，创建单阶段
      if (stages.length === 0 && lines.length > 0) {
        stages.push({
          title: '学习内容',
          description: text.substring(0, 200),
          tasks: lines.slice(0, 10).map(l => ({ title: l.trim(), description: '', completed: false })),
          quiz: { questions: [] },
        });
      }

      return { title: '导入的学习路线', stages };
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        if (file.name.endsWith('.json')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = JSON.parse(e.target.result);
              resolve(data);
            } catch {
              reject(new Error('JSON 格式无效'));
            }
          };
          reader.readAsText(file);
        } else if (file.name.endsWith('.txt')) {
          const reader = new FileReader();
          reader.onload = (e) => resolve(this.parseDocxContent(e.target.result));
          reader.readAsText(file);
        } else if (file.name.endsWith('.docx')) {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
              const text = result.value;
              if (!text || text.trim().length < 10) {
                reject(new Error('文档内容为空或无法解析'));
                return;
              }
              resolve(this.parseDocxContent(text));
            } catch (err) {
              reject(new Error('docx 解析失败：' + err.message));
            }
          };
          reader.readAsArrayBuffer(file);
        } else {
          reject(new Error('不支持的文件格式'));
        }
      });
    },

  };

  // ==================== 主应用 ====================
  class App {
    constructor() {
      this.data = Storage.load();
      this.particleSystem = null;
      this.saturnRenderer = null;
      this.roadmapRenderer = null;
      this.currentSection = 0;
      this.sections = [];

      window.app = this;
      this.init();
    }

    init() {
      // 初始化粒子系统
      this.particleSystem = new ParticleSystem();

      // 等待 DOM 完全加载后初始化其他组件
      requestAnimationFrame(() => {
        this.saturnRenderer = new SaturnRenderer();
        this.roadmapRenderer = new RoadmapRenderer();
        this.sections = [
          document.getElementById('hero'),
          document.getElementById('dashboard'),
          document.getElementById('roadmap'),
        ];
        this.setupScrollDetection();
        this.setupEventListeners();
        this.updateDashboard();
        this.updateRoadmapView();
      });
    }

    // ---- 滚动检测 ----
    setupScrollDetection() {
      // 用 IntersectionObserver 检测当前 section（高阈值）
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const idx = this.sections.indexOf(entry.target);
          if (idx === -1) return;

          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            if (idx !== this.currentSection) {
              this.currentSection = idx;
              this.onSectionChange(idx);
            }
          }
        });
      }, { threshold: [0.55] });

      this.sections.forEach(s => observer.observe(s));

      // 滚动进度条 + 土星显隐（基于精确位置）
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const scrollTop = window.scrollY;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const progress = Math.min(1, scrollTop / docHeight);
          const fill = $('.scroll-progress-fill');
          const glow = $('.scroll-progress-glow');
          if (fill) fill.style.height = (progress * 100) + '%';
          if (glow) glow.style.opacity = progress > 0.01 ? '0.8' : '0';

          // 导航高亮
          $$('.nav-link').forEach((l, i) => {
            l.classList.toggle('active', i === this.currentSection);
          });

          // 土星显隐：仪表盘区域过半才显示
          const dashboard = this.sections[1];
          if (dashboard) {
            const rect = dashboard.getBoundingClientRect();
            const halfScreen = window.innerHeight * 0.4;
            const dashboardVisible = rect.top < halfScreen && rect.bottom > halfScreen;
            this.saturnRenderer?.setVisible(dashboardVisible);
          }
        });
      });
    }

    onSectionChange(idx) {
      switch (idx) {
        case 0: this.particleSystem.setHeroScene(); break;
        case 1: this.particleSystem.setDashboardScene(); break;
        case 2: this.particleSystem.setRoadmapScene(); break;
      }
    }

    // ---- 事件监听 ----
    setupEventListeners() {
      // 导航链接
      $$('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const target = document.querySelector(link.getAttribute('href'));
          target?.scrollIntoView({ behavior: 'smooth' });
        });
      });

      // Hero 按钮
      $('#btnStart')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImport')?.addEventListener('click', () => this.openImportModal());
      $('#btnCreateRoadmap')?.addEventListener('click', () => this.openCreateModal());
      $('#btnImportDoc')?.addEventListener('click', () => this.openImportModal());

      // 设置模态框
      $('#btnSettings')?.addEventListener('click', () => this.openSettingsModal());
      $('#closeSettings')?.addEventListener('click', () => this.closeModal('settingsModal'));
      $('#apiProvider')?.addEventListener('change', (e) => {
        $('#customEndpointGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
      });
      $('#btnSaveSettings')?.addEventListener('click', () => this.saveSettings());
      $('#btnResetAll')?.addEventListener('click', () => this.resetAll());

      // 创建路线模态框
      $('#closeCreate')?.addEventListener('click', () => this.closeModal('createModal'));
      $('#btnGenerateRoadmap')?.addEventListener('click', () => this.generateRoadmap());

      // 导入模态框
      $('#closeImport')?.addEventListener('click', () => this.closeModal('importModal'));
      this.setupFileUpload();

      // 阶段模态框
      $('#closeStage')?.addEventListener('click', () => this.closeModal('stageModal'));

      // 点击遮罩关闭
      $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) overlay.classList.remove('active');
        });
      });
    }

    // ---- 模态框 ----
    openModal(id) {
      document.getElementById(id)?.classList.add('active');
    }

    closeModal(id) {
      document.getElementById(id)?.classList.remove('active');
    }

    openSettingsModal() {
      const s = this.data.settings;
      $('#apiProvider').value = s.apiProvider || 'openai';
      $('#apiKey').value = s.apiKey || '';
      $('#apiEndpoint').value = s.endpoint || '';
      $('#modelName').value = s.modelName || '';
      $('#customEndpointGroup').style.display = s.apiProvider === 'custom' ? 'block' : 'none';
      this.openModal('settingsModal');
    }

    saveSettings() {
      this.data.settings = {
        apiProvider: $('#apiProvider').value,
        apiKey: $('#apiKey').value,
        endpoint: $('#apiEndpoint').value,
        modelName: $('#modelName').value,
      };
      Storage.save(this.data);
      this.closeModal('settingsModal');
      showToast('设置已保存', 'success');
    }

    openCreateModal() {
      if (!this.data.settings.apiKey) {
        showToast('请先配置 API Key', 'error');
        this.openSettingsModal();
        return;
      }
      this.openModal('createModal');
    }

    openImportModal() {
      this.openModal('importModal');
    }

    // ---- AI 生成路线 ----
    async generateRoadmap() {
      const topic = $('#learnTopic').value.trim();
      if (!topic) {
        showToast('请输入学习内容', 'error');
        return;
      }

      const btn = $('#btnGenerateRoadmap');
      const btnText = btn.querySelector('.btn-text');
      const btnLoading = btn.querySelector('.btn-loading');
      const status = $('#aiStatus');

      btn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';
      status.className = 'ai-status';
      status.style.display = 'none';

      try {
        const roadmap = await AI.generateRoadmap(
          topic,
          $('#currentLevel').value,
          $('#targetLevel').value,
          $('#dailyHours').value,
          $('#extraInfo').value.trim()
        );

        // 初始化完成状态
        roadmap.stages.forEach((stage, si) => {
          stage.completed = false;
          stage.tasks.forEach(t => t.completed = false);
        });

        this.data.roadmap = roadmap;
        this.data.progress = { completedTasks: [], heatmap: {}, streak: 0, lastDate: null };
        Storage.save(this.data);

        this.closeModal('createModal');
        this.updateDashboard();
        this.updateRoadmapView();
        showToast('学习路线已生成！', 'success');

        // 滚动到路线图
        setTimeout(() => {
          document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth' });
        }, 500);
      } catch (err) {
        status.textContent = err.message;
        status.className = 'ai-status error';
      } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    }

    // ---- 文件上传 ----
    setupFileUpload() {
      const uploadArea = $('#uploadArea');
      const fileInput = $('#fileInput');

      uploadArea?.addEventListener('click', () => fileInput?.click());
      uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      uploadArea?.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });
      uploadArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]);
      });
      fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length) this.handleFile(e.target.files[0]);
      });
    }

    async handleFile(file) {
      try {
        const roadmap = await RoadmapManager.importFromFile(file);
        roadmap.stages.forEach(stage => {
          stage.completed = false;
          stage.tasks.forEach(t => { if (t.completed === undefined) t.completed = false; });
        });

        // 显示预览
        const preview = $('#importPreview');
        const content = $('#previewContent');
        let previewText = `📌 ${roadmap.title}\n\n`;
        roadmap.stages.forEach((s, i) => {
          previewText += `阶段 ${i + 1}: ${s.title}\n`;
          s.tasks.forEach(t => { previewText += `  • ${t.title}\n`; });
          previewText += '\n';
        });
        content.textContent = previewText.substring(0, 800);
        preview.style.display = 'block';

        // 确认导入
        $('#btnConfirmImport')?.addEventListener('click', () => {
          this.data.roadmap = roadmap;
          this.data.progress = { completedTasks: [], heatmap: {}, streak: 0, lastDate: null };
          Storage.save(this.data);
          this.closeModal('importModal');
          this.updateDashboard();
          this.updateRoadmapView();
          showToast('学习路线已导入！', 'success');
        }, { once: true });
      } catch (err) {
        showToast('导入失败：' + err.message, 'error');
      }
    }

    // ---- 仪表盘更新 ----
    updateDashboard() {
      const roadmap = this.data.roadmap;
      if (!roadmap) return;

      let totalTasks = 0;
      let completedTasks = 0;
      let currentStageTitle = '-';

      roadmap.stages.forEach((stage, si) => {
        stage.tasks.forEach(task => {
          totalTasks++;
          if (task.completed) completedTasks++;
        });
        if (!stage.completed && currentStageTitle === '-') {
          currentStageTitle = stage.title;
        }
      });

      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      $('#statTotalTasks').textContent = totalTasks;
      $('#statCompleted').textContent = completedTasks;
      $('#statStreak').textContent = this.data.progress.streak || 0;
      $('#statStage').textContent = currentStageTitle;
      $('#mainProgressFill').style.width = progress + '%';
      $('#mainProgressText').textContent = progress + '%';

      // 当前任务
      for (const stage of roadmap.stages) {
        if (stage.completed) continue;
        for (const task of stage.tasks) {
          if (!task.completed) {
            $('#currentTask').textContent = task.title;
            break;
          }
        }
        break;
      }

      // 热力图
      this.renderHeatmap();
    }

    renderHeatmap() {
      const grid = $('#heatmapGrid');
      if (!grid) return;
      grid.innerHTML = '';

      const heatmap = this.data.progress.heatmap || {};
      const today = new Date();

      // 生成最近5周的数据
      for (let week = 4; week >= 0; week--) {
        for (let day = 0; day < 7; day++) {
          const d = new Date(today);
          d.setDate(d.getDate() - (week * 7 + (6 - day)));
          const key = d.toISOString().split('T')[0];
          const count = heatmap[key] || 0;

          const cell = document.createElement('div');
          cell.className = 'heatmap-cell';
          if (count >= 4) cell.classList.add('level-4');
          else if (count >= 3) cell.classList.add('level-3');
          else if (count >= 2) cell.classList.add('level-2');
          else if (count >= 1) cell.classList.add('level-1');

          cell.title = `${key}: ${count} 个任务`;
          grid.appendChild(cell);
        }
      }
    }

    // ---- 路线图视图 ----
    updateRoadmapView() {
      const hasRoadmap = this.data.roadmap && this.data.roadmap.stages?.length > 0;
      const prompt = $('#noRoadmapPrompt');
      const canvas = $('#roadmapCanvas');

      if (hasRoadmap) {
        prompt?.classList.add('hidden');
        canvas.style.display = 'block';
        if (this.roadmapRenderer) {
          this.roadmapRenderer.setRoadmap(this.data.roadmap);
        }
      } else {
        prompt?.classList.remove('hidden');
      }
    }

    // ---- 阶段详情 ----
    showStageDetail(stageIndex) {
      const roadmap = this.data.roadmap;
      if (!roadmap || !roadmap.stages[stageIndex]) return;

      const stage = roadmap.stages[stageIndex];
      const prevCompleted = stageIndex === 0 || roadmap.stages[stageIndex - 1]?.completed;

      if (!prevCompleted) {
        showToast('请先完成上一阶段', 'info');
        return;
      }

      $('#stageModalTitle').textContent = stage.title;
      const body = $('#stageModalBody');

      let html = `<p style="color:var(--text-secondary);margin-bottom:16px">${stage.description || ''}</p>`;

      // 任务列表
      html += '<div class="stage-tasks">';
      stage.tasks.forEach((task, ti) => {
        html += `
          <div class="stage-task ${task.completed ? 'completed' : ''}" data-stage="${stageIndex}" data-task="${ti}">
            <div class="stage-task-check"></div>
            <span class="stage-task-text">${task.title}</span>
          </div>`;
      });
      html += '</div>';

      // 测验
      if (stage.quiz?.questions?.length > 0 && !stage.completed) {
        const allTasksDone = stage.tasks.every(t => t.completed);
        if (allTasksDone) {
          html += '<div class="stage-quiz"><h4>✦ 阶段测验</h4>';
          stage.quiz.questions.forEach((q, qi) => {
            html += `<div class="quiz-question">${qi + 1}. ${q.question}</div>`;
            html += '<div class="quiz-options">';
            q.options.forEach((opt, oi) => {
              html += `<div class="quiz-option" data-qi="${qi}" data-oi="${oi}" data-answer="${q.answer}">${opt}</div>`;
            });
            html += '</div>';
          });
          html += '</div>';
        }
      }

      // 完成按钮
      if (stage.completed) {
        html += '<div style="text-align:center;margin-top:20px;color:var(--purple-light)">✦ 此阶段已完成</div>';
      }

      body.innerHTML = html;

      // 任务点击事件
      body.querySelectorAll('.stage-task').forEach(el => {
        el.addEventListener('click', () => {
          const si = parseInt(el.dataset.stage);
          const ti = parseInt(el.dataset.task);
          this.toggleTask(si, ti);
          this.showStageDetail(si); // 刷新
        });
      });

      // 测验选项事件
      body.querySelectorAll('.quiz-option').forEach(el => {
        el.addEventListener('click', () => {
          const qi = parseInt(el.dataset.qi);
          const oi = parseInt(el.dataset.oi);
          const answer = parseInt(el.dataset.answer);
          const isCorrect = oi === answer;

          // 禁用同题所有选项
          body.querySelectorAll(`.quiz-option[data-qi="${qi}"]`).forEach(opt => {
            opt.style.pointerEvents = 'none';
            if (parseInt(opt.dataset.oi) === answer) {
              opt.classList.add('correct');
            }
          });

          if (!isCorrect) {
            el.classList.add('wrong');
          } else {
            // 检查是否所有题都答对
            this.checkQuizCompletion(stageIndex);
          }
        });
      });

      this.openModal('stageModal');
    }

    toggleTask(stageIndex, taskIndex) {
      const stage = this.data.roadmap.stages[stageIndex];
      const task = stage.tasks[taskIndex];
      task.completed = !task.completed;

      // 更新热力图
      const today = new Date().toISOString().split('T')[0];
      if (task.completed) {
        this.data.progress.heatmap[today] = (this.data.progress.heatmap[today] || 0) + 1;
        this.updateStreak();
      }

      // 检查阶段是否全部完成
      this.checkStageCompletion(stageIndex);
      Storage.save(this.data);
      this.updateDashboard();
    }

    checkQuizCompletion(stageIndex) {
      const stage = this.data.roadmap.stages[stageIndex];
      // 简单处理：答对所有题后标记阶段完成
      setTimeout(() => {
        stage.completed = true;
        Storage.save(this.data);
        this.updateDashboard();
        this.updateRoadmapView();
        showToast(`🎉 恭喜完成「${stage.title}」！`, 'success');
      }, 500);
    }

    checkStageCompletion(stageIndex) {
      const stage = this.data.roadmap.stages[stageIndex];
      const allDone = stage.tasks.every(t => t.completed);
      if (allDone && stage.quiz?.questions?.length > 0) {
        // 显示测验
        this.showStageDetail(stageIndex);
      } else if (allDone && (!stage.quiz?.questions || stage.quiz.questions.length === 0)) {
        stage.completed = true;
        this.updateRoadmapView();
      }
    }

    updateStreak() {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const progress = this.data.progress;

      if (progress.lastDate === today) return;

      if (progress.lastDate === yesterday) {
        progress.streak = (progress.streak || 0) + 1;
      } else if (progress.lastDate !== today) {
        progress.streak = 1;
      }
      progress.lastDate = today;
    }

    resetAll() {
      if (!confirm('确定要重置所有数据吗？这将清除学习路线、进度和设置，此操作不可撤销。')) return;
      localStorage.removeItem(Storage.KEY);
      this.data = Storage.getDefault();
      // 清除路线图渲染器
      this.roadmapRenderer?.clear();
      this.closeModal('settingsModal');
      this.updateDashboard();
      this.updateRoadmapView();
      showToast('所有数据已重置', 'info');
    }
  }

  // ==================== 启动 ====================
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
})();
