import requests
import json

MIRRORS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
}

query = """
[out:json];
(
  way(around:100, 23.8649243, 121.5280694);
  relation(around:100, 23.8649243, 121.5280694);
);
out geom;
"""

for mirror in MIRRORS:
    print(f"Trying mirror: {mirror}")
    try:
        r = requests.get(mirror, params={"data": query.strip()}, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            with open("reg/seville_nearby.json", "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("Saved results to reg/seville_nearby.json")
            
            # Check if there are specific names
            for el in data.get("elements", []):
                tags = el.get("tags", {})
                if tags:
                    print(f"Type: {el['type']}, ID: {el['id']}, Tags: {tags.get('name') or tags.get('landuse') or tags}")
            break
        else:
            print(f"Status code: {r.status_code}")
    except Exception as e:
        print(f"Error: {e}")
