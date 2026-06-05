/**
 * 粒子系统引擎
 * 管理所有粒子动画：Hero星空、土星形态、路线图星星
 */

class Particle {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2.5 + 0.5;
    this.baseOpacity = Math.random() * 0.6 + 0.2;
    this.opacity = this.baseOpacity;
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.speedY = (Math.random() - 0.5) * 0.3;
    this.twinkleSpeed = Math.random() * 0.02 + 0.005;
    this.twinkleOffset = Math.random() * Math.PI * 2;

    // 目标位置（用于场景切换）
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetSize = this.size;
    this.targetOpacity = this.baseOpacity;
    this.lerpSpeed = 0.02;

    // 颜色
    const colors = [
      { r: 179, g: 102, b: 255 },  // 紫色
      { r: 212, g: 160, b: 255 },  // 浅紫
      { r: 123, g: 47, b: 190 },   // 深紫
      { r: 255, g: 255, b: 255 },  // 白色
      { r: 200, g: 180, b: 255 },  // 淡紫白
    ];
    const c = colors[Math.floor(Math.random() * colors.length)];
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;

    this.isSaturnBody = false;
    this.isSaturnRing = false;
    this.isStar = false;
  }

  update(time) {
    // 闪烁效果
    this.opacity = this.baseOpacity + Math.sin(time * this.twinkleSpeed + this.twinkleOffset) * 0.15;

    // 向目标位置移动
    this.x += (this.targetX - this.x) * this.lerpSpeed;
    this.y += (this.targetY - this.y) * this.lerpSpeed;
    this.size += (this.targetSize - this.size) * this.lerpSpeed;

    // 自由浮动（仅在非锁定状态下）
    if (!this.isSaturnBody && !this.isSaturnRing && !this.isStar) {
      this.x += this.speedX;
      this.y += this.speedY;

      // 边界循环
      if (this.x < -10) this.x = this.canvas.width + 10;
      if (this.x > this.canvas.width + 10) this.x = -10;
      if (this.y < -10) this.y = this.canvas.height + 10;
      if (this.y > this.canvas.height + 10) this.y = -10;
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.opacity})`;
    ctx.fill();

    // 发光效果
    if (this.size > 1.5) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.opacity * 0.15})`;
      ctx.fill();
    }
  }
}

class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particleCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 300;
    this.currentScene = 'hero'; // hero, dashboard, roadmap
    this.animationId = null;
    this.time = 0;

    this.resize();
    this.init();
    this.animate();

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  init() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(new Particle(this.canvas));
    }
  }

  // Hero场景：随机浮动
  setHeroScene() {
    this.currentScene = 'hero';
    this.particles.forEach(p => {
      p.isSaturnBody = false;
      p.isSaturnRing = false;
      p.isStar = false;
      p.targetX = Math.random() * this.canvas.width;
      p.targetY = Math.random() * this.canvas.height;
      p.targetSize = Math.random() * 2.5 + 0.5;
      p.targetOpacity = p.baseOpacity;
      p.lerpSpeed = 0.02;
    });
  }

  // Dashboard场景：形成土星
  setDashboardScene() {
    this.currentScene = 'dashboard';
    const cx = this.canvas.width * 0.25;
    const cy = this.canvas.height * 0.5;
    const bodyRadius = Math.min(this.canvas.width, this.canvas.height) * 0.12;
    const ringRadiusX = bodyRadius * 2.2;
    const ringRadiusY = bodyRadius * 0.6;

    const bodyParticles = Math.floor(this.particleCount * 0.45);
    const ringParticles = Math.floor(this.particleCount * 0.35);
    const freeParticles = this.particleCount - bodyParticles - ringParticles;

    this.particles.forEach((p, i) => {
      p.lerpSpeed = 0.025;
      if (i < bodyParticles) {
        // 土星本体
        p.isSaturnBody = true;
        p.isSaturnRing = false;
        p.isStar = false;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * bodyRadius;
        p.targetX = cx + Math.cos(angle) * dist;
        p.targetY = cy + Math.sin(angle) * dist;
        p.targetSize = Math.random() * 2 + 1;
        p.targetOpacity = 0.6 + Math.random() * 0.3;
      } else if (i < bodyParticles + ringParticles) {
        // 土星环
        p.isSaturnBody = false;
        p.isSaturnRing = true;
        p.isStar = false;
        const angle = Math.random() * Math.PI * 2;
        p.targetX = cx + Math.cos(angle) * ringRadiusX;
        p.targetY = cy + Math.sin(angle) * ringRadiusY;
        p.targetSize = Math.random() * 1.5 + 0.5;
        p.targetOpacity = 0.3 + Math.random() * 0.4;
      } else {
        // 自由粒子
        p.isSaturnBody = false;
        p.isSaturnRing = false;
        p.isStar = false;
        p.targetX = Math.random() * this.canvas.width;
        p.targetY = Math.random() * this.canvas.height;
        p.targetSize = Math.random() * 2 + 0.5;
        p.targetOpacity = p.baseOpacity;
      }
    });
  }

  // Roadmap场景：分散成小星星
  setRoadmapScene() {
    this.currentScene = 'roadmap';
    this.particles.forEach(p => {
      p.isSaturnBody = false;
      p.isSaturnRing = false;
      p.isStar = true;
      p.targetX = Math.random() * this.canvas.width;
      p.targetY = Math.random() * this.canvas.height;
      p.targetSize = Math.random() * 1.5 + 0.3;
      p.targetOpacity = 0.1 + Math.random() * 0.3;
      p.lerpSpeed = 0.02;
    });
  }

  animate() {
    this.time++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
      p.update(this.time);
      p.draw(this.ctx);
    });

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

// 土星画布（Dashboard专用）
class SaturnRenderer {
  constructor() {
    this.canvas = document.getElementById('saturnCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 400;
    this.time = 0;
    this.animId = null;
    this.visible = false; // 是否可见（由滚动控制）
    this.initialized = false;

    this.resize();
    // 不立即初始化，等可见时再初始化
    this.animate();

    window.addEventListener('resize', () => {
      this.resize();
      if (this.initialized) this.initSaturn();
    });
  }

  // 外部调用：标记为可见并开始初始化
  setVisible(v) {
    if (v && !this.initialized) {
      this.initialized = true;
      this.initSaturn();
    }
    this.visible = v;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height || 500;
  }

  initSaturn() {
    this.particles = [];
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const bodyR = Math.min(this.canvas.width, this.canvas.height) * 0.18;

    for (let i = 0; i < this.particleCount; i++) {
      const isBody = i < this.particleCount * 0.5;
      const isRing = !isBody && i < this.particleCount * 0.85;

      let targetX, targetY, size, opacity;

      if (isBody) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * bodyR;
        targetX = cx + Math.cos(angle) * dist;
        targetY = cy + Math.sin(angle) * dist;
        size = Math.random() * 2.5 + 1;
        opacity = 0.5 + Math.random() * 0.4;
      } else if (isRing) {
        const angle = Math.random() * Math.PI * 2;
        const ringR = bodyR * (1.8 + Math.random() * 0.6);
        const ringH = bodyR * (0.35 + Math.random() * 0.15);
        targetX = cx + Math.cos(angle) * ringR;
        targetY = cy + Math.sin(angle) * ringH;
        size = Math.random() * 1.5 + 0.5;
        opacity = 0.2 + Math.random() * 0.4;
      } else {
        targetX = Math.random() * this.canvas.width;
        targetY = Math.random() * this.canvas.height;
        size = Math.random() * 1.5 + 0.3;
        opacity = 0.1 + Math.random() * 0.2;
      }

      const colors = [
        { r: 179, g: 102, b: 255 },
        { r: 212, g: 160, b: 255 },
        { r: 123, g: 47, b: 190 },
        { r: 255, g: 255, b: 255 },
      ];
      const c = colors[Math.floor(Math.random() * colors.length)];

      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        targetX, targetY, size, opacity,
        r: c.r, g: c.g, b: c.b,
        twinkle: Math.random() * 0.02 + 0.005,
        offset: Math.random() * Math.PI * 2,
        isBody, isRing,
      });
    }
  }

  animate() {
    this.time++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 仅在可见且已初始化时绘制土星
    if (this.visible && this.initialized) {
      // 绘制轨道线（装饰）
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;
      const bodyR = Math.min(this.canvas.width, this.canvas.height) * 0.18;

      this.ctx.strokeStyle = 'rgba(179, 102, 255, 0.06)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, bodyR * 2.1, bodyR * 0.45, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy, bodyR * 1.8, bodyR * 0.35, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      this.particles.forEach(p => {
        p.x += (p.targetX - p.x) * 0.03;
        p.y += (p.targetY - p.y) * 0.03;

        const o = p.opacity + Math.sin(this.time * p.twinkle + p.offset) * 0.1;

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.max(0, o)})`;
        this.ctx.fill();

        if (p.size > 1.5 && p.isBody) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
          this.ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.max(0, o * 0.1)})`;
          this.ctx.fill();
        }
      });
    }

    this.animId = requestAnimationFrame(() => this.animate());
  }
}

// 路线图渲染器
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
    this.nodePositions = [];
    this.hoveredNode = null;
    this.animTime = 0;
    this.animId = null;

    this.resize();
    this.setupEvents();
    this.animate();

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight || 500;
  }

  setupEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.3, Math.min(3, this.zoom * delta));
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
      // 悬停检测
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - this.canvas.width / 2 - this.offsetX) / this.zoom;
      const my = (e.clientY - rect.top - this.canvas.height / 2 - this.offsetY) / this.zoom;
      this.hoveredNode = null;
      for (const node of this.nodePositions) {
        const dx = mx - node.x;
        const dy = my - node.y;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius + 5) {
          this.hoveredNode = node;
          break;
        }
      }
      this.canvas.style.cursor = this.hoveredNode ? 'pointer' : (this.isDragging ? 'grabbing' : 'grab');
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.hoveredNode && this.hoveredNode.onClick) {
        this.hoveredNode.onClick();
      }
    });

    // 缩放按钮
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      this.zoom = Math.min(3, this.zoom * 1.2);
    });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      this.zoom = Math.max(0.3, this.zoom * 0.8);
    });
    document.getElementById('btnResetView')?.addEventListener('click', () => {
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
    });
  }

  setRoadmap(data) {
    this.roadmapData = data;
    this.calculatePositions();
  }

  calculatePositions() {
    if (!this.roadmapData || !this.roadmapData.stages) return;
    this.nodePositions = [];
    const stages = this.roadmapData.stages;
    const centerX = 0;
    const centerY = 0;

    stages.forEach((stage, si) => {
      const angle = (si / stages.length) * Math.PI * 2 - Math.PI / 2;
      const dist = 120 + si * 80;
      const x = centerX + Math.cos(angle) * dist;
      const y = centerY + Math.sin(angle) * dist;
      const radius = 30 + (stage.tasks?.length || 0) * 3;

      this.nodePositions.push({
        x, y, radius,
        stage,
        stageIndex: si,
        label: stage.title || `阶段 ${si + 1}`,
        unlocked: si === 0 || (stages[si - 1]?.completed),
        completed: stage.completed || false,
        onClick: () => window.app?.showStageDetail(si),
      });

      // 子任务节点
      if (stage.tasks) {
        stage.tasks.forEach((task, ti) => {
          const tAngle = angle + (ti - (stage.tasks.length - 1) / 2) * 0.3;
          const tDist = dist + 50;
          const tx = centerX + Math.cos(tAngle) * tDist;
          const ty = centerY + Math.sin(tAngle) * tDist;

          this.nodePositions.push({
            x: tx, y: ty, radius: 12,
            task, stageIndex: si, taskIndex: ti,
            label: task.title || `任务 ${ti + 1}`,
            unlocked: si === 0 || stages[si - 1]?.completed,
            completed: task.completed || false,
            isTask: true,
            parentX: x, parentY: y,
          });
        });
      }
    });
  }

  animate() {
    this.animTime++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(
      this.canvas.width / 2 + this.offsetX,
      this.canvas.height / 2 + this.offsetY
    );
    this.ctx.scale(this.zoom, this.zoom);

    if (this.roadmapData && this.roadmapData.stages) {
      this.drawConnections();
      this.drawNodes();
    }

    this.ctx.restore();

    this.animId = requestAnimationFrame(() => this.animate());
  }

  drawConnections() {
    this.nodePositions.forEach(node => {
      if (node.isTask && node.parentX !== undefined) {
        this.ctx.beginPath();
        this.ctx.moveTo(node.parentX, node.parentY);
        this.ctx.lineTo(node.x, node.y);
        this.ctx.strokeStyle = node.unlocked
          ? 'rgba(179, 102, 255, 0.3)'
          : 'rgba(179, 102, 255, 0.08)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    });

    // 连接各阶段
    const stageNodes = this.nodePositions.filter(n => !n.isTask);
    for (let i = 0; i < stageNodes.length - 1; i++) {
      const a = stageNodes[i];
      const b = stageNodes[i + 1];
      if (a.completed) {
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.strokeStyle = 'rgba(179, 102, 255, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }
  }

  drawNodes() {
    this.nodePositions.forEach(node => {
      const isHovered = this.hoveredNode === node;
      const r = node.radius + (isHovered ? 4 : 0);

      // 轨道环
      if (!node.isTask) {
        this.ctx.beginPath();
        this.ctx.ellipse(node.x, node.y, r * 1.6, r * 0.4, -0.3, 0, Math.PI * 2);
        this.ctx.strokeStyle = node.unlocked
          ? 'rgba(179, 102, 255, 0.15)'
          : 'rgba(179, 102, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      // 发光
      if (node.unlocked) {
        const glow = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 2);
        glow.addColorStop(0, node.completed ? 'rgba(80, 255, 120, 0.1)' : 'rgba(179, 102, 255, 0.15)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, r * 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // 星球本体
      const grad = this.ctx.createRadialGradient(
        node.x - r * 0.3, node.y - r * 0.3, 0,
        node.x, node.y, r
      );
      if (node.completed) {
        grad.addColorStop(0, 'rgba(80, 255, 120, 0.8)');
        grad.addColorStop(1, 'rgba(40, 180, 80, 0.6)');
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

      // 边框
      this.ctx.strokeStyle = isHovered
        ? 'rgba(255, 255, 255, 0.5)'
        : (node.unlocked ? 'rgba(179, 102, 255, 0.3)' : 'rgba(100, 100, 100, 0.2)');
      this.ctx.lineWidth = isHovered ? 2 : 1;
      this.ctx.stroke();

      // 标签
      this.ctx.fillStyle = node.unlocked ? '#fff' : 'rgba(255,255,255,0.3)';
      this.ctx.font = node.isTask ? '10px "Noto Sans SC"' : '12px "Noto Sans SC"';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(node.label, node.x, node.y + r + 16);

      // 锁定图标
      if (!node.unlocked && !node.isTask) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        this.ctx.font = '16px sans-serif';
        this.ctx.fillText('🔒', node.x, node.y + 5);
      }
    });
  }
}

// 导出
window.ParticleSystem = ParticleSystem;
window.SaturnRenderer = SaturnRenderer;
window.RoadmapRenderer = RoadmapRenderer;
