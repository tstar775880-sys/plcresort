import json

with open("reg/seville_nearby.json", "r", encoding="utf-8") as f:
    data = json.load(f)

output_data = []
for el in data.get("elements", []):
    tags = el.get("tags", {})
    if tags.get("landuse") == "meadow" or "草原" in str(tags):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": el["id"], "tags": tags},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[pt["lon"], pt["lat"]] for pt in el["geometry"]]
                    }
                }
            ]
        }
        output_data.append(geojson)

with open("reg/meadow_output.json", "w", encoding="utf-8") as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)
print("Wrote meadow output file successfully")
