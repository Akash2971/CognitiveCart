from typing import Optional
from pydantic import BaseModel


# --------------------------------------------------------------------------- #
# Detect
# --------------------------------------------------------------------------- #

class DetectRequest(BaseModel):
    image: str              # base64 JPEG
    items: list[str]        # e.g. ["olive oil", "yogurt"]
    session_id: Optional[str] = None


class DetectedItem(BaseModel):
    item: str
    brand: Optional[str]
    product_id: Optional[int]
    matched: bool
    confidence: float
    product: Optional[dict]


class DetectResponse(BaseModel):
    session_id: str
    detections: list[DetectedItem]


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    messages: list[ChatMessage]
    confirmed_list: list[str] = []
    pending_proposals: list[str] = []


class ChatResponse(BaseModel):
    response: str
    proposals: list[str] = []
    auto_add: list[str] = []
    suggestions: list[str] = []


# --------------------------------------------------------------------------- #
# Vision Chat (Capture tab — in-store PTT)
# --------------------------------------------------------------------------- #

class VisionChatRequest(BaseModel):
    transcription: str
    frame: Optional[str] = None       # base64 JPEG from glasses
    store_map: Optional[str] = None   # base64 JPEG of store map
    session_id: Optional[str] = None


class VisionChatResponse(BaseModel):
    response: str


# --------------------------------------------------------------------------- #
# Dwell Detection (Capture tab — passive scene monitoring)
# --------------------------------------------------------------------------- #

# --------------------------------------------------------------------------- #
# Barcode Scan
# --------------------------------------------------------------------------- #

class BarcodeScanRequest(BaseModel):
    frame: str  # base64 JPEG from glasses

class NutritionPer100g(BaseModel):
    calories: Optional[float] = None
    fat: Optional[float] = None
    saturated_fat: Optional[float] = None
    carbs: Optional[float] = None
    sugars: Optional[float] = None
    fiber: Optional[float] = None
    protein: Optional[float] = None
    salt: Optional[float] = None
    sodium: Optional[float] = None

class ScannedProduct(BaseModel):
    barcode: str
    name: str
    brand: Optional[str] = None
    size: Optional[str] = None
    serving: Optional[str] = None
    nutriscore: Optional[str] = None
    nova: Optional[int] = None
    ingredients: Optional[str] = None
    allergens: list[str] = []
    labels: list[str] = []
    categories: list[str] = []
    nutrition_per_100g: NutritionPer100g = NutritionPer100g()

class BarcodeScanResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    product: Optional[ScannedProduct] = None

class UpdatePriceRequest(BaseModel):
    price: float


# --------------------------------------------------------------------------- #
# Dwell Detection (Capture tab — passive scene monitoring)
# --------------------------------------------------------------------------- #

class DwellCheckRequest(BaseModel):
    frame: str   # base64 JPEG from glasses

class DwellCheckResponse(BaseModel):
    hash: str    # 64-bit dHash string, empty string on failure
