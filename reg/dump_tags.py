import json

with open("reg/seville_nearby.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for el in data.get("elements", []):
    tags = el.get("tags", {})
    geom_len = len(el.get("geometry", [])) if "geometry" in el else 0
    print(f"Type: {el['type']}, ID: {el['id']}, Nodes: {geom_len}, Tags: {tags}")
