// 喜怒哀楽スカウター - メインアプリケーション

const EMOTIONS = {
  happy: { label: '喜び', sublabel: 'happy', icon: '😊', color: '#FFB800' },
  angry: { label: '怒り', sublabel: 'angry', icon: '😠', color: '#FF3B30' },
  sad: { label: '悲しみ', sublabel: 'sad', icon: '😢', color: '#007AFF' },
  surprised: { label: '驚き', sublabel: 'surprised', icon: '😲', color: '#FF2D92' },
  neutral: { label: '無表情', sublabel: 'neutral', icon: '😐', color: '#8E8E93' },
  fearful: { label: '恐怖', sublabel: 'fearful', icon: '😨', color: '#AF52DE' },
  disgusted: { label: '嫌悪', sublabel: 'disgusted', icon: '🤢', color: '#30D158' }
};

// 7感情すべて（レーダーチャート用）
const RADAR_EMOTIONS = ['happy', 'angry', 'sad', 'surprised', 'neutral', 'fearful', 'disgusted'];

// 複合感情の定義（閾値ベース）
const COMPOUND_EMOTIONS = [
  { id: 'happilySurprised', jp: '喜びの驚き', en: 'Happily Surprised', requires: { happy: 0.25, surprised: 0.25 } },
  { id: 'happilyDisgusted', jp: '皮肉な喜び', en: 'Happily Disgusted', requires: { happy: 0.2, disgusted: 0.2 } },
  { id: 'sadlyFearful', jp: '悲しみの恐怖', en: 'Sadly Fearful', requires: { sad: 0.25, fearful: 0.25 } },
  { id: 'sadlyAngry', jp: '悲しみの怒り', en: 'Sadly Angry', requires: { sad: 0.25, angry: 0.25 } },
  { id: 'sadlySurprised', jp: '悲しみの驚き', en: 'Sadly Surprised', requires: { sad: 0.25, surprised: 0.25 } },
  { id: 'sadlyDisgusted', jp: '呆れ', en: 'Sadly Disgusted', requires: { sad: 0.2, disgusted: 0.2 } },
  { id: 'fearfullyAngry', jp: '恐怖の怒り', en: 'Fearfully Angry', requires: { fearful: 0.25, angry: 0.25 } },
  { id: 'fearfullySurprised', jp: '恐怖の驚き', en: 'Fearfully Surprised', requires: { fearful: 0.25, surprised: 0.25 } },
  { id: 'fearfullyDisgusted', jp: '恐怖の嫌悪', en: 'Fearfully Disgusted', requires: { fearful: 0.2, disgusted: 0.2 } },
  { id: 'angrilySurprised', jp: '怒りの驚き', en: 'Angrily Surprised', requires: { angry: 0.25, surprised: 0.25 } },
  { id: 'angrilyDisgusted', jp: '憎悪', en: 'Hatred', requires: { angry: 0.25, disgusted: 0.25 } },
  { id: 'disgustedlySurprised', jp: '嫌悪の驚き', en: 'Disgustedly Surprised', requires: { disgusted: 0.2, surprised: 0.25 } },
  { id: 'awe', jp: '畏敬', en: 'Awe', requires: { fearful: 0.2, surprised: 0.3, happy: 0.1 } },
];

class EmotionScouter {
  constructor() {
    this.video = document.getElementById('video');
    this.overlay = document.getElementById('overlay');
    this.radar = document.getElementById('radar');
    this.status = document.getElementById('status');
    this.emotionValues = document.getElementById('emotionValues');
    this.startBtn = document.getElementById('startBtn');
    this.switchBtn = document.getElementById('switchBtn');

    this.ctx = this.overlay.getContext('2d');
    this.radarCtx = this.radar.getContext('2d');
    this.compoundEmotion = document.getElementById('compoundEmotion');
    this.mouthCorner = document.getElementById('mouthCorner');
    this.statusBar = document.getElementById('statusBar');
    this.currentMouthScore = 50;
    this.mouthSensitivity = 2.0;

    this.isRunning = false;
    this.currentFacingMode = 'user';
    this.currentEmotions = {};
    this.smoothedEmotions = {};
    this.targetEmotions = {};
    this.isAnimating = false;

    // 画像アップロード用
    this.imageUpload = document.getElementById('imageUpload');
    this.uploadedImage = document.getElementById('uploadedImage');
    this.faceSelector = document.getElementById('faceSelector');
    this.isImageMode = false;

    // 複数顔検出用
    this.detectedFaces = [];
    this.selectedFaceIndex = 0;

    // 顔枠のスムージング用
    this.smoothedBoxes = [];

    // スムージング係数（0-1、大きいほど反応が早い）ゆるゆる動く
    this.smoothingFactor = 0.08;

    // 感度（1.0が標準、大きいほど敏感）
    this.sensitivity = 1.0;
    this.sensitivitySlider = document.getElementById('sensitivity');
    this.sensitivityValue = document.getElementById('sensitivityValue');

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.createEmotionDisplay();
    this.drawRadarChart({});
    this.loadingSpinner = document.getElementById('loadingSpinner');

    try {
      this.status.textContent = 'モデル読込中...';
      await this.loadModels();
      this.status.textContent = 'Ready';
      this.loadingSpinner.classList.add('hidden');
      this.startBtn.disabled = false;
    } catch (error) {
      console.error('Model loading error:', error);
      this.status.textContent = '読込失敗';
      this.loadingSpinner.classList.add('hidden');
    }
  }

  async loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]);
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.toggleCamera());
    this.switchBtn.addEventListener('click', () => this.switchCamera());

    if (this.sensitivitySlider) {
      this.sensitivitySlider.addEventListener('input', (e) => {
        this.sensitivity = parseFloat(e.target.value);
        this.sensitivityValue.textContent = `${this.sensitivity.toFixed(1)}x`;
      });
    }

    // 画像アップロード
    if (this.imageUpload) {
      this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
    }

    // 画像上の顔クリック
    this.overlay.addEventListener('click', (e) => this.handleOverlayClick(e));
  }

  handleOverlayClick(e) {
    if (this.detectedFaces.length <= 1) return;

    // クリック位置をキャンバス座標に変換
    const rect = this.overlay.getBoundingClientRect();
    const scaleX = this.overlay.width / rect.width;
    const scaleY = this.overlay.height / rect.height;
    let clickX = (e.clientX - rect.left) * scaleX;
    let clickY = (e.clientY - rect.top) * scaleY;

    if (this.isImageMode) {
      // 画像モード: object-fit: contain のオフセットを考慮
      const imgNatW = this.uploadedImage.naturalWidth;
      const imgNatH = this.uploadedImage.naturalHeight;
      const containerW = this.overlay.width;
      const containerH = this.overlay.height;

      const scale = Math.min(containerW / imgNatW, containerH / imgNatH);
      const displayW = imgNatW * scale;
      const displayH = imgNatH * scale;
      const offsetX = (containerW - displayW) / 2;
      const offsetY = (containerH - displayH) / 2;

      // クリック座標を元画像の座標に変換
      clickX = (clickX - offsetX) / scale;
      clickY = (clickY - offsetY) / scale;
    } else {
      // カメラモードの場合は鏡像なのでX座標を反転
      clickX = this.overlay.width - clickX;
    }

    // クリック位置がどの顔のボックス内か判定
    for (let i = 0; i < this.detectedFaces.length; i++) {
      const box = this.detectedFaces[i].detection.box;
      if (clickX >= box.x && clickX <= box.x + box.width &&
          clickY >= box.y && clickY <= box.y + box.height) {
        this.selectedFaceIndex = i;

        if (this.isImageMode) {
          this.updateFaceSelectorActive();
          this.drawAllFaceBoxes();
          this.updateEmotionsInstant(this.detectedFaces[i].expressions);
          this.updateMouthCornerInstant(this.detectedFaces[i].landmarks);
        } else {
          this.updateFaceSelectorActiveCamera();
        }
        break;
      }
    }
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // カメラを停止
    if (this.isRunning) {
      this.stopCamera();
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      // 画像モードに切り替え
      this.isImageMode = true;
      this.video.style.display = 'none';
      this.uploadedImage.classList.remove('hidden');
      this.uploadedImage.src = e.target.result;

      this.uploadedImage.onload = async () => {
        // オーバーレイのサイズをコンテナに合わせる
        const container = this.uploadedImage.parentElement;
        this.overlay.width = container.clientWidth;
        this.overlay.height = container.clientHeight;
        await this.analyzeImage();
      };
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async analyzeImage() {
    this.status.textContent = 'Analyzing...';
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    try {
      const detections = await faceapi
        .detectAllFaces(this.uploadedImage, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length > 0) {
        this.detectedFaces = detections;
        this.selectedFaceIndex = 0;

        // 顔選択UIを表示
        this.updateFaceSelector();

        // 顔の枠を描画
        this.drawAllFaceBoxes();

        // 複数顔の場合はオーバーレイをクリック可能に
        if (detections.length > 1) {
          this.overlay.classList.add('clickable');
        }

        // 最初の顔の感情をレーダーチャートに表示
        this.updateEmotionsInstant(detections[0].expressions);
        this.updateMouthCornerInstant(detections[0].landmarks);
        this.status.textContent = `Found ${detections.length} face${detections.length > 1 ? 's' : ''}`;
      } else {
        this.detectedFaces = [];
        this.hideFaceSelector();
        this.overlay.classList.remove('clickable');
        this.status.textContent = 'No face detected';
      }
    } catch (error) {
      console.error('画像分析エラー:', error);
      this.status.textContent = 'Analysis error';
    }
  }

  updateFaceSelector() {
    if (this.detectedFaces.length <= 1) {
      this.hideFaceSelector();
      return;
    }

    // サムネイル用の一時キャンバス
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    this.faceSelector.innerHTML = '';
    this.faceSelector.classList.remove('hidden');

    this.detectedFaces.forEach((detection, index) => {
      const box = detection.detection.box;

      // 顔部分を切り取ってサムネイル作成
      const padding = box.width * 0.2;
      const x = Math.max(0, box.x - padding);
      const y = Math.max(0, box.y - padding);
      const w = Math.min(this.uploadedImage.naturalWidth - x, box.width + padding * 2);
      const h = Math.min(this.uploadedImage.naturalHeight - y, box.height + padding * 2);

      tempCanvas.width = w;
      tempCanvas.height = h;
      tempCtx.drawImage(this.uploadedImage, x, y, w, h, 0, 0, w, h);

      const img = document.createElement('img');
      img.src = tempCanvas.toDataURL();
      img.className = `face-thumb ${index === this.selectedFaceIndex ? 'active' : ''}`;
      img.dataset.index = index;
      img.addEventListener('click', () => {
        this.selectedFaceIndex = index;
        this.updateFaceSelectorActive();
        this.drawAllFaceBoxes();
        this.updateEmotionsInstant(this.detectedFaces[index].expressions);
        this.updateMouthCornerInstant(this.detectedFaces[index].landmarks);
      });

      this.faceSelector.appendChild(img);
    });
  }

  updateFaceSelectorActive() {
    this.faceSelector.querySelectorAll('.face-thumb').forEach((img, index) => {
      img.classList.toggle('active', index === this.selectedFaceIndex);
    });
  }

  hideFaceSelector() {
    this.faceSelector.classList.add('hidden');
    this.faceSelector.innerHTML = '';
  }

  drawAllFaceBoxes() {
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    // object-fit: contain による表示位置のオフセットを計算
    const imgNatW = this.uploadedImage.naturalWidth;
    const imgNatH = this.uploadedImage.naturalHeight;
    const containerW = this.overlay.width;
    const containerH = this.overlay.height;

    const scale = Math.min(containerW / imgNatW, containerH / imgNatH);
    const displayW = imgNatW * scale;
    const displayH = imgNatH * scale;
    const offsetX = (containerW - displayW) / 2;
    const offsetY = (containerH - displayH) / 2;

    this.detectedFaces.forEach((detection, index) => {
      const box = detection.detection.box;
      const isSelected = index === this.selectedFaceIndex;

      // 座標をスケーリングしてオフセット
      const x = box.x * scale + offsetX;
      const y = box.y * scale + offsetY;
      const w = box.width * scale;
      const h = box.height * scale;

      this.drawCornerMarks(x, y, w, h, isSelected);
    });
  }

  updateEmotionsInstant(expressions) {
    // 画像の場合もぬるぬるアニメーション
    RADAR_EMOTIONS.forEach(key => {
      this.targetEmotions[key] = Math.min(1, (expressions[key] || 0) * this.sensitivity);
      // 初期値がなければ設定
      if (this.smoothedEmotions[key] === undefined) {
        this.smoothedEmotions[key] = 0;
      }
    });

    // アニメーション開始
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animateToTarget();
    }
  }

  animateToTarget() {
    let stillAnimating = false;
    const smoothingFactor = 0.12; // ぬるぬる速度

    RADAR_EMOTIONS.forEach(key => {
      const target = this.targetEmotions[key] || 0;
      const current = this.smoothedEmotions[key] || 0;
      const diff = target - current;

      if (Math.abs(diff) > 0.001) {
        this.smoothedEmotions[key] = current + diff * smoothingFactor;
        stillAnimating = true;
      } else {
        this.smoothedEmotions[key] = target;
      }

      const percent = Math.round(this.smoothedEmotions[key] * 100);
      const bar = document.getElementById(`bar-${key}`);
      const valueEl = document.getElementById(`value-${key}`);
      if (bar) bar.style.width = `${percent}%`;
      if (valueEl) valueEl.textContent = `${percent}%`;
    });

    this.drawRadarChart(this.smoothedEmotions);
    this.updateCompoundEmotion(this.smoothedEmotions);

    if (stillAnimating) {
      requestAnimationFrame(() => this.animateToTarget());
    } else {
      this.isAnimating = false;
    }
  }

  updateMouthCorner(landmarks) {
    if (!landmarks) return;

    const points = landmarks.positions;

    // 68点ランドマーク: 48=左口角, 54=右口角, 51=上唇中央上, 57=下唇中央下, 62=上唇中央内側
    const leftCorner = points[48];
    const rightCorner = points[54];
    const upperLipCenter = points[51];
    const lowerLipCenter = points[57];

    // 口の中央のY座標（上唇と下唇の中間）
    const mouthCenterY = (upperLipCenter.y + lowerLipCenter.y) / 2;

    // 口角の平均Y座標
    const cornerAvgY = (leftCorner.y + rightCorner.y) / 2;

    // 顔のサイズで正規化（口の高さを基準に）
    const mouthHeight = lowerLipCenter.y - upperLipCenter.y;
    const normalizer = Math.max(mouthHeight, 10);

    // 口角の相対位置（負=上がってる、正=下がってる）
    const cornerOffset = (cornerAvgY - mouthCenterY) / normalizer;

    // スコアに変換（0-100、50が中立、100が上がってる、0が下がってる）
    // 感度を適用
    const rawScore = 50 - (cornerOffset * 50 * this.mouthSensitivity);
    const score = Math.max(0, Math.min(100, rawScore));

    // スムージング
    this.currentMouthScore = this.currentMouthScore + (score - this.currentMouthScore) * 0.3;

    this.renderMouthCorner(this.currentMouthScore);
  }

  renderMouthCorner(score) {
    // インジケーター位置
    const indicator = document.getElementById('mouth-indicator');
    const valueMouth = document.getElementById('value-mouth');

    if (indicator) {
      indicator.style.left = `${score}%`;
    }
    if (valueMouth) {
      // 50を基準に+/-で表示
      const diff = Math.round(score - 50);
      if (diff > 0) {
        valueMouth.textContent = `+${diff}`;
        valueMouth.style.color = '#2E7D32';
      } else if (diff < 0) {
        valueMouth.textContent = `${diff}`;
        valueMouth.style.color = '#C62828';
      } else {
        valueMouth.textContent = `±0`;
        valueMouth.style.color = '';
      }
    }
  }

  updateMouthCornerInstant(landmarks) {
    if (!landmarks) return;

    const points = landmarks.positions;
    const leftCorner = points[48];
    const rightCorner = points[54];
    const upperLipCenter = points[51];
    const lowerLipCenter = points[57];

    const mouthCenterY = (upperLipCenter.y + lowerLipCenter.y) / 2;
    const cornerAvgY = (leftCorner.y + rightCorner.y) / 2;
    const mouthHeight = lowerLipCenter.y - upperLipCenter.y;
    const normalizer = Math.max(mouthHeight, 10);
    const cornerOffset = (cornerAvgY - mouthCenterY) / normalizer;
    const rawScore = 50 - (cornerOffset * 50 * this.mouthSensitivity);
    const score = Math.max(0, Math.min(100, rawScore));

    this.currentMouthScore = score;
    this.renderMouthCorner(score);
  }

  createEmotionDisplay() {
    const emotionItems = RADAR_EMOTIONS.map(key => {
      const emotion = EMOTIONS[key];
      return `
        <div class="emotion-item">
          <span class="emotion-icon">${emotion.icon}</span>
          <div class="emotion-bar-container">
            <span class="emotion-label">${emotion.label}</span>
            <div class="emotion-bar">
              <div class="emotion-bar-fill" id="bar-${key}" style="background: ${emotion.color}; width: 0%"></div>
            </div>
          </div>
          <span class="emotion-value" id="value-${key}">0%</span>
        </div>
      `;
    }).join('');

    // 口角バーを追加
    const mouthItem = `
      <div class="emotion-item mouth-bar-item">
        <span class="emotion-icon">👄</span>
        <div class="emotion-bar-container">
          <div class="emotion-label">口角 <span class="emotion-sublabel">(smile)</span></div>
          <div class="emotion-bar mouth-gradient-bar">
            <div class="mouth-indicator" id="mouth-indicator" style="left: 50%"></div>
          </div>
        </div>
        <span class="emotion-value" id="value-mouth">±0</span>
      </div>
    `;

    this.emotionValues.innerHTML = emotionItems + mouthItem;
  }

  async toggleCamera() {
    if (this.isRunning) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera() {
    try {
      // 画像モードを解除
      if (this.isImageMode) {
        this.isImageMode = false;
        this.uploadedImage.classList.add('hidden');
        this.video.style.display = 'block';
        this.hideFaceSelector();
        this.detectedFaces = [];
        this.smoothedBoxes = [];
        this.overlay.classList.remove('clickable');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      this.video.srcObject = stream;
      await this.video.play();

      // オーバーレイのサイズを合わせる
      this.overlay.width = this.video.videoWidth;
      this.overlay.height = this.video.videoHeight;

      this.isRunning = true;
      this.startBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>停止`;
      this.status.textContent = 'Detecting...';
      this.statusBar.classList.add('active');

      this.detectLoop();
    } catch (error) {
      console.error('カメラエラー:', error);
      this.status.textContent = 'カメラにアクセスできません';
    }
  }

  stopCamera() {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
    this.isRunning = false;
    this.smoothedBoxes = [];
    this.startBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>カメラ開始`;
    this.status.textContent = 'Stopped';
    this.statusBar.classList.remove('active');
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  async switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    if (this.isRunning) {
      this.stopCamera();
      await this.startCamera();
    }
  }

  async detectLoop() {
    if (!this.isRunning) return;

    const detections = await faceapi
      .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions();

    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (detections.length > 0) {
      this.detectedFaces = detections;

      // 選択インデックスが範囲外なら0に戻す
      if (this.selectedFaceIndex >= detections.length) {
        this.selectedFaceIndex = 0;
      }

      // 複数人の場合はサムネイル更新（頻度を抑える）
      if (detections.length > 1) {
        this.updateCameraFaceSelector();
        this.overlay.classList.add('clickable');
      } else {
        this.hideFaceSelector();
        this.overlay.classList.remove('clickable');
      }

      // 全員の顔枠を描画
      this.drawAllFaceBoxesCamera();

      // 選択中の人を分析
      const detection = detections[this.selectedFaceIndex];
      this.updateEmotions(detection.expressions);
      this.updateMouthCorner(detection.landmarks);
      this.status.textContent = `Detecting — ${detections.length} face${detections.length > 1 ? 's' : ''}`;
    } else {
      this.detectedFaces = [];
      this.hideFaceSelector();
      this.status.textContent = 'No face detected';
    }

    requestAnimationFrame(() => this.detectLoop());
  }

  updateCameraFaceSelector() {
    if (this.detectedFaces.length <= 1) {
      this.hideFaceSelector();
      return;
    }

    // サムネイル用の一時キャンバス
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    this.faceSelector.innerHTML = '';
    this.faceSelector.classList.remove('hidden');

    this.detectedFaces.forEach((detection, index) => {
      const box = detection.detection.box;

      // 顔部分を切り取ってサムネイル作成（鏡像補正）
      const padding = box.width * 0.2;
      const x = Math.max(0, box.x - padding);
      const y = Math.max(0, box.y - padding);
      const w = Math.min(this.video.videoWidth - x, box.width + padding * 2);
      const h = Math.min(this.video.videoHeight - y, box.height + padding * 2);

      tempCanvas.width = w;
      tempCanvas.height = h;
      // 鏡像反転してキャプチャ
      tempCtx.save();
      tempCtx.scale(-1, 1);
      tempCtx.drawImage(this.video, x, y, w, h, -w, 0, w, h);
      tempCtx.restore();

      const img = document.createElement('img');
      img.src = tempCanvas.toDataURL();
      img.className = `face-thumb ${index === this.selectedFaceIndex ? 'active' : ''}`;
      img.dataset.index = index;
      img.addEventListener('click', () => {
        this.selectedFaceIndex = index;
        this.updateFaceSelectorActiveCamera();
      });

      this.faceSelector.appendChild(img);
    });
  }

  updateFaceSelectorActiveCamera() {
    this.faceSelector.querySelectorAll('.face-thumb').forEach((img, index) => {
      img.classList.toggle('active', index === this.selectedFaceIndex);
    });
  }

  drawAllFaceBoxesCamera() {
    const videoWidth = this.overlay.width;
    const smoothing = 0.15;

    // スムージング配列の調整
    while (this.smoothedBoxes.length < this.detectedFaces.length) {
      this.smoothedBoxes.push(null);
    }

    this.detectedFaces.forEach((detection, index) => {
      const box = detection.detection.box;
      const isSelected = index === this.selectedFaceIndex;

      // 鏡像補正したX座標
      const mirroredX = videoWidth - box.x - box.width;

      // スムージング
      if (!this.smoothedBoxes[index]) {
        this.smoothedBoxes[index] = { x: mirroredX, y: box.y, w: box.width, h: box.height };
      } else {
        const sb = this.smoothedBoxes[index];
        sb.x += (mirroredX - sb.x) * smoothing;
        sb.y += (box.y - sb.y) * smoothing;
        sb.w += (box.width - sb.w) * smoothing;
        sb.h += (box.height - sb.h) * smoothing;
      }

      const sb = this.smoothedBoxes[index];
      this.drawCornerMarks(sb.x, sb.y, sb.w, sb.h, isSelected);
    });
  }

  drawCornerMarks(x, y, w, h, isSelected) {
    const ctx = this.ctx;
    const cornerLen = Math.min(w, h) * 0.15;
    const lineWidth = isSelected ? 3 : 2;
    const color = isSelected ? 'rgba(201, 168, 124, 0.9)' : 'rgba(201, 168, 124, 0.4)';

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // 左上
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // 右上
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    ctx.stroke();

    // 左下
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    ctx.stroke();

    // 右下
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();
  }

  drawFaceBox(detection) {
    // カメラモードでは drawAllFaceBoxesCamera を使うのでここは画像用
    const box = detection.detection.box;
    this.ctx.strokeStyle = 'rgba(201, 168, 124, 0.8)';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(box.x, box.y, box.width, box.height);
  }

  updateEmotions(expressions) {
    // スムージング処理 + 感度適用
    RADAR_EMOTIONS.forEach(key => {
      const raw = Math.min(1, (expressions[key] || 0) * this.sensitivity);
      const prev = this.smoothedEmotions[key] || 0;
      this.smoothedEmotions[key] = prev + (raw - prev) * this.smoothingFactor;
    });

    // 数値表示更新
    RADAR_EMOTIONS.forEach(key => {
      const value = Math.round(this.smoothedEmotions[key] * 100);
      const bar = document.getElementById(`bar-${key}`);
      const valueEl = document.getElementById(`value-${key}`);
      if (bar) bar.style.width = `${value}%`;
      if (valueEl) valueEl.textContent = `${value}%`;
    });

    // レーダーチャート更新
    this.drawRadarChart(this.smoothedEmotions);

    // 複合感情更新
    this.updateCompoundEmotion(this.smoothedEmotions);
  }

  updateCompoundEmotion(emotions) {
    // 要素がなければスキップ（非表示設定時）
    if (!this.compoundEmotion) return;

    // 各複合感情の条件をチェック
    const detected = COMPOUND_EMOTIONS.filter(compound => {
      return Object.entries(compound.requires).every(([key, threshold]) => {
        return (emotions[key] || 0) >= threshold;
      });
    });

    // スコア順でソート（条件の合計値が高い順）
    detected.sort((a, b) => {
      const scoreA = Object.entries(a.requires).reduce((sum, [key]) => sum + (emotions[key] || 0), 0);
      const scoreB = Object.entries(b.requires).reduce((sum, [key]) => sum + (emotions[key] || 0), 0);
      return scoreB - scoreA;
    });

    // 上位3つまで表示
    const top = detected.slice(0, 3);

    if (top.length > 0) {
      this.compoundEmotion.innerHTML = `
        <div class="card-label">Complex Emotion</div>
        <div class="compound-result">
          ${top.map(c => `<span class="compound-tag"><span class="jp">${c.jp}</span><span class="en">${c.en}</span></span>`).join('')}
        </div>
      `;
    } else {
      this.compoundEmotion.innerHTML = `
        <div class="card-label">Complex Emotion</div>
        <div class="compound-none">—</div>
      `;
    }
  }

  drawRadarChart(emotions) {
    const ctx = this.radarCtx;
    const canvas = this.radar;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 30;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ラベル（アイコンのみ）
    const angleStep = (Math.PI * 2) / RADAR_EMOTIONS.length;
    RADAR_EMOTIONS.forEach((key, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const labelX = centerX + Math.cos(angle) * (radius + 14);
      const labelY = centerY + Math.sin(angle) * (radius + 14);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(EMOTIONS[key].icon, labelX, labelY);
    });

    // 感情値があるかチェック
    const hasEmotions = Object.keys(emotions).length > 0;
    const maxValue = hasEmotions ? Math.max(...RADAR_EMOTIONS.map(key => emotions[key] || 0)) : 0;
    const isNeutral = maxValue < 0.1;

    ctx.beginPath();

    if (isNeutral) {
      // ニュートラル時は滑らかな小さい円
      const neutralRadius = radius * 0.12;
      ctx.arc(centerX, centerY, neutralRadius, 0, Math.PI * 2);
    } else {
      // ぷにぷに生物アメーバ（根元太く、先端細く丸い触手）
      const values = RADAR_EMOTIONS.map((key) => Math.max(0.12, emotions[key] || 0));
      const n = values.length;
      const coreRadius = radius * 0.12;

      for (let i = 0; i < n; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const nextAngle = angleStep * ((i + 1) % n) - Math.PI / 2;
        const value = values[i];

        // 触手の長さ
        const len = radius * value;

        // 根元の太さ
        const baseWidth = radius * 0.15;
        // 先端の太さ（細いけど丸い）
        const tipWidth = Math.max(4, len * 0.08);

        const baseRightAngle = angle + Math.PI / 2;
        const tipLeftAngle = angle - Math.PI / 2;

        // 根元右
        const baseRight = {
          x: centerX + Math.cos(baseRightAngle) * baseWidth,
          y: centerY + Math.sin(baseRightAngle) * baseWidth
        };

        // 中間点（ふくらみ）
        const midDist = len * 0.5;
        const midWidth = baseWidth * 0.7 + tipWidth * 0.3;
        const midRight = {
          x: centerX + Math.cos(angle) * midDist + Math.cos(baseRightAngle) * midWidth,
          y: centerY + Math.sin(angle) * midDist + Math.sin(baseRightAngle) * midWidth
        };

        // 先端右
        const tipRight = {
          x: centerX + Math.cos(angle) * (len - tipWidth) + Math.cos(baseRightAngle) * tipWidth,
          y: centerY + Math.sin(angle) * (len - tipWidth) + Math.sin(baseRightAngle) * tipWidth
        };

        // 先端の頂点
        const tipTop = {
          x: centerX + Math.cos(angle) * len,
          y: centerY + Math.sin(angle) * len
        };

        // 先端左
        const tipLeft = {
          x: centerX + Math.cos(angle) * (len - tipWidth) + Math.cos(tipLeftAngle) * tipWidth,
          y: centerY + Math.sin(angle) * (len - tipWidth) + Math.sin(tipLeftAngle) * tipWidth
        };

        // 中間左
        const midLeft = {
          x: centerX + Math.cos(angle) * midDist + Math.cos(tipLeftAngle) * midWidth,
          y: centerY + Math.sin(angle) * midDist + Math.sin(tipLeftAngle) * midWidth
        };

        // 根元左
        const baseLeft = {
          x: centerX + Math.cos(tipLeftAngle) * baseWidth,
          y: centerY + Math.sin(tipLeftAngle) * baseWidth
        };

        // 次の触手の根元右
        const nextBaseRightAngle = nextAngle + Math.PI / 2;
        const nextBaseRight = {
          x: centerX + Math.cos(nextBaseRightAngle) * baseWidth,
          y: centerY + Math.sin(nextBaseRightAngle) * baseWidth
        };

        if (i === 0) {
          ctx.moveTo(baseRight.x, baseRight.y);
        }

        // 触手の右側を描く
        ctx.quadraticCurveTo(midRight.x, midRight.y, tipRight.x, tipRight.y);

        // 先端の丸いキャップ
        ctx.quadraticCurveTo(tipTop.x, tipTop.y, tipLeft.x, tipLeft.y);

        // 触手の左側を描く
        ctx.quadraticCurveTo(midLeft.x, midLeft.y, baseLeft.x, baseLeft.y);

        // 根元をネバっと繋ぐ（中心円に沿った滑らかな曲線）
        const midAngle = (angle + nextAngle + (nextAngle < angle ? Math.PI * 2 : 0)) / 2;
        const arcPoint = {
          x: centerX + Math.cos(midAngle) * coreRadius,
          y: centerY + Math.sin(midAngle) * coreRadius
        };
        ctx.quadraticCurveTo(arcPoint.x, arcPoint.y, nextBaseRight.x, nextBaseRight.y);
      }
    }

    ctx.closePath();
    ctx.fillStyle = 'rgba(201, 168, 124, 0.5)';
    ctx.fill();
  }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
  new EmotionScouter();
});
