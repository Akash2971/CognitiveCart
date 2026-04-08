import base64
import time

import cv2
import requests

DETECT_URL = "http://localhost:8080/detect"
ITEMS = ["olive oil", "yogurt", "bread", "cereal", "peanut butter"]
INTERVAL = 3  # seconds between frames


def capture_and_detect():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: could not open webcam")
        return

    print(f"Webcam open. Sending a frame every {INTERVAL}s to {DETECT_URL}")
    print(f"Looking for: {ITEMS}")
    print("Press Q in the webcam window to quit\n")

    session_id = None
    frame_count = 0
    last_sent = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        cv2.imshow("Webcam — press Q to quit", frame)

        now = time.time()
        if now - last_sent >= INTERVAL:
            last_sent = now
            frame_count += 1

            # Encode frame as JPEG base64
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            image_b64 = base64.b64encode(buf).decode("utf-8")

            payload = {
                "image": image_b64,
                "items": ITEMS,
                "session_id": session_id,
            }

            t0 = time.time()
            try:
                resp = requests.post(DETECT_URL, json=payload, timeout=30)
                latency = time.time() - t0
                data = resp.json()
                session_id = data["session_id"]

                print(f"--- Frame {frame_count} ({latency:.2f}s) ---")
                if not data["detections"]:
                    print("  Nothing detected")
                for det in data["detections"]:
                    status = "✓ MATCHED" if det["matched"] else "~ unmatched"
                    brand = det["brand"] or "unknown brand"
                    conf = f"{det['confidence']*100:.0f}%"
                    product_name = det["product"]["name"] if det["product"] else "—"
                    print(f"  {status} | {det['item']} → {brand} ({conf}) | {product_name}")
                print()

            except Exception as e:
                print(f"  Error: {e}\n")

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    capture_and_detect()
