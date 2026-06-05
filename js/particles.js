/**
 * 粒子系统引擎
 * 管理所有粒子动画：Hero星空、3D土星（由粒子过渡形成）、树状路线图
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

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetSize = this.size;
    this.targetOpacity = this.baseOpacity;
    this.lerpSpeed = 0.02;

    // 3D properties for Saturn
    this.x3d = 0;
    this.y3d = 0;
    this.z3d = 0;
    this.baseSize3d = this.size;
    this.saturnGroup = 'free'; // 'body' | 'ring' | 'free'

    const colors = [
      { r: 179, g: 102, b: 255 },
      { r: 212, g: 160, b: 255 },
      { r: 123, g: 47, b: 190 },
      { r: 255, g: 255, b: 255 },
      { r: 200, g: 180, b: 255 },
    ];
    const c = colors[Math.floor(Math.random() * colors.length)];
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0.2, this.size), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.opacity})`;
    ctx.fill();

    if (this.size > 1.5) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.opacity * 0.12})`;
      ctx.fill();
    }
  }
}

class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particleCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 500;
    this.currentScene = 'hero';
    this.animationId = null;
    this.time = 0;

    // Saturn 3D rotation state
    this.saturnRotY = 0;
    this.saturnRotX = 0.35;
    this.saturnCX = 0;
    this.saturnCY = 0;
    this.saturnR = 0;

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

  // ---- Scene transitions ----

  setHeroScene() {
    this.currentScene = 'hero';
    this.particles.forEach(p => {
      p.saturnGroup = 'free';
      p.targetX = Math.random() * this.canvas.width;
      p.targetY = Math.random() * this.canvas.height;
      p.targetSize = Math.random() * 2.5 + 0.5;
      p.targetOpacity = p.baseOpacity;
      p.lerpSpeed = 0.02;
    });
  }

  // Particles transition FROM hero TO Saturn formation
  setDashboardScene() {
    this.currentScene = 'dashboard';
    const cx = this.canvas.width * 0.25;
    const cy = this.canvas.height * 0.5;
    const R = Math.min(this.canvas.width, this.canvas.height) * 0.18;

    this.saturnCX = cx;
    this.saturnCY = cy;
    this.saturnR = R;

    const bodyCount = Math.floor(this.particleCount * 0.45);
    const ringCount = Math.floor(this.particleCount * 0.35);

    this.particles.forEach((p, i) => {
      p.lerpSpeed = 0.06; // faster lerp for smooth transition

      if (i < bodyCount) {
        // Saturn body: spherical distribution
        p.saturnGroup = 'body';
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.5) * R;
        p.x3d = r * Math.sin(phi) * Math.cos(theta);
        p.y3d = r * Math.sin(phi) * Math.sin(theta);
        p.z3d = r * Math.cos(phi);
        p.baseSize3d = Math.random() * 2.5 + 1;
        p.targetOpacity = 0.5 + Math.random() * 0.4;
      } else if (i < bodyCount + ringCount) {
        // Saturn ring: elliptical ring in XZ plane
        p.saturnGroup = 'ring';
        const theta = Math.random() * Math.PI * 2;
        const ringR = R * (1.6 + Math.random() * 0.7);
        p.x3d = ringR * Math.cos(theta);
        p.y3d = 0;
        p.z3d = ringR * Math.sin(theta);
        p.baseSize3d = Math.random() * 1.5 + 0.5;
        p.targetOpacity = 0.3 + Math.random() * 0.4;
      } else {
        // Free-floating ambient particles
        p.saturnGroup = 'free';
        p.targetX = Math.random() * this.canvas.width;
        p.targetY = Math.random() * this.canvas.height;
        p.targetSize = Math.random() * 2 + 0.5;
        p.targetOpacity = p.baseOpacity * 0.6;
      }
    });
  }

  setRoadmapScene() {
    this.currentScene = 'roadmap';
    this.particles.forEach(p => {
      p.saturnGroup = 'free';
      p.targetX = Math.random() * this.canvas.width;
      p.targetY = Math.random() * this.canvas.height;
      p.targetSize = Math.random() * 1.5 + 0.3;
      p.targetOpacity = 0.1 + Math.random() * 0.3;
      p.lerpSpeed = 0.02;
    });
  }

  // ---- 3D projection ----

  projectSaturn(p) {
    const cosY = Math.cos(this.saturnRotY);
    const sinY = Math.sin(this.saturnRotY);
    const cosX = Math.cos(this.saturnRotX);
    const sinX = Math.sin(this.saturnRotX);

    // Rotate around Y axis
    let x = p.x3d * cosY - p.z3d * sinY;
    let z = p.x3d * sinY + p.z3d * cosY;
    let y = p.y3d;

    // Tilt around X axis
    let y2 = y * cosX - z * sinX;
    let z2 = y * sinX + z * cosX;

    // Perspective projection
    const fov = 800;
    const scale = fov / (fov + z2);

    return {
      sx: this.saturnCX + x * scale,
      sy: this.saturnCY + y2 * scale,
      scale,
      z: z2,
    };
  }

  // ---- Main animation loop ----

  animate() {
    this.time++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Continuous Saturn rotation
    if (this.currentScene === 'dashboard') {
      this.saturnRotY += 0.008;
    }

    this.particles.forEach(p => {
      if (this.currentScene === 'dashboard' && p.saturnGroup !== 'free') {
        // Saturn particles: project 3D → 2D, lerp to projected position
        const proj = this.projectSaturn(p);
        p.x += (proj.sx - p.x) * p.lerpSpeed;
        p.y += (proj.sy - p.y) * p.lerpSpeed;
        p.size += (p.baseSize3d * proj.scale - p.size) * p.lerpSpeed;

        const depthFactor = 0.5 + proj.scale * 0.5;
        p.opacity += (p.targetOpacity * depthFactor - p.opacity) * p.lerpSpeed;
        p.opacity += Math.sin(this.time * p.twinkleSpeed + p.twinkleOffset) * 0.03;
      } else {
        // Regular particles: lerp to target + free float
        p.x += (p.targetX - p.x) * p.lerpSpeed;
        p.y += (p.targetY - p.y) * p.lerpSpeed;
        p.size += (p.targetSize - p.size) * p.lerpSpeed;
        p.opacity += (p.targetOpacity - p.opacity) * p.lerpSpeed;

        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < -10) p.x = this.canvas.width + 10;
        if (p.x > this.canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = this.canvas.height + 10;
        if (p.y > this.canvas.height + 10) p.y = -10;

        p.opacity += Math.sin(this.time * p.twinkleSpeed + p.twinkleOffset) * 0.03;
      }

      p.opacity = Math.max(0, Math.min(1, p.opacity));
      p.draw(this.ctx);
    });

    this.animationId = requestAnimationFrame(() => this.animate());
  }
}

// ========================================================
// 路线图树状分支渲染器（水平方向，左侧为根，向右分叉）
// ========================================================
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
    // Zoom (toward mouse cursor)
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

    // Pan
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
      // Hover detection
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

    // Click
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

    // Button controls
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

  // ---- Tree layout calculation ----
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

    // Root node (far left)
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

      // Stage node (center Y)
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

      // Task nodes branching vertically from stage
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

      // Quiz node (gate to next chapter)
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

      // Next chapter connects FROM quiz node (gate)
      prev = quizNode;
    });
  }

  // ---- Render loop ----
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

      // Outer glow
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

      // Orbit ring for stage/root nodes
      if (node.type !== 'task') {
        this.ctx.beginPath();
        this.ctx.ellipse(node.x, node.y, r * 1.7, r * 0.45, -0.3, 0, Math.PI * 2);
        this.ctx.strokeStyle = node.unlocked ? 'rgba(179, 102, 255, 0.12)' : 'rgba(179, 102, 255, 0.04)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      // Node body gradient
      const grad = this.ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, 0, node.x, node.y, r);
      if (node.completed) {
        grad.addColorStop(0, 'rgba(80, 255, 120, 0.9)');
        grad.addColorStop(1, 'rgba(40, 180, 80, 0.7)');
      } else if (node.type === 'quiz' && node.unlocked) {
        // Quiz: gold color
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

      // Border
      this.ctx.strokeStyle = hovered
        ? 'rgba(255, 255, 255, 0.5)'
        : (node.unlocked ? 'rgba(179, 102, 255, 0.3)' : 'rgba(100, 100, 100, 0.2)');
      this.ctx.lineWidth = hovered ? 2 : 1;
      this.ctx.stroke();

      // Label
      this.ctx.fillStyle = node.unlocked ? '#fff' : 'rgba(255,255,255,0.25)';
      this.ctx.font = node.type === 'task' ? '11px "Noto Sans SC"' : (node.type === 'root' ? '13px "Noto Sans SC" bold' : '12px "Noto Sans SC"');
      this.ctx.textAlign = 'center';
      this.ctx.fillText(node.label, node.x, node.y + r + 18);

      // Lock icon
      if (!node.unlocked && node.type === 'stage') {
        this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText('🔒', node.x, node.y + 5);
      }
    });
  }
}

window.ParticleSystem = ParticleSystem;
window.RoadmapRenderer = RoadmapRenderer;
