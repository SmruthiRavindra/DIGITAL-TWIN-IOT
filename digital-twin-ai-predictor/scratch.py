import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
import xgboost as xgb
import kagglehub

dataset_path = kagglehub.dataset_download("behrad3d/nasa-cmaps")
train_file = os.path.join(dataset_path, "CMaps", "train_FD001.txt")
columns = ["unit_id", "cycle", "op_setting_1", "op_setting_2", "op_setting_3"] + [f"sensor_{i}" for i in range(1, 22)]
train_df = pd.read_csv(train_file, sep="\s+", header=None, names=columns)
rul = pd.DataFrame(train_df.groupby("unit_id")["cycle"].max()).reset_index()
rul.columns = ["unit_id", "max"]
train_df = train_df.merge(rul, on=["unit_id"], how="left")
train_df["RUL"] = train_df["max"] - train_df["cycle"]

RUL_CAP = 130 # Original was 125, tweaking to 130
train_df["RUL"] = train_df["RUL"].clip(upper=RUL_CAP)

sensor_cols = [f"sensor_{i}" for i in range(1, 22)]
sensor_std = train_df[sensor_cols].std()
useful_sensors = sensor_std[sensor_std > 0.01].index.tolist()

X = train_df[useful_sensors].values
y = train_df["RUL"].values

# Try StandardScaler instead of MinMax
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

# Deeper trees, lower learning rate
model = xgb.XGBRegressor(
    n_estimators=500,
    max_depth=8,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1
)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)
print(f"R2 optimized: {r2_score(y_test, y_pred)}")
