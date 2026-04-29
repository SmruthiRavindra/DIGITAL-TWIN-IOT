/**
 * script.js — Digital Twin AI Failure Predictor
 * Live-polling, chart updates, and digital twin state management.
 */

// ─── Configuration ─────────────────────────────────────────
const API_BASE = "http://localhost:8000";
const POLL_INTERVAL = 1800; // ms between polls
const MAX_CYCLE_LIFE = 300; // auto-reset after this many cycles

// ─── State ─────────────────────────────────────────────────
let isPaused = false;
let pollTimer = null;
let cycle = 0;
let previousStatus = "NOMINAL";
let alarmInterval = null;
let alarmCtx = null;
let localDegSpeed = 1;        // Local degradation speed multiplier (1x = normal)
let localPollSpeed = POLL_INTERVAL;

// ─── Web Audio API Alarm System ────────────────────────────
function initAudioContext() {
  if (!alarmCtx) {
    alarmCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return alarmCtx;
}

function playAlarmBeep() {
  try {
    const ctx = initAudioContext();
    const now = ctx.currentTime;

    // Oscillator 1 — sharp warning tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(660, now + 0.1);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Oscillator 2 — low rumble undertone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(110, now);
    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.3);
  } catch (e) {
    // Audio not available — silent fail
  }
}

function startAlarm() {
  if (alarmInterval) return; // already alarming
  playAlarmBeep();
  alarmInterval = setInterval(playAlarmBeep, 1500);
  document.body.classList.add("alarm-active");
  showCriticalOverlay(true);
}

function stopAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  document.body.classList.remove("alarm-active");
  showCriticalOverlay(false);
}

// ─── Critical Alert Overlay ────────────────────────────────
function showCriticalOverlay(show) {
  let overlay = document.getElementById("critical-overlay");
  if (show) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "critical-overlay";
      overlay.innerHTML = `
        <div class="critical-overlay-content">
          <div class="critical-icon">⚠️</div>
          <div class="critical-title">CRITICAL FAILURE DETECTED</div>
          <div class="critical-subtitle">Engine degradation exceeds safe operating limits</div>
          <div class="critical-rul">RUL: <span id="overlay-rul">0</span> cycles</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.classList.add("visible");
  } else {
    if (overlay) overlay.classList.remove("visible");
  }
}

// ─── Auto-Reset at Max Cycles ──────────────────────────────
function performAutoReset(reason = "CYCLE LIMIT REACHED") {
  // Dramatic pause
  isPaused = true;

  // Flash the failure overlay
  let flash = document.getElementById("failure-flash");
  if (!flash) {
    flash = document.createElement("div");
    flash.id = "failure-flash";
    document.body.appendChild(flash);
  }
  flash.innerHTML = `
    <div class="failure-flash-text">ENGINE FAILURE — ${reason}</div>
    <div class="failure-flash-sub">Resetting digital twin to factory state...</div>
  `;
  flash.classList.add("visible");

  // After 2.5 seconds, reset everything
  setTimeout(() => {
    flash.classList.remove("visible");
    stopAlarm();
    cycle = 0;
    labels.length = 0;
    rulHistory.length = 0;
    Object.values(sensorHistory).forEach((a) => (a.length = 0));
    previousStatus = "NOMINAL";
    localDegSpeed = 1;
    localPollSpeed = POLL_INTERVAL;
    updateSpeedBadge();
    isPaused = false;

    // Reset backend too
    controlEngine("reset");

    console.log("🔄 Auto-reset: Engine returned to factory-new state");
  }, 2500);
}

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

// ─── Diagnostic Data Log ───────────────────────────────────
const diagLog = {
  startTime: new Date().toISOString(),
  statusTransitions: [],          // {cycle, from, to, timestamp}
  lastSnapshot: null,             // latest full data payload
  peakDegradation: 0,
  peakSensors: {},                // max recorded value per sensor
  alertCount: 0,
};

// Sensor baseline (healthy) ranges for the report
const SENSOR_BASELINES = {
  sensor_2:  { name: 'LPC Outlet Temp',     unit: '°R',   baseline: 641.82, warnAt: 644.0, critAt: 645.5 },
  sensor_3:  { name: 'HPC Outlet Temp',     unit: '°R',   baseline: 1589.7, warnAt: 1598,  critAt: 1605  },
  sensor_4:  { name: 'Core Speed',          unit: 'rpm',  baseline: 1400.6, warnAt: 1415,  critAt: 1422  },
  sensor_7:  { name: 'LPT Outlet Temp',     unit: '°R',   baseline: 553.75, warnAt: 558,   critAt: 561   },
  sensor_9:  { name: 'Physical Core Speed', unit: 'rpm',  baseline: 9046.2, warnAt: 9055,  critAt: 9060  },
  sensor_11: { name: 'HPC Outlet Pressure', unit: 'psia', baseline: 47.47,  warnAt: 48.2,  critAt: 48.6  },
  sensor_12: { name: 'Fuel Flow Ratio',     unit: 'pps',  baseline: 521.66, warnAt: 524.0, critAt: 525.0 },
  sensor_15: { name: 'Bypass Ratio',        unit: '—',    baseline: 8.44,   warnAt: 8.7,   critAt: 8.9   },
};

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

  // Auto-reset at max cycle life
  if (cycle >= MAX_CYCLE_LIFE) {
    performAutoReset("CYCLE LIMIT REACHED");
    // Return safe data for this final frame
    return {
      cycle: MAX_CYCLE_LIFE,
      sensors: { sensor_2: 646, sensor_3: 1607, sensor_4: 1425, sensor_7: 561, sensor_8: 2386, sensor_9: 9061, sensor_11: 48.6, sensor_12: 525, sensor_15: 8.9 },
      degradation: 0.9,
      prediction: { rul_cycles: 0, rul_minutes: 0, status: "FAILURE_IMMINENT", severity: "emergency", confidence: 0.95, model_active: false },
    };
  }

  const degradation = Math.min(1, cycle * 0.003 * localDegSpeed);
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
  if (isPaused) return; // Don't process incoming updates if we're in the failure sequence

  const { sensors, prediction, degradation } = data;
  let cyc = data.cycle || cycle;

  // Lock RUL at 0 to prevent bouncing and trigger failure
  let triggeredFailure = false;
  if (prediction && prediction.rul_cycles <= 0) {
    prediction.rul_cycles = 0;
    prediction.rul_minutes = 0;
    prediction.status = "FAILURE_IMMINENT";
    triggeredFailure = true;
  }

  // Update cycle counter
  document.getElementById("cycle-count").textContent = cyc;


  // Update cycle progress bar
  const progressBar = document.getElementById("cycle-progress-fill");
  if (progressBar) {
    const pct = Math.min(100, (cyc / MAX_CYCLE_LIFE) * 100);
    progressBar.style.width = `${pct}%`;
    if (pct > 80) progressBar.classList.add("danger");
    else if (pct > 50) progressBar.classList.add("warn");
    else { progressBar.classList.remove("danger", "warn"); }
  }

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

    // ── Alarm logic: beep on CRITICAL/FAILURE_IMMINENT ──
    if ((status === "CRITICAL" || status === "FAILURE_IMMINENT") && previousStatus !== "CRITICAL" && previousStatus !== "FAILURE_IMMINENT") {
      startAlarm();
    } else if (status !== "CRITICAL" && status !== "FAILURE_IMMINENT" && (previousStatus === "CRITICAL" || previousStatus === "FAILURE_IMMINENT")) {
      stopAlarm();
    }

    // Update overlay RUL if visible
    const overlayRul = document.getElementById("overlay-rul");
    if (overlayRul) overlayRul.textContent = rul_cycles;

    // Log status transitions
    if (status !== previousStatus) {
      diagLog.statusTransitions.push({
        cycle: cyc,
        from: previousStatus,
        to: status,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
    previousStatus = status;

    // Trigger auto-reset if RUL hit 0
    if (triggeredFailure && !isPaused) {
      setTimeout(() => performAutoReset("RUL REACHED 0"), 100);
    }

    // Update 3D digital twin
    if (typeof updateEngine3D === 'function') {
      updateEngine3D(data);
    }

    // Update 2D status text fallback
    const twinStatus = document.getElementById('twin-status');
    if (twinStatus) {
      twinStatus.textContent = status;
      twinStatus.className = 'engine-status-text';
      if (status === 'NOMINAL' || status === 'WATCH') twinStatus.classList.add('nominal');
      else if (status === 'WARNING') twinStatus.classList.add('warning');
      else twinStatus.classList.add('critical');
    }
  }

  // Update degradation display
  if (degradation !== undefined) {
    document.getElementById("degradation-val").textContent = `${(degradation * 100).toFixed(1)}%`;
    const degEl = document.getElementById("degradation-val");
    if (degradation > 0.7) degEl.style.color = "var(--red)";
    else if (degradation > 0.4) degEl.style.color = "var(--orange)";
    else degEl.style.color = "var(--cyan)";

    // Track diagnostic peaks
    diagLog.peakDegradation = Math.max(diagLog.peakDegradation, degradation);
    diagLog.lastSnapshot = data;
    if (prediction?.status === 'CRITICAL' || prediction?.status === 'FAILURE_IMMINENT') diagLog.alertCount++;
    Object.entries(sensors).forEach(([k, v]) => {
      if (!diagLog.peakSensors[k] || v > diagLog.peakSensors[k]) diagLog.peakSensors[k] = v;
    });
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

// ─── RUL Inline Color Update ───────────────────────────────
function updateRulInlineColor(status) {
  const rulInline = document.getElementById("rul-inline");
  if (!rulInline) return;
  if (status === "NOMINAL" || status === "WATCH") rulInline.style.color = "var(--green)";
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
      cycle = 0;
      labels.length = 0;
      rulHistory.length = 0;
      Object.values(sensorHistory).forEach((a) => (a.length = 0));
      previousStatus = "NOMINAL";
      localDegSpeed = 1;
      localPollSpeed = POLL_INTERVAL;
      updateSpeedBadge();
      restartPolling();
      stopAlarm();
    } else if (action === "speed_up") {
      localDegSpeed = Math.min(32, localDegSpeed * 4);
      localPollSpeed = Math.max(300, POLL_INTERVAL / Math.sqrt(localDegSpeed));
      updateSpeedBadge();
      restartPolling();
      console.log(`⏩ Speed: ${localDegSpeed}x (poll: ${Math.round(localPollSpeed)}ms)`);
    } else if (action === "slow_down") {
      localDegSpeed = Math.max(1, localDegSpeed / 4);
      localPollSpeed = Math.max(300, POLL_INTERVAL / Math.sqrt(localDegSpeed));
      updateSpeedBadge();
      restartPolling();
      console.log(`⏪ Speed: ${localDegSpeed}x (poll: ${Math.round(localPollSpeed)}ms)`);
    }
  } catch (err) {
    if (action === "reset") {
      cycle = 0;
      labels.length = 0;
      rulHistory.length = 0;
      Object.values(sensorHistory).forEach((a) => (a.length = 0));
      previousStatus = "NOMINAL";
      localDegSpeed = 1;
      localPollSpeed = POLL_INTERVAL;
      updateSpeedBadge();
      restartPolling();
      stopAlarm();
    } else if (action === "speed_up") {
      localDegSpeed = Math.min(32, localDegSpeed * 4);
      localPollSpeed = Math.max(300, POLL_INTERVAL / Math.sqrt(localDegSpeed));
      updateSpeedBadge();
      restartPolling();
    } else if (action === "slow_down") {
      localDegSpeed = Math.max(1, localDegSpeed / 4);
      localPollSpeed = Math.max(300, POLL_INTERVAL / Math.sqrt(localDegSpeed));
      updateSpeedBadge();
      restartPolling();
    }
    console.log(`Local control: ${action}`);
  }
}

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById("btn-pause");
  btn.innerHTML = isPaused ? "▶ Resume" : "⏸ Pause";
  controlEngine(isPaused ? "pause" : "resume");
}

function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchData, localPollSpeed);
}

function updateSpeedBadge() {
  const btn = document.getElementById("btn-speedup");
  if (btn) {
    if (localDegSpeed > 1) {
      btn.innerHTML = `⏩ Speed Up (${localDegSpeed}x)`;
    } else {
      btn.innerHTML = "⏩ Speed Up Degradation";
    }
  }
}

// ─── Diagnostic Failure Report Generator ───────────────────
function generateDiagnosticReport() {
  const snap = diagLog.lastSnapshot || {};
  const sensors = snap.sensors || {};
  const pred = snap.prediction || {};
  const deg = snap.degradation || 0;
  const cyc = snap.cycle || cycle;
  const now = new Date();

  // Build sensor analysis rows
  let sensorRows = '';
  let failingCount = 0;
  let warningCount = 0;
  Object.entries(SENSOR_BASELINES).forEach(([key, info]) => {
    const current = sensors[key] ?? info.baseline;
    const peak = diagLog.peakSensors[key] ?? current;
    const deviation = ((current - info.baseline) / info.baseline * 100).toFixed(2);
    let statusTag, rowClass;
    if (current >= info.critAt) { statusTag = '<span class="tag crit">⛔ CRITICAL</span>'; rowClass = 'row-crit'; failingCount++; }
    else if (current >= info.warnAt) { statusTag = '<span class="tag warn">⚠️ WARNING</span>'; rowClass = 'row-warn'; warningCount++; }
    else { statusTag = '<span class="tag ok">✅ NORMAL</span>'; rowClass = ''; }
    sensorRows += `<tr class="${rowClass}"><td>${info.name}</td><td><code>${key}</code></td><td>${info.baseline} ${info.unit}</td><td><strong>${current}</strong> ${info.unit}</td><td>${peak} ${info.unit}</td><td>${deviation > 0 ? '+' : ''}${deviation}%</td><td>${statusTag}</td></tr>`;
  });

  // Status transitions timeline
  let timelineRows = '';
  if (diagLog.statusTransitions.length === 0) {
    timelineRows = '<tr><td colspan="4" style="text-align:center;color:#6a7a9a;">No status transitions recorded yet. Run the simulation first.</td></tr>';
  } else {
    diagLog.statusTransitions.forEach(t => {
      const color = t.to === 'CRITICAL' || t.to === 'FAILURE_IMMINENT' ? '#ff3366' : t.to === 'WARNING' ? '#ff9f43' : t.to === 'WATCH' ? '#00f0ff' : '#00ff88';
      timelineRows += `<tr><td>${t.cycle}</td><td>${t.timestamp}</td><td>${t.from}</td><td style="color:${color};font-weight:700;">${t.to}</td></tr>`;
    });
  }

  // RUL history sparkline data
  const rulData = rulHistory.length > 0 ? rulHistory : [200];
  const rulMin = Math.min(...rulData).toFixed(1);
  const rulMax = Math.max(...rulData).toFixed(1);

  // Overall health verdict
  let verdict, verdictColor, verdictIcon;
  if (pred.status === 'NOMINAL') { verdict = 'ENGINE HEALTHY — No action required'; verdictColor = '#00ff88'; verdictIcon = '✅'; }
  else if (pred.status === 'WATCH') { verdict = 'MINOR DEGRADATION — Schedule routine inspection'; verdictColor = '#00f0ff'; verdictIcon = '👀'; }
  else if (pred.status === 'WARNING') { verdict = 'SIGNIFICANT WEAR — Maintenance recommended within 24 hours'; verdictColor = '#ff9f43'; verdictIcon = '⚠️'; }
  else if (pred.status === 'CRITICAL') { verdict = 'CRITICAL FAILURE RISK — Ground engine immediately'; verdictColor = '#ff3366'; verdictIcon = '🚨'; }
  else { verdict = 'FAILURE IMMINENT — Emergency shutdown required'; verdictColor = '#ff3366'; verdictIcon = '💀'; }

  // Recommendations
  let recommendations = '';
  if (failingCount > 0) recommendations += '<li><strong style="color:#ff3366">IMMEDIATE:</strong> Shut down engine and inspect components with critical sensor deviations.</li>';
  if (warningCount > 0) recommendations += '<li><strong style="color:#ff9f43">SOON:</strong> Schedule maintenance for components showing warning-level wear.</li>';
  if (sensors.sensor_2 >= SENSOR_BASELINES.sensor_2.warnAt) recommendations += '<li>LPC outlet temperature elevated — check compressor blade erosion and air seal integrity.</li>';
  if (sensors.sensor_4 >= SENSOR_BASELINES.sensor_4.warnAt) recommendations += '<li>Core speed deviation detected — inspect shaft bearings and rotor balance.</li>';
  if (sensors.sensor_12 >= SENSOR_BASELINES.sensor_12.warnAt) recommendations += '<li>Fuel flow ratio increased — check fuel nozzle clogging and combustion efficiency.</li>';
  if (sensors.sensor_7 >= SENSOR_BASELINES.sensor_7.warnAt) recommendations += '<li>LPT outlet temperature rising — inspect turbine blade coatings for thermal barrier deterioration.</li>';
  if (failingCount === 0 && warningCount === 0) recommendations += '<li>All parameters within nominal range. Continue standard operating schedule.</li>';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Engine Diagnostic Report — ${now.toLocaleDateString()}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page{size:A4;margin:15mm 18mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#060a13;color:#e0e5f0;line-height:1.6;font-size:10.5pt;padding:24px}
  .report{max-width:210mm;margin:0 auto}
  @media print{body{background:#fff!important;color:#1a1a2e!important}h1,h2{color:#0a0e1a!important}table{border-color:#ccc!important}th{background:#f0f2f5!important;color:#1a1a2e!important}.tag{border:1px solid #ccc!important}.row-crit td{background:rgba(255,51,102,0.06)!important}.row-warn td{background:rgba(255,159,67,0.06)!important}.no-print{display:none!important}}
  h1{font-size:1.5rem;font-weight:800;margin:24px 0 8px;border-bottom:2px solid rgba(0,240,255,0.15);padding-bottom:5px}
  h2{font-size:1rem;font-weight:700;color:#00f0ff;margin:16px 0 6px}
  table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:0.82rem}
  th{background:rgba(0,240,255,0.06);color:#00f0ff;text-align:left;padding:7px 10px;border:1px solid rgba(0,240,255,0.08);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em}
  td{padding:6px 10px;border:1px solid rgba(255,255,255,0.04)}
  tr:nth-child(even) td{background:rgba(0,0,0,0.12)}
  code{font-family:'JetBrains Mono',monospace;background:rgba(0,240,255,0.06);padding:1px 5px;border-radius:3px;font-size:0.8em}
  .tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600}
  .tag.ok{background:rgba(0,255,136,0.1);color:#00ff88}
  .tag.warn{background:rgba(255,159,67,0.1);color:#ff9f43}
  .tag.crit{background:rgba(255,51,102,0.12);color:#ff3366}
  .row-crit td{background:rgba(255,51,102,0.04)!important}
  .row-warn td{background:rgba(255,159,67,0.03)!important}
  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0}
  .sum-box{text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(0,240,255,0.06)}
  .sum-val{font-family:'JetBrains Mono',monospace;font-size:1.5rem;font-weight:700}
  .sum-lbl{font-size:0.65rem;color:#6a7a9a;text-transform:uppercase;letter-spacing:0.08em;margin-top:3px}
  .verdict{padding:14px 20px;border-radius:10px;margin:12px 0;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;text-align:center}
  .recs{margin:8px 0 14px 20px}
  .recs li{margin-bottom:6px}
  .header-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(0,240,255,0.1);margin-bottom:16px}
  .header-bar h1{border:none;margin:0;padding:0}
  .print-btn{padding:8px 20px;border:1px solid #00f0ff;border-radius:8px;background:rgba(0,240,255,0.08);color:#00f0ff;cursor:pointer;font-weight:600;font-size:0.8rem}
</style></head><body>
<div class="report">
  <div class="header-bar">
    <div><h1 style="font-size:1.3rem;">🔧 Engine Diagnostic Failure Report</h1><div style="color:#6a7a9a;font-size:0.8rem;">Digital Twin AI — Turbofan Engine RUL Monitoring</div></div>
    <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>
  </div>

  <div class="summary-grid">
    <div class="sum-box"><div class="sum-val" style="color:${verdictColor}">${pred.rul_cycles ?? 'N/A'}</div><div class="sum-lbl">RUL (cycles)</div></div>
    <div class="sum-box"><div class="sum-val" style="color:#a855f7">${cyc}</div><div class="sum-lbl">Current Cycle</div></div>
    <div class="sum-box"><div class="sum-val" style="color:${deg > 0.5 ? '#ff3366' : '#00f0ff'}">${(deg * 100).toFixed(1)}%</div><div class="sum-lbl">Degradation</div></div>
    <div class="sum-box"><div class="sum-val" style="color:${verdictColor}">${pred.status ?? 'N/A'}</div><div class="sum-lbl">Status</div></div>
  </div>

  <div class="verdict" style="border:2px solid ${verdictColor};color:${verdictColor};background:${verdictColor}11">${verdictIcon} ${verdict}</div>

  <table>
    <tr><th>Field</th><th>Value</th></tr>
    <tr><td>Report Generated</td><td>${now.toLocaleString()}</td></tr>
    <tr><td>Session Started</td><td>${new Date(diagLog.startTime).toLocaleString()}</td></tr>
    <tr><td>Total Cycles Run</td><td>${cyc}</td></tr>
    <tr><td>Peak Degradation</td><td>${(diagLog.peakDegradation * 100).toFixed(1)}%</td></tr>
    <tr><td>Critical Alerts Fired</td><td>${diagLog.alertCount}</td></tr>
    <tr><td>Status Transitions</td><td>${diagLog.statusTransitions.length}</td></tr>
    <tr><td>RUL Range (session)</td><td>${rulMin} — ${rulMax} cycles</td></tr>
    <tr><td>AI Confidence</td><td>${pred.confidence ? Math.round(pred.confidence * 100) + '%' : 'N/A'}</td></tr>
    <tr><td>Model Active</td><td>${pred.model_active ? 'Yes (XGBoost)' : 'Demo Simulation'}</td></tr>
  </table>

  <h1>🔬 Sensor Parameter Analysis</h1>
  <p style="color:#6a7a9a;font-size:0.85rem;margin-bottom:8px;">Baseline values represent factory-new engine readings. Deviations indicate component wear.</p>
  <table>
    <tr><th>Parameter</th><th>Sensor ID</th><th>Baseline</th><th>Current</th><th>Peak</th><th>Deviation</th><th>Status</th></tr>
    ${sensorRows}
  </table>
  <p style="font-size:0.8rem;color:#6a7a9a;"><strong>${failingCount}</strong> parameter(s) in CRITICAL range · <strong>${warningCount}</strong> in WARNING range · <strong>${Object.keys(SENSOR_BASELINES).length - failingCount - warningCount}</strong> NORMAL</p>

  <h1>📜 Status Transition Timeline</h1>
  <table>
    <tr><th>Cycle</th><th>Time</th><th>From</th><th>To</th></tr>
    ${timelineRows}
  </table>

  <h1>🛠️ Maintenance Recommendations</h1>
  <ul class="recs">${recommendations}</ul>

  <div style="text-align:center;margin-top:30px;padding:16px;border-top:1px solid rgba(0,240,255,0.1);color:#6a7a9a;font-size:0.75rem;">
    Digital Twin AI Failure Predictor · Diagnostic Report · Generated ${now.toLocaleString()}
  </div>
</div></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ─── Init ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Digital Twin AI Predictor — Dashboard initialized");

  // Initialize 3D engine
  if (typeof initEngine3D === 'function') {
    initEngine3D('engine-3d-viewport');
  }

  startPolling();
});
