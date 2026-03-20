from fastapi import FastAPI, Request
from .model import GlobalModel
import pandas as pd
import os

app = FastAPI()
model = GlobalModel()

@app.post("/train")
async def train(req: Request):
    body = await req.json()
    model.train(body["X"], body["y"])

    return {
        "status": 200,
        "message": "Model Training Completed"
    }

FEATURE_COLS = [
    "num_stocks", "max_stock_weight", "top3_concentration",
    "total_weight_drift", "portfolio_return", "portfolio_volatility",
    "sector_concentration", "days_since_last_rebalance",
    "market_return_30d", "market_volatility_30d",
    "market_drawdown_90d", "market_trend",
]

@app.post("/train/dataset")
async def train_from_dataset():
    csv_path = os.path.join(os.path.dirname(__file__), "..", "dataset.csv")
    df = pd.read_csv(csv_path)

    X = df[FEATURE_COLS].values.tolist()
    y = df["rebalancing_label"].astype(int).values.tolist()

    model.train(X, y)
    weights = model.getWeights()

    return {
        "status": 200,
        "message": f"Model trained on {len(y)} samples from dataset.csv",
        "n_samples": len(y),
        "n_features": len(FEATURE_COLS),
        "classes": list(map(int, model.model.classes_)),
        "coeff":      weights["coeff"],
        "intercept":  weights["intercept"],
    }

@app.get("/weights")
async def getWeights():
    weights = model.getWeights()
    return weights

@app.post("/weights")
async def setWeights(req: Request):
    body = await req.json()
    model.setWeights(body["coeff"], body["intercept"])

    return{
        "status" : 200,
        "message": "Model Weights Updated"
    }

