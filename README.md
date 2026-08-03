# 🔮 Digital Twin AI — Failure Predictor

> **Industry 4.0** real-time digital twin dashboard with **ML-powered predictive maintenance** for turbofan engines. Built on the NASA CMAPSS dataset.

![Python](https://img.shields.io/badge/Python-3.10+-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square&logo=fastapi)
![XGBoost](https://img.shields.io/badge/XGBoost-2.0-orange?style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-Procedural-black?style=flat-square)
![Chart.js](https://img.shields.io/badge/Chart.js-Live-ff6384?style=flat-square)

---

## 💡 What Is This?

A **live digital twin** of a turbofan jet engine designed for hackathon and presentation environments. It bridges the gap between deep Machine Learning and high-fidelity front-end visualization.

| Left Panel (IoT Data) | Right Panel (Digital Twin) |
|---|---|
| 📡 Real-time simulated IoT sensor feed | 🔮 **Procedural 3D** engine visualization (Three.js) |
| 📊 Live telemetry charts (Chart.js) | 🧠 AI predicts RUL & failure timing (XGBoost) |
| 🚨 Live Health Status & Degradation % | 🔊 **Web Audio API** critical failure alarms |

The ML model predicts the **Remaining Useful Life (RUL)** and classifies the engine state:

- ✅ `NOMINAL` — System stable
- 👀 `WATCH` — Minor degradation detected
- ⚠️ `WARNING` — Maintenance recommended soon
- 🚨 `CRITICAL` — Failure in ~10 minutes!
- 💀 `FAILURE_IMMINENT` — Immediate action required (Triggers Auto-Reset)

---

## 🎯 Key Features (v2.0)

- **Procedural 3D Digital Twin:** The engine is generated entirely via math and Three.js primitives. No bulky `.glb` or `.gltf` files are required.
- **Explainable AI (XAI):** The model includes `GridSearchCV` hyperparameter tuning, testing 27 models to find the perfect fit. Validation plots (`actual_vs_predicted.png` and `feature_importance.png`) prove the model generalizes and highlight *which* sensors drive failure.
- **Dynamic Failure Reports:** Click "Generate Report" to instantly snapshot the engine's telemetry, cross-reference sensors against healthy baselines, and generate a printable PDF failure diagnostic.
- **"Speed Up" Demo Controls:** Built specifically for judges. You can accelerate the engine's degradation by 32x to show a full 300-cycle life and failure loop in under 30 seconds.
- **Immersive UX:** Features CRT scanlines, glowing cards, color-shifting telemetry, and a dual-oscillator synthesized alarm that triggers when the engine hits critical mass.

---

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/YOUR_USERNAME/digital-twin-ai-predictor.git
cd digital-twin-ai-predictor
```

### 2. Backend (FastAPI + XGBoost)

```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs at http://localhost:8000
```

### 3. Frontend (3D UI)

Open `frontend/index.html` in your browser, or serve it locally:

```bash
cd frontend
python -m http.server 5500
# Dashboard at http://localhost:5500
```

> 💡 **Demo Mode:** The frontend works in a localized **demo mode** even if the FastAPI backend is offline. Perfect for quick presentations!

### 4. Train the AI (The Lab)

The training pipeline automatically downloads the NASA dataset, runs GridSearchCV, and generates validation plots.

```bash
# From the project root directory
pip install kagglehub xgboost scikit-learn matplotlib seaborn pandas
python train_model.py
```
Check the `models/` folder for your new `turbo_model.pkl` and validation graphs!

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **ML Model** | XGBoost (GridSearchCV) / Scikit-learn |
| **Backend** | FastAPI + Uvicorn |
| **Frontend UI** | Vanilla HTML/CSS/JS + Chart.js |
| **3D Engine** | Three.js (Procedural Generation) |
| **Styling** | Custom CSS (Cyberpunk dark theme, CRT effects) |
| **Data** | NASA CMAPSS Turbofan Degradation Dataset |
| **Audio** | Web Audio API (Synthesized Alarms) |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/sensor-data` | Single sensor snapshot + prediction |
| `GET` | `/stream` | SSE live stream |
| `POST` | `/predict` | Custom sensor input → RUL prediction |
| `POST` | `/control` | Engine control (reset, speed_up, pause) |
| `GET` | `/history` | Prediction history |
| `GET` | `/model-info` | Model metadata |

---

## 📜 License

MIT — use it, fork it, and win hackathons with it. 🏆
