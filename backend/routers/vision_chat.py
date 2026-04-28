from fastapi import APIRouter
from fastapi.responses import JSONResponse
from openai import APIConnectionError, APIStatusError

from config import client, MODEL
from models import VisionChatRequest, VisionChatResponse

router = APIRouter()

VISION_SYSTEM = """You are CognitiveCart, an in-store AI shopping assistant. The user is wearing Meta Ray-Ban glasses and talking to you hands-free.

Your job is to reduce the user's cognitive load. You have access to what they're looking at (a camera frame from their glasses) and what they're asking.

You can help with exactly 3 things:
1. Navigation — guide the user to the right aisle (use store map if provided)
2. Product narrowing — when there are too many options, ask the user to scan a few specific items
3. Product comparison — compare products the user has scanned

Rules:
- Keep responses SHORT and SPOKEN — 1-3 sentences max. No bullet points or lists.
- If the user's question is out of scope, say so briefly and suggest what you can help with.
- If you can see a shelf in the frame, describe what you see to help orient the user.
- If a store map is provided, use it for navigation guidance.
- Sound warm and natural — this is a voice conversation.
"""


@router.post("/vision_chat", response_model=VisionChatResponse)
def vision_chat(req: VisionChatRequest):
    content: list = [{"type": "text", "text": req.transcription}]

    if req.frame:
        content.insert(0, {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{req.frame}"},
        })

    if req.store_map:
        content.insert(0, {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{req.store_map}"},
        })

    messages = [
        {"role": "system", "content": VISION_SYSTEM},
        {"role": "user", "content": content},
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.5,
            max_tokens=256,
        )
    except APIConnectionError:
        return VisionChatResponse(
            response="Can't reach the model server right now. Make sure the tunnel is up."
        )
    except APIStatusError as e:
        return VisionChatResponse(
            response=f"Model server error {e.status_code}. Try again."
        )

    return VisionChatResponse(response=response.choices[0].message.content.strip())
