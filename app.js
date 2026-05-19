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

    // 當地圖上的 Popup 被關閉時，自動清除可能存在的高亮點
    map.on('popupclose', () => {
        if (state.activeFocusMarker) {
            map.removeLayer(state.activeFocusMarker);
            state.activeFocusMarker = null;
        }
    });

    // 當地圖上的 Popup 被開啟時，自動綁定精緻輪播圖 (Carousel) 互動功能與左右切換按鈕！
    map.on('popupopen', (e) => {
        const popupContainer = e.popup.getElement();
        if (!popupContainer) return;
        
        const carousel = popupContainer.querySelector('.popup-carousel');
        if (!carousel) return;
        
        const slidesInner = popupContainer.querySelector('.carousel-slides');
        const prevBtn = popupContainer.querySelector('.prev-btn');
        const nextBtn = popupContainer.querySelector('.next-btn');
        const dots = carousel.querySelectorAll('.carousel-dot');
        
        let currentIndex = parseInt(carousel.dataset.initialIndex || '0', 10);
        const totalSlides = dots.length;
        
        // 從資料屬性中精準取得地標官方座標 (避免因為地圖點擊微偏導致篩選失效)
        const coordsStr = carousel.dataset.coords;
        if (!coordsStr) return;
        const coords = coordsStr.split(',').map(Number);
        const coordActivities = getActivitiesAtCoords(coords);

        function updateCarousel(index) {
            currentIndex = index;
            // 實現無縫循環播放！
            if (currentIndex < 0) currentIndex = totalSlides - 1;
            if (currentIndex >= totalSlides) currentIndex = 0;
            
            // 滑動動畫
            if (slidesInner) slidesInner.style.transform = `translateX(-${currentIndex * 100}%)`;
            
            // 更新 Dots 狀態
            dots.forEach((dot, idx) => {
                if (idx === currentIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
            
            // 啟用循環播放時，按鈕永遠不禁用！
            if (prevBtn) prevBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            
            // 同步高亮左側清單，並讓清單平滑滾動到對應項！
            if (coordActivities && coordActivities[currentIndex]) {
                const actId = coordActivities[currentIndex].id;
                state.selectedId = actId;
                
                const items = elList.querySelectorAll('.activity-item');
                items.forEach(item => {
                    if (item.dataset.id === actId) {
                        item.classList.add('active');
                        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } else {
                        item.classList.remove('active');
                    }
                });
            }
        }
        
        // 綁定按鈕點擊監聽 (阻止事件冒泡以避免 Leaflet 誤判)
        if (prevBtn) {
            prevBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                updateCarousel(currentIndex - 1);
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                updateCarousel(currentIndex + 1);
            });
        }
        
        // 綁定 Dots 點擊監聽 (阻止事件冒泡以避免 Leaflet 誤判)
        dots.forEach(dot => {
            dot.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const targetIdx = parseInt(ev.target.dataset.index, 10);
                updateCarousel(targetIdx);
            });
        });
        
        // 初始化按鈕啟用狀態
        updateCarousel(currentIndex);
    });

    // 2.5 初始化地圖圖層分類群組 (LayerGroup，預設全部不加入地圖以保持清爽)
    const mapGroups = {
        accommodation: L.layerGroup(),
        restaurant: L.layerGroup(),
        toilet: L.layerGroup(),
        bridge: L.layerGroup(),
        attraction: L.layerGroup(),
        dock: L.layerGroup(),
        checkin: L.layerGroup()
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
    bindLocationClick(buildingFengweiPoly, "風味餐廳", RESORT_LOCATIONS["風味餐廳"]);

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
    bindLocationClick(buildingHaoyongPoly, "豪雍精品", RESORT_LOCATIONS["豪雍精品"]);

    // 6. 接待大廳 (Lobby) 建築範圍 (高貴褐金 + 填充)
    const buildingLobbyPoly = L.polygon(OSM_BUILDING_LOBBY, {
        color: '#a29bfe',       // 優雅粉紫
        weight: 2.5,
        fillColor: '#a29bfe',
        fillOpacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
    buildingLobbyPoly.bindTooltip("接待大廳 (Lobby 建築主體)", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(buildingLobbyPoly, "接待大廳", RESORT_LOCATIONS["接待大廳"]);

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
    bindLocationClick(starryMoviePoly, "星空電影", RESORT_LOCATIONS["星空電影"]);

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
    bindLocationClick(areaArcheryPoly, "射箭場", RESORT_LOCATIONS["射箭場"]);

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
    bindLocationClick(sevilleGrasslandMarker, "塞維亞草原", RESORT_LOCATIONS["賽維亞草原"]);

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
    bindLocationClick(yogaPlatformMarker, "瑜珈平台", RESORT_LOCATIONS["瑜珈平台"]);

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
    bindLocationClick(starbucksMarker, "星巴克花蓮理想門市", RESORT_LOCATIONS["星巴克花蓮理想門市"]);

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
        // 渲染融入背景的灰色軟調邊框與半透明填充 (完全不互動)
        L.polygon(building.coords, {
            color: 'rgba(255, 255, 255, 0.12)',     // 極其輕微的淡白/淺灰邊框
            weight: 1.2,
            fillColor: 'rgba(255, 255, 255, 0.03)',  // 極限融入背景的透明填充
            fillOpacity: 1,
            interactive: false
        }).addTo(map); // 直接加入 map 成為背景

        // 計算中心點以擺放建築編號
        let latSum = 0, lngSum = 0;
        building.coords.forEach(pt => {
            latSum += pt[0];
            lngSum += pt[1];
        });
        const centerCoords = [latSum / building.coords.length, lngSum / building.coords.length];

        // 提取棟數數字 (例如 "19棟" 提取出 "19")
        const match = building.name.match(/\d+/);
        if (match) {
            const labelNum = match[0];
            L.marker(centerCoords, {
                icon: L.divIcon({
                    className: 'building-number-icon',
                    html: labelNum,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                }),
                interactive: false
            }).addTo(map);
        }
    });

    // 12. 理想大地停車場區 (高質感簡潔 P 字圓形標記，降低地圖視覺干擾)
    const parkingIcon = L.divIcon({
        className: 'parking-map-icon',
        html: 'P',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const parkingLots = [
        { name: "大型停車場", coords: [23.8654329, 121.5286354] },
        { name: "第一停車場", coords: [23.8649423, 121.5281442] },
        { name: "第二停車場 (生態公園)", coords: [23.8647312, 121.5265898] }
    ];

    parkingLots.forEach(lot => {
        L.marker(lot.coords, { 
            icon: parkingIcon,
            interactive: false // 完全禁用互動 (不變手形、不可點擊、無懸停反應)
        }).addTo(map); // 直接加載至主地圖上，始終維持顯示！
    });

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
    bindLocationClick(peacockIslandMarker, "孔雀島", RESORT_LOCATIONS["孔雀島"]);

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
    bindLocationClick(cypressMarker, "水中落羽松", RESORT_LOCATIONS["水中落羽松"]);

    // 13.9 豐之谷 - 釣魚平台範圍 (特製木質古銅棕多邊形，呼應水岸親水垂釣氛圍)
    const fishingPlatformPoly = L.polygon(OSM_BUILDING_FISHING_PLATFORM, {
        color: '#d35400',       // 質感古銅棕/木質橘褐
        weight: 2,
        fillColor: '#e67e22',   // 溫暖橘棕填充
        fillOpacity: 0.22,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    fishingPlatformPoly.bindTooltip("釣魚平台 (親水休閒垂釣區)", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(fishingPlatformPoly, "釣魚平台", RESORT_LOCATIONS["豐之谷服務中心"]);

    // 13.95 豐之谷 - 湖畔小憩範圍 (特製薄荷翠綠多邊形，彰顯湖畔林蔭漫步與休憩意境)
    const lakesideRestPoly = L.polygon(OSM_BUILDING_LAKESIDE_REST, {
        color: '#10ac84',       // 翡翠薄荷綠邊框
        weight: 2,
        fillColor: '#1dd1a1',   // 亮翠綠填充
        fillOpacity: 0.15,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    lakesideRestPoly.bindTooltip("湖畔小憩 (水岸休閒漫步區)", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(lakesideRestPoly, "湖畔小憩", RESORT_LOCATIONS["湖畔小憩"]);

    // 13.98 豐之谷 - 親子餵魚區範圍 (特製珊瑚粉橘多邊形，散發活潑歡樂親子互動氛圍)
    const fishFeedingPoly = L.polygon(OSM_BUILDING_FISH_FEEDING_AREA, {
        color: '#ff7675',       // 珊瑚粉橘邊框
        weight: 2,
        fillColor: '#ff7675',   // 珊瑚粉填充
        fillOpacity: 0.22,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    fishFeedingPoly.bindTooltip("親子餵魚區 (生態親水平台)", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(fishFeedingPoly, "親子餵魚區", RESORT_LOCATIONS["竹筏碼頭"]);

    // 13.99 豐之谷 - 服務中心與單車租借站 (特製質感紅磚色多邊形，彰顯核心服務地標)
    const serviceCenterPoly = L.polygon(OSM_BUILDING_FENGZHIGU_SERVICE_CENTER, {
        color: '#d35400',       // 質感古銅磚紅
        weight: 2,
        fillColor: '#e67e22',   // 溫潤橘紅填充
        fillOpacity: 0.26,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.attraction);
    serviceCenterPoly.bindTooltip("豐之谷服務中心 / 單車租借站 (生態體驗與活動報名處)", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(serviceCenterPoly, "豐之谷服務中心", RESORT_LOCATIONS["豐之谷服務中心"]);

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
    const liraRestaurantPoly = L.polygon(OSM_BUILDING_LIRA_RESTAURANT, {
        color: '#d35400',       // 磚橘色
        weight: 2,
        fillColor: '#e67e22',   // 柔橘色
        fillOpacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(mapGroups.restaurant);
    liraRestaurantPoly.bindTooltip("里拉餐廳", { sticky: true, className: 'custom-tooltip' });
    bindLocationClick(liraRestaurantPoly, "里拉餐廳", RESORT_LOCATIONS["里拉餐廳"]);
    // 16. 理想大地推薦打卡景點 (精緻落落大方圓形標記，專屬 Sunset Rose 奢華調)
    RECOMMENDED_CHECKPOINTS.forEach(checkpoint => {
        const checkinMarker = L.circleMarker(checkpoint.coords, {
            radius: 8,
            fillColor: '#fd79a8',   // 奢華玫瑰粉
            color: '#fdcb6e',       // 典雅金邊線
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(mapGroups.checkin);
        checkinMarker.bindTooltip("推薦打卡 - " + checkpoint.name + " (" + checkpoint.desc + ")", { sticky: true, className: 'custom-tooltip' });
    });

    // 自動自適應縮放地圖以完美容納這三個主要園區範圍
    const groupBounds = L.featureGroup([promiseLandPoly, fengzhiguPoly, a2WaterfrontPoly]).getBounds();
    map.fitBounds(groupBounds, { padding: [50, 50] });

    // ==================== 2. 狀態管理器 ====================
    const state = {
        activeFilter: 'indoor-activities', // 地圖篩選器
        indoorSubFilter: 'all',    // 館內活動子篩選 ('all', 'free', 'paid')
        tableFilter: 'all',        // 時間表專屬篩選器
        searchQuery: '',           // 地圖搜尋字串
        currentView: 'map',        // 'map' 或 'table'
        markers: [],               // 地圖標記參考
        selectedId: null,          // 選取中的活動 ID
        timeThreshold: null,       // 時間表過濾閾值 ("HH:MM")
        activeFocusMarker: null    // 當前點選高亮之活動動態焦點標記
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
    // ==================== 5. 地圖渲染主程式 ====================
    function renderMap() {
        let rawData = [];
        
        if (state.activeFilter === 'all-spots') {
            // 全部景點：顯示所有活動項目
            rawData = ACTIVITIES;
        } 
        else if (state.activeFilter === 'checkin-spots') {
            // 打卡景點：將 14 個推薦打卡點映射為活動清單格式，讓使用者能在側邊欄一鍵選取與定位！
            rawData = RECOMMENDED_CHECKPOINTS.map((cp, idx) => ({
                id: `checkin-${idx}`,
                type: 'checkin',
                name: cp.name,
                locationName: "推薦打卡景點",
                time: "全天開放",
                price: "免費參觀",
                desc: cp.desc,
                coords: cp.coords
            }));
        } 
        else if (state.activeFilter === 'indoor-activities') {
            // 館內活動：篩選 free 及 paid 活動
            rawData = ACTIVITIES.filter(item => item.type === 'free' || item.type === 'paid');
            // 進一步依據免費/付費子篩選
            if (state.indoorSubFilter === 'free') {
                rawData = rawData.filter(item => item.type === 'free');
            } else if (state.indoorSubFilter === 'paid') {
                rawData = rawData.filter(item => item.type === 'paid');
            }
        } 
        else if (state.activeFilter === 'offsite-activities') {
            // 館外活動：篩選 offsite 活動
            rawData = ACTIVITIES.filter(item => item.type === 'offsite');
        }

        // 搜尋篩選過濾
        const query = state.searchQuery.toLowerCase();
        const filteredData = rawData.filter(item => {
            const matchesSearch = !query || 
                                  item.name.toLowerCase().includes(query) || 
                                  item.locationName.toLowerCase().includes(query) || 
                                  item.desc.toLowerCase().includes(query);
            return matchesSearch;
        });

        elCount.textContent = `共 ${filteredData.length} 個項目`;

        // 恢復接待大廳的預設外觀
        if (typeof buildingLobbyPoly !== 'undefined' && buildingLobbyPoly) {
            buildingLobbyPoly.setStyle({
                color: '#a29bfe',
                weight: 2.5,
                fillColor: '#a29bfe',
                fillOpacity: 0.2
            });
            buildingLobbyPoly.unbindTooltip();
            buildingLobbyPoly.bindTooltip("接待大廳 (Lobby 建築主體)", { sticky: true, className: 'custom-tooltip' });
        }

        // 清除舊標記
        state.markers.forEach(m => map.removeLayer(m));
        state.markers = [];
        elList.innerHTML = '';

        if (state.activeFilter === 'offsite-activities') {
            // 接待大廳框框高亮顯示為館外行程集合點 (不使用額外紅點)
            if (typeof buildingLobbyPoly !== 'undefined' && buildingLobbyPoly) {
                buildingLobbyPoly.setStyle({
                    color: '#e74c3c', // 醒目的石榴紅
                    weight: 3.5,
                    fillColor: '#e74c3c',
                    fillOpacity: 0.35
                });
                buildingLobbyPoly.unbindTooltip();
            }
        }

        // 座標偏移計算器 (防重疊)
        const coordOffsetCount = {};

        // 側邊清單生成與地圖標記動態綁定
        if (state.activeFilter === 'indoor-activities') {
            // 依地點名稱將活動進行分群，只顯示符合子篩選的點
            const locationsGroup = {};
            filteredData.forEach(item => {
                if (item.coords) {
                    const locKey = item.locationName;
                    if (!locationsGroup[locKey]) {
                        locationsGroup[locKey] = {
                            name: locKey,
                            coords: item.coords,
                            activities: []
                        };
                    }
                    locationsGroup[locKey].activities.push(item);
                }
            });

            // 為每個有活動的地點繪製一個精緻圓標記
            Object.values(locationsGroup).forEach(loc => {
                const hasFree = loc.activities.some(act => act.type === 'free');
                const hasPaid = loc.activities.some(act => act.type === 'paid');
                
                // 決定點位配色：全免費=綠色，全付費=金色，混合=橘色
                let fillColor = '#e67e22'; // 混合
                if (hasFree && !hasPaid) fillColor = '#2ecc71'; // 全免費
                if (!hasFree && hasPaid) fillColor = '#cfa056'; // 全付費

                const marker = L.circleMarker(loc.coords, {
                    radius: 8.5,
                    fillColor: fillColor,
                    color: '#ffffff',
                    weight: 1.8,
                    opacity: 1,
                    fillOpacity: 0.95
                }).addTo(map);

                marker.bindTooltip(`${loc.name} (${loc.activities.length}項活動)`, { 
                    sticky: true, 
                    className: 'custom-tooltip' 
                });

                bindLocationClick(marker, loc.name, loc.coords);
                state.markers.push(marker);
            });
        }

        filteredData.forEach(item => {
            const coordKey = item.coords ? `${item.coords[0].toFixed(5)},${item.coords[1].toFixed(5)}` : '0,0';
            if (!coordOffsetCount[coordKey]) coordOffsetCount[coordKey] = 0;
            const offsetIndex = coordOffsetCount[coordKey]++;

            const latOffset = offsetIndex * 0.00008;
            const lngOffset = offsetIndex * 0.00008;
            const adjustedCoords = item.coords ? [item.coords[0] + latOffset, item.coords[1] + lngOffset] : null;

            const typeLabel = item.type === 'free' ? '館內免費' : 
                              (item.type === 'paid' ? '館內付費' : 
                              (item.type === 'offsite' ? '館外行程' : '推薦打卡'));
            
            const badgeClass = item.type === 'free' ? 'badge-free' : 
                               (item.type === 'paid' ? 'badge-paid' : 
                               (item.type === 'offsite' ? 'badge-offsite' : 'badge-checkin'));

            // 側邊清單項目生成 (緊湊清爽版：僅顯示類別與標題)
            const li = document.createElement('li');
            li.className = `activity-item activity-item-compact ${state.selectedId === item.id ? 'active' : ''}`;
            li.dataset.id = item.id;
            
            li.innerHTML = `
                <div class="item-header-compact">
                    <span class="item-badge ${badgeClass}">${typeLabel}</span>
                    <span class="item-location-compact">${item.locationName}</span>
                </div>
                <h3 class="item-name-compact">${item.name}</h3>
            `;

            li.addEventListener('click', () => {
                highlightItem(item.id, true);
            });

            elList.appendChild(li);
        });
    }

    // 依據座標取得目前篩選結果中在此位置的所有活動與打卡景點
    function getActivitiesAtCoords(coords) {
        if (!coords) return [];
        const lat = coords[0];
        const lng = coords[1];
        
        let list = [];
        let rawData = [];
        
        if (state.activeFilter === 'indoor-activities') {
            rawData = ACTIVITIES.filter(item => item.type === 'free' || item.type === 'paid');
        } else if (state.activeFilter === 'offsite-activities') {
            rawData = ACTIVITIES.filter(item => item.type === 'offsite');
        } else {
            rawData = ACTIVITIES;
        }

        // 搜尋過濾
        const query = state.searchQuery.toLowerCase();
        let filteredData = rawData.filter(item => {
            const matchesSearch = !query || 
                                  item.name.toLowerCase().includes(query) || 
                                  item.locationName.toLowerCase().includes(query) || 
                                  item.desc.toLowerCase().includes(query);
            return matchesSearch;
        });

        // 找出在此座標的所有符合活動
        filteredData.forEach(item => {
            if (item.coords && 
                Math.abs(item.coords[0] - lat) < 0.0001 && 
                Math.abs(item.coords[1] - lng) < 0.0001) {
                list.push(item);
            }
        });

        // 如果開啟了打卡圖層，也加入符合的打卡景點
        const checkinCheckbox = document.getElementById('layer-checkin');
        if (checkinCheckbox && checkinCheckbox.checked) {
            RECOMMENDED_CHECKPOINTS.forEach((cp, idx) => {
                if (cp.coords && 
                    Math.abs(cp.coords[0] - lat) < 0.0001 && 
                    Math.abs(cp.coords[1] - lng) < 0.0001) {
                    list.push({
                        id: `checkpoint-${cp.name}`,
                        name: cp.name,
                        type: 'checkin',
                        locationName: "推薦打卡景點",
                        time: "全天開放",
                        price: "免費參觀",
                        desc: cp.desc,
                        coords: cp.coords
                    });
                }
            });
        }
        
        return list;
    }

    // 綁定地圖上建築框框或點點的點擊事件，以自動尋找該地點之活動並彈出清單！
    function bindLocationClick(layer, locationName, coords) {
        if (!layer) return;
        layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e); // 防止地圖點擊事件干擾
            
            const list = getActivitiesAtCoords(coords);
            if (list.length > 0) {
                // 如果有活動，高亮並顯示第一個活動項目（這會自動畫出黃金呼吸圈並載入所有疊加活動的 Popup）
                highlightItem(list[0].id, false, false);
            } else {
                // 如果沒有當前分類的活動，顯示一個基礎的說明 Popup
                L.popup()
                    .setLatLng(coords)
                    .setContent(`<div class="custom-popup"><h3 class="popup-title">${locationName}</h3><p class="popup-desc">目前此分類下無排定活動項目。</p></div>`)
                    .openOn(map);
            }
        });
    }

    function highlightItem(id, shouldPanMap, showSingleOnly = true) {
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

        // 移除現有的動態活動焦點標記
        if (state.activeFocusMarker) {
            map.removeLayer(state.activeFocusMarker);
            state.activeFocusMarker = null;
        }

        let activity = ACTIVITIES.find(item => item.id === id);
        if (!activity && typeof id === 'string' && id.startsWith('checkin-')) {
            const idx = parseInt(id.replace('checkin-', ''), 10);
            const cp = RECOMMENDED_CHECKPOINTS[idx];
            if (cp) {
                activity = {
                    id: id,
                    type: 'checkin',
                    name: cp.name,
                    locationName: "推薦打卡景點",
                    time: "全天開放",
                    price: "免費參觀",
                    desc: cp.desc,
                    coords: cp.coords
                };
            }
        }
        
        // 額外處理從打卡任務清單點過來的定位
        if (!activity && typeof id === 'string' && id.startsWith('checkpoint-')) {
            const cpName = id.replace('checkpoint-', '');
            const cp = RECOMMENDED_CHECKPOINTS.find(item => item.name === cpName);
            if (cp) {
                activity = {
                    id: id,
                    type: 'checkin',
                    name: cp.name,
                    locationName: "推薦打卡景點",
                    time: "全天開放",
                    price: "免費參觀",
                    desc: cp.desc,
                    coords: cp.coords
                };
            }
        }

        if (activity && activity.coords) {
            // 找出所有與此活動相同座標的活動項目！
            const coordActivities = getActivitiesAtCoords(activity.coords);
            
            const activeIndex = coordActivities.findIndex(act => act.id === id);
            const initialIndex = activeIndex >= 0 ? activeIndex : 0;
            
            let popupHtml = '';
            if (coordActivities.length <= 1) {
                // 純單一活動，不渲染輪播控制
                const act = coordActivities[0] || activity;
                const typeLabel = act.type === 'free' ? '館內免費' : 
                                  (act.type === 'paid' ? '館內付費' : 
                                  (act.type === 'offsite' ? '館外行程' : '推薦打卡'));
                const badgeClass = act.type === 'free' ? 'badge-free' : 
                                   (act.type === 'paid' ? 'badge-paid' : 
                                   (act.type === 'offsite' ? 'badge-offsite' : 'badge-checkin'));
                
                popupHtml = `
                    <div class="custom-popup">
                        <span class="popup-badge ${badgeClass}">${typeLabel}</span>
                        <h3 class="popup-title">${act.name}</h3>
                        <div class="popup-info-row"><span class="popup-label">地點：</span>${act.locationName}</div>
                        <div class="popup-info-row"><span class="popup-label">時間：</span>${act.time}</div>
                        <div class="popup-info-row"><span class="popup-label">費用：</span>${act.price}</div>
                        <p class="popup-desc">${act.desc}</p>
                    </div>
                `;
            } else {
                // 統一的精緻卡片輪播圖 (Carousel)！
                popupHtml = `
                    <div class="popup-carousel" id="popup-carousel-container" data-initial-index="${initialIndex}" data-coords="${activity.coords[0]},${activity.coords[1]}">
                        <div class="carousel-window">
                            <div class="carousel-slides" id="carousel-slides-inner" style="width: ${coordActivities.length * 100}%; transform: translateX(-${initialIndex * 100}%);">
                `;
                
                coordActivities.forEach((act) => {
                    const typeLabel = act.type === 'free' ? '館內免費' : 
                                      (act.type === 'paid' ? '館內付費' : 
                                      (act.type === 'offsite' ? '館外行程' : '推薦打卡'));
                    const badgeClass = act.type === 'free' ? 'badge-free' : 
                                       (act.type === 'paid' ? 'badge-paid' : 
                                       (act.type === 'offsite' ? 'badge-offsite' : 'badge-checkin'));
                    
                    popupHtml += `
                        <div class="carousel-slide" style="width: ${100 / coordActivities.length}%;">
                            <div class="custom-popup" style="padding-bottom: 0;">
                                <span class="popup-badge ${badgeClass}">${typeLabel}</span>
                                <h3 class="popup-title">${act.name}</h3>
                                <div class="popup-info-row"><span class="popup-label">地點：</span>${act.locationName}</div>
                                <div class="popup-info-row"><span class="popup-label">時間：</span>${act.time}</div>
                                <div class="popup-info-row"><span class="popup-label">費用：</span>${act.price}</div>
                                <p class="popup-desc" style="max-height: 120px; overflow-y: auto; padding-right: 4px;">${act.desc}</p>
                            </div>
                        </div>
                    `;
                });
                
                popupHtml += `
                            </div>
                        </div>
                        <div class="carousel-controls">
                            <button class="carousel-btn prev-btn" id="carousel-prev">&lsaquo;</button>
                            <div class="carousel-dots">
                `;
                
                coordActivities.forEach((act, idx) => {
                    const isActive = idx === initialIndex;
                    popupHtml += `<span class="carousel-dot ${isActive ? 'active' : ''}" data-index="${idx}"></span>`;
                });
                
                popupHtml += `
                            </div>
                            <button class="carousel-btn next-btn" id="carousel-next">&rsaquo;</button>
                        </div>
                    </div>
                `;
            }

            if (activity.type === 'offsite') {
                // 館外行程：不建立黃色定位圈，直接在接待大廳框框上彈出氣泡！
                if (typeof buildingLobbyPoly !== 'undefined' && buildingLobbyPoly) {
                    buildingLobbyPoly.bindPopup(popupHtml, { maxWidth: 300, className: 'custom-popup-wrapper' });
                    
                    if (shouldPanMap) {
                        map.setView(activity.coords, 18, { animate: true, duration: 0.6 });
                        setTimeout(() => { 
                            buildingLobbyPoly.openPopup(); 
                        }, 500);
                    } else {
                        buildingLobbyPoly.openPopup();
                    }
                }
            } else {
                // 館內活動或打卡：維持精緻的黃金呼吸定位圈
                state.activeFocusMarker = L.circleMarker(activity.coords, {
                    radius: 12,
                    fillColor: '#fdcb6e',   // 亮麗金色
                    color: '#ffffff',       // 耀眼白框
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.9,
                    className: 'pulsing-focus-marker' // 套用 CSS 動畫
                }).addTo(map);

                state.activeFocusMarker.bindPopup(popupHtml, { maxWidth: 300, className: 'custom-popup-wrapper' });

                if (shouldPanMap) {
                    map.setView(activity.coords, 18, { animate: true, duration: 0.6 });
                    setTimeout(() => { 
                        if (state.activeFocusMarker) state.activeFocusMarker.openPopup(); 
                    }, 500);
                } else {
                    state.activeFocusMarker.openPopup();
                }
            }

            // 手機版優化：點選活動列表後，自動收合底部抽屜以利使用者觀看地圖！
            if (window.innerWidth <= 900) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.remove('expanded');
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
                <div class="modal-info-label">地點</div>
                <div class="modal-info-value">${item.locationName}</div>
                
                <div class="modal-info-label">時間</div>
                <div class="modal-info-value">${item.time}</div>
                
                <div class="modal-info-label">費用</div>
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

    // ==================== 官方下載專區 Modal 控制邏輯 ====================
    const btnOfficialDownloads = document.getElementById('btn-official-downloads');
    const downloadsModal = document.getElementById('downloads-modal');
    const btnCloseDownloadsModal = document.getElementById('close-downloads-modal');

    function showDownloadsModal() {
        if (!downloadsModal) return;
        downloadsModal.classList.remove('view-hidden');
        setTimeout(() => {
            downloadsModal.classList.add('active');
        }, 10);
    }

    function hideDownloadsModal() {
        if (!downloadsModal) return;
        downloadsModal.classList.remove('active');
        setTimeout(() => {
            downloadsModal.classList.add('view-hidden');
        }, 300);
    }

    if (btnOfficialDownloads) {
        btnOfficialDownloads.addEventListener('click', showDownloadsModal);
    }
    if (btnCloseDownloadsModal) {
        btnCloseDownloadsModal.addEventListener('click', hideDownloadsModal);
    }
    if (downloadsModal) {
        downloadsModal.addEventListener('click', (e) => {
            if (e.target === downloadsModal) {
                hideDownloadsModal();
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
                    // 2. 更新地圖篩選狀態以確保該物件在地圖上顯示
                    let targetTabType = 'all-spots';
                    if (item.type === 'free' || item.type === 'paid') {
                        targetTabType = 'indoor-activities';
                    } else if (item.type === 'offsite') {
                        targetTabType = 'offsite-activities';
                    } else if (item.type === 'checkin') {
                        targetTabType = 'checkin-spots';
                    }
                    const mapChip = Array.from(document.querySelectorAll('.chip')).find(c => c.dataset.type === targetTabType);
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
            map.closePopup();

            // 切換分頁時移除現有的動態焦點標記
            if (state.activeFocusMarker) {
                map.removeLayer(state.activeFocusMarker);
                state.activeFocusMarker = null;
            }

            // 當切換到「館內活動 (indoor-activities)」時才顯示打卡任務，其餘隱藏！
            const questCard = document.getElementById('checkin-quest-card');
            const subFilters = document.getElementById('indoor-sub-filters');
            if (state.activeFilter === 'indoor-activities') {
                if (questCard) questCard.style.display = 'block';
                if (subFilters) subFilters.style.display = 'flex';
            } else {
                if (questCard) questCard.style.display = 'none';
                if (subFilters) subFilters.style.display = 'none';
            }

            syncLayerCheckboxes(state.activeFilter);
            renderMap();
        });
    });

    // 館內活動子篩選 Sub-Chip 監聽
    document.querySelectorAll('.sub-chip').forEach(subChip => {
        subChip.addEventListener('click', (e) => {
            document.querySelectorAll('.sub-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            state.indoorSubFilter = e.target.dataset.subType;
            state.selectedId = null;
            map.closePopup();

            // 移除現有的動態焦點標記
            if (state.activeFocusMarker) {
                map.removeLayer(state.activeFocusMarker);
                state.activeFocusMarker = null;
            }

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

    // ==================== 7.5 推薦打卡景點任務活動邏輯 ====================
    function initCheckinQuest() {
        const questCard = document.getElementById('checkin-quest-card');
        const toggleBtn = document.getElementById('quest-card-toggle');
        const checklistContainer = document.getElementById('quest-checklist');
        const progressLabel = document.getElementById('quest-progress-label');
        const progressBarFill = document.getElementById('quest-progress-fill');
        
        if (!questCard || !checklistContainer || !progressLabel || !progressBarFill) return;
        
        // 1. 綁定卡片展開/收合點擊監聽
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                questCard.classList.toggle('collapsed');
            });
        }
        
        // 依據初始篩選同步顯示狀態 (預設 'all-spots' 時隱藏)
        if (state.activeFilter === 'indoor-activities') {
            questCard.style.display = 'block';
        } else {
            questCard.style.display = 'none';
        }
        
        // 讀取本地快取打卡紀錄
        let savedCheckin = [];
        try {
            const saved = localStorage.getItem('plc_checkin_progress');
            if (saved) {
                savedCheckin = JSON.parse(saved);
            }
        } catch (e) {
            console.error("讀取本地打卡快取失敗:", e);
        }
        
        // 2. 動態渲染打卡清單項目 (結合一鍵地圖定位高亮功能)
        checklistContainer.innerHTML = '';
        RECOMMENDED_CHECKPOINTS.forEach((checkpoint) => {
            const isChecked = savedCheckin.includes(checkpoint.name);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'quest-item';
            itemDiv.innerHTML = `
                <label class="quest-item-label">
                    <input type="checkbox" data-name="${checkpoint.name}" ${isChecked ? 'checked' : ''} />
                    <span>${checkpoint.name}</span>
                </label>
                <span class="quest-locate-btn" title="地圖定位">📍</span>
            `;
            
            // 綁定核取盒監聽事件
            const checkbox = itemDiv.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                updateQuestProgress();
            });
            
            // 點擊定位按鈕或名稱，將地圖平移並高亮對應的打卡景點
            const locateBtn = itemDiv.querySelector('.quest-locate-btn');
            const labelText = itemDiv.querySelector('.quest-item-label span');
            const locateAction = () => {
                // 將打卡景點轉換為活動物件格式以套用 highlightItem
                const checkpointActivity = {
                    id: `checkpoint-${checkpoint.name}`,
                    name: checkpoint.name,
                    type: 'checkin',
                    locationName: "推薦打卡景點",
                    time: "全天開放",
                    price: "免費參觀",
                    desc: checkpoint.desc,
                    coords: checkpoint.coords
                };
                
                // 切換至地圖導覽視窗 (如果當前在時間表)
                const mapBtn = document.querySelector('button[data-view="map"]');
                if (mapBtn && !mapBtn.classList.contains('active')) {
                    mapBtn.click();
                }
                
                // 自動勾選推薦打卡圖層以便使用者可以在地圖上看見
                if (layerCheckboxes.checkin && !layerCheckboxes.checkin.checked) {
                    layerCheckboxes.checkin.checked = true;
                    mapGroups.checkin.addTo(map);
                    updateSelectAllState();
                }
                
                // 執行定位與高亮
                highlightItem(checkpointActivity, true);
            };
            
            locateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                locateAction();
            });
            labelText.addEventListener('click', (e) => {
                e.preventDefault(); // 防止點擊文字觸發 checkbox
                locateAction();
            });
            
            checklistContainer.appendChild(itemDiv);
        });
        
        // 更新進度與比例
        function updateQuestProgress() {
            const checkboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
            const checkedNames = [];
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    checkedNames.push(cb.dataset.name);
                }
            });
            
            const count = checkedNames.length;
            const target = 6;
            
            // 寫入本地快取
            localStorage.setItem('plc_checkin_progress', JSON.stringify(checkedNames));
            
            // 更新進度文字
            if (count >= target) {
                progressLabel.textContent = `已打卡: ${count} / ${target} 則 (已達標！可至大廳兌獎)`;
                progressLabel.style.color = '#fdcb6e'; // 達標時字體亮金色
            } else {
                progressLabel.textContent = `已打卡: ${count} / ${target} 則 (還差 ${target - count} 則)`;
                progressLabel.style.color = '#ffffff'; // 未達標維持白字
            }
            
            // 更新進度條長度
            const percent = Math.min((count / target) * 100, 100);
            progressBarFill.style.width = `${percent}%`;
        }
        
        // 首次初始化進度更新
        updateQuestProgress();
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
        restaurant: document.getElementById('layer-restaurant'),
        toilet: document.getElementById('layer-toilet'),
        bridge: document.getElementById('layer-bridge'),
        attraction: document.getElementById('layer-attraction'),
        dock: document.getElementById('layer-dock'),
        checkin: document.getElementById('layer-checkin')
    };

    const selectAllCheckbox = document.getElementById('layer-select-all');
    const layerSeparator = document.getElementById('layer-separator');

    // 更新全選狀態輔助函式 (若所有可見的子選項都勾選，則全選主盒自動勾選，否則取消勾選)
    function updateSelectAllState() {
        if (selectAllCheckbox) {
            const visibleCheckboxes = Object.values(layerCheckboxes).filter(cb => cb && cb.parentElement.style.display !== 'none');
            const allChecked = visibleCheckboxes.length > 0 && visibleCheckboxes.every(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
        }
    }

    Object.keys(layerCheckboxes).forEach(key => {
        const checkbox = layerCheckboxes[key];
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    mapGroups[key].addTo(map);
                } else {
                    map.removeLayer(mapGroups[key]);
                }
                updateSelectAllState(); // 更新全選狀態
            });
        }
    });

    // 監聽全選主核取盒 (一鍵勾選/取消全可見圖層)
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            Object.keys(layerCheckboxes).forEach(key => {
                const checkbox = layerCheckboxes[key];
                // 僅操作當前顯示的可見核取盒，避免點擊全選時影響到隱藏的圖層！
                if (checkbox && checkbox.parentElement.style.display !== 'none') {
                    if (checkbox.checked !== isChecked) {
                        checkbox.checked = isChecked;
                        if (isChecked) {
                            mapGroups[key].addTo(map);
                        } else {
                            map.removeLayer(mapGroups[key]);
                        }
                    }
                }
            });
        });
    }

    // 依據左側篩選 Tab 同步右側核取盒的可見度與預設選取狀態
    function syncLayerCheckboxes(activeFilter) {
        // 重置所有圖層的可見度 (隱藏所有)
        Object.keys(layerCheckboxes).forEach(key => {
            const checkbox = layerCheckboxes[key];
            if (checkbox) {
                // 預設將 checkbox 包裝 label 顯示出來
                checkbox.parentElement.style.display = 'flex';
                // 取消勾選並從地圖移除
                checkbox.checked = false;
                map.removeLayer(mapGroups[key]);
            }
        });
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.parentElement.style.display = 'flex';
        }
        if (layerSeparator) layerSeparator.style.display = 'block';

        if (activeFilter === 'all-spots') {
            // == 全部景點 ==
            // 保持全部選項可見，不強制預設勾選任何圖層，讓使用者自己選
        } 
        else if (activeFilter === 'checkin-spots') {
            // == 打卡景點 ==
            // 只保留「全選/取消」、「推薦打卡」核取盒，其他全部隱藏！
            Object.keys(layerCheckboxes).forEach(key => {
                if (key !== 'checkin') {
                    layerCheckboxes[key].parentElement.style.display = 'none';
                }
            });
            // 自動勾選「推薦打卡」圖層並在地圖上呈現
            layerCheckboxes.checkin.checked = true;
            mapGroups.checkin.addTo(map);
            updateSelectAllState(); // 更新全選勾選狀態
        } 
        else if (activeFilter === 'indoor-activities') {
            // == 館內活動 ==
            // 隱藏「推薦打卡」核取盒，顯示「餐廳、廁所、橋樑、景點、碼頭」
            layerCheckboxes.checkin.parentElement.style.display = 'none';
            // 預設全部不勾選，維持地圖極致清爽與融入背景
            updateSelectAllState();
        } 
        else if (activeFilter === 'offsite-activities') {
            // == 館外活動 ==
            // 館外行程不對應渡假村內圖層，全部選項與分隔線隱藏！
            Object.keys(layerCheckboxes).forEach(key => {
                layerCheckboxes[key].parentElement.style.display = 'none';
            });
            if (selectAllCheckbox) selectAllCheckbox.parentElement.style.display = 'none';
            if (layerSeparator) layerSeparator.style.display = 'none';
        }
    }

    // ==================== 7.8 手機版底部抽屜 (Sliding Bottom Sheet) 控制 ====================
    function initMobileBottomSheet() {
        const sidebar = document.getElementById('sidebar');
        const handle = document.querySelector('.mobile-drag-handle');
        const header = document.querySelector('.sidebar-header');
        
        if (!sidebar) return;
        
        // 點擊拖曳把手或標題區域，切換展開/摺疊狀態
        const toggleSidebar = () => {
            if (window.innerWidth <= 900) {
                sidebar.classList.toggle('expanded');
            }
        };
        
        if (handle) handle.addEventListener('click', toggleSidebar);
        if (header) header.addEventListener('click', toggleSidebar);
    }

    // ==================== 7.9 地圖圖層面板摺疊控制 ====================
    function initCollapsibleLayerControl() {
        const toggleBtn = document.getElementById('layer-control-toggle');
        const layerControl = document.getElementById('map-layer-control');
        
        if (!toggleBtn || !layerControl) return;
        
        // 點擊標題切換摺疊狀態
        toggleBtn.addEventListener('click', () => {
            layerControl.classList.toggle('collapsed');
        });
        
        // 手機版（寬度 <= 900px）預設摺疊，以防擋住地圖
        if (window.innerWidth <= 900) {
            layerControl.classList.add('collapsed');
        }
    }

    // ==================== 8. 初始化執行觸發 ====================
    
    // 首次載入時依據預設分頁同步右側核取盒狀態
    syncLayerCheckboxes(state.activeFilter);

    // 初始化渲染地圖介面
    renderMap();
    
    // 初始化渲染時間表靜態網格
    initTimetableGridFramework();

    // 初始化推薦打卡景點任務
    initCheckinQuest();

    // 初始化手機版底部抽屜控制
    initMobileBottomSheet();

    // 初始化地圖圖層摺疊控制
    initCollapsibleLayerControl();

    // 地圖初次提示自動淡出
    setTimeout(() => {
        elOverlay.classList.add('fade-out');
    }, 3500);
});
