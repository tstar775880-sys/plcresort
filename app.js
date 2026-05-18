// 備註：本檔案包含理想大地互動地圖與時間總表之核心邏輯。
// 負責初始化地圖、渲染飯店範圍線、處理分頁視圖切換、動態繪製時間甘特圖軌道。
// 所有備註皆為繁體中文。

document.addEventListener("DOMContentLoaded", () => {
    // ==================== 1. 初始化地圖設定 ====================
    const defaultView = [23.8639, 121.5297]; 
    const defaultZoom = 16.5; 
    
    const map = L.map('map', { zoomControl: false }).setView(defaultView, defaultZoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 2. 載入雙底圖 (1. 優雅圖磚 CartoDB Voyager | 2. 高精細 Esri 衛星圖)
    const voyagerMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 20
    });

    // 建立底圖選單控制項 (置於地圖右下角縮放按鈕上方)
    const baseMaps = {
        "精緻地圖": voyagerMap,
        "衛星影像": esriSatellite
    };
    L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);

    // 2.5 初始化地圖圖層分類群組 (LayerGroup)
    const mapGroups = {
        accommodation: L.layerGroup().addTo(map),
        restaurant: L.layerGroup().addTo(map),
        toilet: L.layerGroup().addTo(map),
        bridge: L.layerGroup().addTo(map),
        attraction: L.layerGroup().addTo(map),
        dock: L.layerGroup().addTo(map)
    };

    // --- 繪製權威開放街圖 (OSM) 範圍多邊形 (新增功能) ---
    
    // 1. 理想大地主島區 (金邊 + 綠底)
    const promiseLandPoly = L.polygon(OSM_PROMISELAND, {
        color: '#cfa056',       // 典雅金邊線
        weight: 2.5,
        dashArray: '6, 12',     // 虛線
        fillColor: '#134036',   // 深湖水綠填充
        fillOpacity: 0.08,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
    promiseLandPoly.bindTooltip("理想大地渡假飯店 主島園區", { sticky: true, className: 'custom-tooltip' });

    // 2. 豐之谷自然生態公園 (薄荷綠邊 + 綠底)
    const fengzhiguPoly = L.polygon(OSM_FENGZHIGU, {
        color: '#3bad82',       // 生態薄荷綠
        weight: 2.5,
        dashArray: '4, 8',
        fillColor: '#2eb872',   // 嫩綠填充
        fillOpacity: 0.06,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
    fengzhiguPoly.bindTooltip("豐之谷自然生態公園 (飯店附屬生態園區)", { sticky: true, className: 'custom-tooltip' });

    // 3. 鄰近 A2 水岸園區 (海洋藍邊 + 藍底)
    const a2WaterfrontPoly = L.polygon(OSM_A2_WATERFRONT, {
        color: '#529adc',       // 海洋藍邊線
        weight: 2,
        dashArray: '5, 10',
        fillColor: '#74b9ff',   // 水岸淺藍填充
        fillOpacity: 0.05,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
    a2WaterfrontPoly.bindTooltip("a2水岸園區 (鄰近知名景點)", { sticky: true, className: 'custom-tooltip' });

    // 4. 風味餐廳 建築範圍 (亮橘紅色 + 填充)
    const buildingFengweiPoly = L.polygon(OSM_BUILDING_FENGWEI, {
        color: '#e17055',       // 暖橘紅色
        weight: 2,
        fillColor: '#e17055',
        fillOpacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.restaurant);
    buildingFengweiPoly.bindTooltip("風味餐廳 (建築主體)", { sticky: true, className: 'custom-tooltip' });

    // 5. 豪雍精品 建築範圍 (桃紫色 + 填充)
    const buildingHaoyongPoly = L.polygon(OSM_BUILDING_HAOYONG, {
        color: '#d63031',       // 深紅色
        weight: 2,
        fillColor: '#d63031',
        fillOpacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    buildingHaoyongPoly.bindTooltip("豪雍精品 (建築主體)", { sticky: true, className: 'custom-tooltip' });

    // 6. 接待大廳 (Lobby) 建築範圍 (高貴褐金 + 填充)
    const buildingLobbyPoly = L.polygon(OSM_BUILDING_LOBBY, {
        color: '#a29bfe',       // 優雅粉紫
        weight: 2.5,
        fillColor: '#a29bfe',
        fillOpacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.accommodation);
    buildingLobbyPoly.bindTooltip("接待大廳 (Lobby 建築主體)", { sticky: true, className: 'custom-tooltip' });

    // 7. 星空電影 建築範圍 (亮紫色 + 填充，營造璀璨星空色彩)
    const starryMoviePoly = L.polygon(OSM_AREA_STARRY_MOVIE, {
        color: '#6c5ce7',       // 深紫藍色
        weight: 2,
        fillColor: '#6c5ce7',
        fillOpacity: 0.15,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    starryMoviePoly.bindTooltip("星空電影", { sticky: true, className: 'custom-tooltip' });

    // 8. 射箭場 範圍 (亮黃金橘 + 虛線填充)
    const areaArcheryPoly = L.polygon(OSM_AREA_ARCHERY, {
        color: '#fdcb6e',       // 金黃色
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#fdcb6e',
        fillOpacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    areaArcheryPoly.bindTooltip("射箭場", { sticky: true, className: 'custom-tooltip' });

    // 9. 塞維亞草原 (精準點位 - 特製綠色圓點)
    const sevilleGrasslandMarker = L.circleMarker(RESORT_LOCATIONS["賽維亞草原"], {
        radius: 8,
        fillColor: '#2ecc71',   // 青草綠
        color: '#fff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(mapGroups.attraction);
    sevilleGrasslandMarker.bindTooltip("塞維亞草原 (Google Map 抓取點位)", { sticky: true, className: 'custom-tooltip' });

    // 10. 瑜珈平台 (精準點位 - 特製圓形標記)
    const yogaPlatformMarker = L.circleMarker(RESORT_LOCATIONS["瑜珈平台"], {
        radius: 7,
        fillColor: '#e84393',   // 亮粉色
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
    }).addTo(mapGroups.attraction);
    yogaPlatformMarker.bindTooltip("瑜珈平台 (戶外露台點位)", { sticky: true, className: 'custom-tooltip' });

    // 10.2 星巴克花蓮理想門市 (特製星巴克綠色圓點標記，置於 A2 水岸區)
    const starbucksMarker = L.circleMarker(RESORT_LOCATIONS["星巴克花蓮理想門市"], {
        radius: 8,
        fillColor: '#00704a',   // 經典星巴克綠色
        color: '#ffffff',       // 高雅白邊
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95
    }).addTo(mapGroups.restaurant);
    starbucksMarker.bindTooltip("星巴克花蓮理想門市 (全台最美童話屋星巴克)", { sticky: true, className: 'custom-tooltip' });

    // 10.5 運河橋樑精準點位標記 (西班牙古典赤磚紅圓點，展現西班牙古風運河水鄉之美)
    const bridges = [
        { name: "神話橋", label: "神話橋" },
        { name: "習閒橋", label: "習閒橋" },
        { name: "山海橋", label: "山海橋" },
        { name: "麥迪遜橋", label: "麥迪遜橋" },
        { name: "日不落橋", label: "日不落橋" },
        { name: "太極橋", label: "太極橋 (官方圖標示，OSM 未顯)" },
        { name: "彩虹橋", label: "彩虹橋" },
        { name: "應許橋", label: "應許橋" },
        { name: "友誼橋", label: "友誼橋" },
        { name: "牽手橋", label: "牽手橋" }
    ];

    bridges.forEach(bridge => {
        const marker = L.circleMarker(RESORT_LOCATIONS[bridge.name], {
            radius: 5.5,
            fillColor: '#d35400',   // 古典赤磚紅/夕陽橘紅
            color: '#ffffff',       // 精緻白框
            weight: 1.8,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(mapGroups.bridge);
        marker.bindTooltip(bridge.label, { sticky: true, className: 'custom-tooltip' });
    });

    // 10.8 運河碼頭精準點位標記 (水天藍色圓點，展現親水碼頭機能)
    const docks = [
        { name: "一號碼頭", label: "一號碼頭" },
        { name: "三號碼頭", label: "三號碼頭" },
        { name: "五號碼頭", label: "五號碼頭" },
        { name: "六號碼頭", label: "六號碼頭" },
        { name: "七號碼頭", label: "七號碼頭" },
        { name: "八號碼頭", label: "八號碼頭" }
    ];

    docks.forEach(dock => {
        const marker = L.circleMarker(RESORT_LOCATIONS[dock.name], {
            radius: 5.5,
            fillColor: '#0984e3',   // 水天藍色/清爽湛藍
            color: '#ffffff',       // 精緻白框
            weight: 1.8,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(mapGroups.dock);
        marker.bindTooltip(dock.label, { sticky: true, className: 'custom-tooltip' });
    });

    // 11. 客房棟建築群 (採用批次優雅渲染，維持地圖整潔度與一致性美學)
    const accommodationBuildings = [
        { coords: OSM_BUILDING_1_GAILUN, name: "1棟 (蓋倫會議室/客房)" },
        { coords: OSM_BUILDING_2, name: "2棟 (客房區)" },
        { coords: OSM_BUILDING_3, name: "3棟 (客房區)" },
        { coords: OSM_BUILDING_5, name: "5棟 (客房區)" },
        { coords: OSM_BUILDING_6, name: "6棟 (客房區)" },
        { coords: OSM_BUILDING_7, name: "7棟 (客房區)" },
        { coords: OSM_BUILDING_8, name: "8棟 (客房區)" },
        { coords: OSM_BUILDING_9, name: "9棟 (客房區)" },
        { coords: OSM_BUILDING_10, name: "10棟 (客房區)" },
        { coords: OSM_BUILDING_11, name: "11棟 (客房區)" },
        { coords: OSM_BUILDING_12, name: "12棟 (客房區)" },
        { coords: OSM_BUILDING_15, name: "15棟 (客房區)" },
        { coords: OSM_BUILDING_16, name: "16棟 (客房區)" },
        { coords: OSM_BUILDING_17, name: "17棟 (客房區)" },
        { coords: OSM_BUILDING_18, name: "18棟 (客房區)" },
        { coords: OSM_BUILDING_19_LIRA, name: "19棟 (里拉餐廳)" },
        { coords: OSM_BUILDING_20, name: "20棟 (客房區)" },
        { coords: OSM_BUILDING_21, name: "21棟 (客房區)" },
        { coords: OSM_BUILDING_22, name: "22棟 (客房區)" }
    ];

    accommodationBuildings.forEach(building => {
        L.polygon(building.coords, {
            color: '#e17055',       // 質感橘紅色邊框
            weight: 1.8,
            fillColor: '#fab1a0',   // 柔和淡橘填充
            fillOpacity: 0.22,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(mapGroups.accommodation)
          .bindTooltip(building.name, { sticky: true, className: 'custom-tooltip' });
    });

    // 12. 理想大地停車場區 (優雅灰色，批次繪製維持視覺一致性)
    const parkingStyle = {
        color: '#7f8c8d',       // 質感灰色邊框
        weight: 1.5,
        fillColor: '#95a5a6',   // 淺灰填充
        fillOpacity: 0.15,
        lineCap: 'round',
        lineJoin: 'round'
    };

    L.polygon(OSM_PARKING_LARGE, parkingStyle).addTo(mapGroups.attraction).bindTooltip("大型停車場", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_PARKING_1, parkingStyle).addTo(mapGroups.attraction).bindTooltip("第一停車場", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_PARKING_2, parkingStyle).addTo(mapGroups.attraction).bindTooltip("第二停車場 (生態公園)", { sticky: true, className: 'custom-tooltip' });

    // 13. 主要島嶼區範圍高亮 (翠綠綠虛線高亮)
    const islandStyle = {
        color: '#16a085',       // 翠綠綠色
        weight: 2,
        dashArray: '5, 5',
        fillColor: '#1abc9c',   // 亮綠填充
        fillOpacity: 0.05,
        lineCap: 'round',
        lineJoin: 'round'
    };
    L.polygon(OSM_AREA_ZHONGDAO, islandStyle).addTo(mapGroups.attraction).bindTooltip("中島區", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_AREA_XIAODAO, islandStyle).addTo(mapGroups.attraction).bindTooltip("小島區", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_AREA_DADAO, islandStyle).addTo(mapGroups.attraction).bindTooltip("大島區", { sticky: true, className: 'custom-tooltip' });

    // 13.5 豐之谷 - 孔雀島 (特製翡翠綠色圓點標記)
    const peacockIslandMarker = L.circleMarker(RESORT_LOCATIONS["孔雀島"], {
        radius: 7,
        fillColor: '#10ac84',   // 經典翡翠綠色
        color: '#ffffff',       // 質感白框
        weight: 1.8,
        opacity: 1,
        fillOpacity: 0.95
    }).addTo(mapGroups.attraction);
    peacockIslandMarker.bindTooltip("孔雀島 (親近可愛孔雀與小山羊)", { sticky: true, className: 'custom-tooltip' });

    // 13.8 豐之谷 - 水中落羽松 (特製落羽杉深綠圓形標記)
    const cypressMarker = L.circleMarker(RESORT_LOCATIONS["水中落羽松"], {
        radius: 7,
        fillColor: '#27ae60',   // 森林深綠色
        color: '#ffffff',       // 高雅白邊
        weight: 1.8,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(mapGroups.attraction);
    cypressMarker.bindTooltip("水中落羽松 (豐之谷水岸絕美秘境)", { sticky: true, className: 'custom-tooltip' });

    // 14. 公共廁所位置 (水藍色醒目框，方便房客迅速搜尋)
    const toiletStyle = {
        color: '#2980b9',       // 深水藍色
        weight: 1.5,
        fillColor: '#3498db',   // 淺水藍色
        fillOpacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
    };
    L.polygon(OSM_TOILET_ZHONGDAO, toiletStyle).addTo(mapGroups.toilet).bindTooltip("中島區公共廁所", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_TOILET_XIAODAO, toiletStyle).addTo(mapGroups.toilet).bindTooltip("小島區公共廁所", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_TOILET_DADAO, toiletStyle).addTo(mapGroups.toilet).bindTooltip("大島區公共廁所", { sticky: true, className: 'custom-tooltip' });
    L.polygon(OSM_BUILDING_FENGZHIGU_TOILET, toiletStyle).addTo(mapGroups.toilet).bindTooltip("豐之谷生態公園公共廁所", { sticky: true, className: 'custom-tooltip' });

    // 15. 里拉餐廳主體 (精緻磚橘色)
    L.polygon(OSM_BUILDING_LIRA_RESTAURANT, {
        color: '#d35400',       // 磚橘色
        weight: 2,
        fillColor: '#e67e22',   // 柔橘色
        fillOpacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.restaurant).bindTooltip("里拉餐廳", { sticky: true, className: 'custom-tooltip' });

    // 自動自適應縮放地圖以完美容納這三個主要園區範圍
    const groupBounds = L.featureGroup([promiseLandPoly, fengzhiguPoly, a2WaterfrontPoly]).getBounds();
    map.fitBounds(groupBounds, { padding: [50, 50] });

    // ==================== 2. 狀態管理器 ====================
    const state = {
        activeFilter: 'all',       // 地圖篩選器
        tableFilter: 'all',        // 時間表專屬篩選器
        searchQuery: '',           // 地圖搜尋字串
        currentView: 'map',        // 'map' 或 'table'
        markers: [],               // 地圖標記參考
        selectedId: null,          // 選取中的活動 ID
        timeThreshold: null        // 時間表過濾閾值 ("HH:MM")
    };

    // 時間表基礎配置常數
    const TIME_BASE_HOUR = 8;      // 縱軸起點 08:00
    const TIME_END_HOUR = 23;      // 縱軸終點 23:00
    const HOUR_HEIGHT = 84;        // 每小時高度 (須與 CSS --hour-height 一致)

    // ==================== 3. DOM 元素取得 ====================
    const elList = document.getElementById('activities-list');
    const elCount = document.getElementById('results-count');
    const elSearch = document.getElementById('activity-search');
    const elOverlay = document.getElementById('map-overlay-info');
    
    // 視圖切換
    const viewBtns = document.querySelectorAll('.toggle-btn');
    const wrapperMap = document.getElementById('map-wrapper');
    const sidebar = document.getElementById('sidebar');
    const wrapperTable = document.getElementById('timetable-wrapper');

    // 時間表容器
    const elAxisSlots = document.getElementById('axis-time-slots');
    const elGridBg = document.getElementById('grid-lines-bg');
    const elHeaders = document.getElementById('scheduler-headers');
    const elGridBody = document.getElementById('scheduler-grid-body');
    const tableFilterChips = document.querySelectorAll('.table-filter-chip');
    const btnClearThreshold = document.getElementById('btn-clear-threshold');

    // 活動詳情彈出視窗 (Modal) DOM
    const elModal = document.getElementById('activity-modal');
    const elModalBody = document.getElementById('modal-body-content');
    const btnCloseModal = elModal ? elModal.querySelector('.modal-close-btn') : null;


    // ==================== 4. 時間運算輔助函式 ====================
    // 將 "HH:MM" 格式時間轉換為相對於 08:00 的分鐘數
    function getMinutesFromBase(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        const totalMin = h * 60 + m;
        const baseMin = TIME_BASE_HOUR * 60;
        return totalMin - baseMin;
    }

    // 計算兩個時間點的分鐘差
    function getDurationMinutes(startStr, endStr) {
        return getMinutesFromBase(endStr) - getMinutesFromBase(startStr);
    }


    // ==================== 5. 地圖渲染主程式 ====================
    function renderMap() {
        const filteredData = ACTIVITIES.filter(item => {
            const matchesType = state.activeFilter === 'all' || item.type === state.activeFilter;
            const query = state.searchQuery.toLowerCase();
            const matchesSearch = item.name.toLowerCase().includes(query) || 
                                  item.locationName.toLowerCase().includes(query) || 
                                  item.desc.toLowerCase().includes(query);
            return matchesType && matchesSearch;
        });

        elCount.textContent = `共 ${filteredData.length} 個項目`;

        // 清除舊標記
        state.markers.forEach(m => map.removeLayer(m));
        state.markers = [];
        elList.innerHTML = '';

        // 座標偏移計算器 (防重疊)
        const coordOffsetCount = {};

        filteredData.forEach(item => {
            const coordKey = `${item.coords[0].toFixed(5)},${item.coords[1].toFixed(5)}`;
            if (!coordOffsetCount[coordKey]) coordOffsetCount[coordKey] = 0;
            const offsetIndex = coordOffsetCount[coordKey]++;

            const latOffset = offsetIndex * 0.00008;
            const lngOffset = offsetIndex * 0.00008;
            const adjustedCoords = [item.coords[0] + latOffset, item.coords[1] + lngOffset];

            const typeLabel = item.type === 'free' ? '館內免費' : (item.type === 'paid' ? '館內付費' : '館外行程');
            
            const popupHtml = `
                <div class="custom-popup">
                    <span class="popup-badge">${typeLabel}</span>
                    <h3 class="popup-title">${item.name}</h3>
                    <div class="popup-info-row"><span class="popup-label">地點：</span>${item.locationName}</div>
                    <div class="popup-info-row"><span class="popup-label">時間：</span>${item.time}</div>
                    <div class="popup-info-row"><span class="popup-label">費用：</span>${item.price}</div>
                    <p class="popup-desc">${item.desc}</p>
                </div>
            `;

            // 【暫時停用圖釘】依據使用者需求，清空地圖圖釘，僅保留三個主要範圍框
            /*
            const marker = L.marker(adjustedCoords)
                .bindPopup(popupHtml, { maxWidth: 300 })
                .addTo(map);

            marker.activityId = item.id;
            state.markers.push(marker);

            marker.on('click', () => {
                highlightItem(item.id, false);
            });
            */

            // 側邊清單項目生成
            const li = document.createElement('li');
            li.className = `activity-item ${state.selectedId === item.id ? 'active' : ''}`;
            li.dataset.id = item.id;
            const badgeClass = item.type === 'free' ? 'badge-free' : (item.type === 'paid' ? 'badge-paid' : 'badge-offsite');
            
            li.innerHTML = `
                <span class="item-badge ${badgeClass}">${typeLabel}</span>
                <h3 class="item-name">${item.name}</h3>
                <div class="item-meta">
                    <div class="meta-row"><span class="meta-label">地點</span><span class="meta-value">${item.locationName}</span></div>
                    <div class="meta-row"><span class="meta-label">時間</span><span class="meta-value">${item.time}</span></div>
                    <div class="meta-row"><span class="meta-label">費用</span><span class="meta-value">${item.price}</span></div>
                </div>
            `;

            li.addEventListener('click', () => {
                highlightItem(item.id, true);
            });

            elList.appendChild(li);
        });
    }

    function highlightItem(id, shouldPanMap) {
        state.selectedId = id;
        const items = elList.querySelectorAll('.activity-item');
        items.forEach(item => {
            if (item.dataset.id === id) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });

        const targetMarker = state.markers.find(m => m.activityId === id);
        if (targetMarker) {
            if (shouldPanMap) {
                map.setView(targetMarker.getLatLng(), 18, { animate: true, duration: 0.6 });
                setTimeout(() => { targetMarker.openPopup(); }, 450);
            } else {
                targetMarker.openPopup();
            }
        }
    }


    // ==================== 6. 時間總表渲染主程式 ====================
    
    // 初始化靜態時間軸框架 (只執行一次)
    function initTimetableGridFramework() {
        elAxisSlots.innerHTML = '';
        elGridBg.innerHTML = '';

        for (let h = TIME_BASE_HOUR; h <= TIME_END_HOUR; h++) {
            // 1. 生成時間列標籤與網格背景線 (整點)
            const hhStr = String(h).padStart(2, '0') + ':00';
            
            const labelHour = document.createElement('div');
            labelHour.className = 'time-slot-label hour-boundary';
            labelHour.textContent = hhStr;
            labelHour.dataset.time = hhStr;
            labelHour.addEventListener('click', () => selectTimeThreshold(hhStr));
            elAxisSlots.appendChild(labelHour);

            const lineHour = document.createElement('div');
            lineHour.className = 'bg-horizontal-line hour-line';
            elGridBg.appendChild(lineHour);

            // 2. 半整點 (排除最後一小時的半整點)
            if (h < TIME_END_HOUR) {
                const hhHalfStr = String(h).padStart(2, '0') + ':30';
                const labelHalf = document.createElement('div');
                labelHalf.className = 'time-slot-label';
                labelHalf.textContent = hhHalfStr;
                labelHalf.dataset.time = hhHalfStr;
                labelHalf.addEventListener('click', () => selectTimeThreshold(hhHalfStr));
                elAxisSlots.appendChild(labelHalf);

                const lineHalf = document.createElement('div');
                lineHalf.className = 'bg-horizontal-line';
                elGridBg.appendChild(lineHalf);
            }
        }
    }

    // 選擇特定過濾閾值時間
    function selectTimeThreshold(timeStr) {
        // 💡 點選已選中的時間時，則切換為取消過濾（顯示全部活動）
        if (state.timeThreshold === timeStr) {
            clearTimeThreshold();
            return;
        }

        state.timeThreshold = timeStr;
        
        // 1. 更新 Y 軸高亮樣式
        const labels = elAxisSlots.querySelectorAll('.time-slot-label');
        labels.forEach(lbl => {
            if (lbl.dataset.time === timeStr) {
                lbl.classList.add('active-threshold');
            } else {
                lbl.classList.remove('active-threshold');
            }
        });

        // 2. 渲染 (或移動) 右側橫向線
        let line = elGridBody.querySelector('.time-threshold-line');
        if (!line) {
            line = document.createElement('div');
            line.className = 'time-threshold-line';
            elGridBody.appendChild(line);
        }
        const offsetMin = getMinutesFromBase(timeStr);
        const topPx = (offsetMin / 60) * HOUR_HEIGHT;
        line.style.top = `${topPx}px`;
        line.style.display = 'block';

        // 3. 顯示清除按鈕
        if (btnClearThreshold) btnClearThreshold.style.display = 'inline-block';

        // 4. 重新渲染時間表過濾內容
        renderTimetable();
    }

    // 清除時間閾值過濾
    function clearTimeThreshold() {
        state.timeThreshold = null;
        
        // 1. 移除 Y 軸高亮
        const labels = elAxisSlots.querySelectorAll('.time-slot-label');
        labels.forEach(lbl => lbl.classList.remove('active-threshold'));

        // 2. 隱藏橫向線
        const line = elGridBody.querySelector('.time-threshold-line');
        if (line) line.style.display = 'none';

        // 3. 隱藏清除按鈕
        if (btnClearThreshold) btnClearThreshold.style.display = 'none';

        // 4. 重新渲染時間表
        renderTimetable();
    }

    // ==================== 詳情 Modal 控制邏輯 ====================
    function showActivityModal(item) {
        if (!elModal || !elModalBody) return;

        const typeLabel = item.type === 'free' ? '館內免費' : (item.type === 'paid' ? '館內付費' : '館外行程');
        const badgeClass = item.type === 'free' ? 'badge-free' : (item.type === 'paid' ? 'badge-paid' : 'badge-offsite');
        
        elModalBody.innerHTML = `
            <div class="modal-header">
                <span class="modal-badge ${badgeClass}">${typeLabel}</span>
                <h3 class="modal-title">${item.name}</h3>
            </div>
            <div class="modal-info-grid">
                <div class="modal-info-label">📍 地點</div>
                <div class="modal-info-value">${item.locationName}</div>
                
                <div class="modal-info-label">🕒 時間</div>
                <div class="modal-info-value">${item.time}</div>
                
                <div class="modal-info-label">💰 費用</div>
                <div class="modal-info-value">${item.price}</div>
            </div>
            <p class="modal-desc-box">${item.desc}</p>
        `;

        elModal.classList.remove('view-hidden');
        setTimeout(() => {
            elModal.classList.add('active');
        }, 10);
    }

    function hideActivityModal() {
        if (!elModal) return;
        elModal.classList.remove('active');
        setTimeout(() => {
            elModal.classList.add('view-hidden');
        }, 300);
    }

    // 註冊 Modal 關閉事件
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', hideActivityModal);
    }
    if (elModal) {
        elModal.addEventListener('click', (e) => {
            if (e.target === elModal) {
                hideActivityModal();
            }
        });
    }

    // 動態繪製活動軌道與甘特方塊
    function renderTimetable() {
        // 篩選出要呈現的活動資料
        let filteredData = ACTIVITIES.filter(item => {
            return state.tableFilter === 'all' || item.type === state.tableFilter;
        });

        // 處理時間閥值過濾
        if (state.timeThreshold) {
            const thresholdMin = getMinutesFromBase(state.timeThreshold);
            filteredData = filteredData.map(item => {
                // 篩選出在閥值時間點「之後或還在進行」的時段 (slot)
                const validSlots = item.slots.filter(slot => {
                    const endMin = getMinutesFromBase(slot.end);
                    // 若結束時間大於閥值，則此時段仍需保留顯示
                    return endMin > thresholdMin;
                });
                // 回傳一個淺拷貝物件，帶有過濾後的 slots
                return { ...item, slots: validSlots };
            }).filter(item => item.slots.length > 0); // 若活動「沒有任何一個時段落在閥值後」，則整欄隱藏
        }

        // 清空舊資料列，但保留背景網格
        elHeaders.innerHTML = '';
        // 移除 scheduler-column，保留 grid-lines-bg 及過濾線
        const existingColumns = elGridBody.querySelectorAll('.scheduler-column');
        existingColumns.forEach(col => elGridBody.removeChild(col));

        filteredData.forEach(item => {
            // 1. 生成頂部固定標題格，並附帶查看資訊按鈕
            const th = document.createElement('div');
            th.className = 'col-header';
            th.innerHTML = `
                <div class="col-header-title-row">
                    <div class="col-header-title" title="${item.name}">${item.name}</div>
                    <button class="info-btn" title="查看活動詳情">i</button>
                </div>
                <div class="col-header-subtitle">${item.locationName}</div>
            `;
            
            // 點擊 "i" 資訊按鈕跳出 Modal 詳情
            const btnInfo = th.querySelector('.info-btn');
            if (btnInfo) {
                btnInfo.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止氣泡傳播
                    showActivityModal(item);
                });
            }

            elHeaders.appendChild(th);

            // 2. 生成對應的垂直網格軌道列
            const col = document.createElement('div');
            col.className = 'scheduler-column';
            
            // 3. 遍歷活動所屬的所有時段 (可能不只一個，例如窯烤麵包有上午/下午兩班)
            item.slots.forEach(slot => {
                const block = document.createElement('div');
                
                // 計算高度與頂部距離比例 (以小時高度 84px 為基準)
                const startMin = getMinutesFromBase(slot.start);
                const duration = getDurationMinutes(slot.start, slot.end);

                const topPx = (startMin / 60) * HOUR_HEIGHT;
                const heightPx = (duration / 60) * HOUR_HEIGHT;

                // 套用樣式類別
                const typeClass = item.type === 'free' ? 'time-block-free' : (item.type === 'paid' ? 'time-block-paid' : 'time-block-offsite');
                const shortClass = duration <= 30 ? 'time-block-short' : '';
                block.className = `time-block ${typeClass} ${shortClass}`;
                
                // 動態設定 Absolute 座標位置
                block.style.top = `${topPx}px`;
                block.style.height = `${heightPx}px`;

                block.innerHTML = `
                    <div class="block-time-span">${slot.start} - ${slot.end}</div>
                    <div class="block-title">${item.name}</div>
                `;

                // 點擊時間塊事件：直接切換回地圖檢視，並平滑移動到該標籤定位
                block.addEventListener('click', () => {
                    // 1. 切換視圖狀態
                    switchView('map');
                    // 2. 更新地圖篩選狀態以確保該物件在地圖上顯示 (如果是館外行程切換為館外以防被隱藏)
                    const mapChip = Array.from(document.querySelectorAll('.chip')).find(c => c.dataset.type === item.type || c.dataset.type === 'all');
                    if(mapChip) mapChip.click();
                    
                    // 3. 執行地圖定位高亮
                    setTimeout(() => {
                        highlightItem(item.id, true);
                    }, 200);
                });

                col.appendChild(block);
            });

            elGridBody.appendChild(col);
        });
    }


    // ==================== 7. 全域互動與事件監聽器 ====================
    
    // 視圖切換器
    function switchView(targetView) {
        if (state.currentView === targetView) return;
        state.currentView = targetView;

        // 切換按鈕高亮
        viewBtns.forEach(btn => {
            if (btn.dataset.view === targetView) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 切換本體介面顯隱
        if (targetView === 'table') {
            wrapperTable.classList.remove('view-hidden');
            // 延遲渲染以確保父元件尺寸正確
            renderTimetable();
        } else {
            wrapperTable.classList.add('view-hidden');
            // 返回地圖時強制 Leaflet 重新修正快取尺寸計算 (非常重要，否則地圖灰塊)
            setTimeout(() => {
                map.invalidateSize();
            }, 50);
        }
    }

    viewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => switchView(e.target.dataset.view));
    });

    // 地圖篩選 Chip 監聽
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            state.activeFilter = e.target.dataset.type;
            state.selectedId = null;
            renderMap();
        });
    });

    // 地圖搜尋監聽
    let searchTimeout;
    elSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = e.target.value;
            renderMap();
        }, 250);
    });

    // 時間表篩選 Chip 監聽
    tableFilterChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            // 排除點擊的是清除按鈕本身
            if (e.target.id === 'btn-clear-threshold') return;
            
            tableFilterChips.forEach(c => {
                if (c.id !== 'btn-clear-threshold') c.classList.remove('active');
            });
            e.target.classList.add('active');
            state.tableFilter = e.target.dataset.tableFilter;
            renderTimetable();
        });
    });

    // 清除時間過濾按鈕事件
    if (btnClearThreshold) {
        btnClearThreshold.addEventListener('click', clearTimeThreshold);
    }

    // 地圖空白處重置選中
    map.on('click', (e) => {
        if (e.originalEvent.target.id === 'map') {
            state.selectedId = null;
            const items = elList.querySelectorAll('.activity-item');
            items.forEach(item => item.classList.remove('active'));
        }
    });


    // 地圖圖層分類篩選監聽器 (即時開關 LayerGroup)
    const layerCheckboxes = {
        accommodation: document.getElementById('layer-accommodation'),
        restaurant: document.getElementById('layer-restaurant'),
        toilet: document.getElementById('layer-toilet'),
        bridge: document.getElementById('layer-bridge'),
        attraction: document.getElementById('layer-attraction'),
        dock: document.getElementById('layer-dock')
    };

    Object.keys(layerCheckboxes).forEach(key => {
        const checkbox = layerCheckboxes[key];
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    mapGroups[key].addTo(map);
                } else {
                    map.removeLayer(mapGroups[key]);
                }
            });
        }
    });

    // ==================== 8. 初始化執行觸發 ====================
    
    // 初始化渲染地圖介面
    renderMap();
    
    // 初始化渲染時間表靜態網格
    initTimetableGridFramework();

    // 地圖初次提示自動淡出
    setTimeout(() => {
        elOverlay.classList.add('fade-out');
    }, 3500);
});
