import json

# 備註：讀取下載好的原始資料並拼接出最精確的邊界點。
# 備註為繁體中文。

def stitch_ways(ways_geometry):
    """
    將多個未排序的線段(Way)座標拼接為單一連續的閉合環圈。
    ways_geometry: 包含多個 [[lat, lon], ...] 的 list
    """
    if not ways_geometry:
        return []
    
    # 轉換為易處理的 list
    segments = [list(w) for w in ways_geometry]
    stitched = list(segments.pop(0))
    
    # 持續在前後拼接剩餘線段
    while segments:
        found = False
        for i, seg in enumerate(segments):
            # 匹配目前拼接體的尾端與新線段的首端
            if abs(stitched[-1][0] - seg[0][0]) < 1e-6 and abs(stitched[-1][1] - seg[0][1]) < 1e-6:
                stitched.extend(seg[1:])
                segments.pop(i)
                found = True
                break
            # 匹配尾端與新線段尾端 (逆轉新線段)
            elif abs(stitched[-1][0] - seg[-1][0]) < 1e-6 and abs(stitched[-1][1] - seg[-1][1]) < 1e-6:
                stitched.extend(seg[::-1][1:])
                segments.pop(i)
                found = True
                break
            # 匹配首端與新線段首端 (逆轉拼接體)
            elif abs(stitched[0][0] - seg[0][0]) < 1e-6 and abs(stitched[0][1] - seg[0][1]) < 1e-6:
                stitched = seg[::-1][:-1] + stitched
                segments.pop(i)
                found = True
                break
            # 匹配首端與新線段尾端
            elif abs(stitched[0][0] - seg[-1][0]) < 1e-6 and abs(stitched[0][1] - seg[-1][1]) < 1e-6:
                stitched = seg[:-1] + stitched
                segments.pop(i)
                found = True
                break
        if not found:
            # 若發生非閉合或獨立線段，強行併入
            stitched.extend(segments.pop(0))
            
    return stitched

# 1. 讀取理想大地
with open("reg/promiseland_raw.json", "r", encoding="utf-8") as f:
    p_raw = json.load(f)

p_elements = p_raw.get("elements", [])
p_outer_ways = []
if p_elements:
    for m in p_elements[0].get("members", []):
        if m.get("role") == "outer" and "geometry" in m:
            pts = [[pt["lat"], pt["lon"]] for pt in m["geometry"]]
            p_outer_ways.append(pts)

# 進行精準端點拼接
stitched_promise = stitch_ways(p_outer_ways)
print(f"拼接後理想大地總點數：{len(stitched_promise)}")

# 2. 讀取 A2 水岸與豐之谷
with open("reg/osm_boundaries_raw.json", "r", encoding="utf-8") as f:
    raw_others = json.load(f)

# A2 水岸
a2_coords = []
if "a2_waterfront" in raw_others:
    a2_el = raw_others["a2_waterfront"].get("elements", [])
    if a2_el and "geometry" in a2_el[0]:
        a2_coords = [[pt["lat"], pt["lon"]] for pt in a2_el[0]["geometry"]]
print(f"A2 水岸園區總點數：{len(a2_coords)}")

# 豐之谷
feng_coords = []
if "fengzhigu_search" in raw_others:
    f_els = raw_others["fengzhigu_search"].get("elements", [])
    # 我們知道它的 relation id 是 2634139
    target_rel = next((el for el in f_els if el.get("id") == 2634139), None)
    if target_rel:
        f_outer_ways = []
        for m in target_rel.get("members", []):
            if m.get("role") == "outer" and "geometry" in m:
                pts = [[pt["lat"], pt["lon"]] for pt in m["geometry"]]
                f_outer_ways.append(pts)
        feng_coords = stitch_ways(f_outer_ways)
print(f"拼接後豐之谷生態公園總點數：{len(feng_coords)}")

# 輸出為 JS 代碼區塊以利直接注入
js_output = f"""
// ==================== 開放街圖 (OSM) 權威範圍資料 ====================

// 理想大地渡假飯店 主島區邊界 (OSM Relation: 5828514)
const OSM_PROMISELAND = {json.dumps(stitched_promise, indent=2)};

// 豐之谷自然生態公園 邊界 (OSM Relation: 2634139)
const OSM_FENGZHIGU = {json.dumps(feng_coords, indent=2)};

// 鄰近 A2 水岸園區 邊界 (OSM Way: 840605422)
const OSM_A2_WATERFRONT = {json.dumps(a2_coords, indent=2)};
"""

with open("reg/osm_final_js_blocks.txt", "w", encoding="utf-8") as f:
    f.write(js_output)

print("\n已成功生成 JS 代碼塊到 reg/osm_final_js_blocks.txt！")
