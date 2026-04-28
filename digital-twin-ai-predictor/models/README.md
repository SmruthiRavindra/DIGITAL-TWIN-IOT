# Models Directory

Store trained model artifacts here:

| File | Description |
|------|-------------|
| `turbo_model.pkl` | Trained XGBoost or LSTM model for RUL prediction |
| `scaler.joblib` | Fitted MinMaxScaler (CRITICAL for inference) |

## Generating Models

Run the training notebook:
```bash
jupyter notebook notebooks/01_eda_and_training.ipynb
```

Models are auto-saved here after training completes.

> ⚠️ Large model files are excluded from Git via `.gitignore`.
