import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL  = os.getenv("VLLM_MODEL")
client = OpenAI(
    base_url=os.getenv("VLLM_BASE_URL"),
    api_key=os.getenv("VLLM_API_KEY", "none"),
)

DB_PATH = os.getenv("DB_PATH", "products.db")
