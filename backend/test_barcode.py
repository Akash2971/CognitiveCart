#!/usr/bin/env python3
import sys
import base64
import json
import requests

BACKEND = "http://localhost:8080"

def scan(image_path: str):
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    resp = requests.post(f"{BACKEND}/test/barcode", json={"image": b64}, timeout=15)
    print(json.dumps(resp.json(), indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_barcode.py <image_path>")
        sys.exit(1)
    scan(sys.argv[1])
