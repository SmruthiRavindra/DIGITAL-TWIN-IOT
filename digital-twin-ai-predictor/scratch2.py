import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
from sklearn.preprocessing import PolynomialFeatures
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

RUL_CAP = 125
train_df["RUL"] = train_df["RUL"].clip(upper=RUL_CAP)

sensor_cols = [f"sensor_{i}" for i in range(1, 22)]
sensor_std = train_df[sensor_cols].std()
useful_sensors = sensor_std[sensor_std > 0.01].index.tolist()

X = train_df[useful_sensors].values
y = train_df["RUL"].values

poly = PolynomialFeatures(degree=2, interaction_only=True, include_bias=False)
X_poly = poly.fit_transform(X)

scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X_poly)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

model = xgb.XGBRegressor(
    n_estimators=300,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1
)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)
print(f"R2 with Poly Features: {r2_score(y_test, y_pred)}")
