import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("VLLM_MODEL")
DB_PATH = os.getenv("DB_PATH", "products.db")

_vlm_url: str = os.getenv("VLLM_BASE_URL", "")
_api_key: str = os.getenv("VLLM_API_KEY", "none")

client = OpenAI(base_url=_vlm_url, api_key=_api_key)

# Groq — vision: Llama 4 Scout, text: GPT OSS 120B
GROQ_VISION_MODEL: str = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")
GROQ_TEXT_MODEL: str = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")
groq_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY", ""),
)


def set_vlm_url(url: str) -> None:
    global client, _vlm_url
    _vlm_url = url
    client = OpenAI(base_url=url, api_key=_api_key)


def get_vlm_url() -> str:
    return _vlm_url
