from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import MODEL, get_vlm_url, set_vlm_url
from routers import detect, chat, barcode, passive, active, store_map, product_info
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
app.include_router(store_map.router)
app.include_router(product_info.router)


@app.delete("/agent_state")
def reset_agent_state():
    agent_state.reset()
    return {"ok": True}


class VlmUrlUpdate(BaseModel):
    url: str


@app.post("/config/vlm_url")
def update_vlm_url(body: VlmUrlUpdate):
    set_vlm_url(body.url)
    return {"ok": True, "vlm_url": body.url}


@app.get("/config/vlm_url")
def current_vlm_url():
    return {"vlm_url": get_vlm_url()}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "vlm_url": get_vlm_url()}
