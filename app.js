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
  "img/about.jpg",
  "img/guest_attalk_dai.png",
  "img/x_post_nami.webp",
  "img/x_post_kuu.webp",
];

const baseRepeat = 4;
let atlasTexture = null;

// 複数画像をテクスチャアトラス（2x2）にまとめる（cover方式：隙間なし）
function createTextureAtlas(images) {
  const atlasSize = 1024;
  const tileSize = atlasSize / 2; // 2x2グリッド

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const ctx = atlasCanvas.getContext("2d");

  // 背景を暗い色に
  ctx.fillStyle = "#0d0d12";
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // 各画像をcover方式で配置（タイル全体を埋める）
  images.forEach((img, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = col * tileSize;
    const y = row * tileSize;

    const imgAspect = img.width / img.height;

    // cover方式（タイル全体を埋める、アスペクト比を保持）
    let drawWidth, drawHeight, drawX, drawY;
    if (imgAspect > 1) {
      // 横長画像 → 縦を合わせて横をはみ出す
      drawHeight = tileSize;
      drawWidth = tileSize * imgAspect;
      drawX = x - (drawWidth - tileSize) / 2;
      drawY = y;
    } else {
      // 縦長画像 → 横を合わせて縦をはみ出す
      drawWidth = tileSize;
      drawHeight = tileSize / imgAspect;
      drawX = x;
      drawY = y - (drawHeight - tileSize) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, tileSize, tileSize);
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
    u_imageCount: { value: 4.0 },
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

    // 疑似乱数生成
    float random(vec2 st) {
      return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
    }

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
        // タイルごとにランダムな画像を選択
        float rand = random(tileIndex);
        int imageIndex = int(floor(rand * u_imageCount));

        // アトラス内の位置を計算（2x2グリッド）
        float atlasCol = mod(float(imageIndex), 2.0);
        float atlasRow = floor(float(imageIndex) / 2.0);

        // アトラスUVを計算
        vec2 atlasUV = (vec2(atlasCol, atlasRow) + scaledUV) / 2.0;

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
