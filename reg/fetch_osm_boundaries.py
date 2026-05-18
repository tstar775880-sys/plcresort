import requests
import json
import time

# 備註：輪詢多個全球 Overpass 映像站以避開限流或拒絕。
# 備註使用繁體中文。

MIRRORS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter" # 台灣國網中心映像站
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept": "*/*"
}

def get_osm_geom(query):
    for mirror in MIRRORS:
        print(f"嘗試站點：{mirror}")
        try:
            # 壓縮 Query
            compact_q = "".join([line.strip() for line in query.splitlines()])
            response = requests.get(mirror, params={"data": compact_q}, headers=HEADERS, timeout=20)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"  - 狀態碼：{response.status_code}")
        except Exception as e:
            print(f"  - 連線出錯：{e}")
    return None

queries = {
    "promiseland": """
        [out:json];
        relation(5828514);
        out geom;
    """,
    "a2_waterfront": """
        [out:json];
        way(840605422);
        out geom;
    """,
    "fengzhigu_search": """
        [out:json];
        (
          way["name"~"豐之谷"];
          relation["name"~"豐之谷"];
        );
        out geom;
    """
}

results = {}

for key, query in queries.items():
    print(f"\n=== 查詢：{key} ===")
    data = get_osm_geom(query)
    if data:
        print("  => 查詢成功！")
        results[key] = data
    else:
        print("  => 所有站點皆查詢失敗。")
    time.sleep(1)

# 儲存完整回應到 reg 資料夾
with open("reg/osm_boundaries_raw.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

parsed_data = {}

# 1. 解析理想大地 (Relation: 5828514)
if "promiseland" in results and results["promiseland"].get("elements"):
    el = results["promiseland"]["elements"][0]
    # 連接所有 outer members 的軌跡
    combined = []
    for m in el.get("members", []):
        if m.get("role") == "outer" and "geometry" in m:
            pts = [[pt["lat"], pt["lon"]] for pt in m["geometry"]]
            combined.append(pts)
    
    parsed_data["promiseland"] = combined
    print(f"\n解析理想大地完成：共有 {len(combined)} 組線段")

# 2. 解析 A2 水岸園區
if "a2_waterfront" in results and results["a2_waterfront"].get("elements"):
    el = results["a2_waterfront"]["elements"][0]
    if "geometry" in el:
        coords = [[pt["lat"], pt["lon"]] for pt in el["geometry"]]
        parsed_data["a2_waterfront"] = coords
        print(f"解析 A2 水岸園區完成：共有 {len(coords)} 個端點")

# 3. 解析 豐之谷生態公園
if "fengzhigu_search" in results and results["fengzhigu_search"].get("elements"):
    elements = results["fengzhigu_search"]["elements"]
    print(f"解析豐之谷搜尋結果，共找到 {len(elements)} 個匹配")
    for idx, el in enumerate(elements):
        name = el.get("tags", {}).get("name", f"豐之谷-{idx}")
        if "geometry" in el:
            coords = [[pt["lat"], pt["lon"]] for pt in el["geometry"]]
            parsed_data[f"fengzhigu_{idx}"] = {
                "name": name,
                "coords": coords
            }
            print(f"  - 擷取 [{name}] 物件成功 ({len(coords)} 個端點)")
            
with open("reg/osm_boundaries_parsed.json", "w", encoding="utf-8") as f:
    json.dump(parsed_data, f, ensure_ascii=False, indent=2)
print("\n完成！解析後的座標已存至 reg/osm_boundaries_parsed.json")
