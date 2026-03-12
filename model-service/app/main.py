from fastapi import FastAPI, Request
from .model import GlobalModel

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

