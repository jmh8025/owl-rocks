(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const distanceText = document.getElementById("distanceText");
  const scoreText = document.getElementById("scoreText");
  const bestText = document.getElementById("bestText");
  const resultText = document.getElementById("resultText");
  const startOverlay = document.getElementById("startOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const skillButtons = [...document.querySelectorAll(".skill-slot")];

  const TAU = Math.PI * 2;
  const CONFIG = {
    baseFallSpeed: 360,
    maxFallSpeed: 860,
    spawnEvery: 0.92,
    minSpawnEvery: 0.38,
    playerRadius: 27,
    obstacleRadius: 25,
    wallMin: 70,
    wallMax: 132,
    inputEase: 13,
    startSeed: 74291
  };

  const palette = {
    skyTop: "#101722",
    skyMid: "#1f2b36",
    skyBottom: "#2b1f33",
    rockDark: "#17121a",
    rockMid: "#2b2730",
    rockEdge: "#534859",
    white: "#f8fbff",
    amber: "#ffd166",
    owlBrown: "#8d5a34",
    owlDark: "#442b22",
    mint: "#67e8c9",
    coral: "#ff6f61",
    blue: "#7aa7ff",
    violet: "#ad8cff"
  };

  const characterTypes = [
    { name: "ranger", body: "#ff6f61", trim: "#ffd166", shape: "cape" },
    { name: "pilot", body: "#67e8c9", trim: "#10232a", shape: "helmet" },
    { name: "guard", body: "#7aa7ff", trim: "#f8fbff", shape: "shield" },
    { name: "runner", body: "#ad8cff", trim: "#f7b267", shape: "scarf" }
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = performance.now();
  let bestScore = Number(localStorage.getItem("cliffOwlBest") || 0);

  const input = {
    active: false,
    x: 0,
    y: 0
  };

  const world = {
    phase: "ready",
    seed: CONFIG.startSeed,
    visualSeed: CONFIG.startSeed ^ 0x9e3779b9,
    elapsed: 0,
    distance: 0,
    score: 0,
    dodged: 0,
    fallSpeed: CONFIG.baseFallSpeed,
    spawnTimer: 0,
    spawnIndex: 0,
    shake: 0,
    flash: 0,
    scroll: 0,
    wind: [],
    particles: [],
    obstacles: []
  };

  const player = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    radius: CONFIG.playerRadius,
    tilt: 0,
    wingPhase: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function seededRandom() {
    world.seed = (world.seed * 1664525 + 1013904223) >>> 0;
    return world.seed / 4294967296;
  }

  function visualRandom() {
    world.visualSeed = (world.visualSeed * 1103515245 + 12345) >>> 0;
    return world.visualSeed / 4294967296;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const startX = width * 0.5;
    const startY = height * 0.47;
    player.x = player.x || startX;
    player.y = player.y || startY;
    player.targetX = input.active ? input.x : startX;
    player.targetY = input.active ? input.y : startY;
    input.x = input.x || startX;
    input.y = input.y || startY;
  }

  function canyonBounds(y = height * 0.5) {
    const wave = Math.sin((y + world.scroll * 0.16) * 0.004) * 18;
    const wall = clamp(width * 0.12, CONFIG.wallMin, CONFIG.wallMax);
    return {
      left: wall + wave,
      right: width - wall + wave * 0.35
    };
  }

  function resetGame() {
    world.phase = "playing";
    world.seed = CONFIG.startSeed + Math.floor(performance.now()) % 100000;
    world.visualSeed = world.seed ^ 0x9e3779b9;
    world.elapsed = 0;
    world.distance = 0;
    world.score = 0;
    world.dodged = 0;
    world.fallSpeed = CONFIG.baseFallSpeed;
    world.spawnTimer = 0.45;
    world.spawnIndex = 0;
    world.shake = 0;
    world.flash = 0;
    world.scroll = 0;
    world.particles = [];
    world.obstacles = [];
    world.wind = createWind();

    const bounds = canyonBounds();
    player.x = width * 0.5;
    player.y = height * 0.47;
    player.targetX = player.x;
    player.targetY = player.y;
    input.x = player.x;
    input.y = player.y;
    player.radius = clamp(width * 0.035, 22, 31);
    player.wingPhase = 0;
    player.tilt = 0;
    player.x = clamp(player.x, bounds.left + player.radius, bounds.right - player.radius);

    startOverlay.classList.remove("is-visible");
    gameOverOverlay.classList.remove("is-visible");
    updateHud();
  }

  function createWind() {
    return Array.from({ length: 54 }, () => ({
      x: visualRandom() * width,
      y: visualRandom() * height,
      length: 32 + visualRandom() * 86,
      speed: 0.35 + visualRandom() * 1.2,
      alpha: 0.12 + visualRandom() * 0.32
    }));
  }

  function spawnObstacle() {
    const bounds = canyonBounds(height + 80);
    const type = characterTypes[world.spawnIndex % characterTypes.length];
    const radius = clamp(CONFIG.obstacleRadius + seededRandom() * 10, 23, 37);
    const x = bounds.left + radius + seededRandom() * Math.max(1, bounds.right - bounds.left - radius * 2);
    const drift = (seededRandom() - 0.5) * (50 + world.elapsed * 3);
    const bob = seededRandom() * TAU;

    world.obstacles.push({
      id: world.spawnIndex++,
      type,
      x,
      y: height + radius + 36,
      radius,
      speed: world.fallSpeed * (0.86 + seededRandom() * 0.34),
      drift,
      bob,
      rotation: (seededRandom() - 0.5) * 0.9,
      dodged: false
    });
  }

  function update(dt) {
    if (world.phase !== "playing") {
      animateIdle(dt);
      return;
    }

    world.elapsed += dt;
    world.fallSpeed = clamp(CONFIG.baseFallSpeed + world.elapsed * 13, CONFIG.baseFallSpeed, CONFIG.maxFallSpeed);
    world.distance += (world.fallSpeed * dt) / 9;
    world.score = Math.floor(world.distance + world.dodged * 35);
    world.scroll += world.fallSpeed * dt;
    world.spawnTimer -= dt;
    world.shake = Math.max(0, world.shake - dt * 18);
    world.flash = Math.max(0, world.flash - dt * 3.6);

    const spawnEvery = Math.max(CONFIG.minSpawnEvery, CONFIG.spawnEvery - world.elapsed * 0.012);
    if (world.spawnTimer <= 0) {
      spawnObstacle();
      world.spawnTimer = spawnEvery * (0.75 + seededRandom() * 0.55);
    }

    updatePlayer(dt);
    updateObstacles(dt);
    updateParticles(dt);
    updateHud();
  }

  function animateIdle(dt) {
    world.scroll += 120 * dt;
    player.wingPhase += dt * 4;
    updateParticles(dt);
  }

  function updatePlayer(dt) {
    const bounds = canyonBounds(player.y);
    const ease = 1 - Math.exp(-CONFIG.inputEase * dt);
    const pointerX = input.active ? input.x : player.targetX;
    const pointerY = input.active ? input.y : player.targetY;

    player.targetX = clamp(pointerX, bounds.left + player.radius, bounds.right - player.radius);
    player.targetY = clamp(pointerY, height * 0.22, height * 0.78);

    const previousX = player.x;
    player.x = lerp(player.x, player.targetX, ease);
    player.y = lerp(player.y, player.targetY, ease * 0.76);
    player.tilt = clamp((player.x - previousX) * 0.04, -0.55, 0.55);
    player.wingPhase += dt * (8 + world.fallSpeed * 0.012);
  }

  function updateObstacles(dt) {
    for (const obstacle of world.obstacles) {
      obstacle.bob += dt * 4.2;
      obstacle.y -= obstacle.speed * dt;
      obstacle.x += Math.sin(obstacle.bob) * obstacle.drift * dt;
      obstacle.rotation += Math.sin(obstacle.bob * 0.7) * dt * 0.9;

      const bounds = canyonBounds(obstacle.y);
      obstacle.x = clamp(obstacle.x, bounds.left + obstacle.radius, bounds.right - obstacle.radius);

      if (!obstacle.dodged && obstacle.y + obstacle.radius < player.y - player.radius) {
        obstacle.dodged = true;
        world.dodged += 1;
        burst(player.x, player.y + player.radius * 0.9, palette.mint, 3);
      }

      const dx = obstacle.x - player.x;
      const dy = obstacle.y - player.y;
      const hitDistance = obstacle.radius + player.radius * 0.78;
      if (dx * dx + dy * dy < hitDistance * hitDistance) {
        endGame();
        return;
      }
    }

    world.obstacles = world.obstacles.filter((obstacle) => obstacle.y + obstacle.radius > -80);
  }

  function updateParticles(dt) {
    for (const particle of world.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 80 * dt;
      particle.rotation += particle.spin * dt;
    }
    world.particles = world.particles.filter((particle) => particle.life > 0);
  }

  function burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i += 1) {
      const angle = visualRandom() * TAU;
      const speed = 80 + visualRandom() * 180;
      world.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 3 + visualRandom() * 5,
        color,
        life: 0.45 + visualRandom() * 0.4,
        rotation: visualRandom() * TAU,
        spin: (visualRandom() - 0.5) * 7
      });
    }
  }

  function endGame() {
    world.phase = "gameover";
    world.shake = 1;
    world.flash = 1;
    burst(player.x, player.y, palette.coral, 28);
    bestScore = Math.max(bestScore, world.score);
    localStorage.setItem("cliffOwlBest", String(bestScore));
    resultText.textContent = `${Math.floor(world.distance)}m / ${world.score}`;
    gameOverOverlay.classList.add("is-visible");
    updateHud();
  }

  function updateHud() {
    distanceText.textContent = `${Math.floor(world.distance)}m`;
    scoreText.textContent = String(world.score);
    bestText.textContent = String(bestScore);
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (world.shake > 0) {
      const power = world.shake * 10;
      ctx.translate((visualRandom() - 0.5) * power, (visualRandom() - 0.5) * power);
    }

    drawCanyon();
    drawWind();
    drawDepthMarkers();

    for (const obstacle of world.obstacles) {
      drawCharacter(obstacle);
    }

    drawParticles();
    drawOwl();
    drawVignette();

    if (world.flash > 0) {
      ctx.fillStyle = `rgba(255, 111, 97, ${world.flash * 0.22})`;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }

  function drawCanyon() {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, palette.skyTop);
    bg.addColorStop(0.48, palette.skyMid);
    bg.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const leftPath = new Path2D();
    const rightPath = new Path2D();
    leftPath.moveTo(0, 0);
    rightPath.moveTo(width, 0);

    const step = 54;
    for (let y = -step; y <= height + step; y += step) {
      const wave = Math.sin((y + world.scroll * 0.16) * 0.004) * 18;
      const jag = Math.sin((y + world.scroll * 0.3) * 0.021) * 15;
      const wall = clamp(width * 0.12, CONFIG.wallMin, CONFIG.wallMax);
      leftPath.lineTo(wall + wave + jag, y);
      rightPath.lineTo(width - wall + wave * 0.35 - jag * 0.8, y);
    }

    leftPath.lineTo(0, height);
    leftPath.closePath();
    rightPath.lineTo(width, height);
    rightPath.closePath();

    const rock = ctx.createLinearGradient(0, 0, width, 0);
    rock.addColorStop(0, palette.rockDark);
    rock.addColorStop(0.22, palette.rockMid);
    rock.addColorStop(0.5, "#100f16");
    rock.addColorStop(0.78, palette.rockMid);
    rock.addColorStop(1, palette.rockDark);
    ctx.fillStyle = rock;
    ctx.fill(leftPath);
    ctx.fill(rightPath);

    drawRockLines("left");
    drawRockLines("right");
  }

  function drawRockLines(side) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 2;

    const wall = clamp(width * 0.12, CONFIG.wallMin, CONFIG.wallMax);
    const baseX = side === "left" ? wall * 0.42 : width - wall * 0.42;
    const direction = side === "left" ? 1 : -1;
    const offset = world.scroll % 130;

    for (let y = -150; y < height + 170; y += 130) {
      const lineY = y + offset;
      ctx.beginPath();
      ctx.moveTo(baseX - direction * 80, lineY);
      ctx.lineTo(baseX + direction * (30 + Math.sin(lineY * 0.02) * 22), lineY + 56);
      ctx.lineTo(baseX - direction * 45, lineY + 112);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 209, 102, 0.12)";
    ctx.lineWidth = 3;
    for (let y = -90; y < height + 100; y += 220) {
      const lineY = y + (world.scroll * 0.68) % 220;
      ctx.beginPath();
      ctx.moveTo(baseX - direction * 10, lineY);
      ctx.lineTo(baseX + direction * 42, lineY + 84);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawWind() {
    ctx.save();
    ctx.lineCap = "round";
    for (const line of world.wind) {
      line.y -= world.fallSpeed * 0.9 * line.speed * (1 / 60);
      if (line.y < -line.length) {
        line.y = height + line.length;
        line.x = visualRandom() * width;
      }

      const bounds = canyonBounds(line.y);
      const x = clamp(line.x, bounds.left + 22, bounds.right - 22);
      ctx.strokeStyle = `rgba(248, 251, 255, ${line.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, line.y);
      ctx.lineTo(x - 9, line.y + line.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDepthMarkers() {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = palette.mint;
    ctx.lineWidth = 2;
    const gap = 190;
    const offset = world.scroll % gap;
    for (let y = -gap; y < height + gap; y += gap) {
      const markerY = y + offset;
      const bounds = canyonBounds(markerY);
      ctx.beginPath();
      ctx.moveTo(bounds.left + 18, markerY);
      ctx.lineTo(bounds.left + 42, markerY + 12);
      ctx.moveTo(bounds.right - 18, markerY);
      ctx.lineTo(bounds.right - 42, markerY + 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOwl() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt);

    const flap = Math.sin(player.wingPhase);
    const r = player.radius;

    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, r * 1.12, r * 0.95, r * 0.28, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = palette.owlDark;
    ctx.beginPath();
    ctx.ellipse(-r * 0.78, 2 + flap * 3, r * 0.55, r * 1.05, -0.65 - flap * 0.18, 0, TAU);
    ctx.ellipse(r * 0.78, 2 - flap * 3, r * 0.55, r * 1.05, 0.65 + flap * 0.18, 0, TAU);
    ctx.fill();

    ctx.fillStyle = palette.owlBrown;
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.98, -r * 1.05, -r * 0.28, -r * 0.76);
    ctx.quadraticCurveTo(0, -r * 1.18, r * 0.28, -r * 0.76);
    ctx.quadraticCurveTo(r * 0.98, -r * 1.05, r * 0.72, -r * 0.2);
    ctx.quadraticCurveTo(r * 0.55, r * 0.9, 0, r * 1.04);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.9, -r * 0.72, -r * 0.2);
    ctx.fill();

    ctx.fillStyle = "#f4d59f";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.18, r * 0.48, r * 0.62, 0, 0, TAU);
    ctx.fill();

    drawEye(-r * 0.28, -r * 0.23, r);
    drawEye(r * 0.28, -r * 0.23, r);

    ctx.fillStyle = palette.amber;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.03);
    ctx.lineTo(-r * 0.13, r * 0.18);
    ctx.lineTo(r * 0.13, r * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEye(x, y, r) {
    ctx.fillStyle = palette.white;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.21, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#151923";
    ctx.beginPath();
    ctx.arc(x + player.tilt * 4, y + r * 0.03, r * 0.1, 0, TAU);
    ctx.fill();
  }

  function drawCharacter(obstacle) {
    const { type, radius: r } = obstacle;
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(obstacle.rotation);

    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * 0.92, r * 0.22, 0, 0, TAU);
    ctx.fill();

    if (type.shape === "cape") {
      ctx.fillStyle = "rgba(255, 209, 102, 0.55)";
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -r * 0.1);
      ctx.lineTo(-r * 1.04, r * 0.78);
      ctx.lineTo(r * 0.1, r * 0.56);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = type.body;
    roundRect(-r * 0.45, -r * 0.12, r * 0.9, r * 1.05, r * 0.22);
    ctx.fill();

    ctx.fillStyle = type.trim;
    ctx.beginPath();
    ctx.arc(0, -r * 0.48, r * 0.42, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#101722";
    ctx.beginPath();
    ctx.arc(-r * 0.14, -r * 0.5, r * 0.055, 0, TAU);
    ctx.arc(r * 0.14, -r * 0.5, r * 0.055, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = type.trim;
    ctx.lineWidth = Math.max(3, r * 0.11);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, r * 0.18);
    ctx.lineTo(-r * 0.86, r * 0.45);
    ctx.moveTo(r * 0.4, r * 0.18);
    ctx.lineTo(r * 0.82, r * 0.42);
    ctx.moveTo(-r * 0.18, r * 0.86);
    ctx.lineTo(-r * 0.42, r * 1.18);
    ctx.moveTo(r * 0.18, r * 0.86);
    ctx.lineTo(r * 0.44, r * 1.16);
    ctx.stroke();

    if (type.shape === "shield") {
      ctx.fillStyle = "rgba(248, 251, 255, 0.72)";
      ctx.beginPath();
      ctx.arc(r * 0.78, r * 0.18, r * 0.28, 0, TAU);
      ctx.fill();
    } else if (type.shape === "helmet") {
      ctx.strokeStyle = "rgba(16, 35, 42, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -r * 0.48, r * 0.48, Math.PI * 0.1, Math.PI * 0.9, true);
      ctx.stroke();
    } else if (type.shape === "scarf") {
      ctx.fillStyle = palette.amber;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.12);
      ctx.lineTo(r * 0.86, r * 0.08);
      ctx.lineTo(r * 0.18, r * 0.18);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawParticles() {
    ctx.save();
    for (const particle of world.particles) {
      const alpha = clamp(particle.life / 0.85, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.restore();
  }

  function drawVignette() {
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.48, height * 0.1, width * 0.5, height * 0.48, height * 0.78);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.7, "rgba(0, 0, 0, 0.08)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function gameLoop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
  }

  function setPointer(clientX, clientY) {
    input.active = true;
    input.x = clientX;
    input.y = clientY;
  }

  function activateSkill(key) {
    const button = skillButtons.find((slot) => slot.dataset.key === key);
    if (!button) return;
    button.classList.remove("is-pulsing");
    void button.offsetWidth;
    button.classList.add("is-pulsing");

    if (world.phase === "playing") {
      world.flash = Math.max(world.flash, 0.08);
      burst(player.x, player.y, palette.blue, 5);
    }
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => setPointer(event.clientX, event.clientY), { passive: true });
  window.addEventListener("pointerdown", (event) => {
    setPointer(event.clientX, event.clientY);
    if (world.phase === "ready") resetGame();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toUpperCase();
    if (key === " " && world.phase !== "playing") {
      resetGame();
      return;
    }
    if (["Q", "W", "E", "R"].includes(key)) {
      activateSkill(key);
    }
  });

  for (const button of skillButtons) {
    button.addEventListener("click", () => activateSkill(button.dataset.key));
  }

  startButton.addEventListener("click", resetGame);
  restartButton.addEventListener("click", resetGame);

  resize();
  world.wind = createWind();
  updateHud();
  requestAnimationFrame((now) => {
    lastTime = now;
    requestAnimationFrame(gameLoop);
  });
})();
