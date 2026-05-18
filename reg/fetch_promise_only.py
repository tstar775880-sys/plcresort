import requests
import json

# 備註：單獨重試下載理想大地邊界資料。
# 備註為繁體中文。

URL = "https://overpass.kumi.systems/api/interpreter"
QUERY = "[out:json];relation(5828514);out geom;"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print("正在對 overpass.kumi.systems 單獨請求 5828514...")
try:
    resp = requests.get(URL, params={"data": QUERY}, headers=HEADERS, timeout=60)
    if resp.status_code == 200:
        data = resp.json()
        with open("reg/promiseland_raw.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("下載成功！原始資料已存入 reg/promiseland_raw.json")
    else:
        print(f"下載失敗，狀態碼：{resp.status_code}")
except Exception as e:
    print(f"下載出錯：{e}")
