from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import MODEL
from routers import detect, chat, barcode, passive, active
import agent_state

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
app.include_router(chat.router)
app.include_router(barcode.router)
app.include_router(passive.router)
app.include_router(active.router)


@app.delete("/agent_state")
def reset_agent_state():
    agent_state.reset()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}
