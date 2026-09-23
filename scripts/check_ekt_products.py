"""Fetch page 1 from the EKT catalog API and save it as a local-only fixture.

Set EKT_API_USERNAME and EKT_API_PASSWORD in the environment before running.
"""

import base64
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = os.getenv("EKT_API_BASE_URL", "https://ekt.kz/api").rstrip("/")
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "ekt_products_page1.json"


def main() -> int:
    username = os.getenv("EKT_API_USERNAME", "")
    password = os.getenv("EKT_API_PASSWORD", "")
    if not username or not password:
        print("Set EKT_API_USERNAME and EKT_API_PASSWORD first.", file=sys.stderr)
        return 2

    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    request = Request(
        f"{BASE_URL}/products?page=1",
        headers={"Authorization": f"Basic {token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        print(f"EKT returned HTTP {exc.code}", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Could not fetch/parse EKT product list: {exc}", file=sys.stderr)
        return 1

    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        print("Unexpected response: expected an object containing items[]", file=sys.stderr)
        return 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"OK: page={payload.get('page')}, items={len(payload['items'])}, "
        f"saved={OUTPUT} (ignored by Git)"
    )
    if payload["items"]:
        first = payload["items"][0]
        print(f"First product: id={first.get('id')}, name={first.get('name')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
