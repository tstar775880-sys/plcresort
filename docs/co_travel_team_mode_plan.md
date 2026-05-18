# 🧭 理想大地「同伴組隊與行程即時共享模式」技術實作規劃書 (Group & Co-travel Mode Plan)

本規劃書記錄了針對「理想大地互動地圖與時間總表」擴充多人即時連線、行程共同編輯、以及隊友即時 GPS 位置共享的輕量化 Serverless 實作藍圖。

---

## 🎯 核心使用場景 (Core Scenarios)

### 1. 📅 團隊行程協同編輯 (Co-planning Itinerary)
* **情境**：親友團體、家庭旅客共同出遊。隊長建立一個房號小組（如 `ROOM-102`），其他隊員掃描 QR Code 並輸入代碼加入。
* **效果**：任何隊員在「時間總表」上點擊勾選或取消某項活動，全隊所有成員的手機螢幕將在 **200 毫秒內同步更新**，無需反覆透過 LINE 確認。
* **分組支援**：允許隊員標記為「A組」或「B組」，在地圖與時間表上呈現精準的分流狀態。

### 2. 📍 隊友地圖即時 GPS 共享 (Real-time Location Tracker)
* **情境**：理想大地度假村幅員遼闊，分島多、水路交錯，旅客散步或搭乘遊艇時極易走散。
* **效果**：啟用後，手機瀏覽器利用 HTML5 Geolocation API 持續監聽隊員 GPS 座標並廣播。
* **地圖呈現**： Leaflet 地圖上會實時渲染帶有隊員姓名的**精緻頭像/圓點標記**（例如：黃色圓點標記「爸爸」、粉色圓點標記「妹妹」），直觀呈現隊友動態。

### 3. 🏆 團隊實境探索打卡 (Explore & Quests Mode)
* **情境**：豐富生態公園與莊園探索樂趣。
* **效果**：隊員走入特定景點範圍（如「水中落羽松」或「孔雀島」方圓 10 公尺內）時自動打卡觸發，解鎖全隊的收集進度。

---

## 🏗️ 系統架構設計 (System Architecture)

採用 **極輕量、免主機租金、零維護成本** 的現代 Web Serverless 架構，保證專案易於部署（如直接託管在 GitHub Pages 或 Vercel）。

```mermaid
graph TD
    A["📱 爸爸的手機 (Mobile Web / PWA)"] <-->|即時 WebSocket 雙向綁定| C[("🔥 Google Firebase Realtime Database")]
    B["📱 媽媽的手機 (Mobile Web / PWA)"] <-->|即時 WebSocket 雙向綁定| C
    D["📱 小孩的手機 (Mobile Web / PWA)"] <-->|即時 WebSocket 雙向綁定| C
    
    subgraph 瀏覽器原生功能 (Browser Native API)
        A1["GPS 定位 (Geolocation API)"] --> A
        A2["離線暫存 (Local Storage)"] --> A
    end
```

### 1. 📲 載體：手機網頁 (Mobile Web) + 漸進式 Web 應用 (PWA)
* **優勢**：**零阻力、免安裝**。旅客掃描度假村 QR Code 即可直接使用，隨時退房隨時關閉，隱私度與體驗極佳。
* **PWA 支援**：透過設定 `manifest.json` 與 `Service Worker`，讓旅客能像一般 APP 一樣一鍵「加入手機主畫面」，支援全螢幕、高流暢度操作。

### 2. ☁️ 雲端中介站：Google Firebase Realtime Database (免費額度託管)
* **數據結構 (JSON Schema)**：
  ```json
  {
    "rooms": {
      "ROOM-102": {
        "createdAt": 1779078400000,
        "itinerary": {
          "p1": true,
          "f3": false
        },
        "members": {
          "member_01": {
            "name": "爸爸",
            "lat": 23.8638956,
            "lng": 121.5271746,
            "lastActive": 1779078450000,
            "color": "#e74c3c"
          },
          "member_02": {
            "name": "媽媽",
            "lat": 23.8636849,
            "lng": 121.5274887,
            "lastActive": 1779078452000,
            "color": "#e84393"
          }
        }
      }
    }
  }
  ```
* **運作機制**：Firebase 採用原生 WebSocket 技術，當資料庫中的地理座標或行程狀態被寫入時，其他已訂閱該 `roomId` 的手機瀏覽器會自動收到推播，完全不需撰寫 Ajax 輪詢，性能極高且省電。

---

## 🛠️ 分階段實作步驟 (Implementation Steps)

### 🚀 第一階段：Firebase 即時連線環境搭建
1. 在 Google Firebase 平台建立一個免費專案，開啟 **Realtime Database** 服務。
2. 於 `index.html` 引入 Firebase SDK，並在 `app.js` 初始化。
3. 建立「隊伍建立 / 加入」控制面板（UI 與現有側邊欄融合，採用微透磨砂玻璃風格）。

### 🛰️ 第二階段：GPS 位置監聽與廣播
1. 實作手機端 Geolocation 位置持續追蹤器：
   ```javascript
   if (navigator.geolocation) {
       navigator.geolocation.watchPosition(
           (position) => {
               const coords = [position.coords.latitude, position.coords.longitude];
               // 即時寫入 Firebase 雲端資料庫中該成員的 lat/lng
           },
           (error) => console.warn(error),
           { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
       );
   }
   ```
2. 當接收到其他隊友的座標更新時，在地圖上使用 `L.circleMarker` 或客製化標記即時重新定位，並提供平滑移動的轉場動畫 (Smooth Marker Transition)。

### 📅 第三階段：協同行程狀態同步
1. 將「時間總表」的活動點選事件與 Firebase 連線。
2. 當某位隊員勾選活動時，自動在 Firebase 的 `itinerary` 下記錄，並向全體隊友廣播更新，動態更新側邊欄的活動清單高亮。

---

> [!NOTE]
> **隱私防護建議**
> 位置共享模式應設計為**主動開啟/關閉**，且當使用者退房或關閉網頁時自動清除資料庫座標，保證旅客隱私安全無虞。
