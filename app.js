// Three.js セットアップ
const canvas = document.getElementById("webgl-canvas");
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

// リサイズ対応
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateAspect();
});

// 複数画像のパス
const imagePaths = [
  "img/photo_01.jpg",
  "img/photo_02.jpg",
  "img/photo_03.jpg",
  "img/photo_04.jpg",
  "img/photo_05.jpg",
  "img/photo_06.jpg",
  "img/photo_07.jpg",
  "img/photo_08.jpg",
  "img/photo_09.jpg",
  "img/photo_10.jpg",
];

// 各画像に対応するリンク先URL（画像と同じ順番）
const imageURLs = [
  "https://example.com/photo01",
  "https://example.com/photo02",
  "https://example.com/photo03",
  "https://example.com/photo04",
  "https://example.com/photo05",
  "https://example.com/photo06",
  "https://example.com/photo07",
  "https://example.com/photo08",
  "https://example.com/photo09",
  "https://example.com/photo10",
];

const baseRepeat = 3;
let atlasTexture = null;

// 複数画像をテクスチャアトラス（5x2）にまとめる（cover方式：隙間なし）
const ATLAS_COLS = 5;
const ATLAS_ROWS = 2;

function createTextureAtlas(images) {
  const atlasWidth = 2560;  // 512 * 5
  const atlasHeight = 1024; // 512 * 2
  const tileWidth = atlasWidth / ATLAS_COLS;
  const tileHeight = atlasHeight / ATLAS_ROWS;

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasWidth;
  atlasCanvas.height = atlasHeight;
  const ctx = atlasCanvas.getContext("2d");

  // 背景を暗い色に
  ctx.fillStyle = "#0d0d12";
  ctx.fillRect(0, 0, atlasWidth, atlasHeight);

  // 各画像をcover方式で配置（タイル全体を埋める）
  images.forEach((img, index) => {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const x = col * tileWidth;
    const y = row * tileHeight;

    const imgAspect = img.width / img.height;
    const tileAspect = tileWidth / tileHeight;

    // cover方式（タイル全体を埋める、アスペクト比を保持）
    let drawWidth, drawHeight, drawX, drawY;
    if (imgAspect > tileAspect) {
      // 画像がタイルより横長 → 縦を合わせて横をはみ出す
      drawHeight = tileHeight;
      drawWidth = tileHeight * imgAspect;
      drawX = x - (drawWidth - tileWidth) / 2;
      drawY = y;
    } else {
      // 画像がタイルより縦長 → 横を合わせて縦をはみ出す
      drawWidth = tileWidth;
      drawHeight = tileWidth / imgAspect;
      drawX = x;
      drawY = y - (drawHeight - tileHeight) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, tileWidth, tileHeight);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(atlasCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// 画像を全て読み込んでアトラスを作成
function loadAllImages() {
  const promises = imagePaths.map((path) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        const dummy = document.createElement("canvas");
        dummy.width = 100;
        dummy.height = 100;
        const ctx = dummy.getContext("2d");
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, 100, 100);
        resolve(dummy);
      };
      img.src = path;
    });
  });

  Promise.all(promises).then((images) => {
    atlasTexture = createTextureAtlas(images);
    material.uniforms.u_texture.value = atlasTexture;
    updateAspect();
  });
}

loadAllImages();

// アスペクト比を更新
function updateAspect() {
  const screenAspect = window.innerWidth / window.innerHeight;
  if (screenAspect > 1) {
    material.uniforms.u_repeat.value.set(baseRepeat * screenAspect, baseRepeat);
  } else {
    material.uniforms.u_repeat.value.set(baseRepeat, baseRepeat / screenAspect);
  }
}

// カスタムシェーダーマテリアル
const material = new THREE.ShaderMaterial({
  uniforms: {
    u_texture: { value: null },
    u_offset: { value: new THREE.Vector2(0, 0) },
    u_repeat: { value: new THREE.Vector2(baseRepeat, baseRepeat) },
    u_gap: { value: 0.0 },
    u_depth: { value: 0.0 },
    u_imageCount: { value: 10.0 },
    u_atlasCols: { value: 5.0 },
    u_atlasRows: { value: 2.0 },
  },
  vertexShader: `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform vec2 u_offset;
    uniform vec2 u_repeat;
    uniform float u_gap;
    uniform float u_depth;
    uniform float u_imageCount;
    uniform float u_atlasCols;
    uniform float u_atlasRows;

    void main() {
      // 画面中心からの距離
      vec2 centered = v_uv - 0.5;
      float distFromCenter = length(centered);

      // 奥行き効果
      float depthStrength = u_depth * 0.3;
      vec2 depthWarp = centered * (1.0 - depthStrength * distFromCenter * 2.0);
      vec2 warpedUV = depthWarp + 0.5;

      // タイリング用のUV
      vec2 uv = warpedUV * u_repeat + u_offset;

      // タイルのインデックス
      vec2 tileIndex = floor(uv);

      // タイル内のローカルUV
      vec2 tileUV = fract(uv);

      // ギャップを適用
      float gap = u_gap * 0.09;
      vec2 scaledUV = (tileUV - 0.5) / (1.0 - gap * 2.0) + 0.5;

      // タイル外かどうかチェック
      bool isOutside = scaledUV.x < 0.0 || scaledUV.x > 1.0 || scaledUV.y < 0.0 || scaledUV.y > 1.0;

      vec4 color;
      if (isOutside) {
        color = vec4(0.05, 0.05, 0.08, 1.0);
      } else {
        // XとY座標を組み合わせて決定（縦横で異なる画像になる）
        float indexFloat = mod(tileIndex.x + tileIndex.y * u_atlasCols, u_imageCount);
        int imageIndex = int(indexFloat);

        // アトラス内の位置を計算（5x2グリッド）
        float atlasCol = mod(float(imageIndex), u_atlasCols);
        float atlasRow = floor(float(imageIndex) / u_atlasCols);

        // アトラスUVを計算（Y座標を反転）
        vec2 atlasUV = vec2(
          (atlasCol + scaledUV.x) / u_atlasCols,
          ((u_atlasRows - 1.0 - atlasRow) + scaledUV.y) / u_atlasRows
        );

        color = texture2D(u_texture, atlasUV);
      }

      // トンネル効果
      color.rgb *= 1.0 - u_depth * 0.2;

      gl_FragColor = color;
    }
  `,
});

// 全画面を覆う平面
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// アニメーション用の変数
let offset = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };
const friction = 0.95;

// ギャップ・奥行きアニメーション用
let currentGap = 0;
let currentDepth = 0;
const gapSmoothing = 0.1;
const depthSmoothing = 0.08;

// マウスイベント
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
  velocity.x = 0;
  velocity.y = 0;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;

    velocity.x = deltaX * 0.002;
    velocity.y = -deltaY * 0.002;

    offset.x += velocity.x;
    offset.y += velocity.y;

    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

// タッチイベント
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  isDragging = true;
  const touch = e.touches[0];
  lastMousePos.x = touch.clientX;
  lastMousePos.y = touch.clientY;
  velocity.x = 0;
  velocity.y = 0;
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (isDragging) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - lastMousePos.x;
    const deltaY = touch.clientY - lastMousePos.y;

    velocity.x = deltaX * 0.002;
    velocity.y = -deltaY * 0.002;

    offset.x += velocity.x;
    offset.y += velocity.y;

    lastMousePos.x = touch.clientX;
    lastMousePos.y = touch.clientY;
  }
});

canvas.addEventListener("touchend", () => {
  isDragging = false;
});

// ホイールイベント
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  velocity.x += e.deltaX * 0.0002;
  velocity.y -= e.deltaY * 0.0002;
});

// アニメーションループ
function animate() {
  requestAnimationFrame(animate);
  offset.x += 0.006;
  // 慣性を適用
  if (!isDragging) {
    offset.x += velocity.x;
    offset.y += velocity.y;
    velocity.x *= friction;
    velocity.y *= friction;
  }

  // 速度の大きさを計算
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

  // 目標ギャップ値
  const targetGap = Math.min(speed * 20, 1.0);

  // 目標奥行き値
  const targetDepth = Math.min(speed * 15, 1.0);

  // 滑らかに補間
  currentGap += (targetGap - currentGap) * gapSmoothing;
  currentDepth += (targetDepth - currentDepth) * depthSmoothing;

  // シェーダーのuniformを更新
  material.uniforms.u_offset.value.set(offset.x, offset.y);
  material.uniforms.u_gap.value = currentGap;
  material.uniforms.u_depth.value = currentDepth;

  renderer.render(scene, camera);
}

animate();

// クリックでリンクに飛ぶ処理
canvas.addEventListener("click", (e) => {
  // クリック位置を0〜1のUV座標に変換
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1.0 - (e.clientY - rect.top) / rect.height; // 上下反転

  // 画面中心からの距離（奥行き効果の計算）
  const centered_x = x - 0.5;
  const centered_y = y - 0.5;
  const distFromCenter = Math.sqrt(centered_x * centered_x + centered_y * centered_y);

  // 奥行きワープを適用（シェーダーと同じ）
  // テスト：奥行きワープを一時的に無効化
  const depthStrength = 0; // currentDepth * 0.3;
  const warpFactor = 1.0 - depthStrength * distFromCenter * 2.0;
  const warpedX = centered_x * warpFactor + 0.5;
  const warpedY = centered_y * warpFactor + 0.5;

  // リピート倍率を取得
  const repeatX = material.uniforms.u_repeat.value.x;
  const repeatY = material.uniforms.u_repeat.value.y;

  // UV座標を計算
  const uv_x = warpedX * repeatX + offset.x;
  const uv_y = warpedY * repeatY + offset.y;

  // タイルのインデックス
  const tileIndexX = Math.floor(uv_x);
  const tileIndexY = Math.floor(uv_y);

  // タイル内のローカルUV
  const tileUV_x = uv_x - tileIndexX;
  const tileUV_y = uv_y - tileIndexY;

  // ギャップチェック（タイルの隙間をクリックした場合は無視）
  const gap = currentGap * 0.09;
  const scaledUV_x = (tileUV_x - 0.5) / (1.0 - gap * 2.0) + 0.5;
  const scaledUV_y = (tileUV_y - 0.5) / (1.0 - gap * 2.0) + 0.5;

  // タイル外（隙間）をクリックした場合は何もしない
  if (scaledUV_x < 0.0 || scaledUV_x > 1.0 || scaledUV_y < 0.0 || scaledUV_y > 1.0) {
    return;
  }

  // XとY座標を組み合わせて決定（シェーダーと同じ計算）
  const calcValue = tileIndexX + tileIndexY * 5;
  const imageIndex = ((calcValue % 10) + 10) % 10;

  // デバッグ情報を表示
  console.log("=== クリック情報 ===");
  console.log("クリック座標(画面):", e.clientX.toFixed(0), e.clientY.toFixed(0));
  console.log("UV座標:", x.toFixed(4), y.toFixed(4));
  console.log("currentDepth:", currentDepth.toFixed(4));
  console.log("奥行きワープ後:", warpedX.toFixed(4), warpedY.toFixed(4));
  console.log("repeat:", repeatX.toFixed(2), repeatY.toFixed(2));
  console.log("offset:", offset.x.toFixed(4), offset.y.toFixed(4));
  console.log("最終UV:", uv_x.toFixed(4), uv_y.toFixed(4));
  console.log("タイル位置:", tileIndexX, tileIndexY);
  console.log("計算（X+Y*5）:", `${tileIndexX} + ${tileIndexY} * 5 = ${calcValue}`);
  console.log("最終:", `((${calcValue} % 10) + 10) % 10 = ${imageIndex}`);
  console.log("画像:", imagePaths[imageIndex]);
  console.log("URL:", imageURLs[imageIndex]);
  console.log("==================");

  // 対応するURLに飛ぶ
  if (imageURLs[imageIndex]) {
    // デバッグ中はコメントアウトして実際には飛ばないようにする
    // window.location.href = imageURLs[imageIndex];
    alert(
      `タイル位置: (${tileIndexX}, ${tileIndexY})\n画像: ${imagePaths[imageIndex]}\nリンク先: ${imageURLs[imageIndex]}\n\n※見えている画像と合っているか確認してください`
    );
  }
});
