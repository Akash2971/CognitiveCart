import base64
import io

from fastapi import APIRouter
from PIL import Image

from models import DwellCheckRequest, DwellCheckResponse

router = APIRouter()


def dhash(b64: str) -> str:
    """64-bit difference hash — brightness-invariant perceptual hash."""
    img_bytes = base64.b64decode(b64)
    img = Image.open(io.BytesIO(img_bytes)).convert('L').resize((9, 8), Image.LANCZOS)
    pixels = list(img.getdata())
    bits = []
    for row in range(8):
        for col in range(8):
            bits.append('1' if pixels[row * 9 + col] > pixels[row * 9 + col + 1] else '0')
    return ''.join(bits)


@router.post("/dwell_check", response_model=DwellCheckResponse)
def dwell_check(req: DwellCheckRequest):
    try:
        h = dhash(req.frame)
    except Exception:
        h = ""
    return DwellCheckResponse(hash=h)
