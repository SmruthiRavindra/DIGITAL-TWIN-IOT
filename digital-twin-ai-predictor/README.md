# 🔮 Digital Twin AI — Failure Predictor

> **Industry 4.0** real-time digital twin dashboard with **ML-powered failure prediction** for turbofan engines using the NASA CMAPSS dataset.

![Python](https://img.shields.io/badge/Python-3.10+-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square&logo=fastapi)
![XGBoost](https://img.shields.io/badge/XGBoost-2.0-orange?style=flat-square)
![Chart.js](https://img.shields.io/badge/Chart.js-4.4-ff6384?style=flat-square)

---

## 💡 What Is This?

A **live digital twin** of a turbofan jet engine that:

| Left Panel | Right Panel |
|---|---|
| 📡 Real-time simulated IoT sensor feed | 🔮 Animated digital twin visualization |
| 📊 Live telemetry charts | 🧠 AI predicts RUL & failure timing |

The ML model predicts **Remaining Useful Life (RUL)** and classifies the engine state:

- ✅ `NOMINAL` — System stable
- 👀 `WATCH` — Minor degradation detected
- ⚠️ `WARNING` — Maintenance recommended soon
- 🚨 `CRITICAL` — Failure in ~10 minutes!
- 💀 `FAILURE_IMMINENT` — Immediate action required

---

## 🎯 Why This Is Killer

- **"Digital Twin"** = buzzword judges LOVE
- Feels like **Industry 4.0** level innovation
- Real **NASA dataset** (CMAPSS Turbofan Degradation)
- **Live streaming** sensor data with Server-Sent Events
- Works in **demo mode** even without a trained model

---

## 🗂️ Project Structure

```
digital-twin-ai-predictor/
├── data/
│   ├── raw/                 # NASA CMAPSS .txt files
│   └── processed/           # Scaled/windowed training data
├── notebooks/
│   └── 01_eda_and_training.ipynb
├── models/
│   ├── turbo_model.pkl      # Trained XGBoost model
│   └── scaler.joblib        # Fitted MinMaxScaler
├── backend/
│   ├── main.py              # FastAPI server
│   ├── model_utils.py       # Model loading & preprocessing
│   └── requirements.txt
├── frontend/
│   ├── index.html           # Dashboard UI
│   ├── assets/style.css     # Cyberpunk dark theme
│   └── script.js            # Live polling & Chart.js
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/YOUR_USERNAME/digital-twin-ai-predictor.git
cd digital-twin-ai-predictor
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs at http://localhost:8000
```

### 3. Frontend

Open `frontend/index.html` in your browser, or serve it:

```bash
cd frontend
python -m http.server 5500
# Dashboard at http://localhost:5500
```

> 💡 The frontend works in **demo mode** (local simulation) even if the backend is not running!

### 4. Train Your Own Model (Optional)

1. Download [NASA CMAPSS dataset](https://www.kaggle.com/datasets/behrad3d/nasa-cmaps) → place in `data/raw/`
2. Open `notebooks/01_eda_and_training.ipynb` in Jupyter/Colab
3. Run all cells — model saves to `models/`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **ML Model** | XGBoost / scikit-learn |
| **Backend** | FastAPI + Uvicorn |
| **Frontend** | Vanilla JS + Chart.js 4 |
| **Styling** | Custom CSS (Cyberpunk dark theme) |
| **Data** | NASA CMAPSS Turbofan Degradation |
| **Streaming** | Server-Sent Events (SSE) |

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

MIT — use it, fork it, win hackathons with it. 🏆
