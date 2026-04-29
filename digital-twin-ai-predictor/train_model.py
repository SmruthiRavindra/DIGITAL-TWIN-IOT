"""
train_model.py — Download NASA CMAPSS data via kagglehub & train XGBoost RUL model.

Usage:
    python train_model.py
"""

import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import xgboost as xgb
import joblib
import kagglehub
import matplotlib.pyplot as plt
import seaborn as sns

# ─── Paths ──────────────────────────────────────────────────
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(ROOT_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# ─── 1. Download Dataset via kagglehub ──────────────────────
print("=" * 60)
print("📥  STEP 1: Downloading NASA CMAPSS dataset via kagglehub")
print("=" * 60)

dataset_path = kagglehub.dataset_download("behrad3d/nasa-cmaps")
print(f"✅  Dataset path: {dataset_path}")

# List files to find the right ones
for f in os.listdir(dataset_path):
    print(f"   📄 {f}")

# ─── 2. Load Training Data ─────────────────────────────────
print("\n" + "=" * 60)
print("📊  STEP 2: Loading training data")
print("=" * 60)

# CMAPSS column definitions
index_cols = ["unit_id", "cycle"]
setting_cols = ["op_setting_1", "op_setting_2", "op_setting_3"]
sensor_cols = [f"sensor_{i}" for i in range(1, 22)]
all_cols = index_cols + setting_cols + sensor_cols

# Find the train file (could be train_FD001.txt)
train_file = None
for f in os.listdir(dataset_path):
    if f.lower().startswith("train") and f.endswith(".txt"):
        train_file = os.path.join(dataset_path, f)
        break

if train_file is None:
    # Check subdirectories
    for root, dirs, files in os.walk(dataset_path):
        for f in files:
            if f.lower().startswith("train") and f.endswith(".txt"):
                train_file = os.path.join(root, f)
                break
        if train_file:
            break

if train_file is None:
    raise FileNotFoundError(f"Could not find train_FD001.txt in {dataset_path}")

print(f"📄  Using: {train_file}")

train_df = pd.read_csv(
    train_file, sep=r"\s+", header=None, names=all_cols, index_col=False
)
# Drop any fully-NaN columns (trailing whitespace artifacts)
train_df = train_df.dropna(axis=1, how="all")

print(f"✅  Loaded: {train_df.shape[0]} rows, {train_df.shape[1]} columns")
print(f"   Engines: {train_df['unit_id'].nunique()}")

# ─── 3. Compute RUL (target) ───────────────────────────────
print("\n" + "=" * 60)
print("🎯  STEP 3: Computing Remaining Useful Life (RUL)")
print("=" * 60)

max_cycles = train_df.groupby("unit_id")["cycle"].max().reset_index()
max_cycles.columns = ["unit_id", "max_cycle"]
train_df = train_df.merge(max_cycles, on="unit_id")
train_df["RUL"] = train_df["max_cycle"] - train_df["cycle"]

# Piece-wise linear cap at 125 cycles
RUL_CAP = 125
train_df["RUL"] = train_df["RUL"].clip(upper=RUL_CAP)

print(f"✅  RUL range: {train_df['RUL'].min()} – {train_df['RUL'].max()}")

# ─── 4. Feature Selection & Scaling ────────────────────────
print("\n" + "=" * 60)
print("⚙️   STEP 4: Feature selection & scaling")
print("=" * 60)

# Keep only sensors with meaningful variance
available_sensors = [c for c in sensor_cols if c in train_df.columns]
sensor_std = train_df[available_sensors].std()
useful_sensors = sensor_std[sensor_std > 0.01].index.tolist()
constant_sensors = [s for s in available_sensors if s not in useful_sensors]

print(f"   Useful sensors ({len(useful_sensors)}): {useful_sensors}")
print(f"   Dropped constants ({len(constant_sensors)}): {constant_sensors}")

X = train_df[useful_sensors].values
y = train_df["RUL"].values

# Min-Max scaling
scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X)

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

print(f"✅  Train: {X_train.shape}, Test: {X_test.shape}")

# ─── 5. Train XGBoost ──────────────────────────────────────
from sklearn.model_selection import GridSearchCV

print("\n" + "=" * 60)
print("🧠  STEP 5: Training XGBoost model with Grid Search")
print("=" * 60)
print("Starting exhaustive Hyperparameter Grid Search... This will take a moment.")

# Define the base model
xgb_base = xgb.XGBRegressor(
    objective="reg:squarederror",
    random_state=42,
    n_jobs=-1,
)

# Define the parameters we want the computer to test
param_grid = {
    'n_estimators': [100, 200, 300],
    'learning_rate': [0.01, 0.05, 0.1],
    'max_depth': [3, 5, 7]
}

# Run the search (This trains 27 different models under the hood!)
grid_search = GridSearchCV(
    estimator=xgb_base, 
    param_grid=param_grid, 
    cv=3, 
    scoring='neg_root_mean_squared_error', 
    verbose=2
)
grid_search.fit(X_train, y_train)

# Use the best model it found
model = grid_search.best_estimator_
print(f"✅  Best parameters found: {grid_search.best_params_}")

# ─── 6. Evaluate ───────────────────────────────────────────
print("\n" + "=" * 60)
print("📈  STEP 6: Evaluation")
print("=" * 60)

y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"   RMSE : {rmse:.2f}")
print(f"   MAE  : {mae:.2f}")
print(f"   R²   : {r2:.4f}")

# ─── 7. Save Model & Scaler ────────────────────────────────
print("\n" + "=" * 60)
print("💾  STEP 7: Saving model & scaler")
print("=" * 60)

model_path = os.path.join(MODEL_DIR, "turbo_model.pkl")
scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")

joblib.dump(model, model_path)
joblib.dump(scaler, scaler_path)

# Also save the sensor column names so backend knows the order
meta = {
    "useful_sensors": useful_sensors,
    "rul_cap": RUL_CAP,
    "rmse": round(rmse, 2),
    "mae": round(mae, 2),
    "r2": round(r2, 4),
}
joblib.dump(meta, os.path.join(MODEL_DIR, "model_meta.joblib"))

print(f"✅  Model  → {model_path}")
print(f"✅  Scaler → {scaler_path}")
print(f"✅  Meta   → {os.path.join(MODEL_DIR, 'model_meta.joblib')}")

# ─── 8. Generate Validation Plots ───────────────────────────
print("\n" + "=" * 60)
print("📈  STEP 8: Generating validation plots")
print("=" * 60)

sns.set_theme(style="darkgrid")

# Plot 1: Feature Importance
plt.figure(figsize=(10, 6))
# Get feature importances and sort them
importances = model.feature_importances_
indices = np.argsort(importances)
plt.barh(range(len(indices)), importances[indices], color='cyan', align='center')
plt.yticks(range(len(indices)), [useful_sensors[i] for i in indices])
plt.xlabel('Relative Importance')
plt.title('Feature Importance (Which sensors drive failure the most?)')
plt.tight_layout()
feat_imp_path = os.path.join(MODEL_DIR, "feature_importance.png")
plt.savefig(feat_imp_path, dpi=300, facecolor='#0a0e1a', edgecolor='none')
plt.close()
print(f"✅  Feature Importance Plot → {feat_imp_path}")

# Plot 2: Actual vs Predicted RUL
plt.figure(figsize=(8, 8))
plt.scatter(y_test, y_pred, alpha=0.5, color='magenta', edgecolor='white', linewidth=0.5)
plt.plot([0, RUL_CAP], [0, RUL_CAP], 'w--', linewidth=2) # Perfect prediction line
plt.xlabel('Actual RUL (Cycles)')
plt.ylabel('Predicted RUL (Cycles)')
plt.title(f'Actual vs. Predicted RUL (R² = {r2:.3f})')
plt.tight_layout()
val_plot_path = os.path.join(MODEL_DIR, "actual_vs_predicted.png")
plt.savefig(val_plot_path, dpi=300, facecolor='#0a0e1a', edgecolor='none')
plt.close()
print(f"✅  Actual vs Predicted Plot → {val_plot_path}")

print("\n" + "=" * 60)
print("🎉  TRAINING COMPLETE — Model is ready for the Digital Twin!")
print("=" * 60)
