# 🎯 手機電子羅盤與導航扇形（Compass Cone）實作指南

本文件記錄了如何在未來的網頁版 Leaflet 地圖中，實作像 Google Map 一樣的「定位藍點」以及「視角朝向扇形」。當你需要此功能時，可以直接參考本文件程式碼進行開發。

---

## 🛠️ 技術原理與架構

1. **地理定位（GPS）**：使用 `navigator.geolocation.watchPosition` 即時更新經緯度。
2. **朝向偵測（電子羅盤）**：使用 `deviceorientation` 事件，獲取手機相對於正北方的順時針夾角（0 ~ 360 度）。
3. **地圖渲染（Leaflet）**：
   - 使用 `L.divIcon` 創建一個自訂圖示。
   - 圖示內部包含一個**中心小藍點（Dot）**與一個**半透明扇形（Cone）**。
   - 當收到手機朝向角度時，動態更新扇形的 CSS `transform: rotate(${heading}deg)`。

---

## 💻 核心程式碼實作

### 1. HTML / CSS 樣式設定
在 CSS 中定義定位點與視角扇形的樣式。

```css
/* 定位點容器 */
.user-location-marker {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* 中心實心藍點 */
.user-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background-color: #2b82c9;
    border: 2.5px solid #ffffff;
    box-shadow: 0 0 10px rgba(43, 130, 201, 0.6);
    z-index: 10;
}

/* 外圈呼吸光暈效果 (非必要，但能提升質感) */
.user-dot-pulse {
    position: absolute;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: rgba(43, 130, 201, 0.3);
    animation: pulse 2s infinite ease-out;
    z-index: 9;
}

@keyframes pulse {
    0% { transform: scale(0.6); opacity: 0.8; }
    100% { transform: scale(1.6); opacity: 0; }
}

/* 視角扇形 (朝向錐) */
.user-compass-cone {
    position: absolute;
    top: -20px; /* 根據扇形大小微調位置，使其中心點與藍點重合 */
    width: 80px;
    height: 80px;
    /* 
      使用 CSS 漸層畫出一個 60 度的扇形，指向正上方 (0度)
      透過 transparent 與 rgba 做出半透明漸變效果 
    */
    background: radial-gradient(circle at 50% 50%, rgba(43, 130, 201, 0.4) 0%, rgba(43, 130, 201, 0.05) 70%, transparent 70%);
    clip-path: polygon(50% 50%, 20% 0%, 80% 0%); /* 剪切出扇形視角 */
    transform-origin: 50% 50%;
    z-index: 8;
    transition: transform 0.1s ease-out; /* 讓轉動平滑些 */
}
```

---

### 2. JavaScript 邏輯實作

將以下邏輯整合至 `app.js` 中：

```javascript
let userMarker = null;
let userCoords = null;

// ==================== 初始化定位標記 ====================
function initUserMarker(latlng) {
    // 建立自訂 divIcon
    const locationIcon = L.divIcon({
        className: 'custom-user-icon-container',
        html: `
            <div class="user-location-marker">
                <div class="user-compass-cone" id="user-compass-cone"></div>
                <div class="user-dot-pulse"></div>
                <div class="user-dot"></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    userMarker = L.marker(latlng, { icon: locationIcon }).addTo(map);
}

// ==================== GPS 追蹤 ====================
function startTrackingLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                userCoords = [lat, lng];

                if (!userMarker) {
                    initUserMarker(userCoords);
                } else {
                    userMarker.setLatLng(userCoords);
                }
            },
            (error) => {
                console.error("GPS 定位失敗:", error);
            },
            {
                enableHighAccuracy: true, // 開啟高精度 GPS
                maximumAge: 1000,
                timeout: 10000
            }
        );
    }
}

// ==================== 電子羅盤 (Device Orientation) ====================
function startCompass() {
    const handleOrientation = (event) => {
        let heading = null;

        // 1. iOS 專用屬性 (最精準)
        if (event.webkitCompassHeading !== undefined) {
            heading = event.webkitCompassHeading;
        } 
        // 2. Android 與標準瀏覽器屬性
        else if (event.alpha !== undefined) {
            // alpha 通常是逆時針旋轉，需要轉換為順時針夾角，且不同瀏覽器對 compass 的 absolute 處理不同
            heading = 360 - event.alpha; 
        }

        if (heading !== null) {
            const cone = document.getElementById('user-compass-cone');
            if (cone) {
                // 更新扇形朝向 (加上旋轉角度)
                cone.style.transform = `rotate(${heading}deg)`;
            }
        }
    };

    // 🌟 處理 iOS (Safari) 權限申請大坑
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 裝置，必須透過使用者主動點擊按鈕觸發此函式
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                } else {
                    alert('您拒絕了羅盤權限，地圖將無法顯示您的視角朝向！');
                }
            })
            .catch(console.error);
    } else {
        // Android 或一般桌面瀏覽器，直接監聽即可
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}
```

---

## 📱 推薦的使用者操作介面 (UI)

在手機網頁上，建議在右下角（或右上角）放置一個 **「🎯 定位導航」** 圓形按鈕：

1. **第一次點擊**：
   * 觸發 `startTrackingLocation()` 開始尋找定位，並將地圖視角移動到小藍點中心。
   * 觸發 `startCompass()`，跳出系統權限請求，獲得授權後顯示朝向扇形。
2. **再次點擊**：
   * 快速將地圖視角重置，以自己目前的位置為中心（`map.panTo(userCoords)`）。

這樣一來，既符合主流地圖 App 的操作直覺，也能完美繞過 iOS 的安全瀏覽器權限限制！
