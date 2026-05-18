import os
import urllib.request
import ssl

# Bypass SSL certificate verification if necessary
ssl._create_default_https_context = ssl._create_unverified_context

pdf_links = {
    "2026_outside_tours.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2026/2026Nian%20Du%20Guan%20Wai%20Ban%20Ri%20You%20~Ri%20You%20Xing%20Cheng%20.pdf",
    "ideal_paark_menu.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2026/Shen%20Nong%20Sheng%20Huo%20-Can%20Yin%20Cai%20Dan%20.pdf",
    "2025_zen_spa.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2025/2025Nian%20Du%20%20ZEN%20SPALiao%20Cheng%20~Lan%20Biao%20.pdf",
    "aroma_menu.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2026/Feng%20Wei%20Cai%20Dan%20_Guan%20Wang%20Yong%20.pdf",
    "latest_resort_map.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2026/Quan%20Qu%20Di%20Tu%20_s20260514.pdf",
    "gifts_promo.pdf": "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2026/2026Zong%20He%20Ban%20Shou%20Li%20Cu%20Xiao%20Ding%20Gou%20Dan%20_S.pdf"
}

dest_dir = "reg/official_resources"
os.makedirs(dest_dir, exist_ok=True)

print("Starting Promiseland PDF downloads...")

for filename, url in pdf_links.items():
    target_path = os.path.join(dest_dir, filename)
    print(f"Downloading {filename}...")
    try:
        # Use custom headers to mimic a browser and avoid HTTP 403 errors
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response, open(target_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Successfully saved to {target_path}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

print("Download process finished.")
