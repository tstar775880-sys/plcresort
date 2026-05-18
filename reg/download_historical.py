import requests
import os
import urllib3

# 停用 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def download_file(url, filename):
    try:
        print(f"正在下載: {filename}")
        response = requests.get(url, verify=False, timeout=15)
        if response.status_code == 200:
            with open(filename, "wb") as f:
                f.write(response.content)
            print(f"下載成功: {filename}")
            return True
        else:
            print(f"下載失敗 (HTTP {response.status_code}): {url}")
            return False
    except Exception as e:
        print(f"下載錯誤: {e}")
        return False

def main():
    base_dir = r"d:\python\Python_Develop\plcresort\參考資料"
    
    # 1. 下載已確認存在的 2025 年七月活動表
    url_2025_july = "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2025Nian%20Qi%20Yue%20Fen%20Huo%20Dong%20~Lan%20Biao%20-Shu%20Jia%20-0701.pdf"
    dest_2025 = os.path.join(base_dir, "2025年七月活動一覽表.pdf")
    download_file(url_2025_july, dest_2025)

    # 2. 嘗試探測 2024 年七月的可能網址 (使用常見拼字與日期後綴進行探測)
    # 因網址可能有 -0701, -0702 等，此處僅作基礎展示。若需要更深層探測可建立迴圈。
    print("\n--- 開始探測歷年活動 PDF ---")
    probe_urls = [
        # 2024 年 7 月
        "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2024/2024Nian%20Qi%20Yue%20Fen%20Huo%20Dong%20~Lan%20Biao.pdf",
        "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2024/2024Nian%20Qi%20Yue%20Fen%20Huo%20Dong%20~Lan%20Biao%20-0701.pdf",
        "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2024Nian%20Qi%20Yue%20Fen%20Huo%20Dong%20~Lan%20Biao%20-0701.pdf",
        # 2023 年 7 月
        "https://www.plcresort.com.tw/Xia%20Zai%20Zhuan%20Qu/2023/2023Nian%20Qi%20Yue%20Fen%20Huo%20Dong%20~Lan%20Biao.pdf",
    ]
    
    for url in probe_urls:
        # 解析出檔名作為探測用檔名
        basename = url.split('/')[-1]
        # 將 %20 還原為空格
        clean_name = requests.utils.unquote(basename)
        temp_dest = os.path.join(r"d:\python\Python_Develop\plcresort\reg", clean_name)
        
        # 發送 HEAD 請求確認檔案是否存在，避免直接下載大檔
        try:
            res = requests.head(url, verify=False, timeout=5)
            if res.status_code == 200:
                print(f"[探測成功] 找到網址: {url}")
                download_file(url, temp_dest)
            else:
                print(f"[探測跳過] {clean_name} (HTTP {res.status_code})")
        except:
            pass

if __name__ == "__main__":
    main()
