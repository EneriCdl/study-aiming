(function () {
  'use strict';

  const MAIN_KEY = 'study_aiming_data';
  const PET_KEY = 'study_aiming_pet_data';
  const PET_VERSION = 1;
  const STAGES = [
    { id: 'baby', label: '婴儿期', minFeeds: 0, scale: 0.92 },
    { id: 'young', label: '幼年期', minFeeds: 10, scale: 1.02 },
    { id: 'adult', label: '成年期', minFeeds: 25, scale: 1.08 },
  ];
  const REWARD_POINTS = {
    stage: 12,
    extra: 10,
    quiz: 24,
    newPlan: 30,
    achievement: 18,
  };
  const FOOD_ITEMS = [
    { id: 'fish_snack', name: '小鱼干', price: 18, feedValue: 1, desc: '轻巧零食，适合日常喂养。' },
    { id: 'milk_bowl', name: '营养奶盆', price: 32, feedValue: 2, desc: '一顿抵两顿，适合冲成长。' },
  ];
  const OUTFIT_ITEMS = [
    { id: 'scarf_red', name: '红围巾', price: 34, desc: '适合冬天和认真学习的样子。' },
    { id: 'cap_star', name: '星星帽', price: 44, desc: '看起来更像今天很有干劲。' },
    { id: 'bell_collar', name: '铃铛项圈', price: 38, desc: '会让桌宠更像真正陪伴你的伙伴。' },
  ];
  const PET_PRESETS = {
    cat: {
      icon: '🐱',
      name: '奶油小猫',
      mood: '擅长陪你稳稳推进学习计划。',
      colorClass: 'study-pet--cat',
      coachLine: '今天先把最靠前的未完成任务解决掉，我陪你。',
    },
    dog: {
      icon: '🐶',
      name: '元气小狗',
      mood: '更像督学搭子，节奏更直接。',
      colorClass: 'study-pet--dog',
      coachLine: '别拖，先动起来。做掉一个任务，状态就回来了。',
    },
    bunny: {
      icon: '🐰',
      name: '云朵兔兔',
      mood: '更温柔，适合低压力提醒。',
      colorClass: 'study-pet--bunny',
      coachLine: '我们今天就推进一点点，把当前阶段往前拱一下。',
    },
  };
  const MODEL_PRESETS = {
    openai: { endpoint: 'https://api.openai.com/v1/chat/completions' },
    deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions' },
    xiaomi_mimo: { endpoint: 'https://api.xiaomi.com/v1/chat/completions' },
    claude: { endpoint: 'https://api.anthropic.com/v1/messages' },
    gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models' },
    qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
    zhipu: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
    custom: { endpoint: '' },
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getMainData() {
    return readJson(MAIN_KEY, {
      plans: [],
      activePlanId: null,
      progress: { activityLog: [], heatmap: {}, streak: 0, lastDate: null },
      settings: { apiProvider: 'openai', apiKey: '', endpoint: '', modelName: 'gpt-4o-mini' },
    });
  }

  function computePlanStats(plan) {
    const stageTasks = (plan?.stages || []).flatMap((stage, stageIndex) =>
      (stage.tasks || []).map(task => ({
        ...task,
        stageIndex,
        stageTitle: stage.title || `阶段 ${stageIndex + 1}`,
      }))
    );
    const extraTasks = (plan?.extraTasks || []).map(task => ({
      ...task,
      stageIndex: null,
      stageTitle: '额外任务',
    }));
    const stageCompleted = stageTasks.filter(task => task.completed).length;
    return {
      stageTasks,
      extraTasks,
      stageCompleted,
      stageTotal: stageTasks.length,
      progressPct: stageTasks.length ? Math.round(stageCompleted / stageTasks.length * 100) : 0,
    };
  }

  function getUnlockedAchievementKeys(mainData) {
    const keys = [];
    (mainData.plans || []).forEach(plan => {
      const stats = computePlanStats(plan);
      (plan.achievements || []).forEach((achievement, index) => {
        const unlockAt = achievement.unlockAt || 0;
        if (stats.stageCompleted >= unlockAt) {
          keys.push(`${plan.id}:${achievement.id || achievement.name || index}`);
        }
      });
    });
    return keys;
  }

  function buildBaselineState(mainData) {
    const activityKeys = (mainData.progress?.activityLog || []).map(entry =>
      `${entry.at}|${entry.taskId}|${entry.kind}|${entry.planId}|${entry.stageIndex}`
    );
    return {
      version: PET_VERSION,
      species: 'cat',
      feedCount: 0,
      points: 36,
      inventory: { fish_snack: 2, milk_bowl: 0 },
      ownedOutfits: [],
      equippedOutfit: null,
      chatHistory: [],
      seenActivityKeys: activityKeys.slice(-240),
      knownPlanIds: (mainData.plans || []).map(plan => plan.id),
      unlockedAchievementKeys: getUnlockedAchievementKeys(mainData),
      bubbleText: '我在这儿。完成任务、测验和徽章解锁都会给我赚积分。',
      lastCoachDate: null,
      collapsed: false,
      visible: false,
      position: { x: 0, y: 0 },
    };
  }

  function getPetState(mainData) {
    const stored = readJson(PET_KEY, null);
    if (!stored || stored.version !== PET_VERSION) return buildBaselineState(mainData);
    const baseline = buildBaselineState(mainData);
    return {
      ...baseline,
      ...stored,
      inventory: { ...baseline.inventory, ...(stored.inventory || {}) },
      position: { ...baseline.position, ...(stored.position || {}) },
      ownedOutfits: Array.isArray(stored.ownedOutfits) ? stored.ownedOutfits : [],
      chatHistory: Array.isArray(stored.chatHistory) ? stored.chatHistory.slice(-24) : [],
      seenActivityKeys: Array.isArray(stored.seenActivityKeys) ? stored.seenActivityKeys.slice(-240) : baseline.seenActivityKeys,
      knownPlanIds: Array.isArray(stored.knownPlanIds) ? stored.knownPlanIds : baseline.knownPlanIds,
      unlockedAchievementKeys: Array.isArray(stored.unlockedAchievementKeys) ? stored.unlockedAchievementKeys : baseline.unlockedAchievementKeys,
    };
  }

  function getStageForFeedCount(feedCount) {
    let stage = STAGES[0];
    STAGES.forEach(candidate => {
      if (feedCount >= candidate.minFeeds) stage = candidate;
    });
    return stage;
  }

  class StudyPet {
    constructor() {
      this.mainData = getMainData();
      this.state = getPetState(this.mainData);
      this.app = null;
      this.root = null;
      this.launcher = null;
      this.activePanel = null;
      this.reactionTimer = null;
      this.speechTimer = null;
      this.drag = null;
      this.todayKey = new Date().toISOString().slice(0, 10);
    }

    init() {
      this.app = window.app || null;
      this.build();
      this.bind();
      this.bindExternalToggle();
      this.syncFromSite(true);
      this.render();
      this.showCoachIfNeeded();
      setInterval(() => this.syncFromSite(false), 2000);
      window.addEventListener('storage', event => {
        if (event.key === MAIN_KEY || event.key === PET_KEY) this.syncFromSite(false);
      });
    }

    build() {
      const root = document.createElement('section');
      root.className = 'study-pet';
      root.innerHTML = `
        <div class="study-pet__card">
          <div class="study-pet__header">
            <button class="study-pet__drag" type="button" aria-label="拖拽桌宠">⋮⋮</button>
            <div class="study-pet__header-main">
              <span class="study-pet__name" data-role="name"></span>
              <span class="study-pet__stage" data-role="stage"></span>
            </div>
            <div class="study-pet__points" data-role="points">0 积分</div>
            <button class="study-pet__icon-btn" type="button" data-action="selector" aria-label="选择桌宠">换</button>
            <button class="study-pet__icon-btn" type="button" data-action="collapse" aria-label="收起桌宠">－</button>
          </div>
          <div class="study-pet__mood" data-role="mood"></div>
          <div class="study-pet__speech" data-role="speech"></div>
          <div class="study-pet__figure-wrap">
            <button class="study-pet__figure-btn" type="button" data-action="figure" aria-label="点击桌宠开启对话">
              <div class="pet-figure" data-role="figure">
                <div class="pet-figure__tail"></div>
                <div class="pet-figure__body">
                  <div class="pet-figure__belly"></div>
                  <div class="pet-figure__paw pet-figure__paw--left"></div>
                  <div class="pet-figure__paw pet-figure__paw--right"></div>
                  <div class="pet-figure__foot pet-figure__foot--left"></div>
                  <div class="pet-figure__foot pet-figure__foot--right"></div>
                </div>
                <div class="pet-figure__head">
                  <div class="pet-figure__ear pet-figure__ear--left"></div>
                  <div class="pet-figure__ear pet-figure__ear--right"></div>
                  <div class="pet-figure__eye pet-figure__eye--left"></div>
                  <div class="pet-figure__eye pet-figure__eye--right"></div>
                  <div class="pet-figure__blush pet-figure__blush--left"></div>
                  <div class="pet-figure__blush pet-figure__blush--right"></div>
                  <div class="pet-figure__nose"></div>
                  <div class="pet-figure__mouth"></div>
                </div>
                <div class="pet-figure__accessory"></div>
              </div>
            </button>
            <div class="study-pet__hearts" data-role="hearts"></div>
          </div>
          <div class="study-pet__quick">
            <button type="button" data-action="pat">抚摸</button>
            <button type="button" data-action="feed">喂食</button>
            <button type="button" data-action="coach">督学</button>
            <button type="button" data-action="shop">商店</button>
          </div>
        </div>
        <div class="study-pet__panel" data-panel="selector">
          <div class="study-pet__panel-head">
            <div class="study-pet__panel-title">选择桌宠</div>
            <button class="study-pet__close" type="button" data-action="close-panel">×</button>
          </div>
          <div class="study-pet__pet-list" data-role="selector-list"></div>
        </div>
        <div class="study-pet__panel" data-panel="shop">
          <div class="study-pet__panel-head">
            <div class="study-pet__panel-title">商店与背包</div>
            <button class="study-pet__close" type="button" data-action="close-panel">×</button>
          </div>
          <div class="study-pet__inventory" data-role="inventory"></div>
          <div class="study-pet__shop-list" data-role="food-list"></div>
          <div class="study-pet__shop-list" data-role="outfit-list" style="margin-top:10px;"></div>
        </div>
        <div class="study-pet__panel" data-panel="chat">
          <div class="study-pet__panel-head">
            <div class="study-pet__panel-title">桌宠对话</div>
            <button class="study-pet__close" type="button" data-action="close-panel">×</button>
          </div>
          <div class="study-pet__chat-log" data-role="chat-log"></div>
          <div class="study-pet__chat-asks">
            <button class="study-pet__quick-ask" type="button" data-ask="现在我应该先做什么？">现在做什么</button>
            <button class="study-pet__quick-ask" type="button" data-ask="我目前这个学习计划进展到哪个阶段了？">当前进度</button>
            <button class="study-pet__quick-ask" type="button" data-ask="结合当前计划，给我一个简短的督学提醒。">督学提醒</button>
          </div>
          <form class="study-pet__chat-form" data-role="chat-form">
            <input class="study-pet__chat-input" data-role="chat-input" type="text" maxlength="160" placeholder="问问桌宠：我现在该做什么？">
            <button class="study-pet__chat-send" type="submit">发送</button>
          </form>
          <div class="study-pet__status-line" data-role="chat-status">成长到幼年期后会解锁 AI 对话。</div>
        </div>
      `;
      document.body.appendChild(root);
      this.root = root;
      const launcher = document.createElement('button');
      launcher.className = 'study-pet-launcher';
      launcher.type = 'button';
      launcher.innerHTML = '<span>🐾</span><span>呼出桌宠</span>';
      launcher.setAttribute('aria-label', '呼出桌宠');
      launcher.addEventListener('click', () => this.showPet(true));
      document.body.appendChild(launcher);
      this.launcher = launcher;
      this.applyPosition();
    }

    bind() {
      this.root.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'selector') this.togglePanel('selector');
        if (action === 'collapse') this.toggleCollapse();
        if (action === 'pat') this.patPet();
        if (action === 'feed') this.feedPet();
        if (action === 'coach') this.coachPet();
        if (action === 'shop') this.togglePanel('shop');
        if (action === 'figure') this.openChatOrHint();
        if (action === 'close-panel') this.closePanels();
      });

      this.root.addEventListener('click', event => {
        const ask = event.target.closest('[data-ask]')?.dataset.ask;
        if (ask) this.sendChat(ask);
      });

      $('[data-role="chat-form"]', this.root).addEventListener('submit', event => {
        event.preventDefault();
        const input = $('[data-role="chat-input"]', this.root);
        const message = input.value.trim();
        if (!message) return;
        input.value = '';
        this.sendChat(message);
      });

      $('.study-pet__drag', this.root).addEventListener('pointerdown', event => this.startDrag(event));

      document.addEventListener('pointermove', event => this.onDrag(event));
      document.addEventListener('pointerup', () => this.stopDrag());
    }

    bindExternalToggle() {
      const toggleButton = document.getElementById('btnPetToggle');
      if (!toggleButton) return;
      toggleButton.addEventListener('click', () => this.toggleVisibility());
    }

    startDrag(event) {
      event.preventDefault();
      const start = this.state.position || { x: 0, y: 0 };
      this.drag = {
        originX: event.clientX,
        originY: event.clientY,
        startX: start.x,
        startY: start.y,
      };
      this.root.classList.add('is-dragging');
    }

    onDrag(event) {
      if (!this.drag) return;
      const nextX = this.drag.startX + (event.clientX - this.drag.originX);
      const nextY = this.drag.startY + (event.clientY - this.drag.originY);
      this.state.position = {
        x: clamp(nextX, -window.innerWidth + 110, 40),
        y: clamp(nextY, -window.innerHeight + 120, 40),
      };
      this.applyPosition();
    }

    stopDrag() {
      if (!this.drag) return;
      this.drag = null;
      this.root.classList.remove('is-dragging');
      this.save();
    }

    applyPosition() {
      this.normalizePosition();
      this.root.style.setProperty('--pet-offset-x', `${this.state.position.x || 0}px`);
      this.root.style.setProperty('--pet-offset-y', `${this.state.position.y || 0}px`);
    }

    normalizePosition() {
      const x = Number(this.state.position?.x || 0);
      const y = Number(this.state.position?.y || 0);
      this.state.position = {
        x: clamp(x, -window.innerWidth + 120, 48),
        y: clamp(y, -window.innerHeight + 140, 48),
      };
    }

    save() {
      writeJson(PET_KEY, this.state);
    }

    syncFromSite(isInitial) {
      this.mainData = getMainData();
      if (!isInitial) {
        this.processActivities();
        this.processPlans();
        this.processAchievements();
      }
      this.render();
      this.save();
    }

    processActivities() {
      const log = this.mainData.progress?.activityLog || [];
      const currentKeys = log.map(entry =>
        `${entry.at}|${entry.taskId}|${entry.kind}|${entry.planId}|${entry.stageIndex}`
      );
      const known = new Set(this.state.seenActivityKeys || []);
      log.forEach(entry => {
        const key = `${entry.at}|${entry.taskId}|${entry.kind}|${entry.planId}|${entry.stageIndex}`;
        if (known.has(key)) return;
        known.add(key);
        const reward = REWARD_POINTS[entry.kind] || 0;
        if (!reward) return;
        this.state.points += reward;
        const taskName = entry.taskText || '学习进展';
        if (entry.kind === 'quiz') {
          this.react(`测验完成 +${reward} 积分`, `${taskName} 做得漂亮，我们继续。`, 'celebrate');
        } else {
          this.react(`任务推进 +${reward} 积分`, `你刚完成了「${taskName}」，我看到进度往前走了。`, 'stretch');
        }
      });
      this.state.seenActivityKeys = currentKeys.slice(-240);
    }

    processPlans() {
      const currentIds = (this.mainData.plans || []).map(plan => plan.id);
      const known = new Set(this.state.knownPlanIds || []);
      currentIds.forEach(planId => {
        if (known.has(planId)) return;
        known.add(planId);
        this.state.points += REWARD_POINTS.newPlan;
        this.react(`新计划解锁 +${REWARD_POINTS.newPlan} 积分`, '新学习计划来了，我去计划旁边蹦两下。', 'celebrate');
        this.triggerPlanHop();
      });
      this.state.knownPlanIds = currentIds;
    }

    processAchievements() {
      const currentUnlocked = getUnlockedAchievementKeys(this.mainData);
      const known = new Set(this.state.unlockedAchievementKeys || []);
      currentUnlocked.forEach(key => {
        if (known.has(key)) return;
        known.add(key);
        this.state.points += REWARD_POINTS.achievement;
        this.react(`徽章解锁 +${REWARD_POINTS.achievement} 积分`, '你拿到新徽章了，这一下很关键。', 'celebrate');
      });
      this.state.unlockedAchievementKeys = currentUnlocked;
    }

    toggleCollapse() {
      this.state.collapsed = !this.state.collapsed;
      this.root.classList.toggle('is-collapsed', !!this.state.collapsed);
      this.closePanels();
      this.save();
    }

    toggleVisibility() {
      if (this.state.visible) this.hidePet();
      else this.showPet(true);
    }

    showPet(resetPosition = false) {
      this.state.visible = true;
      if (resetPosition) {
        this.state.position = { x: 0, y: 0 };
        this.applyPosition();
      }
      this.render();
      this.save();
    }

    hidePet() {
      this.state.visible = false;
      this.closePanels();
      this.render();
      this.save();
    }

    togglePanel(name) {
      if (this.activePanel === name) {
        this.closePanels();
        return;
      }
      this.activePanel = name;
      $$('[data-panel]', this.root).forEach(panel => {
        panel.classList.toggle('is-open', panel.dataset.panel === name);
      });
      if (name === 'chat') this.ensureChatReady();
    }

    closePanels() {
      this.activePanel = null;
      $$('[data-panel]', this.root).forEach(panel => panel.classList.remove('is-open'));
    }

    getSpecies() {
      return PET_PRESETS[this.state.species] || PET_PRESETS.cat;
    }

    getStage() {
      return getStageForFeedCount(this.state.feedCount || 0);
    }

    render() {
      const preset = this.getSpecies();
      const stage = this.getStage();
      this.root.classList.remove('study-pet--cat', 'study-pet--dog', 'study-pet--bunny');
      this.root.classList.add(preset.colorClass);
      this.root.classList.toggle('is-collapsed', !!this.state.collapsed);
      this.root.classList.toggle('is-hidden', !this.state.visible);
      if (this.launcher) this.launcher.classList.toggle('is-hidden', !!this.state.visible);
      $('[data-role="name"]', this.root).textContent = preset.name;
      $('[data-role="stage"]', this.root).textContent = `${stage.label} · 已喂食 ${this.state.feedCount} 次`;
      $('[data-role="points"]', this.root).textContent = `${this.state.points} 积分`;
      $('[data-role="mood"]', this.root).textContent = preset.mood;
      $('[data-role="speech"]', this.root).textContent = this.state.bubbleText;
      $('[data-action="collapse"]', this.root).textContent = this.state.collapsed ? '＋' : '－';
      const externalToggle = document.getElementById('btnPetToggle');
      if (externalToggle) externalToggle.textContent = this.state.visible ? '隐藏桌宠' : '桌宠';

      const figure = $('[data-role="figure"]', this.root);
      const stageClass = stage.id === 'adult' ? 'stage-adult' : stage.id === 'young' ? 'stage-young' : 'stage-baby';
      figure.className = `pet-figure species-${this.state.species} ${stageClass} ${this.state.equippedOutfit ? `outfit-${this.state.equippedOutfit}` : ''}`;
      figure.style.setProperty('--pet-scale', String(stage.scale));

      this.renderSelector();
      this.renderShop();
      this.renderChat();
      this.updateChatStatus();
    }

    renderSelector() {
      const selector = $('[data-role="selector-list"]', this.root);
      selector.innerHTML = Object.entries(PET_PRESETS).map(([key, preset]) => `
        <div class="study-pet__pet-option">
          <div class="study-pet__pet-badge">${preset.icon}</div>
          <div class="study-pet__pet-meta">
            <strong>${escHtml(preset.name)}</strong>
            <span>${escHtml(preset.mood)}</span>
          </div>
          <button type="button" data-select-pet="${key}">${this.state.species === key ? '当前使用' : '选这个'}</button>
        </div>
      `).join('');
      $$('[data-select-pet]', selector).forEach(button => {
        button.addEventListener('click', () => {
          this.state.species = button.dataset.selectPet;
          this.state.bubbleText = `以后我就用 ${this.getSpecies().name} 的样子陪你学了。`;
          this.react('桌宠已切换', this.state.bubbleText, 'celebrate');
          this.render();
          this.save();
          this.closePanels();
        });
      });
    }

    renderShop() {
      const inventoryLine = $('[data-role="inventory"]', this.root);
      inventoryLine.textContent = `背包：小鱼干 ${this.state.inventory.fish_snack || 0} · 营养奶盆 ${this.state.inventory.milk_bowl || 0} · 已装备 ${this.describeEquippedOutfit()}`;

      const foodList = $('[data-role="food-list"]', this.root);
      foodList.innerHTML = FOOD_ITEMS.map(item => `
        <div class="study-pet__shop-card">
          <strong>${escHtml(item.name)} · ${item.price} 积分</strong>
          <p>${escHtml(item.desc)}</p>
          <div class="study-pet__shop-actions">
            <button type="button" data-buy-food="${item.id}">购买</button>
            <button type="button" class="is-secondary" data-feed-food="${item.id}">直接喂食</button>
          </div>
        </div>
      `).join('');

      const outfitList = $('[data-role="outfit-list"]', this.root);
      outfitList.innerHTML = OUTFIT_ITEMS.map(item => {
        const owned = this.state.ownedOutfits.includes(item.id);
        const equipped = this.state.equippedOutfit === item.id;
        return `
          <div class="study-pet__shop-card">
            <strong>${escHtml(item.name)} · ${item.price} 积分</strong>
            <p>${escHtml(item.desc)}</p>
            <div class="study-pet__shop-actions">
              ${owned
                ? `<button type="button" data-equip-outfit="${item.id}">${equipped ? '已装备' : '装备'}</button>`
                : `<button type="button" data-buy-outfit="${item.id}">购买</button>`
              }
              ${owned && equipped ? '<button type="button" class="is-secondary" data-clear-outfit="1">卸下</button>' : ''}
            </div>
          </div>
        `;
      }).join('');

      $$('[data-buy-food]', this.root).forEach(button => {
        button.onclick = () => this.buyFood(button.dataset.buyFood);
      });
      $$('[data-feed-food]', this.root).forEach(button => {
        button.onclick = () => this.feedPet(button.dataset.feedFood);
      });
      $$('[data-buy-outfit]', this.root).forEach(button => {
        button.onclick = () => this.buyOutfit(button.dataset.buyOutfit);
      });
      $$('[data-equip-outfit]', this.root).forEach(button => {
        button.onclick = () => this.equipOutfit(button.dataset.equipOutfit);
      });
      $$('[data-clear-outfit]', this.root).forEach(button => {
        button.onclick = () => {
          this.state.equippedOutfit = null;
          this.state.bubbleText = '今天先素颜陪你学。';
          this.render();
          this.save();
        };
      });
    }

    renderChat() {
      const log = $('[data-role="chat-log"]', this.root);
      const history = this.state.chatHistory.length
        ? this.state.chatHistory
        : [{ role: 'pet', text: '长到幼年期以后，我就能帮你看计划、看当前阶段，还能根据你的 API 配置回答问题。' }];
      log.innerHTML = history.map(entry => `
        <div class="study-pet__chat-message study-pet__chat-message--${entry.role === 'user' ? 'user' : 'pet'}">${escHtml(entry.text)}</div>
      `).join('');
      log.scrollTop = log.scrollHeight;
    }

    updateChatStatus() {
      const status = $('[data-role="chat-status"]', this.root);
      if (this.getStage().minFeeds < 10) {
        status.textContent = `再喂食 ${Math.max(0, 10 - this.state.feedCount)} 次，就会解锁 AI 对话功能。`;
      } else {
        const settings = this.mainData.settings || {};
        status.textContent = settings.apiKey
          ? '已检测到 API Key。点击桌宠或在这里输入问题即可。'
          : '已解锁对话。若要获得智能回复，请先在网站设置里配置 API Key。';
      }
    }

    describeEquippedOutfit() {
      const outfit = OUTFIT_ITEMS.find(item => item.id === this.state.equippedOutfit);
      return outfit ? outfit.name : '无';
    }

    patPet() {
      const lines = {
        cat: '呼噜呼噜……继续做，我陪着你。',
        dog: '好，状态提起来了，我们继续冲。',
        bunny: '摸摸就会变乖，接着学一点点吧。',
      };
      this.react('抚摸成功', lines[this.state.species] || lines.cat, 'celebrate');
    }

    feedPet(preferredFoodId) {
      const currentStage = this.getStage();
      let food = null;
      if (preferredFoodId && (this.state.inventory[preferredFoodId] || 0) > 0) {
        food = FOOD_ITEMS.find(item => item.id === preferredFoodId);
      }
      if (!food) {
        food = FOOD_ITEMS.find(item => (this.state.inventory[item.id] || 0) > 0) || null;
      }
      if (!food) {
        this.state.bubbleText = '背包里没吃的了，先去商店买一点吧。';
        this.render();
        this.togglePanel('shop');
        return;
      }
      this.state.inventory[food.id] = Math.max(0, (this.state.inventory[food.id] || 0) - 1);
      this.state.feedCount += food.feedValue;
      const nextStage = this.getStage();
      if (nextStage.id !== currentStage.id) {
        this.react('成长完成', `我长大到${nextStage.label}了，对话功能也更完整了。`, 'celebrate');
      } else {
        this.react('喂食成功', `${food.name} 真不错，我会继续陪你。`, 'stretch');
      }
      this.render();
      this.save();
    }

    buyFood(foodId) {
      const food = FOOD_ITEMS.find(item => item.id === foodId);
      if (!food) return;
      if (this.state.points < food.price) {
        this.state.bubbleText = '积分不够，再完成几个任务就够买了。';
        this.render();
        return;
      }
      this.state.points -= food.price;
      this.state.inventory[food.id] = (this.state.inventory[food.id] || 0) + 1;
      this.state.bubbleText = `买到了 ${food.name}。现在背包里有 ${this.state.inventory[food.id]} 份。`;
      this.render();
      this.save();
    }

    buyOutfit(outfitId) {
      const outfit = OUTFIT_ITEMS.find(item => item.id === outfitId);
      if (!outfit) return;
      if (this.state.ownedOutfits.includes(outfit.id)) {
        this.equipOutfit(outfit.id);
        return;
      }
      if (this.state.points < outfit.price) {
        this.state.bubbleText = '积分还差一点，先去推进学习进度。';
        this.render();
        return;
      }
      this.state.points -= outfit.price;
      this.state.ownedOutfits = [...this.state.ownedOutfits, outfit.id];
      this.state.equippedOutfit = outfit.id;
      this.react('装扮入手', `${outfit.name} 已经穿上了。`, 'celebrate');
      this.render();
      this.save();
    }

    equipOutfit(outfitId) {
      if (!this.state.ownedOutfits.includes(outfitId)) return;
      this.state.equippedOutfit = outfitId;
      this.state.bubbleText = `今天穿的是 ${this.describeEquippedOutfit()}。`;
      this.render();
      this.save();
    }

    openChatOrHint() {
      if (this.getStage().minFeeds < 10) {
        this.state.bubbleText = `再喂食 ${Math.max(0, 10 - this.state.feedCount)} 次，我就能帮你看计划回答问题。`;
        this.render();
        return;
      }
      this.togglePanel('chat');
    }

    ensureChatReady() {
      const figure = $('[data-role="figure"]', this.root);
      figure.classList.add('is-chatting');
      clearTimeout(this.reactionTimer);
      this.reactionTimer = window.setTimeout(() => {
        figure.classList.remove('is-chatting');
      }, 1200);
    }

    coachPet() {
      this.state.bubbleText = this.buildCoachMessage();
      this.render();
    }

    showCoachIfNeeded() {
      const log = this.mainData.progress?.activityLog || [];
      const hasTodayActivity = log.some(entry => entry.date === this.todayKey);
      if (hasTodayActivity || this.state.lastCoachDate === this.todayKey) return;
      this.state.lastCoachDate = this.todayKey;
      this.state.bubbleText = this.buildCoachMessage();
      this.render();
      this.save();
    }

    buildCoachMessage() {
      const plan = this.getCurrentPlan();
      if (!plan) return '你还没有选择学习计划。先去路线图页面创建一个，我就能开始督学。';
      const stats = computePlanStats(plan);
      const nextTask = stats.stageTasks.find(task => !task.completed)
        || stats.extraTasks.find(task => !task.completed);
      const stageIndex = nextTask?.stageIndex;
      const stageName = Number.isInteger(stageIndex)
        ? (plan.stages?.[stageIndex]?.title || `阶段 ${stageIndex + 1}`)
        : '额外任务';
      if (!nextTask) return `${plan.title} 已经完成得差不多了，去测验页或者开下一个计划吧。`;
      const preset = this.getSpecies();
      return `${preset.coachLine} 当前建议：先做「${nextTask.text}」。它属于 ${stageName}。`;
    }

    getCurrentPlan() {
      const plans = this.mainData.plans || [];
      if (!plans.length) return null;
      const viewingPlanId = window.app?.viewingPlanId || null;
      const activeId = viewingPlanId || this.mainData.activePlanId || plans[0].id;
      return plans.find(plan => plan.id === activeId) || plans[0];
    }

    async sendChat(message) {
      if (this.getStage().minFeeds < 10) {
        this.state.bubbleText = '我要再长大一点，才能帮你做计划问答。';
        this.render();
        return;
      }

      this.pushChat('user', message);
      this.pushChat('pet', '我先帮你看一下当前计划和任务……');
      this.render();

      try {
        const reply = await this.askModel(message);
        this.state.chatHistory.pop();
        this.pushChat('pet', reply);
        this.state.bubbleText = '我把你当前计划看完了，回复已经放在旁边。';
      } catch (error) {
        this.state.chatHistory.pop();
        this.pushChat('pet', `我这次没能回答成功：${error.message}`);
        this.state.bubbleText = '这次对话失败了，先检查 API 设置。';
      }
      this.render();
      this.save();
    }

    pushChat(role, text) {
      this.state.chatHistory.push({ role, text });
      this.state.chatHistory = this.state.chatHistory.slice(-24);
    }

    buildPlanContext() {
      const plan = this.getCurrentPlan();
      if (!plan) {
        return '当前没有学习计划。请直接提醒用户先创建或选择计划。';
      }
      const stats = computePlanStats(plan);
      const currentStageIndex = plan.stages.findIndex(stage => (stage.tasks || []).some(task => !task.completed));
      const fallbackStageIndex = currentStageIndex === -1 ? Math.max(0, plan.stages.length - 1) : currentStageIndex;
      const currentStage = plan.stages[fallbackStageIndex];
      const pendingTasks = (currentStage?.tasks || []).filter(task => !task.completed).slice(0, 6);
      const recent = (this.mainData.progress?.activityLog || [])
        .filter(entry => entry.planId === plan.id)
        .slice(-5)
        .map(entry => `${entry.date} ${entry.kind} ${entry.taskText || ''}`);
      return [
        `当前计划：${plan.title}`,
        `计划简介：${plan.description || '无'}`,
        `计划进度：${stats.stageCompleted}/${stats.stageTotal}，约 ${stats.progressPct}%`,
        `当前阶段：${currentStage?.title || '未识别阶段'}`,
        `阶段目标：${currentStage?.goal || '无'}`,
        `当前阶段待办：${pendingTasks.length ? pendingTasks.map(task => `- ${task.text}`).join('\n') : '当前阶段任务已完成'}`,
        `最近学习记录：${recent.length ? recent.join('\n') : '暂无记录'}`,
      ].join('\n');
    }

    async askModel(message) {
      const settings = this.mainData.settings || {};
      const apiKey = String(settings.apiKey || '').trim();
      const provider = settings.apiProvider || 'openai';
      const endpoint = provider === 'custom' ? (settings.endpoint || '') : (MODEL_PRESETS[provider]?.endpoint || '');
      const model = String(settings.modelName || 'gpt-4o-mini').trim();
      if (!apiKey) throw new Error('网站设置里还没有配置 API Key');
      if (!endpoint) throw new Error('当前 API 端点不可用');

      const systemPrompt = [
        `你是用户网站里的桌宠，名字是 ${this.getSpecies().name}。`,
        '你要先根据提供的学习计划和当前任务上下文回答，不要脱离上下文瞎猜。',
        '回答风格：可爱、简洁、督学明确，但不要太油腻。',
        '如果用户问“现在该做什么”，先给最明确的下一步，再补充一到三条具体动作。',
      ].join('\n');
      const userPrompt = `当前网站上下文如下：\n${this.buildPlanContext()}\n\n用户问题：${message}`;

      if (provider === 'claude') {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0.7,
            max_tokens: 800,
          }),
        });
        if (!response.ok) throw new Error(`Claude 请求失败 (${response.status})`);
        const data = await response.json();
        return (data.content || []).map(part => part.text || '').join('').trim() || '我刚刚没组织好语言。';
      }

      if (provider === 'gemini') {
        const url = `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
          }),
        });
        if (!response.ok) throw new Error(`Gemini 请求失败 (${response.status})`);
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim() || '我这次没有拿到回复。';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!response.ok) throw new Error(`对话请求失败 (${response.status})`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '我这次没能成功回复。';
    }

    react(title, line, mode) {
      this.state.bubbleText = line;
      this.render();
      this.spawnHearts();
      const figure = $('[data-role="figure"]', this.root);
      figure.classList.remove('is-reacting', 'is-stretching');
      if (mode === 'stretch') figure.classList.add('is-stretching');
      figure.classList.add('is-reacting');
      clearTimeout(this.reactionTimer);
      this.reactionTimer = window.setTimeout(() => {
        figure.classList.remove('is-reacting', 'is-stretching');
      }, 900);
      const mood = $('[data-role="mood"]', this.root);
      mood.textContent = title;
    }

    spawnHearts() {
      const hearts = $('[data-role="hearts"]', this.root);
      hearts.innerHTML = '';
      for (let i = 0; i < 4; i += 1) {
        const heart = document.createElement('span');
        heart.className = 'study-pet__heart';
        heart.textContent = i % 2 === 0 ? '❤' : '✨';
        heart.style.left = `${44 + Math.random() * 18}%`;
        heart.style.setProperty('--heart-x', `${-20 + Math.random() * 40}px`);
        heart.style.animationDelay = `${i * 0.06}s`;
        hearts.appendChild(heart);
      }
    }

    triggerPlanHop() {
      const target = document.querySelector('.plan-gallery, #planGrid, .detail-hero, .dashboard-right');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const currentX = this.state.position.x || 0;
      const currentY = this.state.position.y || 0;
      const targetX = Math.min(0, rect.left - window.innerWidth + 360);
      const targetY = Math.max(rect.top - window.innerHeight + 260, -window.innerHeight + 180);
      this.root.classList.add('is-traveling');
      this.root.style.setProperty('--pet-offset-x', `${targetX}px`);
      this.root.style.setProperty('--pet-offset-y', `${targetY}px`);
      window.setTimeout(() => {
        this.root.style.setProperty('--pet-offset-x', `${currentX}px`);
        this.root.style.setProperty('--pet-offset-y', `${currentY}px`);
      }, 720);
      window.setTimeout(() => {
        this.root.classList.remove('is-traveling');
        this.applyPosition();
      }, 1460);
    }
  }

  function bootPet() {
    if (window.__studyPetMounted) return;
    window.__studyPetMounted = true;
    const pet = new StudyPet();
    pet.init();
    window.studyPet = pet;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPet);
  } else {
    bootPet();
  }
})();
