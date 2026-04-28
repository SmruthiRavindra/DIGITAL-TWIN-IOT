"""
model_utils.py — Model loading, preprocessing, and prediction logic
for the Digital Twin AI Failure Predictor.
"""

import os
import numpy as np
import joblib
import json
from datetime import datetime

# ─── Configuration ──────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "turbo_model.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.joblib")
META_PATH = os.path.join(MODEL_DIR, "model_meta.joblib")

# Default sensor columns (overridden by model_meta.joblib if available)
SENSOR_COLUMNS = [
    "sensor_2", "sensor_3", "sensor_4", "sensor_7", "sensor_8",
    "sensor_9", "sensor_11", "sensor_12", "sensor_13", "sensor_14",
    "sensor_15", "sensor_17", "sensor_20", "sensor_21"
]

OPERATIONAL_COLUMNS = ["op_setting_1", "op_setting_2", "op_setting_3"]

# ─── Globals ────────────────────────────────────────────────────
_model = None
_scaler = None
_model_loaded = False


def load_model():
    """Load the trained model, scaler, and metadata from disk."""
    global _model, _scaler, _model_loaded, SENSOR_COLUMNS

    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        try:
            _model = joblib.load(MODEL_PATH)
            _scaler = joblib.load(SCALER_PATH)
            _model_loaded = True
            print(f"✅ Model loaded from {MODEL_PATH}")
            print(f"✅ Scaler loaded from {SCALER_PATH}")

            # Load metadata to get exact sensor column order from training
            if os.path.exists(META_PATH):
                meta = joblib.load(META_PATH)
                SENSOR_COLUMNS = meta.get("useful_sensors", SENSOR_COLUMNS)
                print(f"✅ Meta loaded — {len(SENSOR_COLUMNS)} sensors, R²={meta.get('r2', '?')}")
            return True
        except Exception as e:
            print(f"⚠️ Error loading model: {e}")
            _model_loaded = False
            return False
    else:
        print("⚠️ Model files not found. Running in DEMO MODE with simulated predictions.")
        _model_loaded = False
        return False


def preprocess_sensor_data(sensor_readings: dict) -> np.ndarray:
    """
    Take raw sensor readings dict and transform into model-ready features.
    
    Args:
        sensor_readings: Dict with sensor names as keys, float values.
        
    Returns:
        Scaled feature array ready for prediction.
    """
    # Build feature vector in correct order
    features = []
    for col in SENSOR_COLUMNS:
        features.append(sensor_readings.get(col, 0.0))

    feature_array = np.array(features).reshape(1, -1)

    # Scale if scaler is available
    if _scaler is not None:
        feature_array = _scaler.transform(feature_array)

    return feature_array


def predict_rul(sensor_readings: dict) -> dict:
    """
    Predict Remaining Useful Life (RUL) from sensor readings.
    
    Args:
        sensor_readings: Dict with sensor names as keys.
        
    Returns:
        Dict with prediction results including RUL, status, and confidence.
    """
    if _model_loaded and _model is not None:
        # ── Real Model Prediction ──
        features = preprocess_sensor_data(sensor_readings)
        rul_prediction = float(_model.predict(features)[0])

        # Clamp RUL to reasonable range
        rul_prediction = max(0, min(rul_prediction, 300))

    else:
        # ── Demo Mode: Simulated Prediction ──
        rul_prediction = _simulate_rul(sensor_readings)

    # Determine system status based on RUL
    status, severity, confidence = _classify_status(rul_prediction)

    return {
        "rul_cycles": round(rul_prediction, 1),
        "rul_minutes": round(rul_prediction * 2.5, 1),  # ~2.5 min per cycle
        "status": status,
        "severity": severity,
        "confidence": round(confidence, 2),
        "timestamp": datetime.utcnow().isoformat(),
        "model_active": _model_loaded
    }


def _simulate_rul(sensor_readings: dict) -> float:
    """
    Generate realistic simulated RUL based on sensor values.
    Uses heuristic analysis of key degradation indicators.
    """
    # Key degradation indicators from CMAPSS
    temp_factor = sensor_readings.get("sensor_2", 641.0)  # Total temp at LPC outlet
    pressure_factor = sensor_readings.get("sensor_3", 1589.0)  # Total temp at HPC outlet
    vibration = sensor_readings.get("sensor_7", 553.0)  # Total temp at LPT outlet
    speed = sensor_readings.get("sensor_4", 1400.0)  # Physical speed of core

    # Normalize and compute degradation score (0 = healthy, 1 = critical)
    temp_score = max(0, min(1, (temp_factor - 640) / 5))
    pressure_score = max(0, min(1, (pressure_factor - 1580) / 20))
    vibration_score = max(0, min(1, (vibration - 550) / 10))
    speed_score = max(0, min(1, (speed - 1390) / 30))

    degradation = (temp_score * 0.3 + pressure_score * 0.3 +
                   vibration_score * 0.2 + speed_score * 0.2)

    # Map degradation to RUL (inverse relationship)
    base_rul = 200 * (1 - degradation)

    # Add some noise for realism
    noise = np.random.normal(0, 5)
    return max(0, base_rul + noise)


def _classify_status(rul: float) -> tuple:
    """Classify system status based on predicted RUL."""
    if rul > 120:
        return "NOMINAL", "low", 0.92
    elif rul > 60:
        return "WATCH", "medium", 0.87
    elif rul > 20:
        return "WARNING", "high", 0.83
    elif rul > 5:
        return "CRITICAL", "critical", 0.79
    else:
        return "FAILURE_IMMINENT", "emergency", 0.95


def generate_simulated_sensors(cycle: int = 0, degradation_rate: float = 0.0) -> dict:
    """
    Generate simulated IoT sensor data mimicking a turbofan engine.
    Degradation rate controls how quickly the engine deteriorates (0.0 to 1.0).
    
    Args:
        cycle: Current operating cycle number.
        degradation_rate: How degraded the engine is (0=new, 1=failing).
    
    Returns:
        Dict of sensor readings with realistic noise.
    """
    d = min(1.0, degradation_rate)
    noise = lambda scale=1.0: np.random.normal(0, scale)

    sensors = {
        "sensor_2":  round(641.82 + d * 4.5 + noise(0.3), 2),   # LPC outlet temp
        "sensor_3":  round(1589.7 + d * 18.0 + noise(1.2), 2),  # HPC outlet temp
        "sensor_4":  round(1400.6 + d * 25.0 + noise(2.0), 2),  # Core speed
        "sensor_7":  round(553.75 + d * 8.0 + noise(0.5), 2),   # LPT outlet temp
        "sensor_8":  round(2388.1 - d * 1.5 + noise(0.1), 2),   # Physical fan speed
        "sensor_9":  round(9046.2 + d * 15.0 + noise(3.0), 2),  # Physical core speed
        "sensor_11": round(47.47 + d * 1.2 + noise(0.1), 2),    # Static pressure at HPC outlet
        "sensor_12": round(521.66 + d * 3.5 + noise(0.4), 2),   # Fuel flow ratio
        "sensor_13": round(2388.0 - d * 2.0 + noise(0.2), 2),   # Corrected fan speed
        "sensor_14": round(8138.6 + d * 10.0 + noise(2.0), 2),  # Corrected core speed
        "sensor_15": round(8.44 + d * 0.5 + noise(0.05), 2),    # Bypass ratio
        "sensor_17": round(392.0 + d * 2.0 + noise(0.3), 2),    # Bleed enthalpy
        "sensor_20": round(38.86 + d * 0.8 + noise(0.1), 2),    # HPT coolant bleed
        "sensor_21": round(23.42 + d * 1.0 + noise(0.1), 2),    # LPT coolant bleed
    }

    # Operational settings
    operational = {
        "op_setting_1": round(-0.0007 + noise(0.001), 4),
        "op_setting_2": round(-0.0004 + noise(0.0005), 4),
        "op_setting_3": round(100.0, 1),
    }

    return {
        "cycle": cycle,
        "sensors": sensors,
        "operational": operational,
        "degradation": round(d, 4),
        "timestamp": datetime.utcnow().isoformat()
    }


def get_model_info() -> dict:
    """Return info about the currently loaded model."""
    return {
        "model_loaded": _model_loaded,
        "model_path": MODEL_PATH if _model_loaded else None,
        "scaler_path": SCALER_PATH if _model_loaded else None,
        "sensor_columns": SENSOR_COLUMNS,
        "mode": "production" if _model_loaded else "demo_simulation",
    }
