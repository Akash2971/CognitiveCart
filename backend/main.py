from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import MODEL
from routers import detect, chat, vision_chat, dwell, barcode

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
app.include_router(chat.router)
app.include_router(vision_chat.router)
app.include_router(dwell.router)
app.include_router(barcode.router)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}
