import json

from fastapi import APIRouter
from openai import APIConnectionError, APIStatusError

from agent_state import set_store_map_data
from config import MODEL, client
from models import StoreMapUploadRequest, StoreMapUploadResponse

router = APIRouter()

MAP_PARSE_SYSTEM = """\
You are parsing a store map image. Extract every aisle and section into structured JSON.

Return ONLY valid JSON in this exact format:
{
  "aisles": [
    {
      "id": "<aisle label visible on map, e.g. A1, B14>",
      "section": "<section or department name>"
    }
  ],
  "landmarks": ["<landmark, e.g. Main Entrance, Checkout, Pharmacy>", ...],
  "layout_notes": "<one sentence describing the overall spatial layout>"
}

Be thorough — capture every visible aisle number and section name.
Keep values short. Omit fields you cannot determine rather than guessing.
"""


@router.post("/store_map", response_model=StoreMapUploadResponse)
def upload_store_map(req: StoreMapUploadRequest):
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": MAP_PARSE_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{req.image}"},
                        },
                        {"type": "text", "text": "Parse this store map into structured JSON."},
                    ],
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=4096,
        )
        raw = resp.choices[0].message.content.strip()
        map_data = json.loads(raw)
        set_store_map_data(map_data)
        print(f"[MAP] parsed OK:\n{json.dumps(map_data, indent=2)}")
        return StoreMapUploadResponse(success=True)
    except APIConnectionError:
        print("[MAP] error: connection failed")
        return StoreMapUploadResponse(success=False, message="Can't reach the model server.")
    except APIStatusError as e:
        print(f"[MAP] error: API status {e.status_code}")
        return StoreMapUploadResponse(success=False, message=f"Model error {e.status_code}.")
    except Exception as e:
        print(f"[MAP] error: {e}")
        return StoreMapUploadResponse(success=False, message=str(e))
