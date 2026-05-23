from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import MODEL, get_vlm_url, set_vlm_url
from routers import chat, barcode, store_map, product_info
from routers import main_agent, shelf_scan, barcode_agent, location
import database

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Init new tables on startup
database.init_new_tables()

app.include_router(chat.router)
app.include_router(barcode.router)
app.include_router(store_map.router)
app.include_router(product_info.router)
app.include_router(main_agent.router)
app.include_router(shelf_scan.router)
app.include_router(barcode_agent.router)
app.include_router(location.router)


@app.delete("/agent_state")
def reset_agent_state():
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
