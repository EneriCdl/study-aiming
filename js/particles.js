/**
 * ============================================================
 *  全局粒子系统 —— 状态机驱动的跨页面形态转换动画
 * ============================================================
 *
 *  状态枚举：
 *    CHAOS      — 第一面（首页）：粒子自由漂浮
 *    SATURN     — 第二面（仪表盘）：粒子聚合为 3D 旋转土星
 *    BACKGROUND — 第三面（路线图）：粒子解体后均匀散布为背景
 *
 *  过渡逻辑：
 *    CHAOS  → SATURN     粒子从随机位置飞向土星坐标
 *    SATURN → BACKGROUND  土星解体，粒子重新随机散布全屏
 *    BACKGROUND → SATURN  背景粒子重新吸附回土星坐标
 *    任意 → CHAOS         粒子回到自由漂浮
 *
 *  缓动公式（线性插值 / Lerp）：
 *    x += (targetX - x) * ease
 *    ease 值越大过渡越快（0.04 ~ 0.08）
 */

// ============================================================
//  状态常量
// ============================================================
const STATE = Object.freeze({
  CHAOS: 'CHAOS',
  SATURN: 'SATURN',
  BACKGROUND: 'BACKGROUND',
});

// ============================================================
//  颜色池（紫/白系）
// ============================================================
const PALETTE = [
  { r: 179, g: 102, b: 255 },
  { r: 212, g: 160, b: 255 },
  { r: 123, g: 47,  b: 190 },
  { r: 255, g: 255, b: 255 },
  { r: 200, g: 180, b: 255 },
];

// ============================================================
//  自适应粒子数量
// ============================================================
function getParticleCount() {
  const w = window.innerWidth;
  if (w < 600) return 200;   // 手机
  if (w < 1024) return 400;  // 平板
  return 700;                // 桌面
}

// ============================================================
//  Particle 类 —— 单个粒子
// ============================================================
class Particle {
  constructor(cw, ch) {
    // ---- 当前坐标（屏幕空间） ----
    this.x = Math.random() * cw;
    this.y = Math.random() * ch;

    // ---- 目标坐标（Lerp 插值目的地） ----
    this.targetX = this.x;
    this.targetY = this.y;

    // ---- 自由漂浮速度（仅 CHAOS / BACKGROUND 状态生效） ----
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;

    // ---- 外观 ----
    const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    this.r = c.r; this.g = c.g; this.b = c.b;
    this.size = Math.random() * 2.5 + 0.5;
    this.baseOpacity = Math.random() * 0.6 + 0.2;
    this.opacity = this.baseOpacity;
    this.targetOpacity = this.baseOpacity;
    this.targetSize = this.size;

    // ---- 闪烁参数 ----
    this.twinkleSpeed = Math.random() * 0.02 + 0.005;
    this.twinklePhase = Math.random() * Math.PI * 2;

    // ---- 土星 3D 局部坐标（仅 SATURN 状态使用） ----
    this.saturnGroup = 'free'; // 'body' | 'ring' | 'free'
    this.x3d = 0;
    this.y3d = 0;
    this.z3d = 0;
    this.baseSize3d = this.size;
  }

  /**
   * 绘制粒子
   * - 主体圆点
   * - 尺寸 > 1.5 时叠加一层柔光
   */
  draw(ctx) {
    const sz = Math.max(0.2, this.size);
    ctx.beginPath();
    ctx.arc(this.x, this.y, sz, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${this.opacity})`;
    ctx.fill();

    if (sz > 1.5) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, sz * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${this.opacity * 0.1})`;
      ctx.fill();
    }
  }
}

// ============================================================
//  ParticleSystem 类 —— 全局粒子系统
// ============================================================
class ParticleSystem {
  constructor() {
    // ---- Canvas 初始化 ----
    this.canvas = document.getElementById('particleCanvas');
    this.ctx = this.canvas.getContext('2d');

    // ---- 粒子数组 & 计数 ----
    this.particles = [];
    this.count = getParticleCount();

    // ---- 状态机 ----
    this.state = STATE.CHAOS;
    this.prevState = STATE.CHAOS;

    // ---- 全局帧计数器 ----
    this.time = 0;

    // ---- 土星 3D 旋转参数 ----
    this.saturnRotY = 0;      // 绕 Y 轴旋转角（弧度）
    this.saturnRotX = 0.35;   // 绕 X 轴倾斜角
    this.saturnCX = 0;        // 土星中心 X（屏幕坐标）
    this.saturnCY = 0;        // 土星中心 Y
    this.saturnR = 0;         // 土星球体半径

    // ---- 缓动系数（越大过渡越快） ----
    this.ease = 0.06;

    // ---- 初始化 ----
    this._resize();
    this._initParticles();
    this._loop();

    // ---- 监听窗口变化 ----
    window.addEventListener('resize', () => this._resize());
  }

  // ========================================================
  //  内部：窗口尺寸变化
  // ========================================================
  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 仅在尺寸真正改变时重设（避免移动端滚动触发 resize）
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      // 重新计算土星中心
      this.saturnCX = w * 0.25;
      this.saturnCY = h * 0.5;
      this.saturnR = Math.min(w, h) * 0.18;
    }
  }

  // ========================================================
  //  内部：初始化粒子数组
  // ========================================================
  _initParticles() {
    this.particles = [];
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    for (let i = 0; i < this.count; i++) {
      this.particles.push(new Particle(cw, ch));
    }
  }

  // ========================================================
  //  外部 API：切换到第一面（CHAOS）
  // ========================================================
  setHeroScene() {
    this.prevState = this.state;
    this.state = STATE.CHAOS;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    this.particles.forEach(p => {
      p.saturnGroup = 'free';
      // 随机目标位置（屏幕内）
      p.targetX = Math.random() * cw;
      p.targetY = Math.random() * ch;
      p.targetSize = Math.random() * 2.5 + 0.5;
      p.targetOpacity = p.baseOpacity;
    });
    this.ease = 0.04; // 较慢过渡
  }

  // ========================================================
  //  外部 API：切换到第二面（SATURN）
  // ========================================================
  setDashboardScene() {
    this.prevState = this.state;
    this.state = STATE.SATURN;

    const cx = this.saturnCX;
    const cy = this.saturnCY;
    const R = this.saturnR;

    const bodyCount = Math.floor(this.count * 0.45);
    const ringCount = Math.floor(this.count * 0.35);

    this.particles.forEach((p, i) => {
      if (i < bodyCount) {
        // ---- 球体粒子：球面均匀分布 ----
        p.saturnGroup = 'body';
        const phi = Math.acos(2 * Math.random() - 1);   // 极角 0~π
        const theta = Math.random() * Math.PI * 2;       // 方位角 0~2π
        const r = Math.pow(Math.random(), 0.5) * R;      // 均匀体积分布
        p.x3d = r * Math.sin(phi) * Math.cos(theta);
        p.y3d = r * Math.sin(phi) * Math.sin(theta);
        p.z3d = r * Math.cos(phi);
        p.baseSize3d = Math.random() * 2.5 + 1;
        p.targetOpacity = 0.5 + Math.random() * 0.4;
      } else if (i < bodyCount + ringCount) {
        // ---- 星环粒子：XZ 平面椭圆 ----
        p.saturnGroup = 'ring';
        const theta = Math.random() * Math.PI * 2;
        const ringR = R * (1.6 + Math.random() * 0.7);
        p.x3d = ringR * Math.cos(theta);
        p.y3d = 0;
        p.z3d = ringR * Math.sin(theta);
        p.baseSize3d = Math.random() * 1.5 + 0.5;
        p.targetOpacity = 0.3 + Math.random() * 0.4;
      } else {
        // ---- 自由漂浮粒子 ----
        p.saturnGroup = 'free';
        p.targetX = Math.random() * this.canvas.width;
        p.targetY = Math.random() * this.canvas.height;
        p.targetSize = Math.random() * 2 + 0.5;
        p.targetOpacity = p.baseOpacity * 0.6;
      }
    });
    this.ease = 0.06; // 较快聚合
  }

  // ========================================================
  //  外部 API：切换到第三面（BACKGROUND）
  // ========================================================
  setRoadmapScene() {
    this.prevState = this.state;
    this.state = STATE.BACKGROUND;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    this.particles.forEach(p => {
      p.saturnGroup = 'free';
      // 随机散布到全屏
      p.targetX = Math.random() * cw;
      p.targetY = Math.random() * ch;
      p.targetSize = Math.random() * 1.5 + 0.3;
      // 降低透明度，避免干扰前景文字
      p.targetOpacity = 0.08 + Math.random() * 0.2;
      // 赋予微小漂浮速度
      p.vx = (Math.random() - 0.5) * 0.2;
      p.vy = (Math.random() - 0.5) * 0.2;
    });
    this.ease = 0.04; // 较慢解体
  }

  // ========================================================
  //  内部：3D → 2D 透视投影（土星专用）
  // ========================================================
  _projectSaturn(p) {
    const cosY = Math.cos(this.saturnRotY);
    const sinY = Math.sin(this.saturnRotY);
    const cosX = Math.cos(this.saturnRotX);
    const sinX = Math.sin(this.saturnRotX);

    // 绕 Y 轴旋转
    const x1 = p.x3d * cosY - p.z3d * sinY;
    const z1 = p.x3d * sinY + p.z3d * cosY;
    // 绕 X 轴倾斜
    const y2 = p.y3d * cosX - z1 * sinX;
    const z2 = p.y3d * sinX + z1 * cosX;

    // 透视投影
    const fov = 800;
    const scale = fov / (fov + z2);

    return {
      sx: this.saturnCX + x1 * scale,
      sy: this.saturnCY + y2 * scale,
      scale,
      z: z2,
    };
  }

  // ========================================================
  //  内部：主渲染循环
  // ========================================================
  _loop() {
    this.time++;
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // ---- 土星持续旋转（仅 SATURN 状态） ----
    if (this.state === STATE.SATURN) {
      this.saturnRotY += 0.008;
    }

    // ---- 逐粒子更新 & 绘制 ----
    const ease = this.ease;
    this.particles.forEach(p => {
      const isSaturnBody = this.state === STATE.SATURN && p.saturnGroup !== 'free';

      if (isSaturnBody) {
        // ==========================================
        //  SATURN 模式：3D 投影 + Lerp 吸附
        // ==========================================
        const proj = this._projectSaturn(p);

        // Lerp 公式：x += (target - x) * ease
        // 当 ease=0.06 时，每帧消除 6% 的距离差
        // 粒子从任意位置平滑飞向土星表面坐标
        p.x += (proj.sx - p.x) * ease;
        p.y += (proj.sy - p.y) * ease;
        p.size += (p.baseSize3d * proj.scale - p.size) * ease;

        // 深度因子：远处粒子更暗，营造立体感
        const depth = 0.5 + proj.scale * 0.5;
        p.opacity += (p.targetOpacity * depth - p.opacity) * ease;
        p.opacity += Math.sin(this.time * p.twinkleSpeed + p.twinklePhase) * 0.02;

      } else {
        // ==========================================
        //  CHAOS / BACKGROUND 模式：Lerp + 自由漂浮
        // ==========================================

        // Lerp 到目标位置
        p.x += (p.targetX - p.x) * ease;
        p.y += (p.targetY - p.y) * ease;
        p.size += (p.targetSize - p.size) * ease;
        p.opacity += (p.targetOpacity - p.opacity) * ease;

        // 叠加自由漂浮速度
        p.x += p.vx;
        p.y += p.vy;

        // 边界循环（超出屏幕后从对面出现）
        if (p.x < -10) p.x = cw + 10;
        if (p.x > cw + 10) p.x = -10;
        if (p.y < -10) p.y = ch + 10;
        if (p.y > ch + 10) p.y = -10;

        // 闪烁
        p.opacity += Math.sin(this.time * p.twinkleSpeed + p.twinklePhase) * 0.02;
      }

      // 透明度钳制
      p.opacity = Math.max(0, Math.min(1, p.opacity));
      p.draw(ctx);
    });

    requestAnimationFrame(() => this._loop());
  }
}

// ============================================================
//  导出
// ============================================================
window.ParticleSystem = ParticleSystem;

// ============================================================
//  路线图树状分支渲染器（水平方向，左侧为根，向右分叉）
// ============================================================
class RoadmapRenderer {
  constructor() {
    this.canvas = document.getElementById('roadmapCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.roadmapData = null;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.nodes = [];
    this.connections = [];
    this.hoveredNode = null;
    this.animTime = 0;

    this.resize();
    this.setupEvents();
    this.animate();

    window.addEventListener('resize', () => {
      this.resize();
      if (this.roadmapData) this.calculateLayout();
    });
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight || 500;
  }

  getMouseWorldPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offsetX) / this.zoom,
      y: (e.clientY - rect.top - this.offsetY) / this.zoom,
    };
  }

  setupEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldZoom = this.zoom;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.2, Math.min(4, this.zoom * factor));
      const ratio = this.zoom / oldZoom;
      this.offsetX = mx - (mx - this.offsetX) * ratio;
      this.offsetY = my - (my - this.offsetY) * ratio;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - this.offsetX;
      this.dragStartY = e.clientY - this.offsetY;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;
      }
      const pos = this.getMouseWorldPos(e);
      this.hoveredNode = null;
      for (const node of this.nodes) {
        const dx = pos.x - node.x;
        const dy = pos.y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) {
          this.hoveredNode = node;
          break;
        }
      }
      this.canvas.style.cursor = this.hoveredNode ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });

    this.canvas.addEventListener('click', (e) => {
      if (this.isDragging) return;
      const pos = this.getMouseWorldPos(e);
      for (const node of this.nodes) {
        const dx = pos.x - node.x;
        const dy = pos.y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) {
          if (node.onClick) node.onClick();
          break;
        }
      }
    });

    document.getElementById('btnZoomIn')?.addEventListener('click', () => { this.zoom = Math.min(4, this.zoom * 1.2); });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => { this.zoom = Math.max(0.2, this.zoom * 0.8); });
    document.getElementById('btnResetView')?.addEventListener('click', () => { this.zoom = 1; this.offsetX = 0; this.offsetY = 0; });
  }

  setRoadmap(data) {
    this.roadmapData = data;
    this.calculateLayout();
  }

  clear() {
    this.roadmapData = null;
    this.nodes = [];
    this.connections = [];
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  calculateLayout() {
    if (!this.roadmapData?.stages) return;
    this.nodes = [];
    this.connections = [];

    const stages = this.roadmapData.stages;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const padX = 90;
    const padY = 60;
    const levelSpacing = Math.max(200, (w - 2 * padX) / (stages.length + 1));

    const root = {
      x: padX, y: h / 2, radius: 30,
      label: this.roadmapData.title || '学习路线',
      type: 'root', unlocked: true, completed: false,
    };
    this.nodes.push(root);

    let prev = root;

    stages.forEach((stage, si) => {
      const sx = padX + (si + 1) * levelSpacing;
      const tasks = stage.tasks || [];
      const taskCount = tasks.length;
      const taskGap = Math.min(60, (h - 2 * padY) / Math.max(taskCount, 1));
      const totalH = (taskCount - 1) * taskGap;
      const prevCompleted = si === 0 || stages[si - 1]?.completed;

      const stageNode = {
        x: sx, y: h / 2, radius: 26,
        label: stage.title || `阶段 ${si + 1}`,
        type: 'stage', stageIndex: si, stage,
        unlocked: prevCompleted,
        completed: stage.completed || false,
        onClick: () => window.app?.showStageDetail(si),
      };
      this.nodes.push(stageNode);
      this.connections.push({ from: prev, to: stageNode });

      tasks.forEach((task, ti) => {
        const ty = h / 2 - totalH / 2 + ti * taskGap;
        const tx = sx + levelSpacing * 0.38;
        const taskNode = {
          x: tx, y: ty, radius: 14,
          label: task.title || `任务 ${ti + 1}`,
          type: 'task', stageIndex: si, taskIndex: ti, task,
          unlocked: prevCompleted,
          completed: task.completed || false,
          onClick: () => window.app?.showStageDetail(si),
        };
        this.nodes.push(taskNode);
        this.connections.push({ from: stageNode, to: taskNode });
      });

      const quizY = h / 2 + totalH / 2 + 45;
      const quizX = sx + levelSpacing * 0.35;
      const allTasksDone = tasks.length > 0 && tasks.every(t => t.completed);
      const quizNode = {
        x: quizX, y: quizY, radius: 15,
        label: '✦ 测验',
        type: 'quiz', stageIndex: si,
        unlocked: prevCompleted && allTasksDone,
        completed: stage.completed || false,
        onClick: () => window.app?.showStageDetail(si),
      };
      this.nodes.push(quizNode);
      this.connections.push({ from: stageNode, to: quizNode, type: 'branch' });

      prev = quizNode;
    });
  }

  animate() {
    this.animTime++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.zoom, this.zoom);

    if (this.roadmapData?.stages) {
      this.drawConnections();
      this.drawNodes();
    }

    this.ctx.restore();
    requestAnimationFrame(() => this.animate());
  }

  drawConnections() {
    this.connections.forEach(conn => {
      const { from, to, type } = conn;
      const sx = from.x + from.radius;
      const sy = from.y;
      const ex = to.x - to.radius;
      const ey = to.y;

      this.ctx.beginPath();
      this.ctx.moveTo(sx, sy);

      const mx = (sx + ex) / 2;
      this.ctx.bezierCurveTo(mx, sy, mx, ey, ex, ey);

      const unlocked = to.unlocked;
      const isTrunk = type === 'trunk';

      this.ctx.strokeStyle = unlocked
        ? (isTrunk ? 'rgba(179, 102, 255, 0.4)' : 'rgba(179, 102, 255, 0.25)')
        : 'rgba(179, 102, 255, 0.06)';
      this.ctx.lineWidth = isTrunk ? 3 : 1.5;

      if (unlocked) {
        this.ctx.setLineDash([8, 5]);
        this.ctx.lineDashOffset = -this.animTime * 0.6;
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    });
  }

  drawNodes() {
    this.nodes.forEach(node => {
      const hovered = this.hoveredNode === node;
      const r = node.radius + (hovered ? 3 : 0);
      const pulse = node.unlocked ? 1 + Math.sin(this.animTime * 0.03 + (node.x || 0) * 0.01) * 0.06 : 1;

      if (node.unlocked) {
        const glow = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 2.8 * pulse);
        let glowColor;
        if (node.completed) glowColor = 'rgba(80, 255, 120, 0.12)';
        else if (node.type === 'quiz') glowColor = 'rgba(255, 215, 100, 0.15)';
        else glowColor = 'rgba(179, 102, 255, 0.15)';
        glow.addColorStop(0, glowColor);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, r * 2.8 * pulse, 0, Math.PI * 2);
        this.ctx.fill();
      }

      if (node.type !== 'task') {
        this.ctx.beginPath();
        this.ctx.ellipse(node.x, node.y, r * 1.7, r * 0.45, -0.3, 0, Math.PI * 2);
        this.ctx.strokeStyle = node.unlocked ? 'rgba(179, 102, 255, 0.12)' : 'rgba(179, 102, 255, 0.04)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      const grad = this.ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 0, node.x, node.y, r);
      if (node.completed) {
        grad.addColorStop(0, 'rgba(80, 255, 120, 0.9)');
        grad.addColorStop(1, 'rgba(40, 180, 80, 0.7)');
      } else if (node.type === 'quiz' && node.unlocked) {
        grad.addColorStop(0, 'rgba(255, 215, 100, 0.9)');
        grad.addColorStop(1, 'rgba(200, 150, 50, 0.7)');
      } else if (node.unlocked) {
        grad.addColorStop(0, 'rgba(212, 160, 255, 0.9)');
        grad.addColorStop(1, 'rgba(123, 47, 190, 0.7)');
      } else {
        grad.addColorStop(0, 'rgba(80, 80, 80, 0.4)');
        grad.addColorStop(1, 'rgba(40, 40, 40, 0.3)');
      }

      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = grad;
      this.ctx.fill();

      this.ctx.strokeStyle = hovered
        ? 'rgba(255, 255, 255, 0.5)'
        : (node.unlocked ? 'rgba(179, 102, 255, 0.3)' : 'rgba(100, 100, 100, 0.2)');
      this.ctx.lineWidth = hovered ? 2 : 1;
      this.ctx.stroke();

      this.ctx.fillStyle = node.unlocked ? '#fff' : 'rgba(255,255,255,0.25)';
      this.ctx.font = node.type === 'task' ? '11px "Noto Sans SC"' : (node.type === 'root' ? '13px "Noto Sans SC" bold' : '12px "Noto Sans SC"');
      this.ctx.textAlign = 'center';
      this.ctx.fillText(node.label, node.x, node.y + r + 18);

      if (!node.unlocked && node.type === 'stage') {
        this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText('🔒', node.x, node.y + 5);
      }
    });
  }
}

window.RoadmapRenderer = RoadmapRenderer;
