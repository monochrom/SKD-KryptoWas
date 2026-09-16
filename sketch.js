let originalImg = null;
let processedImg = null;
let displayImg = null;
let mainCanvas;

let fileInput;
let modeSelect;
let thresholdSlider, pixelSizeSlider, contrastSlider, brightnessSlider;
let posterizeSlider, noiseSlider, blurSlider;
let thresholdValue, pixelSizeValue, contrastValue, brightnessValue;
let posterizeValue, noiseValue, blurValue;
let invertCheckbox;
let redrawButton;
let saveButton, saveSvgButton;
let videoControls, playButton, pauseButton, restartButton;
let seekSlider, timeDisplay, videoScaleSelect, exportFormatSelect, exportFpsSelect;
let loopCheckbox, audioCheckbox, exportVideoButton, cancelExportButton;
let exportProgress, statusMessage;

let mediaType = "none";
let mediaObjectUrl = null;
let videoEl = null;
let videoFrameBuffer = null;
let videoFrameRequest = null;
let fallbackFrameRequest = null;
let videoNeedsProcessing = false;
let isSeeking = false;
let cachedSettings = null;
let frameIndex = 0;

let isExporting = false;
let exportRecorder = null;
let exportChunks = [];
let exportStream = null;
let exportStopTimer = null;
let pendingExportResolve = null;
let lockedExportSettings = null;
let exportWasCancelled = false;
let activeExportFormat = null;

function setup() {
  mainCanvas = createCanvas(900, 700);
  pixelDensity(1);
  mainCanvas.parent("canvas-container");

  fileInput = document.getElementById("fileInput");
  modeSelect = document.getElementById("modeSelect");
  thresholdSlider = document.getElementById("thresholdSlider");
  pixelSizeSlider = document.getElementById("pixelSizeSlider");
  contrastSlider = document.getElementById("contrastSlider");
  brightnessSlider = document.getElementById("brightnessSlider");
  posterizeSlider = document.getElementById("posterizeSlider");
  noiseSlider = document.getElementById("noiseSlider");
  blurSlider = document.getElementById("blurSlider");
  thresholdValue = document.getElementById("thresholdValue");
  pixelSizeValue = document.getElementById("pixelSizeValue");
  contrastValue = document.getElementById("contrastValue");
  brightnessValue = document.getElementById("brightnessValue");
  posterizeValue = document.getElementById("posterizeValue");
  noiseValue = document.getElementById("noiseValue");
  blurValue = document.getElementById("blurValue");
  invertCheckbox = document.getElementById("invertCheckbox");
  redrawButton = document.getElementById("redrawButton");
  saveButton = document.getElementById("saveButton");
  saveSvgButton = document.getElementById("saveSvgButton");
  videoControls = document.getElementById("videoControls");
  playButton = document.getElementById("playButton");
  pauseButton = document.getElementById("pauseButton");
  restartButton = document.getElementById("restartButton");
  seekSlider = document.getElementById("seekSlider");
  timeDisplay = document.getElementById("timeDisplay");
  videoScaleSelect = document.getElementById("videoScaleSelect");
  exportFormatSelect = document.getElementById("exportFormatSelect");
  exportFpsSelect = document.getElementById("exportFpsSelect");
  loopCheckbox = document.getElementById("loopCheckbox");
  audioCheckbox = document.getElementById("audioCheckbox");
  exportVideoButton = document.getElementById("exportVideoButton");
  cancelExportButton = document.getElementById("cancelExportButton");
  exportProgress = document.getElementById("exportProgress");
  statusMessage = document.getElementById("statusMessage");

  fileInput.addEventListener("change", handleFile);
  modeSelect.addEventListener("change", handleFilterChange);
  bindSliderValue(thresholdSlider, thresholdValue);
  bindSliderValue(pixelSizeSlider, pixelSizeValue);
  bindSliderValue(contrastSlider, contrastValue);
  bindSliderValue(brightnessSlider, brightnessValue);
  bindSliderValue(posterizeSlider, posterizeValue);
  bindSliderValue(noiseSlider, noiseValue);
  bindSliderValue(blurSlider, blurValue);
  invertCheckbox.addEventListener("change", handleFilterChange);
  redrawButton.addEventListener("click", handleFilterChange);
  saveButton.addEventListener("click", saveProcessedImage);
  saveSvgButton.addEventListener("click", saveSvgImage);
  playButton.addEventListener("click", playVideo);
  pauseButton.addEventListener("click", pauseVideo);
  restartButton.addEventListener("click", restartVideo);
  seekSlider.addEventListener("input", handleSeekInput);
  seekSlider.addEventListener("change", handleSeekCommit);
  videoScaleSelect.addEventListener("change", handleVideoScaleChange);
  exportFormatSelect.addEventListener("change", updateUiState);
  loopCheckbox.addEventListener("change", () => {
    if (videoEl) videoEl.loop = loopCheckbox.checked;
  });
  exportVideoButton.addEventListener("click", startVideoExport);
  cancelExportButton.addEventListener("click", cancelVideoExport);
  window.addEventListener("beforeunload", cleanupMedia);

  textAlign(CENTER, CENTER);
  updateUiState();
}

function bindSliderValue(slider, valueInput) {
  valueInput.value = slider.value;

  slider.addEventListener("input", () => {
    valueInput.value = slider.value;
    handleFilterChange();
  });

  valueInput.addEventListener("input", () => {
    slider.value = clampInputValue(valueInput);
    valueInput.value = slider.value;
    handleFilterChange();
  });
}

function clampInputValue(input) {
  const minValue = Number(input.min);
  const maxValue = Number(input.max);
  const stepValue = Number(input.step) || 1;
  let value = Number(input.value);

  if (Number.isNaN(value)) {
    value = minValue;
  }

  value = constrain(value, minValue, maxValue);
  value = Math.round(value / stepValue) * stepValue;
  return String(constrain(value, minValue, maxValue));
}

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  cleanupMedia();
  setStatus("");

  if (file.type.startsWith("image/")) {
    mediaType = "image";
    mediaObjectUrl = URL.createObjectURL(file);
    loadImage(mediaObjectUrl, img => {
      originalImg = img;
      processImage();
      setStatus("Bild geladen.");
      updateUiState();
    }, () => {
      showError("Die Bilddatei konnte nicht gelesen werden.");
    });
    return;
  }

  if (file.type.startsWith("video/")) {
    loadVideoFile(file);
    return;
  }

  showError("Dieser Dateityp wird nicht unterstützt.");
}

function draw() {
  if (!displayImg) {
    background(245);
    fill(40);
    noStroke();
    textSize(18);
    text("Lade ein Bild oder Video hoch, um zu starten.", width / 2, height / 2);
    return;
  }

  imageMode(CORNER);
  image(displayImg, 0, 0, width, height);
}

function handleFilterChange() {
  refreshSettings();

  if (mediaType === "image") {
    processImage();
  } else if (mediaType === "video") {
    videoNeedsProcessing = true;
    processVideoFrame();
  }
}

function processImage() {
  if (!originalImg) return;

  processedImg = processSourceFrame(originalImg, getActiveSettings());
  displayImg = processedImg;
  resizeCanvasToFrame(displayImg.width, displayImg.height);
}

function processSourceFrame(source, settings) {
  let img = source.get();

  img = toGrayscale(img);
  img = applyBrightnessContrast(img, settings.brightness, settings.contrast);

  if (settings.blur > 0) {
    img = simpleBlur(img, settings.blur);
  }

  if (settings.posterize > 1) {
    img = posterizeGray(img, settings.posterize);
  }

  if (settings.mode === "Threshold") {
    return thresholdDither(img, settings.pixelSize, settings.threshold, settings.noise, settings.invert, settings);
  }

  if (settings.mode === "Random") {
    return randomDither(img, settings.pixelSize, settings.noise, settings.invert, settings);
  }

  if (settings.mode === "Bayer 4x4") {
    return bayerDither(img, settings.pixelSize, settings.invert);
  }

  if (settings.mode === "Floyd-Steinberg") {
    return floydSteinbergDither(img, settings.pixelSize, settings.invert);
  }

  if (settings.mode === "Atkinson") {
    return atkinsonDither(img, settings.pixelSize, settings.invert);
  }

  if (settings.mode === "ASCII") {
    return asciiDither(img, settings.pixelSize, settings.threshold, settings.invert);
  }

  return img;
}

function loadVideoFile(file) {
  mediaType = "video";
  mediaObjectUrl = URL.createObjectURL(file);
  videoEl = document.createElement("video");
  videoEl.preload = "metadata";
  videoEl.playsInline = true;
  videoEl.crossOrigin = "anonymous";
  videoEl.muted = false;
  videoEl.src = mediaObjectUrl;

  videoEl.addEventListener("loadedmetadata", () => {
    if (!videoEl.videoWidth || !videoEl.videoHeight) {
      showError("Das Videoformat wird nicht unterstützt oder enthält keine Bildspur.");
      return;
    }

    videoEl.loop = loopCheckbox.checked;
    prepareVideoBuffer();
    updateTimeDisplay();
    displayImg = videoFrameBuffer;
    videoNeedsProcessing = true;
    processVideoFrame();
    scheduleVideoFrame();
    setStatus("Video geladen.");
    updateUiState();
  });

  videoEl.addEventListener("play", scheduleVideoFrame);
  videoEl.addEventListener("pause", () => {
    if (!isExporting) cancelVideoFrameSchedule();
  });
  videoEl.addEventListener("ended", handleVideoEnded);
  videoEl.addEventListener("timeupdate", updateTimeDisplay);
  videoEl.addEventListener("seeked", () => {
    videoNeedsProcessing = true;
    processVideoFrame();
    updateTimeDisplay();
  });
  videoEl.addEventListener("error", () => {
    showError("Videoformat wird nicht unterstützt oder die Datei konnte nicht gelesen werden.");
  });

  videoEl.load();
}

function prepareVideoBuffer() {
  if (!videoEl) return;

  const scale = Number(videoScaleSelect.value);
  const bufferW = max(1, floor(videoEl.videoWidth * scale));
  const bufferH = max(1, floor(videoEl.videoHeight * scale));

  if (videoFrameBuffer && videoFrameBuffer.width === bufferW && videoFrameBuffer.height === bufferH) {
    return;
  }

  if (videoFrameBuffer) {
    videoFrameBuffer.remove();
  }

  videoFrameBuffer = createGraphics(bufferW, bufferH);
  videoFrameBuffer.pixelDensity(1);
  resizeCanvasToFrame(videoEl.videoWidth, videoEl.videoHeight);
}

function resizeCanvasToFrame(frameW, frameH) {
  const nextW = max(1, floor(frameW));
  const nextH = max(1, floor(frameH));

  if (width !== nextW || height !== nextH) {
    resizeCanvas(nextW, nextH);
    pixelDensity(1);
  }
}

function handleVideoScaleChange() {
  if (mediaType !== "video" || isExporting) return;
  prepareVideoBuffer();
  videoNeedsProcessing = true;
  processVideoFrame();
}

function playVideo() {
  if (!videoEl || isExporting) return;
  videoEl.play().catch(() => {
    showError("Das Video konnte nicht abgespielt werden.");
  });
}

function pauseVideo() {
  if (!videoEl || isExporting) return;
  videoEl.pause();
}

function restartVideo() {
  if (!videoEl || isExporting) return;
  videoEl.currentTime = 0;
  videoNeedsProcessing = true;
  processVideoFrame();
  videoEl.play().catch(() => {});
}

function handleSeekInput() {
  if (!videoEl || !Number.isFinite(videoEl.duration) || isExporting) return;
  isSeeking = true;
  const targetTime = (Number(seekSlider.value) / 1000) * videoEl.duration;
  timeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(videoEl.duration)}`;
}

function handleSeekCommit() {
  if (!videoEl || !Number.isFinite(videoEl.duration) || isExporting) return;
  videoEl.currentTime = (Number(seekSlider.value) / 1000) * videoEl.duration;
  isSeeking = false;
}

function scheduleVideoFrame() {
  if (!videoEl || videoEl.paused && !isExporting) return;

  cancelVideoFrameSchedule();

  if (typeof videoEl.requestVideoFrameCallback === "function") {
    videoFrameRequest = videoEl.requestVideoFrameCallback(handleScheduledVideoFrame);
  } else {
    fallbackFrameRequest = requestAnimationFrame(handleFallbackVideoFrame);
  }
}

function handleScheduledVideoFrame(now, metadata) {
  videoFrameRequest = null;
  frameIndex = metadata.presentedFrames || frameIndex + 1;
  processVideoFrame();
  updateExportProgress();
  scheduleVideoFrame();
}

function handleFallbackVideoFrame() {
  fallbackFrameRequest = null;
  frameIndex++;
  processVideoFrame();
  updateExportProgress();
  scheduleVideoFrame();
}

function cancelVideoFrameSchedule() {
  if (videoEl && videoFrameRequest !== null && typeof videoEl.cancelVideoFrameCallback === "function") {
    videoEl.cancelVideoFrameCallback(videoFrameRequest);
  }

  if (fallbackFrameRequest !== null) {
    cancelAnimationFrame(fallbackFrameRequest);
  }

  videoFrameRequest = null;
  fallbackFrameRequest = null;
}

function processVideoFrame() {
  if (!videoEl || !videoFrameBuffer || videoEl.readyState < 2) return;
  if (videoEl.paused && !videoNeedsProcessing && !isExporting) return;

  videoFrameBuffer.clear();
  videoFrameBuffer.drawingContext.drawImage(videoEl, 0, 0, videoFrameBuffer.width, videoFrameBuffer.height);

  const settings = isExporting && lockedExportSettings ? lockedExportSettings : getActiveSettings();
  settings.isVideo = true;
  settings.frameIndex = frameIndex;
  processedImg = processSourceFrame(videoFrameBuffer, settings);
  displayImg = processedImg;
  videoNeedsProcessing = false;
}

function handleVideoEnded() {
  processVideoFrame();

  if (isExporting) {
    finishVideoExport();
  } else {
    cancelVideoFrameSchedule();
  }
}

function updateTimeDisplay() {
  if (!videoEl) {
    timeDisplay.textContent = "00:00 / 00:00";
    seekSlider.value = 0;
    return;
  }

  const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
  const current = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

  if (!isSeeking && duration > 0) {
    seekSlider.value = String(constrain((current / duration) * 1000, 0, 1000));
  }
}

function formatTime(seconds) {
  const safeSeconds = max(0, floor(seconds || 0));
  const minutes = floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function refreshSettings() {
  cachedSettings = {
    mode: modeSelect.value,
    threshold: Number(thresholdSlider.value),
    pixelSize: Number(pixelSizeSlider.value),
    contrast: Number(contrastSlider.value),
    brightness: Number(brightnessSlider.value),
    posterize: Number(posterizeSlider.value),
    noise: Number(noiseSlider.value),
    blur: Number(blurSlider.value),
    invert: invertCheckbox.checked,
    isVideo: mediaType === "video",
    frameIndex
  };
}

function getActiveSettings() {
  if (!cachedSettings) refreshSettings();
  return { ...cachedSettings };
}

function getMediaRecorderFormat(preferredFormat = "auto") {
  if (typeof MediaRecorder === "undefined") return null;

  const formats = {
    mp4: [
      "video/mp4;codecs=h264,aac",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1",
      "video/mp4"
    ],
    webm: [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ]
  };

  const order = preferredFormat === "mp4"
    ? ["mp4"]
    : preferredFormat === "webm"
      ? ["webm"]
      : ["mp4", "webm"];

  for (const format of order) {
    const mimeType = formats[format].find(type => MediaRecorder.isTypeSupported(type));
    if (mimeType) {
      return {
        extension: format,
        label: format.toUpperCase(),
        mimeType
      };
    }
  }

  return null;
}

async function startVideoExport() {
  if (!videoEl || isExporting) return;

  const exportFormat = getMediaRecorderFormat(exportFormatSelect.value);
  if (!mainCanvas.elt.captureStream || typeof MediaRecorder === "undefined" || !exportFormat) {
    showError("Das gewählte Exportformat wird in diesem Browser nicht unterstützt.");
    updateUiState();
    return;
  }

  isExporting = true;
  activeExportFormat = exportFormat;
  exportWasCancelled = false;
  lockedExportSettings = getActiveSettings();
  lockedExportSettings.isVideo = true;
  exportChunks = [];
  exportProgress.value = 0;
  setStatus("Export wird vorbereitet...");
  updateUiState();

  try {
    const fps = Number(exportFpsSelect.value);
    const canvasStream = mainCanvas.elt.captureStream(fps);
    const tracks = [...canvasStream.getVideoTracks()];
    const audioTrack = getVideoAudioTrack();

    if (audioTrack) {
      tracks.push(audioTrack);
    } else if (audioCheckbox.checked) {
      setStatus("Export läuft ohne Audiotrack, weil kein kompatibler Audiotrack verfügbar ist.");
    }

    exportStream = new MediaStream(tracks);
    exportRecorder = new MediaRecorder(exportStream, { mimeType: exportFormat.mimeType });
    exportRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        exportChunks.push(event.data);
      }
    };
    exportRecorder.onerror = () => showError("Export konnte nicht gestartet oder abgeschlossen werden.");
    exportRecorder.onstop = finalizeVideoExport;

    await seekVideoToStart();
    videoEl.loop = false;
    videoEl.muted = !audioTrack;
    processVideoFrame();
    exportRecorder.start(250);
    await videoEl.play();
    scheduleVideoFrame();
    setStatus(audioTrack ? `${exportFormat.label}-Export läuft mit Audiotrack...` : `${exportFormat.label}-Export läuft ohne Audio...`);

    exportStopTimer = window.setTimeout(finishVideoExport, max(1000, (videoEl.duration + 2) * 1000));
  } catch (error) {
    showError("Export konnte nicht gestartet werden.");
    resetExportState();
  }
}

function getVideoAudioTrack() {
  if (!audioCheckbox.checked || !videoEl) return null;

  try {
    const capture = videoEl.captureStream || videoEl.mozCaptureStream;
    if (!capture) return null;
    const videoStream = capture.call(videoEl);
    const audioTracks = videoStream.getAudioTracks();
    return audioTracks.length > 0 ? audioTracks[0] : null;
  } catch (error) {
    return null;
  }
}

function seekVideoToStart() {
  return new Promise(resolve => {
    pendingExportResolve = resolve;

    const done = () => {
      videoEl.removeEventListener("seeked", done);
      pendingExportResolve = null;
      resolve();
    };

    videoEl.pause();
    videoEl.addEventListener("seeked", done, { once: true });
    videoEl.currentTime = 0;

    if (videoEl.currentTime === 0) {
      window.setTimeout(done, 50);
    }
  });
}

function updateExportProgress() {
  updateTimeDisplay();

  if (!isExporting || !videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
  exportProgress.value = constrain((videoEl.currentTime / videoEl.duration) * 100, 0, 100);
}

function finishVideoExport() {
  if (!isExporting || !exportRecorder) return;

  if (exportStopTimer) {
    clearTimeout(exportStopTimer);
    exportStopTimer = null;
  }

  exportProgress.value = 100;
  setStatus("Export wird abgeschlossen...");

  if (exportRecorder.state !== "inactive") {
    exportRecorder.stop();
  }
}

function cancelVideoExport() {
  if (!isExporting) return;
  exportWasCancelled = true;
  setStatus("Export abgebrochen.");

  if (exportRecorder && exportRecorder.state !== "inactive") {
    exportRecorder.stop();
    return;
  }

  exportChunks = [];
  resetExportState();
}

function finalizeVideoExport() {
  if (exportWasCancelled) {
    resetExportState();
    setStatus("Export abgebrochen.");
    return;
  }

  const chunks = exportChunks.slice();
  const exportFormat = activeExportFormat || { extension: "webm", mimeType: "video/webm" };
  resetExportState();

  if (!chunks.length) {
    showError("Der Export hat keine Videodaten erzeugt.");
    return;
  }

  const blob = new Blob(chunks, { type: exportFormat.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dither-video.${exportFormat.extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Export abgeschlossen.");
}

function resetExportState() {
  if (exportStopTimer) {
    clearTimeout(exportStopTimer);
    exportStopTimer = null;
  }

  if (exportStream) {
    exportStream.getTracks().forEach(track => track.stop());
  }

  if (videoEl) {
    videoEl.muted = false;
    videoEl.loop = loopCheckbox.checked;
  }

  exportRecorder = null;
  exportStream = null;
  exportChunks = [];
  isExporting = false;
  exportWasCancelled = false;
  activeExportFormat = null;
  lockedExportSettings = null;
  updateUiState();
}

function updateUiState() {
  const hasImage = mediaType === "image" && !!displayImg;
  const hasVideo = mediaType === "video" && !!videoEl;
  const recorderFormat = getMediaRecorderFormat(exportFormatSelect.value);

  videoControls.classList.toggle("hidden", !hasVideo);
  saveButton.disabled = !hasImage || isExporting;
  saveSvgButton.disabled = !hasImage || isExporting;
  redrawButton.disabled = mediaType === "none" || isExporting;
  exportVideoButton.disabled = !hasVideo || isExporting || !recorderFormat;
  cancelExportButton.disabled = !isExporting;
  seekSlider.disabled = !hasVideo || isExporting;
  playButton.disabled = !hasVideo || isExporting;
  pauseButton.disabled = !hasVideo || isExporting;
  restartButton.disabled = !hasVideo || isExporting;
  videoScaleSelect.disabled = !hasVideo || isExporting;
  exportFormatSelect.disabled = !hasVideo || isExporting;
  exportFpsSelect.disabled = !hasVideo || isExporting;

  const filterControls = [
    modeSelect, thresholdSlider, thresholdValue, pixelSizeSlider, pixelSizeValue,
    contrastSlider, contrastValue, brightnessSlider, brightnessValue,
    posterizeSlider, posterizeValue, noiseSlider, noiseValue, blurSlider, blurValue,
    invertCheckbox
  ];

  filterControls.forEach(control => {
    control.disabled = isExporting;
  });

  if (hasVideo && recorderFormat) {
    exportVideoButton.textContent = `Export ${recorderFormat.label}`;
  } else {
    exportVideoButton.textContent = "Export video";
  }

  if (hasVideo && !recorderFormat && !statusMessage.classList.contains("error")) {
    setStatus("Das gewählte Exportformat wird in diesem Browser nicht unterstützt.");
  }
}

function setStatus(message) {
  statusMessage.textContent = message || "Lade ein Bild oder Video hoch, um zu starten.";
  statusMessage.classList.remove("error");
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("error");
  updateUiState();
}

function cleanupMedia() {
  cancelVideoFrameSchedule();

  if (isExporting) {
    cancelVideoExport();
  }

  if (videoFrameBuffer) {
    videoFrameBuffer.remove();
    videoFrameBuffer = null;
  }

  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
    videoEl = null;
  }

  if (mediaObjectUrl) {
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  }

  originalImg = null;
  processedImg = null;
  displayImg = null;
  mediaType = "none";
  cachedSettings = null;
  frameIndex = 0;
  videoNeedsProcessing = false;
  resizeCanvasToFrame(900, 700);
  updateUiState();
}

function saveProcessedImage() {
  if (!displayImg) return;

  const out = createGraphics(displayImg.width, displayImg.height);
  out.pixelDensity(1);
  out.image(displayImg, 0, 0, displayImg.width, displayImg.height);
  saveCanvas(out, "dither-output", "png");
  out.remove();
}

function saveSvgImage() {
  if (!displayImg) return;

  const svg = imageToSvg(displayImg);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dither-output.svg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function imageToSvg(img) {
  img.loadPixels();

  const rects = collectBlackRects(img);
  const paths = rectsToPathElements(rects);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}" shape-rendering="crispEdges">`,
    `<rect width="${img.width}" height="${img.height}" fill="#fff"/>`,
    ...paths,
    "</svg>"
  ].join("\n");
}

function collectBlackRects(img) {
  const rects = [];
  let active = new Map();

  for (let y = 0; y < img.height; y++) {
    const rowRuns = getBlackRunsForRow(img, y);
    const nextActive = new Map();

    for (const run of rowRuns) {
      const key = `${run.x},${run.w}`;
      const existing = active.get(key);

      if (existing) {
        existing.h++;
        nextActive.set(key, existing);
      } else {
        nextActive.set(key, { x: run.x, y, w: run.w, h: 1 });
      }
    }

    for (const [key, rect] of active) {
      if (!nextActive.has(key)) {
        rects.push(rect);
      }
    }

    active = nextActive;
  }

  for (const rect of active.values()) {
    rects.push(rect);
  }

  return rects;
}

function getBlackRunsForRow(img, y) {
  const runs = [];
  let runStart = null;

  for (let x = 0; x < img.width; x++) {
    const black = isBlackPixel(img, x, y);

    if (black && runStart === null) {
      runStart = x;
    } else if (!black && runStart !== null) {
      runs.push({ x: runStart, w: x - runStart });
      runStart = null;
    }
  }

  if (runStart !== null) {
    runs.push({ x: runStart, w: img.width - runStart });
  }

  return runs;
}

function isBlackPixel(img, x, y) {
  const idx = 4 * (y * img.width + x);
  const alpha = img.pixels[idx + 3];
  if (alpha < 128) return false;

  const r = img.pixels[idx];
  const g = img.pixels[idx + 1];
  const b = img.pixels[idx + 2];
  return (r + g + b) / 3 < 128;
}

function rectsToPathElements(rects) {
  const paths = [];
  let d = "";
  const maxPathLength = 100000;

  for (const rect of rects) {
    const command = `M${rect.x} ${rect.y}h${rect.w}v${rect.h}h-${rect.w}Z`;

    if (d.length + command.length > maxPathLength && d.length > 0) {
      paths.push(`<path fill="#000" d="${d}"/>`);
      d = "";
    }

    d += command;
  }

  if (d.length > 0) {
    paths.push(`<path fill="#000" d="${d}"/>`);
  }

  return paths;
}

function asciiDither(img, pixelSize, threshold, invert) {
  let out = createGraphics(img.width, img.height);
  out.pixelDensity(1);
  out.background(255);
  out.fill(0);
  out.textAlign(CENTER, CENTER);
  out.textFont("monospace");
  out.textSize(max(6, pixelSize * 0.9));

  const charset = " .:-=+*#%@";

  img.loadPixels();
  for (let y = 0; y < img.height; y += pixelSize) {
    for (let x = 0; x < img.width; x += pixelSize) {
      let avg = blockAverage(img, x, y, pixelSize);
      let normalized = constrain((avg - threshold) / 255, 0, 1);
      if (invert) normalized = 1 - normalized;

      let density = 1 - normalized;
      let charIndex = floor(density * (charset.length - 1));
      charIndex = constrain(charIndex, 0, charset.length - 1);
      out.text(charset[charIndex], x + pixelSize / 2, y + pixelSize / 2);
    }
  }

  return out;
}

function toGrayscale(img) {
  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  for (let i = 0; i < img.pixels.length; i += 4) {
    let r = img.pixels[i];
    let g = img.pixels[i + 1];
    let b = img.pixels[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    out.pixels[i] = gray;
    out.pixels[i + 1] = gray;
    out.pixels[i + 2] = gray;
    out.pixels[i + 3] = 255;
  }

  out.updatePixels();
  return out;
}

function applyBrightnessContrast(img, brightnessVal, contrastVal) {
  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  let factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));

  for (let i = 0; i < img.pixels.length; i += 4) {
    let v = img.pixels[i];
    v += brightnessVal;
    v = factor * (v - 128) + 128;
    v = constrain(v, 0, 255);

    out.pixels[i] = v;
    out.pixels[i + 1] = v;
    out.pixels[i + 2] = v;
    out.pixels[i + 3] = 255;
  }

  out.updatePixels();
  return out;
}

function posterizeGray(img, levels) {
  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  for (let i = 0; i < img.pixels.length; i += 4) {
    let v = img.pixels[i];
    let step = 255 / (levels - 1);
    let q = round(v / step) * step;
    q = constrain(q, 0, 255);

    out.pixels[i] = q;
    out.pixels[i + 1] = q;
    out.pixels[i + 2] = q;
    out.pixels[i + 3] = 255;
  }

  out.updatePixels();
  return out;
}

function simpleBlur(img, passes) {
  let current = img.get();

  for (let p = 0; p < passes; p++) {
    let out = createImage(current.width, current.height);
    current.loadPixels();
    out.loadPixels();

    for (let y = 0; y < current.height; y++) {
      for (let x = 0; x < current.width; x++) {
        let sum = 0;
        let count = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            let nx = x + kx;
            let ny = y + ky;

            if (nx >= 0 && nx < current.width && ny >= 0 && ny < current.height) {
              let idx = 4 * (ny * current.width + nx);
              sum += current.pixels[idx];
              count++;
            }
          }
        }

        let v = sum / count;
        let idx = 4 * (y * current.width + x);
        out.pixels[idx] = v;
        out.pixels[idx + 1] = v;
        out.pixels[idx + 2] = v;
        out.pixels[idx + 3] = 255;
      }
    }

    out.updatePixels();
    current = out;
  }

  return current;
}

function thresholdDither(img, pixelSize, threshold, noiseAmount, invert, settings = {}) {
  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  for (let y = 0; y < img.height; y += pixelSize) {
    for (let x = 0; x < img.width; x += pixelSize) {
      let avg = blockAverage(img, x, y, pixelSize);
      avg += getNoiseOffset(x, y, noiseAmount, settings);
      let v = avg > threshold ? 255 : 0;
      if (invert) v = 255 - v;

      fillBlock(out, x, y, pixelSize, v);
    }
  }

  out.updatePixels();
  return out;
}

function randomDither(img, pixelSize, noiseAmount, invert, settings = {}) {
  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  for (let y = 0; y < img.height; y += pixelSize) {
    for (let x = 0; x < img.width; x += pixelSize) {
      let avg = blockAverage(img, x, y, pixelSize);
      let threshold = settings.isVideo ? stableNoise01(x, y, 17) * 255 : random(255);
      avg += getNoiseOffset(x, y, noiseAmount, settings);

      let v = avg > threshold ? 255 : 0;
      if (invert) v = 255 - v;

      fillBlock(out, x, y, pixelSize, v);
    }
  }

  out.updatePixels();
  return out;
}

function bayerDither(img, pixelSize, invert) {
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  let out = createImage(img.width, img.height);
  img.loadPixels();
  out.loadPixels();

  for (let y = 0; y < img.height; y += pixelSize) {
    for (let x = 0; x < img.width; x += pixelSize) {
      let avg = blockAverage(img, x, y, pixelSize);
      let mx = floor((x / pixelSize) % 4);
      let my = floor((y / pixelSize) % 4);
      let threshold = map(matrix[my][mx], 0, 15, 0, 255);

      let v = avg > threshold ? 255 : 0;
      if (invert) v = 255 - v;

      fillBlock(out, x, y, pixelSize, v);
    }
  }

  out.updatePixels();
  return out;
}

function floydSteinbergDither(img, pixelSize, invert) {
  let values = blockValueGrid(img, pixelSize);

  for (let y = 0; y < values.length; y++) {
    for (let x = 0; x < values[y].length; x++) {
      let oldVal = values[y][x];
      let newVal = oldVal > 127 ? 255 : 0;
      let error = oldVal - newVal;
      values[y][x] = newVal;

      distributeError(values, x + 1, y, error * 7 / 16);
      distributeError(values, x - 1, y + 1, error * 3 / 16);
      distributeError(values, x, y + 1, error * 5 / 16);
      distributeError(values, x + 1, y + 1, error * 1 / 16);
    }
  }

  return renderBlockGrid(img, values, pixelSize, invert);
}

function atkinsonDither(img, pixelSize, invert) {
  let values = blockValueGrid(img, pixelSize);

  for (let y = 0; y < values.length; y++) {
    for (let x = 0; x < values[y].length; x++) {
      let oldVal = values[y][x];
      let newVal = oldVal > 127 ? 255 : 0;
      let error = (oldVal - newVal) / 8;
      values[y][x] = newVal;

      distributeError(values, x + 1, y, error);
      distributeError(values, x + 2, y, error);
      distributeError(values, x - 1, y + 1, error);
      distributeError(values, x, y + 1, error);
      distributeError(values, x + 1, y + 1, error);
      distributeError(values, x, y + 2, error);
    }
  }

  return renderBlockGrid(img, values, pixelSize, invert);
}

function distributeError(arr, x, y, value) {
  if (y >= 0 && y < arr.length && x >= 0 && x < arr[0].length) {
    arr[y][x] += value;
  }
}

function blockValueGrid(img, pixelSize) {
  const values = [];
  img.loadPixels();

  for (let y = 0; y < img.height; y += pixelSize) {
    const row = [];

    for (let x = 0; x < img.width; x += pixelSize) {
      row.push(blockAverage(img, x, y, pixelSize));
    }

    values.push(row);
  }

  return values;
}

function renderBlockGrid(sourceImg, values, pixelSize, invert) {
  let out = createImage(sourceImg.width, sourceImg.height);
  out.loadPixels();

  for (let gridY = 0; gridY < values.length; gridY++) {
    for (let gridX = 0; gridX < values[gridY].length; gridX++) {
      let v = constrain(values[gridY][gridX], 0, 255);
      v = v > 127 ? 255 : 0;
      if (invert) v = 255 - v;

      fillBlock(out, gridX * pixelSize, gridY * pixelSize, pixelSize, v);
    }
  }

  out.updatePixels();
  return out;
}

function blockAverage(img, startX, startY, size) {
  let sum = 0;
  let count = 0;

  for (let y = startY; y < startY + size && y < img.height; y++) {
    for (let x = startX; x < startX + size && x < img.width; x++) {
      let idx = 4 * (y * img.width + x);
      sum += img.pixels[idx];
      count++;
    }
  }

  return sum / count;
}

function fillBlock(img, startX, startY, size, value) {
  for (let y = startY; y < startY + size && y < img.height; y++) {
    for (let x = startX; x < startX + size && x < img.width; x++) {
      let idx = 4 * (y * img.width + x);
      img.pixels[idx] = value;
      img.pixels[idx + 1] = value;
      img.pixels[idx + 2] = value;
      img.pixels[idx + 3] = 255;
    }
  }
}

function getNoiseOffset(x, y, noiseAmount, settings) {
  if (!noiseAmount) return 0;

  if (settings && settings.isVideo) {
    return map(stableNoise01(x, y, 31), 0, 1, -noiseAmount, noiseAmount);
  }

  return random(-noiseAmount, noiseAmount);
}

function stableNoise01(x, y, salt) {
  let n = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 2246822519, 3266489917) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
