import requests
import json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
}

query = """
[out:json];
(
  way(23.8648, 121.5279, 23.8652, 121.5282);
  relation(23.8648, 121.5279, 23.8652, 121.5282);
);
out geom;
"""

try:
    r = requests.get("https://overpass.kumi.systems/api/interpreter", params={"data": query.strip()}, headers=HEADERS, timeout=30)
    with open("reg/bbox_results.txt", "w", encoding="utf-8") as logf:
        logf.write(f"Response Status: {r.status_code}\n")
        if r.status_code == 200:
            data = r.json()
            for el in data.get("elements", []):
                logf.write(f"ID: {el['id']}, Type: {el['type']}, Tags: {el.get('tags', {})}\n")
                if 'geometry' in el:
                    logf.write(f"  - Coords count: {len(el['geometry'])}\n")
                    logf.write(f"  - Coords sample: {[[pt['lat'], pt['lon']] for pt in el['geometry']]}\n")
        else:
            logf.write(r.text[:300])
    print("Done! Log saved to reg/bbox_results.txt")
except Exception as e:
    print("Error:", e)
