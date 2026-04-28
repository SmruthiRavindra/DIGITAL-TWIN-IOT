/**
 * script.js — Digital Twin AI Failure Predictor
 * Live-polling, chart updates, and digital twin state management.
 */

// ─── Configuration ─────────────────────────────────────────
const API_BASE = "http://localhost:8000";
const POLL_INTERVAL = 1800; // ms between polls

// ─── State ─────────────────────────────────────────────────
let isPaused = false;
let pollTimer = null;
let cycle = 0;

// Chart data buffers
const MAX_POINTS = 60;
const rulHistory = [];
const sensorHistory = {
  sensor_2: [],
  sensor_4: [],
  sensor_9: [],
  sensor_12: [],
};
const labels = [];

// ─── Chart Setup ───────────────────────────────────────────
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      labels: { color: "#5a6a8a", font: { family: "'Inter', sans-serif", size: 10 } },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.03)" },
      ticks: { color: "#5a6a8a", font: { size: 9 }, maxTicksLimit: 10 },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.03)" },
      ticks: { color: "#5a6a8a", font: { size: 9 } },
    },
  },
};

// RUL Chart
const rulCtx = document.getElementById("rul-chart").getContext("2d");
const rulChart = new Chart(rulCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "RUL (cycles)",
        data: [],
        borderColor: "#00f0ff",
        backgroundColor: "rgba(0,240,255,0.08)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "Warning Threshold",
        data: [],
        borderColor: "rgba(255,159,67,0.5)",
        borderDash: [6, 4],
        pointRadius: 0,
        borderWidth: 1,
        fill: false,
      },
      {
        label: "Critical Threshold",
        data: [],
        borderColor: "rgba(255,51,102,0.5)",
        borderDash: [6, 4],
        pointRadius: 0,
        borderWidth: 1,
        fill: false,
      },
    ],
  },
  options: { ...chartDefaults },
});

// Sensor Chart
const sensorCtx = document.getElementById("sensor-chart").getContext("2d");
const sensorChart = new Chart(sensorCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "LPC Temp (°R)",
        data: [],
        borderColor: "#00f0ff",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
      },
      {
        label: "Core Speed (rpm)",
        data: [],
        borderColor: "#a855f7",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
      },
      {
        label: "Phys Core (rpm)",
        data: [],
        borderColor: "#00ff88",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
      },
      {
        label: "Fuel Flow (pps)",
        data: [],
        borderColor: "#ff9f43",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
      },
    ],
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: { ...chartDefaults.scales.y, display: false },
    },
  },
});

// ─── Polling ───────────────────────────────────────────────
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchData, POLL_INTERVAL);
  fetchData(); // immediate first call
}

async function fetchData() {
  if (isPaused) return;

  try {
    const res = await fetch(`${API_BASE}/sensor-data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateDashboard(data);
  } catch (err) {
    // Backend not running — use local simulation
    const data = simulateLocal();
    updateDashboard(data);
  }
}

// ─── Local Simulation (when backend is offline) ────────────
function simulateLocal() {
  cycle++;
  const degradation = Math.min(1, cycle * 0.003);
  const noise = () => (Math.random() - 0.5) * 2;

  const sensors = {
    sensor_2: +(641.82 + degradation * 4.5 + noise() * 0.3).toFixed(2),
    sensor_3: +(1589.7 + degradation * 18 + noise() * 1.2).toFixed(2),
    sensor_4: +(1400.6 + degradation * 25 + noise() * 2).toFixed(2),
    sensor_7: +(553.75 + degradation * 8 + noise() * 0.5).toFixed(2),
    sensor_8: +(2388.1 - degradation * 1.5 + noise() * 0.1).toFixed(2),
    sensor_9: +(9046.2 + degradation * 15 + noise() * 3).toFixed(2),
    sensor_11: +(47.47 + degradation * 1.2 + noise() * 0.1).toFixed(2),
    sensor_12: +(521.66 + degradation * 3.5 + noise() * 0.4).toFixed(2),
    sensor_15: +(8.44 + degradation * 0.5 + noise() * 0.05).toFixed(2),
  };

  const rul = Math.max(0, 200 * (1 - degradation) + noise() * 5);
  let status, severity, confidence;

  if (rul > 120) { status = "NOMINAL"; severity = "low"; confidence = 0.92; }
  else if (rul > 60) { status = "WATCH"; severity = "medium"; confidence = 0.87; }
  else if (rul > 20) { status = "WARNING"; severity = "high"; confidence = 0.83; }
  else if (rul > 5) { status = "CRITICAL"; severity = "critical"; confidence = 0.79; }
  else { status = "FAILURE_IMMINENT"; severity = "emergency"; confidence = 0.95; }

  return {
    cycle,
    sensors,
    degradation: +degradation.toFixed(4),
    prediction: {
      rul_cycles: +rul.toFixed(1),
      rul_minutes: +(rul * 2.5).toFixed(1),
      status,
      severity,
      confidence,
      model_active: false,
    },
  };
}

// ─── Dashboard Update ──────────────────────────────────────
function updateDashboard(data) {
  const { sensors, prediction, degradation } = data;
  const cyc = data.cycle || cycle;

  // Update cycle counter
  document.getElementById("cycle-count").textContent = cyc;

  // Update sensor values
  Object.entries(sensors).forEach(([key, val]) => {
    const el = document.getElementById(`val-${key}`);
    if (el) {
      el.textContent = val;
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 500);
    }

    // Update sensor bars
    const bar = document.getElementById(`bar-${key}`);
    if (bar) {
      const pct = Math.min(100, (degradation || 0) * 100 + 20 + Math.random() * 10);
      bar.style.width = `${pct}%`;
      if (pct > 70) bar.classList.add("warn");
      else bar.classList.remove("warn");
    }
  });

  // Update prediction stats
  if (prediction) {
    const { rul_cycles, rul_minutes, status, confidence } = prediction;

    document.getElementById("stat-rul").textContent = rul_cycles;
    document.getElementById("stat-ttf").textContent = rul_minutes;
    document.getElementById("stat-confidence").textContent = `${Math.round(confidence * 100)}%`;
    document.getElementById("rul-inline").textContent = rul_cycles;

    // Status color coding
    const statusEl = document.getElementById("stat-status");
    const statusSubEl = document.getElementById("stat-status-sub");
    statusEl.textContent = status;
    statusEl.className = "stat-value";
    statusSubEl.textContent = getStatusMessage(status);

    if (status === "NOMINAL") statusEl.classList.add("green");
    else if (status === "WATCH") statusEl.classList.add("cyan");
    else if (status === "WARNING") statusEl.classList.add("orange");
    else statusEl.classList.add("red");

    // RUL stat color
    const rulStat = document.getElementById("stat-rul");
    rulStat.className = "stat-value";
    if (rul_cycles > 120) rulStat.classList.add("cyan");
    else if (rul_cycles > 60) rulStat.classList.add("green");
    else if (rul_cycles > 20) rulStat.classList.add("orange");
    else rulStat.classList.add("red");

    // Update header status chip
    updateStatusChip(status);

    // Update digital twin
    updateTwin(status, degradation);
  }

  // Update degradation display
  if (degradation !== undefined) {
    document.getElementById("degradation-val").textContent = `${(degradation * 100).toFixed(1)}%`;
    const degEl = document.getElementById("degradation-val");
    if (degradation > 0.7) degEl.style.color = "var(--red)";
    else if (degradation > 0.4) degEl.style.color = "var(--orange)";
    else degEl.style.color = "var(--cyan)";
  }

  // Update charts
  updateCharts(data);
}

function getStatusMessage(status) {
  const msgs = {
    NOMINAL: "All systems operational",
    WATCH: "Minor degradation detected",
    WARNING: "Maintenance recommended soon",
    CRITICAL: "Failure in ~10 minutes!",
    FAILURE_IMMINENT: "⚠️ IMMEDIATE ACTION REQUIRED",
  };
  return msgs[status] || status;
}

// ─── Status Chip ───────────────────────────────────────────
function updateStatusChip(status) {
  const chip = document.getElementById("status-chip");
  const label = document.getElementById("status-label");
  chip.className = "status-chip";
  label.textContent = status;

  if (status === "NOMINAL") chip.classList.add("nominal");
  else if (status === "WATCH") chip.classList.add("nominal");
  else if (status === "WARNING") chip.classList.add("warning");
  else chip.classList.add("critical");
}

// ─── Digital Twin Update ───────────────────────────────────
function updateTwin(status, degradation) {
  const twinStatus = document.getElementById("twin-status");
  const rings = ["ring-outer", "ring-middle", "ring-inner", "ring-core"];

  // Update status text
  twinStatus.textContent = status;
  twinStatus.className = "engine-status-text";

  // Remove all state classes
  rings.forEach((id) => {
    const el = document.getElementById(id);
    el.classList.remove("state-warning", "state-critical");
  });

  if (status === "NOMINAL" || status === "WATCH") {
    twinStatus.classList.add("nominal");
  } else if (status === "WARNING") {
    twinStatus.classList.add("warning");
    rings.forEach((id) => document.getElementById(id).classList.add("state-warning"));
  } else {
    twinStatus.classList.add("critical");
    rings.forEach((id) => document.getElementById(id).classList.add("state-critical"));
  }

  // Adjust rotation speed based on degradation
  const speed = Math.max(2, 20 - (degradation || 0) * 18);
  document.getElementById("ring-outer").style.animationDuration = `${speed}s`;
  document.getElementById("ring-middle").style.animationDuration = `${speed * 0.6}s`;
  document.getElementById("ring-inner").style.animationDuration = `${speed * 0.3}s`;

  // RUL inline color
  const rulInline = document.getElementById("rul-inline");
  if (status === "NOMINAL") rulInline.style.color = "var(--green)";
  else if (status === "WARNING") rulInline.style.color = "var(--orange)";
  else if (status === "CRITICAL" || status === "FAILURE_IMMINENT") rulInline.style.color = "var(--red)";
}

// ─── Chart Updates ─────────────────────────────────────────
function updateCharts(data) {
  const cyc = data.cycle || cycle;
  const { sensors, prediction } = data;

  // Add data points
  labels.push(cyc);
  rulHistory.push(prediction?.rul_cycles || 0);

  sensorHistory.sensor_2.push(sensors?.sensor_2 || 0);
  sensorHistory.sensor_4.push(sensors?.sensor_4 || 0);
  sensorHistory.sensor_9.push(sensors?.sensor_9 || 0);
  sensorHistory.sensor_12.push(sensors?.sensor_12 || 0);

  // Trim to max points
  if (labels.length > MAX_POINTS) {
    labels.shift();
    rulHistory.shift();
    Object.values(sensorHistory).forEach((arr) => arr.shift());
  }

  // RUL chart
  rulChart.data.labels = [...labels];
  rulChart.data.datasets[0].data = [...rulHistory];
  rulChart.data.datasets[1].data = labels.map(() => 60); // warning line
  rulChart.data.datasets[2].data = labels.map(() => 20); // critical line
  rulChart.update("none");

  // Sensor chart
  sensorChart.data.labels = [...labels];
  sensorChart.data.datasets[0].data = [...sensorHistory.sensor_2];
  sensorChart.data.datasets[1].data = [...sensorHistory.sensor_4];
  sensorChart.data.datasets[2].data = [...sensorHistory.sensor_9];
  sensorChart.data.datasets[3].data = [...sensorHistory.sensor_12];
  sensorChart.update("none");
}

// ─── Engine Controls ───────────────────────────────────────
async function controlEngine(action) {
  try {
    const res = await fetch(`${API_BASE}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    console.log(`Engine control: ${action}`, data);

    if (action === "reset") {
      // Reset local state too
      cycle = 0;
      labels.length = 0;
      rulHistory.length = 0;
      Object.values(sensorHistory).forEach((a) => (a.length = 0));
    }
  } catch (err) {
    // Local-only reset
    if (action === "reset") {
      cycle = 0;
      labels.length = 0;
      rulHistory.length = 0;
      Object.values(sensorHistory).forEach((a) => (a.length = 0));
    }
    console.log(`Local control: ${action}`);
  }
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById("btn-pause");
  btn.innerHTML = isPaused ? "▶ Resume" : "⏸ Pause";

  // Also tell backend
  controlEngine(isPaused ? "pause" : "resume");
}

// ─── Init ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Digital Twin AI Predictor — Dashboard initialized");
  startPolling();
});
