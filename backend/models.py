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
# Passive Agent
# --------------------------------------------------------------------------- #

class PassiveFrameRequest(BaseModel):
    frame: str  # base64 JPEG

class PassiveFrameResponse(BaseModel):
    updated_summary: str
    updated_load_type: int
    updated_confidence: float
    intervene: bool
    response: Optional[str] = None


# --------------------------------------------------------------------------- #
# Active Agent
# --------------------------------------------------------------------------- #

class ActiveFrameRequest(BaseModel):
    user_message: str
    frame: Optional[str] = None

class ActionCall(BaseModel):
    name: str
    args: dict = {}

class ActiveFrameResponse(BaseModel):
    response: str
    suggested_action: Optional[str] = None       # passive load hint: "scan"
    suggested_actions: list[ActionCall] = []     # tools pending user confirmation
    execute_action: Optional[str] = None         # confirmed tool action for frontend to trigger
    updated_summary: str
    updated_load_type: int
    updated_confidence: float


# --------------------------------------------------------------------------- #
# Product Info / Compare
# --------------------------------------------------------------------------- #

class MinimalProduct(BaseModel):
    name: str
    brand: Optional[str] = None
    nutriscore: Optional[str] = None
    nova: Optional[int] = None
    calories: Optional[float] = None
    fat: Optional[float] = None
    saturated_fat: Optional[float] = None
    sugars: Optional[float] = None
    protein: Optional[float] = None
    salt: Optional[float] = None

class ProductSummary(BaseModel):
    name: str
    summary: str

class ProductInfoRequest(BaseModel):
    products: list[MinimalProduct]
    context: Optional[str] = None  # optional hint: what the user was trying to do

class ProductInfoResponse(BaseModel):
    products: list[ProductSummary]
    comparison: Optional[str] = None  # null when only 1 product
    spoken_response: str              # TTS-ready, added to agent history


# --------------------------------------------------------------------------- #
# Navigate Action
# --------------------------------------------------------------------------- #

class NavigateRequest(BaseModel):
    store_map: str              # base64 JPEG
    frame: Optional[str] = None

class NavigateResponse(BaseModel):
    response: str               # spoken aisle directions


# --------------------------------------------------------------------------- #
# Store Map Upload
# --------------------------------------------------------------------------- #

class StoreMapUploadRequest(BaseModel):
    image: str  # base64 JPEG

class StoreMapUploadResponse(BaseModel):
    success: bool
    message: Optional[str] = None


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
# User Profile
# --------------------------------------------------------------------------- #

class UserProfile(BaseModel):
    goals: list[str] = []
    restrictions: list[str] = []
    priorities: list[str] = []


# --------------------------------------------------------------------------- #
# PTT — Main Agent
# --------------------------------------------------------------------------- #

class PTTRequest(BaseModel):
    user_message: str
    history: list[ChatMessage] = []

class PTTResponse(BaseModel):
    response: str


# --------------------------------------------------------------------------- #
# Shelf Scan — Start Assistance
# --------------------------------------------------------------------------- #

class DetectedProduct(BaseModel):
    name: str
    brand: str
    in_db: str = "uncertain"  # "found" | "uncertain"

class ShelfScanRequest(BaseModel):
    frames: list[str]  # base64 JPEGs

class TopProduct(BaseModel):
    name: str
    brand: Optional[str] = None
    reason: str
    score: int  # 1-10, how well it fits the user profile

class ShelfScanResponse(BaseModel):
    category: str
    detected_products: list[DetectedProduct]
    recommendation: str
    winner: Optional[str] = None
    top3: list[TopProduct] = []
    fallback_level: int                  # 1 = full DB recommendation, 2 = category known, 3 = unknown
    spoken: str


# --------------------------------------------------------------------------- #
# Barcode Analysis
# --------------------------------------------------------------------------- #

class BarcodeAnalyzeRequest(BaseModel):
    products: list[MinimalProduct]

class BarcodeAnalyzeResponse(BaseModel):
    verdict: str          # "take" | "skip" | "consider"
    winner: Optional[str] = None
    reason: str
    spoken: str


# --------------------------------------------------------------------------- #
# Store Location
# --------------------------------------------------------------------------- #

class StoreLocation(BaseModel):
    category: str
    aisle: str
    landmarks: Optional[str] = None

class LocationResponse(BaseModel):
    category: str
    aisle: str
    landmarks: Optional[str] = None
    spoken: str
