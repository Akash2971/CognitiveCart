import base64, json, sys, requests

url = "http://192.168.0.252:8080/scan_barcode"
path = sys.argv[1] if len(sys.argv) > 1 else "/Users/akashelumalai/.claude/image-cache/a738d6d4-00ef-48cd-a004-6681e729f127/15.png"

with open(path, "rb") as f:
    frame = base64.b64encode(f.read()).decode()

resp = requests.post(url, json={"frame": frame})
print(json.dumps(resp.json(), indent=2))
