/**
 * engine3d.js — Procedural 3D Turbofan Engine Digital Twin
 * Built with Three.js — no external model files needed.
 *
 * Exports:
 *   initEngine3D(containerId)   — mount scene into a DOM element
 *   updateEngine3D(data)        — update with live sensor/prediction payload
 *   disposeEngine3D()           — cleanup
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Module State ──────────────────────────────────────────────
let scene, camera, renderer, controls;
let engineGroup, fanGroup, lpcGroup, hpcGroup, hptGroup, lptGroup;
let combustionRing, exhaustCone, nacelle, nacelleWire;
let particles, particlePositions, particleVelocities;
let hudRUL, hudStatus;
let animationId;
let container;

// Engine parameters driven by data
let targetRotationSpeed = 0.02;
let currentRotationSpeed = 0.02;
let targetGlowIntensity = 0.3;
let currentGlowIntensity = 0.3;
let targetShake = 0;
let currentShake = 0;
let degradationLevel = 0;
let engineStatus = "NOMINAL";

// Color palette matching the dashboard
const COLORS = {
  cyan: 0x00f0ff,
  green: 0x00ff88,
  orange: 0xff9f43,
  red: 0xff3366,
  purple: 0xa855f7,
  nacelle: 0x1a2a4a,
  metal: 0x8899aa,
  darkMetal: 0x334455,
  exhaust: 0x00f0ff,
};

// ─── Initialization ────────────────────────────────────────────
function initEngine3D(containerId) {
  container = document.getElementById(containerId);
  if (!container) {
    console.error("engine3d: container not found:", containerId);
    return;
  }

  const w = container.clientWidth;
  const h = container.clientHeight || 380;

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060a13, 0.06);

  // Camera
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(4.5, 2.0, 5.5);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  controls.minDistance = 3;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.85;

  // Build engine first (before lighting, so combustion light can be added to engineGroup)
  engineGroup = new THREE.Group();
  scene.add(engineGroup);
  buildNacelle();
  buildFanBlades();
  buildCompressorStages();
  buildCombustionChamber();
  buildTurbineStages();
  buildExhaustCone();
  buildExhaustParticles();

  // Lighting (after engineGroup exists)
  setupLighting();



  // HUD overlay
  buildHUD();

  // Resize handler
  window.addEventListener("resize", onResize);

  // Start animation
  animate();
  console.log("🚀 3D Digital Twin Engine initialized");
}

// ─── Lighting ──────────────────────────────────────────────────
function setupLighting() {
  // Ambient
  const ambient = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambient);

  // Key light — cyan tinted
  const keyLight = new THREE.DirectionalLight(0x88ccff, 1.2);
  keyLight.position.set(5, 5, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  // Fill light — purple tint
  const fillLight = new THREE.DirectionalLight(0x6633aa, 0.4);
  fillLight.position.set(-3, 2, -3);
  scene.add(fillLight);

  // Rim light — backlight for edge definition
  const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.5);
  rimLight.position.set(0, -2, -5);
  scene.add(rimLight);

  // Point light inside combustion chamber
  const combustionLight = new THREE.PointLight(COLORS.cyan, 1.5, 4);
  combustionLight.position.set(-0.3, 0, 0);
  if (engineGroup) {
    engineGroup.add(combustionLight);
  } else {
    scene.add(combustionLight);
  }
  // Store for later updates
  window._combustionLight = combustionLight;
}

// ─── Nacelle (Outer Casing) ────────────────────────────────────
function buildNacelle() {
  const geom = new THREE.CylinderGeometry(1.5, 1.3, 5, 32, 1, true);
  geom.rotateZ(Math.PI / 2);

  const mat = new THREE.MeshPhysicalMaterial({
    color: COLORS.nacelle,
    metalness: 0.8,
    roughness: 0.3,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    envMapIntensity: 0.5,
  });
  nacelle = new THREE.Mesh(geom, mat);
  nacelle.position.set(0, 0, 0);
  engineGroup.add(nacelle);

  // Wireframe overlay
  const wireGeom = new THREE.CylinderGeometry(1.52, 1.32, 5, 32, 4, true);
  wireGeom.rotateZ(Math.PI / 2);
  const wireMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  nacelleWire = new THREE.Mesh(wireGeom, wireMat);
  engineGroup.add(nacelleWire);

  // Intake ring
  const intakeGeom = new THREE.TorusGeometry(1.5, 0.06, 8, 32);
  intakeGeom.rotateY(Math.PI / 2);
  const intakeMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.2,
  });
  const intakeRing = new THREE.Mesh(intakeGeom, intakeMat);
  intakeRing.position.set(2.5, 0, 0);
  engineGroup.add(intakeRing);

  // Exhaust ring
  const exhaustRingGeom = new THREE.TorusGeometry(1.3, 0.05, 8, 32);
  exhaustRingGeom.rotateY(Math.PI / 2);
  const exhaustRingMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.2,
    metalness: 0.9,
    roughness: 0.2,
  });
  const exhaustRing = new THREE.Mesh(exhaustRingGeom, exhaustRingMat);
  exhaustRing.position.set(-2.5, 0, 0);
  engineGroup.add(exhaustRing);
}

// ─── Fan Blades ────────────────────────────────────────────────
function buildFanBlades() {
  fanGroup = new THREE.Group();
  fanGroup.position.set(2.2, 0, 0);

  const bladeCount = 18;
  const bladeGeom = new THREE.BoxGeometry(0.05, 1.2, 0.3);

  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const bladeMat = new THREE.MeshStandardMaterial({
      color: COLORS.metal,
      metalness: 0.95,
      roughness: 0.15,
    });
    const blade = new THREE.Mesh(bladeGeom, bladeMat);
    blade.position.set(0, Math.cos(angle) * 0.65, Math.sin(angle) * 0.65);
    blade.rotation.x = angle;
    blade.rotation.z = 0.3; // blade pitch
    fanGroup.add(blade);
  }

  // Hub
  const hubGeom = new THREE.SphereGeometry(0.25, 16, 16);
  const hubMat = new THREE.MeshStandardMaterial({
    color: COLORS.darkMetal,
    metalness: 0.9,
    roughness: 0.2,
  });
  const hub = new THREE.Mesh(hubGeom, hubMat);
  fanGroup.add(hub);

  // Spinner cone
  const spinnerGeom = new THREE.ConeGeometry(0.22, 0.5, 16);
  spinnerGeom.rotateZ(-Math.PI / 2);
  const spinnerMat = new THREE.MeshStandardMaterial({
    color: COLORS.metal,
    metalness: 0.95,
    roughness: 0.1,
  });
  const spinner = new THREE.Mesh(spinnerGeom, spinnerMat);
  spinner.position.set(0.35, 0, 0);
  fanGroup.add(spinner);

  engineGroup.add(fanGroup);
}

// ─── Compressor Stages (LPC + HPC) ────────────────────────────
function buildCompressorStages() {
  // LPC
  lpcGroup = new THREE.Group();
  lpcGroup.position.set(1.2, 0, 0);
  buildBladeRing(lpcGroup, 14, 0.9, 0.2, COLORS.metal);
  engineGroup.add(lpcGroup);

  // HPC
  hpcGroup = new THREE.Group();
  hpcGroup.position.set(0.3, 0, 0);
  buildBladeRing(hpcGroup, 20, 0.7, 0.15, COLORS.darkMetal);
  engineGroup.add(hpcGroup);
}

function buildBladeRing(group, count, radius, bladeH, color) {
  const bladeGeom = new THREE.BoxGeometry(0.04, bladeH, 0.12);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.9,
      roughness: 0.2,
    });
    const blade = new THREE.Mesh(bladeGeom, mat);
    blade.position.set(0, Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5);
    blade.rotation.x = angle;
    blade.rotation.z = 0.25;
    group.add(blade);
  }
  // Inner hub ring
  const ringGeom = new THREE.TorusGeometry(radius * 0.2, 0.04, 8, 16);
  ringGeom.rotateY(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: COLORS.darkMetal,
    metalness: 0.8,
    roughness: 0.3,
  });
  group.add(new THREE.Mesh(ringGeom, ringMat));
}

// ─── Combustion Chamber ────────────────────────────────────────
function buildCombustionChamber() {
  // Glowing torus
  const geom = new THREE.TorusGeometry(0.55, 0.12, 16, 32);
  geom.rotateY(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.85,
    metalness: 0.3,
    roughness: 0.5,
  });
  combustionRing = new THREE.Mesh(geom, mat);
  combustionRing.position.set(-0.3, 0, 0);
  engineGroup.add(combustionRing);

  // Inner flame glow sphere
  const glowGeom = new THREE.SphereGeometry(0.35, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    transparent: true,
    opacity: 0.12,
  });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.position.set(-0.3, 0, 0);
  engineGroup.add(glow);
  window._combustionGlow = glow;

  // Position the combustion light
  if (window._combustionLight) {
    engineGroup.add(window._combustionLight);
    window._combustionLight.position.set(-0.3, 0, 0);
  }
}

// ─── Turbine Stages (HPT + LPT) ───────────────────────────────
function buildTurbineStages() {
  // HPT
  hptGroup = new THREE.Group();
  hptGroup.position.set(-1.0, 0, 0);
  buildBladeRing(hptGroup, 16, 0.8, 0.18, 0x996633);
  engineGroup.add(hptGroup);

  // LPT
  lptGroup = new THREE.Group();
  lptGroup.position.set(-1.7, 0, 0);
  buildBladeRing(lptGroup, 12, 1.0, 0.22, 0x887744);
  engineGroup.add(lptGroup);
}

// ─── Exhaust Cone ──────────────────────────────────────────────
function buildExhaustCone() {
  const geom = new THREE.ConeGeometry(0.6, 1.2, 16);
  geom.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.darkMetal,
    metalness: 0.85,
    roughness: 0.25,
    emissive: COLORS.cyan,
    emissiveIntensity: 0.1,
  });
  exhaustCone = new THREE.Mesh(geom, mat);
  exhaustCone.position.set(-2.8, 0, 0);
  engineGroup.add(exhaustCone);
}

// ─── Exhaust Particles ─────────────────────────────────────────
function buildExhaustParticles() {
  const count = 300;
  const geom = new THREE.BufferGeometry();
  particlePositions = new Float32Array(count * 3);
  particleVelocities = [];

  for (let i = 0; i < count; i++) {
    resetParticle(i);
  }

  geom.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

  const mat = new THREE.PointsMaterial({
    color: COLORS.exhaust,
    size: 0.04,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particles = new THREE.Points(geom, mat);
  engineGroup.add(particles);
}

function resetParticle(i) {
  const i3 = i * 3;
  const spread = 0.5 + Math.random() * 0.3;
  particlePositions[i3] = -3.2 - Math.random() * 0.5;
  particlePositions[i3 + 1] = (Math.random() - 0.5) * spread;
  particlePositions[i3 + 2] = (Math.random() - 0.5) * spread;
  if (!particleVelocities[i]) {
    particleVelocities[i] = { x: 0, y: 0, z: 0 };
  }
  particleVelocities[i].x = -(0.03 + Math.random() * 0.06);
  particleVelocities[i].y = (Math.random() - 0.5) * 0.01;
  particleVelocities[i].z = (Math.random() - 0.5) * 0.01;
}

// ─── HUD Overlay ───────────────────────────────────────────────
function buildHUD() {
  // RUL display
  hudRUL = document.createElement("div");
  hudRUL.id = "hud-rul-3d";
  hudRUL.innerHTML = `
    <div class="hud-label">REMAINING USEFUL LIFE</div>
    <div class="hud-value" id="hud-rul-value">200.0</div>
    <div class="hud-unit">cycles</div>
  `;
  container.appendChild(hudRUL);

  // Status display
  hudStatus = document.createElement("div");
  hudStatus.id = "hud-status-3d";
  hudStatus.innerHTML = `
    <span class="hud-dot"></span>
    <span id="hud-status-text">NOMINAL</span>
  `;
  container.appendChild(hudStatus);

  // Component labels
  const labelsContainer = document.createElement("div");
  labelsContainer.id = "hud-labels-3d";
  labelsContainer.innerHTML = `
    <div class="engine-component-label" style="left:75%;top:78%;">FAN</div>
    <div class="engine-component-label" style="left:55%;top:78%;">LPC</div>
    <div class="engine-component-label" style="left:42%;top:78%;">HPC</div>
    <div class="engine-component-label" style="left:32%;top:78%;">COMB</div>
    <div class="engine-component-label" style="left:20%;top:78%;">HPT</div>
    <div class="engine-component-label" style="left:10%;top:78%;">LPT</div>
  `;
  container.appendChild(labelsContainer);
}

// ─── Update from Live Data ─────────────────────────────────────
function updateEngine3D(data) {
  if (!engineGroup) return;

  const { sensors, prediction, degradation } = data;

  // Store degradation level
  degradationLevel = degradation || 0;
  engineStatus = prediction?.status || "NOMINAL";

  // 1. Rotation speed from core speed sensor
  const coreSpeed = sensors?.sensor_4 || 1400;
  targetRotationSpeed = mapRange(coreSpeed, 1380, 1430, 0.01, 0.06);

  // 2. Combustion glow from LPC temperature
  const lpcTemp = sensors?.sensor_2 || 641;
  targetGlowIntensity = mapRange(lpcTemp, 640, 648, 0.3, 1.2);

  // 3. Shake from degradation
  targetShake = degradationLevel * 0.025;

  // 4. Color transitions based on status
  updateEngineColors(engineStatus, degradationLevel);

  // 5. Exhaust particle color
  updateExhaustColor(engineStatus);

  // 6. HUD updates
  if (prediction) {
    const rulEl = document.getElementById("hud-rul-value");
    const statusEl = document.getElementById("hud-status-text");
    if (rulEl) rulEl.textContent = prediction.rul_cycles;
    if (statusEl) statusEl.textContent = prediction.status;

    // HUD color
    if (hudRUL) {
      hudRUL.className = "";
      hudRUL.classList.add(`hud-${engineStatus.toLowerCase()}`);
    }
    if (hudStatus) {
      hudStatus.className = "";
      hudStatus.id = "hud-status-3d";
      hudStatus.classList.add(`hud-chip-${engineStatus.toLowerCase()}`);
    }
  }
}

function updateEngineColors(status, deg) {
  let nacelleColor, emissiveColor, wireOpacity, glowColor;

  switch (status) {
    case "NOMINAL":
    case "WATCH":
      nacelleColor = new THREE.Color(COLORS.nacelle);
      emissiveColor = new THREE.Color(COLORS.cyan);
      wireOpacity = 0.08;
      glowColor = new THREE.Color(COLORS.cyan);
      break;
    case "WARNING":
      nacelleColor = new THREE.Color(0x2a1a0a);
      emissiveColor = new THREE.Color(COLORS.orange);
      wireOpacity = 0.15;
      glowColor = new THREE.Color(COLORS.orange);
      break;
    case "CRITICAL":
    case "FAILURE_IMMINENT":
      nacelleColor = new THREE.Color(0x2a0a0a);
      emissiveColor = new THREE.Color(COLORS.red);
      wireOpacity = 0.25;
      glowColor = new THREE.Color(COLORS.red);
      break;
    default:
      nacelleColor = new THREE.Color(COLORS.nacelle);
      emissiveColor = new THREE.Color(COLORS.cyan);
      wireOpacity = 0.08;
      glowColor = new THREE.Color(COLORS.cyan);
  }

  // Smoothly interpolate nacelle
  if (nacelle) {
    nacelle.material.color.lerp(nacelleColor, 0.05);
  }
  if (nacelleWire) {
    nacelleWire.material.color.lerp(emissiveColor, 0.05);
    nacelleWire.material.opacity += (wireOpacity - nacelleWire.material.opacity) * 0.05;
  }

  // Combustion ring
  if (combustionRing) {
    combustionRing.material.color.lerp(glowColor, 0.08);
    combustionRing.material.emissive.lerp(glowColor, 0.08);
    combustionRing.material.emissiveIntensity += (targetGlowIntensity - combustionRing.material.emissiveIntensity) * 0.05;
  }

  // Combustion glow sphere
  if (window._combustionGlow) {
    window._combustionGlow.material.color.lerp(glowColor, 0.08);
    const targetOpacity = 0.1 + deg * 0.25;
    window._combustionGlow.material.opacity += (targetOpacity - window._combustionGlow.material.opacity) * 0.05;
  }

  // Combustion point light
  if (window._combustionLight) {
    window._combustionLight.color.lerp(glowColor, 0.08);
    window._combustionLight.intensity += ((1.5 + deg * 3) - window._combustionLight.intensity) * 0.05;
  }

  // Exhaust cone glow
  if (exhaustCone) {
    exhaustCone.material.emissive.lerp(emissiveColor, 0.05);
    exhaustCone.material.emissiveIntensity += (0.1 + deg * 0.5 - exhaustCone.material.emissiveIntensity) * 0.05;
  }
}

function updateExhaustColor(status) {
  if (!particles) return;
  let color;
  switch (status) {
    case "NOMINAL":
    case "WATCH":
      color = new THREE.Color(COLORS.cyan);
      break;
    case "WARNING":
      color = new THREE.Color(COLORS.orange);
      break;
    case "CRITICAL":
    case "FAILURE_IMMINENT":
      color = new THREE.Color(COLORS.red);
      break;
    default:
      color = new THREE.Color(COLORS.cyan);
  }
  particles.material.color.lerp(color, 0.05);
}

// ─── Animation Loop ────────────────────────────────────────────
function animate() {
  animationId = requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  // Smooth interpolation
  currentRotationSpeed += (targetRotationSpeed - currentRotationSpeed) * 0.05;
  currentShake += (targetShake - currentShake) * 0.05;

  // Rotate blade groups
  if (fanGroup) fanGroup.rotation.x += currentRotationSpeed;
  if (lpcGroup) lpcGroup.rotation.x += currentRotationSpeed * 0.85;
  if (hpcGroup) hpcGroup.rotation.x += currentRotationSpeed * 1.2;
  if (hptGroup) hptGroup.rotation.x -= currentRotationSpeed * 0.9;
  if (lptGroup) lptGroup.rotation.x -= currentRotationSpeed * 0.7;

  // Combustion chamber pulse
  if (combustionRing) {
    const pulse = 1 + Math.sin(time * 4) * 0.08 * (1 + degradationLevel);
    combustionRing.scale.set(pulse, pulse, pulse);
  }

  // Engine shake (degradation-driven)
  if (engineGroup && currentShake > 0.0005) {
    engineGroup.position.y = Math.sin(time * 25) * currentShake;
    engineGroup.position.z = Math.cos(time * 30) * currentShake * 0.7;
  } else if (engineGroup) {
    engineGroup.position.y *= 0.9;
    engineGroup.position.z *= 0.9;
  }

  // Animate exhaust particles
  if (particles && particlePositions) {
    const posAttr = particles.geometry.attributes.position;
    for (let i = 0; i < particleVelocities.length; i++) {
      const i3 = i * 3;
      particlePositions[i3] += particleVelocities[i].x * (1 + degradationLevel * 0.5);
      particlePositions[i3 + 1] += particleVelocities[i].y;
      particlePositions[i3 + 2] += particleVelocities[i].z;

      // Reset particles that travel too far
      if (particlePositions[i3] < -6) {
        resetParticle(i);
      }
    }
    posAttr.needsUpdate = true;
  }

  // Nacelle wireframe shimmer
  if (nacelleWire) {
    nacelleWire.rotation.x = Math.sin(time * 0.5) * 0.02;
  }

  // Controls
  if (controls) controls.update();

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ─── Helpers ───────────────────────────────────────────────────
function mapRange(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function onResize() {
  if (!container || !camera || !renderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight || 380;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ─── Dispose ───────────────────────────────────────────────────
function disposeEngine3D() {
  if (animationId) cancelAnimationFrame(animationId);
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
  window.removeEventListener("resize", onResize);
  console.log("3D Engine disposed");
}

// ─── Expose Globally ───────────────────────────────────────────
window.initEngine3D = initEngine3D;
window.updateEngine3D = updateEngine3D;
window.disposeEngine3D = disposeEngine3D;
