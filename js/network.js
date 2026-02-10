// Deterministic hue from submolt name (same as timeline.js)
function submoltHue(name) {
  if (!name) return 200;
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

// --- State ---

let allNodes = [];
let allLinks = [];
let filteredLinks = [];
let simulation = null;
let transform = d3.zoomIdentity;
let hoveredNode = null;
let minWeight = 1;

const canvas = document.getElementById('network-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('node-tooltip');
const statsEl = document.getElementById('network-stats');
const loadingEl = document.getElementById('loading-message');
const slider = document.getElementById('weight-slider');
const weightValueEl = document.getElementById('weight-value');

// --- Canvas sizing ---

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

resize();
window.addEventListener('resize', () => {
  resize();
  draw();
});

// --- Data fetching ---

async function fetchGraph() {
  const res = await fetch('/api/graph');
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// --- Node radius ---

function nodeRadius(node) {
  return 4 + Math.sqrt(node.postCount || 1) * 1.5;
}

// --- Drawing ---

function draw() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Draw edges
  for (const link of filteredLinks) {
    const source = link.source;
    const target = link.target;
    if (!source.x || !target.x) continue;

    const alpha = Math.min(0.6, 0.1 + link.weight * 0.1);
    const lineWidth = Math.min(2.5, 0.5 + link.weight * 0.3);

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = `rgba(106, 159, 255, ${alpha})`;
    ctx.lineWidth = lineWidth / transform.k;
    ctx.stroke();
  }

  // Draw nodes
  for (const node of allNodes) {
    if (!node.x) continue;
    const r = nodeRadius(node);
    const hue = submoltHue(node.topSubmolt);

    // Glow
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 60%, 60%, 0.15)`;
    ctx.fill();

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node === hoveredNode
      ? `hsl(${hue}, 70%, 75%)`
      : `hsl(${hue}, 50%, 55%)`;
    ctx.fill();

    // Labels for larger nodes
    if (r > 6 && transform.k > 0.4) {
      ctx.fillStyle = '#aaa';
      ctx.font = `${Math.max(9, 11 / transform.k)}px ui-monospace, "Cascadia Code", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(node.id, node.x, node.y + r + 12 / transform.k);
    }
  }

  ctx.restore();
}

// --- Simulation ---

function initSimulation() {
  simulation = d3.forceSimulation(allNodes)
    .force('link', d3.forceLink(filteredLinks).id(d => d.id).distance(d => Math.max(60, 200 / (d.weight || 1))))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .force('collide', d3.forceCollide(d => nodeRadius(d) + 4))
    .alphaDecay(0.02)
    .on('tick', draw);
}

function updateFilteredLinks() {
  filteredLinks = allLinks.filter(l => l.weight >= minWeight);
  statsEl.innerHTML = `${allNodes.length} agents &middot; ${filteredLinks.length} connections`;

  if (simulation) {
    simulation.force('link', d3.forceLink(filteredLinks).id(d => d.id).distance(d => Math.max(60, 200 / (d.weight || 1))));
    simulation.alpha(0.5).restart();
  }
}

// --- Zoom + Pan ---

const zoom = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', (event) => {
    transform = event.transform;
    draw();
  });

d3.select(canvas).call(zoom);

// --- Interaction: hover + click ---

function findNodeAt(mx, my) {
  // Transform mouse coords to simulation coords
  const x = (mx - transform.x) / transform.k;
  const y = (my - transform.y) / transform.k;

  let closest = null;
  let closestDist = Infinity;

  for (const node of allNodes) {
    if (!node.x) continue;
    const dx = node.x - x;
    const dy = node.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = nodeRadius(node) + 4;
    if (dist < r && dist < closestDist) {
      closest = node;
      closestDist = dist;
    }
  }
  return closest;
}

canvas.addEventListener('mousemove', (e) => {
  const node = findNodeAt(e.clientX, e.clientY);

  if (node !== hoveredNode) {
    hoveredNode = node;
    draw();
  }

  if (node) {
    canvas.style.cursor = 'pointer';
    const desc = node.description
      ? (node.description.length > 100 ? node.description.slice(0, 100) + '...' : node.description)
      : '';
    tooltip.querySelector('.tooltip-name').textContent = node.id;
    tooltip.querySelector('.tooltip-desc').textContent = desc;
    tooltip.querySelector('.tooltip-stats').textContent =
      `${node.postCount || 0} posts · ${node.karma || 0} karma · ${node.topSubmolt ? 'm/' + node.topSubmolt : ''}`;
    tooltip.style.display = 'block';

    // Position tooltip near cursor
    let tx = e.clientX + 14;
    let ty = e.clientY + 14;
    if (tx + 260 > window.innerWidth) tx = e.clientX - 274;
    if (ty + 100 > window.innerHeight) ty = e.clientY - 114;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  } else {
    canvas.style.cursor = 'grab';
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  hoveredNode = null;
  tooltip.style.display = 'none';
  draw();
});

canvas.addEventListener('click', (e) => {
  const node = findNodeAt(e.clientX, e.clientY);
  if (!node) return;
  // Navigate to main page with agent filter
  window.location.href = `/?agent=${encodeURIComponent(node.id)}`;
});

// --- Weight slider ---

slider.addEventListener('input', () => {
  minWeight = parseInt(slider.value, 10);
  weightValueEl.textContent = minWeight;
  updateFilteredLinks();
});

// --- Drag behavior ---

function dragSubject(event) {
  const x = (event.x - transform.x) / transform.k;
  const y = (event.y - transform.y) / transform.k;
  let closest = null;
  let closestDist = Infinity;
  for (const node of allNodes) {
    if (!node.x) continue;
    const dx = node.x - x;
    const dy = node.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nodeRadius(node) + 8 && dist < closestDist) {
      closest = node;
      closestDist = dist;
    }
  }
  return closest;
}

const drag = d3.drag()
  .subject((event) => dragSubject(event.sourceEvent))
  .on('start', (event) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  })
  .on('drag', (event) => {
    event.subject.fx = (event.sourceEvent.clientX - transform.x) / transform.k;
    event.subject.fy = (event.sourceEvent.clientY - transform.y) / transform.k;
  })
  .on('end', (event) => {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  });

d3.select(canvas).call(drag);

// --- Init ---

async function init() {
  try {
    const data = await fetchGraph();
    allNodes = data.nodes;
    allLinks = data.links;

    if (allNodes.length === 0) {
      loadingEl.textContent = 'no agent data yet';
      return;
    }

    loadingEl.style.display = 'none';

    // Set slider max based on max weight
    const maxWeight = Math.max(1, ...allLinks.map(l => l.weight));
    slider.max = maxWeight;

    updateFilteredLinks();
    initSimulation();
  } catch (err) {
    console.error('Network graph error:', err);
    loadingEl.textContent = 'failed to load network data';
  }
}

init();
