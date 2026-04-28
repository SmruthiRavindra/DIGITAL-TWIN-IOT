"""
main.py — FastAPI server for the Digital Twin AI Failure Predictor.

Endpoints:
  POST /predict       → Send sensor data, get RUL prediction
  GET  /stream        → SSE stream of live sensor data + predictions
  GET  /sensor-data   → Single snapshot of simulated sensor data
  GET  /model-info    → Info about the loaded ML model
  GET  /health        → Health check
"""

import asyncio
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
import json

from model_utils import (
    load_model,
    predict_rul,
    generate_simulated_sensors,
    get_model_info,
)

# ─── App Setup ──────────────────────────────────────────────────
app = FastAPI(
    title="Digital Twin AI Failure Predictor",
    description="Real-time turbofan engine digital twin with ML-powered RUL prediction",
    version="1.0.0",
)

# CORS — allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── State ──────────────────────────────────────────────────────
engine_state = {
    "cycle": 0,
    "degradation": 0.0,
    "degradation_speed": 0.003,  # How fast the engine degrades per cycle
    "running": True,
    "history": [],
}


# ─── Startup ────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Load model on server start."""
    load_model()
    print("🚀 Digital Twin AI Predictor is ONLINE")


# ─── Request Models ────────────────────────────────────────────
class SensorInput(BaseModel):
    sensor_2: float = 641.82
    sensor_3: float = 1589.7
    sensor_4: float = 1400.6
    sensor_7: float = 553.75
    sensor_8: float = 2388.1
    sensor_9: float = 9046.2
    sensor_11: float = 47.47
    sensor_12: float = 521.66
    sensor_13: float = 2388.0
    sensor_14: float = 8138.6
    sensor_15: float = 8.44
    sensor_17: float = 392.0
    sensor_20: float = 38.86
    sensor_21: float = 23.42


class EngineControl(BaseModel):
    action: str  # "reset", "speed_up", "slow_down", "pause", "resume"
    value: Optional[float] = None


# ─── Routes ─────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Digital Twin AI Predictor",
        "engine_cycle": engine_state["cycle"],
        "degradation": round(engine_state["degradation"], 4),
    }


@app.post("/predict")
async def predict(sensor_input: SensorInput):
    """
    Accept sensor readings and return RUL prediction.
    """
    readings = sensor_input.model_dump()
    prediction = predict_rul(readings)
    return prediction


@app.get("/sensor-data")
async def get_sensor_data():
    """
    Get a single snapshot of current simulated sensor data with prediction.
    """
    # Advance engine state
    engine_state["cycle"] += 1
    engine_state["degradation"] = min(
        1.0,
        engine_state["degradation"] + engine_state["degradation_speed"]
    )

    # Generate sensor readings
    data = generate_simulated_sensors(
        cycle=engine_state["cycle"],
        degradation_rate=engine_state["degradation"],
    )

    # Run prediction on the generated sensors
    prediction = predict_rul(data["sensors"])

    # Build response
    response = {
        **data,
        "prediction": prediction,
    }

    # Store in history (keep last 200 readings)
    engine_state["history"].append({
        "cycle": engine_state["cycle"],
        "rul": prediction["rul_cycles"],
        "status": prediction["status"],
        "degradation": engine_state["degradation"],
    })
    if len(engine_state["history"]) > 200:
        engine_state["history"] = engine_state["history"][-200:]

    return response


@app.get("/stream")
async def stream_sensor_data():
    """
    Server-Sent Events (SSE) stream of live sensor data and predictions.
    Updates every 1.5 seconds, simulating real-time IoT telemetry.
    """
    async def event_generator():
        while engine_state["running"]:
            # Advance engine
            engine_state["cycle"] += 1
            engine_state["degradation"] = min(
                1.0,
                engine_state["degradation"] + engine_state["degradation_speed"]
            )

            # Generate data + prediction
            data = generate_simulated_sensors(
                cycle=engine_state["cycle"],
                degradation_rate=engine_state["degradation"],
            )
            prediction = predict_rul(data["sensors"])

            payload = {
                **data,
                "prediction": prediction,
            }

            # Store in history
            engine_state["history"].append({
                "cycle": engine_state["cycle"],
                "rul": prediction["rul_cycles"],
                "status": prediction["status"],
                "degradation": engine_state["degradation"],
            })
            if len(engine_state["history"]) > 200:
                engine_state["history"] = engine_state["history"][-200:]

            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/control")
async def control_engine(control: EngineControl):
    """
    Control the simulated engine.
    Actions: reset, speed_up, slow_down, pause, resume
    """
    action = control.action.lower()

    if action == "reset":
        engine_state["cycle"] = 0
        engine_state["degradation"] = 0.0
        engine_state["history"] = []
        return {"message": "Engine reset to factory-new state", "status": "reset"}

    elif action == "speed_up":
        engine_state["degradation_speed"] = min(0.05, engine_state["degradation_speed"] * 2)
        return {
            "message": f"Degradation speed increased to {engine_state['degradation_speed']:.4f}",
            "status": "accelerated",
        }

    elif action == "slow_down":
        engine_state["degradation_speed"] = max(0.0005, engine_state["degradation_speed"] / 2)
        return {
            "message": f"Degradation speed decreased to {engine_state['degradation_speed']:.4f}",
            "status": "decelerated",
        }

    elif action == "pause":
        engine_state["running"] = False
        return {"message": "Engine simulation paused", "status": "paused"}

    elif action == "resume":
        engine_state["running"] = True
        return {"message": "Engine simulation resumed", "status": "running"}

    else:
        return {"message": f"Unknown action: {action}", "status": "error"}


@app.get("/history")
async def get_history():
    """Get prediction history for trend analysis."""
    return {
        "total_cycles": engine_state["cycle"],
        "current_degradation": round(engine_state["degradation"], 4),
        "history": engine_state["history"],
    }


@app.get("/model-info")
async def model_info():
    """Get information about the loaded ML model."""
    return get_model_info()


# ─── Run ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
