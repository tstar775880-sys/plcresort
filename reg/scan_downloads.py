import requests
from bs4 import BeautifulSoup
import re
import json
import os
import urllib3

# 備註：本程式為測試用途，用於掃描理想大地官網下載專區，尋找歷年活動行程表
# 存放於 reg 資料夾內

# 停用 SSL 憑證警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scan_downloads():
    url = "https://www.plcresort.com.tw/zh_TW/download"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        print("正在請求下載專區網頁...")
        response = requests.get(url, headers=headers, verify=False, timeout=15)
        response.encoding = 'utf-8'
        
        if response.status_code != 200:
            print(f"請求失敗，狀態碼: {response.status_code}")
            return
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 尋找所有的連結
        links = soup.find_all('a', href=True)
        pdf_links = []
        
        print(f"共找到 {len(links)} 個連結，正在篩選 PDF 檔案...")
        for link in links:
            href = link['href']
            text = link.get_text().strip()
            
            if href.lower().endswith('.pdf'):
                # 組合成完整 URL
                if href.startswith('/'):
                    full_url = "https://www.plcresort.com.tw" + href
                elif not href.startswith('http'):
                    full_url = "https://www.plcresort.com.tw/" + href
                else:
                    full_url = href
                
                pdf_links.append({
                    "text": text,
                    "url": full_url
                })
                
        print(f"\n篩選出 {len(pdf_links)} 個 PDF 檔案。")
            
        # 將結果儲存為 JSON 供後續分析
        output_file = os.path.join(os.path.dirname(__file__), "scan_result.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(pdf_links, f, ensure_ascii=False, indent=4)
            
        print(f"掃描結果已儲存至 {output_file}")
            
    except Exception as e:
        print(f"發生錯誤: {e}")

if __name__ == "__main__":
    scan_downloads()
