(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const els = {
    photoInput: $("#photoInput"),
    choosePhotoBtn: $("#choosePhotoBtn"),
    resetBtn: $("#resetBtn"),
    installBtn: $("#installBtn"),
    canvas: $("#photoCanvas"),
    emptyState: $("#emptyState"),
    status: $("#status"),
    modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
    referenceLength: $("#referenceLength"),
    referenceUnit: $("#referenceUnit"),
    depthInput: $("#depthInput"),
    depthUnit: $("#depthUnit"),
    autoBtn: $("#autoBtn"),
    analyzeBtn: $("#analyzeBtn"),
    undoBtn: $("#undoBtn"),
    clearWoundBtn: $("#clearWoundBtn"),
    lengthValue: $("#lengthValue"),
    widthValue: $("#widthValue"),
    depthValue: $("#depthValue"),
    areaValue: $("#areaValue"),
    healthyValue: $("#healthyValue"),
    unhealthyValue: $("#unhealthyValue"),
    classifiedValue: $("#classifiedValue"),
    granulationValue: $("#granulationValue"),
    epithelialValue: $("#epithelialValue"),
    sloughValue: $("#sloughValue"),
    necroticValue: $("#necroticValue"),
    otherValue: $("#otherValue"),
    granulationBar: $("#granulationBar"),
    epithelialBar: $("#epithelialBar"),
    sloughBar: $("#sloughBar"),
    necroticBar: $("#necroticBar"),
    otherBar: $("#otherBar"),
    copyReportBtn: $("#copyReportBtn"),
    downloadReportBtn: $("#downloadReportBtn"),
    reportOutput: $("#reportOutput")
  };

  const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

  const state = {
    image: null,
    imageUrl: "",
    mode: "wound",
    scalePoints: [],
    woundPoints: [],
    canvasSize: { width: 0, height: 0, dpr: 1 },
    imageRect: null,
    analysis: null,
    deferredInstallPrompt: null
  };

  const categoryLabels = {
    granulation: "granulation",
    epithelial: "epithelial",
    slough: "slough",
    necrotic: "necrotic",
    other: "unclassified"
  };

  function setStatus(message) {
    els.status.textContent = message;
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    setStatus(mode === "scale" ? "Tap both ends of the scale reference." : "Tap points around the wound edge.");
    draw();
  }

  function resetAll() {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }
    state.image = null;
    state.imageUrl = "";
    state.scalePoints = [];
    state.woundPoints = [];
    state.analysis = null;
    els.photoInput.value = "";
    updateResults();
    resizeCanvas();
    setStatus("Ready for a photo.");
  }

  function handlePhotoFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Choose an image file from the camera or photo library.");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      if (state.imageUrl) {
        URL.revokeObjectURL(state.imageUrl);
      }
      state.image = img;
      state.imageUrl = nextUrl;
      state.scalePoints = [];
      state.woundPoints = [];
      state.analysis = null;
      updateResults();
      resizeCanvas();
      setMode("scale");
      setStatus("Photo loaded. Mark the scale reference first.");
    };
    img.onerror = function () {
      URL.revokeObjectURL(nextUrl);
      setStatus("That photo could not be loaded.");
    };
    img.src = nextUrl;
  }

  function resizeCanvas() {
    const panel = els.canvas.parentElement;
    const rect = panel.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width || panel.clientWidth || 360));
    const dpr = window.devicePixelRatio || 1;

    let height = width * 0.72;
    if (state.image) {
      const naturalRatio = state.image.naturalHeight / state.image.naturalWidth;
      height = width * naturalRatio;
    }

    const maxHeight = Math.max(360, Math.min(window.innerHeight * 0.62, 760));
    height = Math.max(340, Math.min(height, maxHeight));

    els.canvas.style.height = `${Math.round(height)}px`;
    els.canvas.width = Math.round(width * dpr);
    els.canvas.height = Math.round(height * dpr);
    state.canvasSize = { width, height, dpr };
    draw();
  }

  function containRect(boxWidth, boxHeight, imageWidth, imageHeight) {
    const boxRatio = boxWidth / boxHeight;
    const imageRatio = imageWidth / imageHeight;
    let width;
    let height;

    if (imageRatio > boxRatio) {
      width = boxWidth;
      height = boxWidth / imageRatio;
    } else {
      height = boxHeight;
      width = boxHeight * imageRatio;
    }

    return {
      x: (boxWidth - width) / 2,
      y: (boxHeight - height) / 2,
      width,
      height
    };
  }

  function imageToCanvas(point) {
    const rect = state.imageRect;
    if (!rect || !state.image) {
      return { x: 0, y: 0 };
    }

    return {
      x: rect.x + (point.x / state.image.naturalWidth) * rect.width,
      y: rect.y + (point.y / state.image.naturalHeight) * rect.height
    };
  }

  function canvasToImage(point) {
    const rect = state.imageRect;
    if (!rect || !state.image) {
      return null;
    }

    if (
      point.x < rect.x ||
      point.y < rect.y ||
      point.x > rect.x + rect.width ||
      point.y > rect.y + rect.height
    ) {
      return null;
    }

    return {
      x: ((point.x - rect.x) / rect.width) * state.image.naturalWidth,
      y: ((point.y - rect.y) / rect.height) * state.image.naturalHeight
    };
  }

  function eventToCanvasPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * state.canvasSize.width,
      y: ((event.clientY - rect.top) / rect.height) * state.canvasSize.height
    };
  }

  function draw() {
    const { width, height, dpr } = state.canvasSize;
    if (!width || !height) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#202826";
    ctx.fillRect(0, 0, width, height);

    if (!state.image) {
      state.imageRect = null;
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    state.imageRect = containRect(width, height, state.image.naturalWidth, state.image.naturalHeight);
    ctx.drawImage(
      state.image,
      state.imageRect.x,
      state.imageRect.y,
      state.imageRect.width,
      state.imageRect.height
    );

    drawWoundOverlay();
    drawScaleOverlay();
  }

  function drawWoundOverlay() {
    if (!state.woundPoints.length) {
      return;
    }

    const points = state.woundPoints.map(imageToCanvas);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffddd6";
    ctx.fillStyle = "rgba(184, 68, 53, 0.16)";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    if (points.length > 2) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();

    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === points.length - 1 ? "#ffffff" : "#b84435";
      ctx.strokeStyle = "#7f241b";
      ctx.lineWidth = 2;
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawScaleOverlay() {
    if (!state.scalePoints.length) {
      return;
    }

    const points = state.scalePoints.map(imageToCanvas);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2ff4df";
    ctx.fillStyle = "#052f2d";

    if (points.length === 2) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }

    points.forEach((point) => {
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0f6f69";
      ctx.lineWidth = 3;
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function addCanvasPoint(event) {
    if (!state.image) {
      setStatus("Take a photo first.");
      return;
    }

    const canvasPoint = eventToCanvasPoint(event);
    const imagePoint = canvasToImage(canvasPoint);
    if (!imagePoint) {
      setStatus("Tap inside the photo.");
      return;
    }

    if (state.mode === "scale") {
      if (state.scalePoints.length >= 2) {
        state.scalePoints = [];
      }
      state.scalePoints.push(imagePoint);
      state.analysis = null;
      if (state.scalePoints.length === 2) {
        setMode("wound");
        setStatus("Scale set. Tap around the wound edge or use Auto outline.");
      } else {
        setStatus("Tap the other end of the scale reference.");
      }
    } else {
      state.woundPoints.push(imagePoint);
      state.analysis = null;
      const count = state.woundPoints.length;
      setStatus(count < 3 ? `Wound points: ${count}. Add at least ${3 - count} more.` : `Wound points: ${count}. Analyze when ready.`);
    }

    updateResults();
    draw();
  }

  function undoPoint() {
    if (state.mode === "scale" && state.scalePoints.length) {
      state.scalePoints.pop();
    } else if (state.woundPoints.length) {
      state.woundPoints.pop();
    }
    state.analysis = null;
    updateResults();
    draw();
    setStatus("Last point removed.");
  }

  function clearWound() {
    state.woundPoints = [];
    state.analysis = null;
    updateResults();
    draw();
    setStatus("Wound outline cleared.");
  }

  function parsePositiveNumber(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function unitToCm(value, unit) {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (unit === "mm") {
      return value / 10;
    }
    if (unit === "in") {
      return value * 2.54;
    }
    return value;
  }

  function getReferenceLengthCm() {
    const value = parsePositiveNumber(els.referenceLength.value);
    return value ? unitToCm(value, els.referenceUnit.value) : null;
  }

  function getDepthCm() {
    const value = parsePositiveNumber(els.depthInput.value);
    return value ? unitToCm(value, els.depthUnit.value) : null;
  }

  function getPxPerCm() {
    if (state.scalePoints.length !== 2) {
      return null;
    }
    const refCm = getReferenceLengthCm();
    if (!refCm) {
      return null;
    }
    const distancePx = distance(state.scalePoints[0], state.scalePoints[1]);
    return distancePx > 0 ? distancePx / refCm : null;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function convexHull(points) {
    if (points.length <= 3) {
      return points.slice();
    }

    const sorted = points
      .map((point) => ({ x: point.x, y: point.y }))
      .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

    const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    const upper = [];

    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  function polygonArea(points) {
    if (points.length < 3) {
      return 0;
    }

    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      sum += current.x * next.y - next.x * current.y;
    }
    return Math.abs(sum / 2);
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  function computeDimensions(points, pxPerCm) {
    const hull = convexHull(points);
    const count = hull.length;
    const centroid = hull.reduce(
      (acc, point) => ({ x: acc.x + point.x / count, y: acc.y + point.y / count }),
      { x: 0, y: 0 }
    );

    let covXx = 0;
    let covXy = 0;
    let covYy = 0;
    hull.forEach((point) => {
      const dx = point.x - centroid.x;
      const dy = point.y - centroid.y;
      covXx += dx * dx;
      covXy += dx * dy;
      covYy += dy * dy;
    });

    const angle = 0.5 * Math.atan2(2 * covXy, covXx - covYy);
    const major = { x: Math.cos(angle), y: Math.sin(angle) };
    const minor = { x: -Math.sin(angle), y: Math.cos(angle) };
    const majorProjection = projectRange(hull, centroid, major);
    const minorProjection = projectRange(hull, centroid, minor);
    const majorPx = majorProjection.max - majorProjection.min;
    const minorPx = minorProjection.max - minorProjection.min;
    const lengthPx = Math.max(majorPx, minorPx);
    const widthPx = Math.min(majorPx, minorPx);
    const areaPx = polygonArea(hull);

    return {
      lengthCm: lengthPx / pxPerCm,
      widthCm: widthPx / pxPerCm,
      areaCm2: areaPx / (pxPerCm * pxPerCm)
    };
  }

  function projectRange(points, origin, axis) {
    let min = Infinity;
    let max = -Infinity;
    points.forEach((point) => {
      const projection = (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y;
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    });
    return { min, max };
  }

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;

    if (delta !== 0) {
      if (max === rn) {
        h = 60 * (((gn - bn) / delta) % 6);
      } else if (max === gn) {
        h = 60 * ((bn - rn) / delta + 2);
      } else {
        h = 60 * ((rn - gn) / delta + 4);
      }
    }

    if (h < 0) {
      h += 360;
    }

    return {
      h,
      s: max === 0 ? 0 : delta / max,
      v: max
    };
  }

  function classifyPixel(r, g, b) {
    const hsv = rgbToHsv(r, g, b);
    const h = hsv.h;
    const s = hsv.s;
    const v = hsv.v;

    if (v > 0.86 && s < 0.12) {
      return { category: "other", candidate: false };
    }

    if ((v < 0.24 && s > 0.08) || (h >= 18 && h <= 45 && s > 0.22 && v < 0.52)) {
      return { category: "necrotic", candidate: true };
    }

    if (h >= 32 && h <= 72 && s > 0.12 && v > 0.34) {
      return { category: "slough", candidate: true };
    }

    if ((h <= 18 || h >= 344) && s > 0.28 && v > 0.20) {
      return { category: "granulation", candidate: true };
    }

    if ((h <= 30 || h >= 332) && s > 0.10 && s <= 0.40 && v > 0.42) {
      return { category: "epithelial", candidate: s > 0.18 };
    }

    return { category: "other", candidate: false };
  }

  function createSampleCanvas(maxSide) {
    const image = state.image;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.drawImage(image, 0, 0, width, height);
    return {
      canvas,
      ctx: sampleCtx,
      width,
      height,
      scaleX: width / image.naturalWidth,
      scaleY: height / image.naturalHeight
    };
  }

  function analyzeTissue(points) {
    const hull = convexHull(points);
    const sample = createSampleCanvas(850);
    const scaledHull = hull.map((point) => ({
      x: point.x * sample.scaleX,
      y: point.y * sample.scaleY
    }));
    const bounds = polygonBounds(scaledHull, sample.width, sample.height);
    const imageData = sample.ctx.getImageData(bounds.minX, bounds.minY, bounds.width, bounds.height);
    const counts = {
      total: 0,
      granulation: 0,
      epithelial: 0,
      slough: 0,
      necrotic: 0,
      other: 0
    };

    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const absoluteX = bounds.minX + x;
        const absoluteY = bounds.minY + y;
        if (!pointInPolygon(absoluteX, absoluteY, scaledHull)) {
          continue;
        }

        const index = (y * bounds.width + x) * 4;
        const alpha = imageData.data[index + 3];
        if (alpha < 10) {
          continue;
        }

        const result = classifyPixel(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
        counts.total += 1;
        counts[result.category] += 1;
      }
    }

    const classified = counts.granulation + counts.epithelial + counts.slough + counts.necrotic;
    const safeTotal = Math.max(1, counts.total);
    const safeClassified = Math.max(1, classified);

    return {
      counts,
      classified,
      classifiedPercent: (classified / safeTotal) * 100,
      healthyPercent: ((counts.granulation + counts.epithelial) / safeClassified) * 100,
      unhealthyPercent: ((counts.slough + counts.necrotic) / safeClassified) * 100,
      areaPercents: {
        granulation: (counts.granulation / safeTotal) * 100,
        epithelial: (counts.epithelial / safeTotal) * 100,
        slough: (counts.slough / safeTotal) * 100,
        necrotic: (counts.necrotic / safeTotal) * 100,
        other: (counts.other / safeTotal) * 100
      }
    };
  }

  function polygonBounds(points, maxWidth, maxHeight) {
    let minX = maxWidth - 1;
    let minY = maxHeight - 1;
    let maxX = 0;
    let maxY = 0;

    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });

    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(maxWidth - 1, Math.ceil(maxX));
    maxY = Math.min(maxHeight - 1, Math.ceil(maxY));

    return {
      minX,
      minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1)
    };
  }

  function autoDetectWound() {
    if (!state.image) {
      setStatus("Take a photo first.");
      return;
    }

    const sample = createSampleCanvas(260);
    const imageData = sample.ctx.getImageData(0, 0, sample.width, sample.height);
    const mask = new Uint8Array(sample.width * sample.height);

    for (let index = 0; index < mask.length; index += 1) {
      const pixelIndex = index * 4;
      const result = classifyPixel(
        imageData.data[pixelIndex],
        imageData.data[pixelIndex + 1],
        imageData.data[pixelIndex + 2]
      );
      mask[index] = result.candidate ? 1 : 0;
    }

    const component = largestComponent(mask, sample.width, sample.height);
    if (!component) {
      setStatus("No wound-like area found. Use Wound mode and tap the wound edge.");
      return;
    }

    const padX = Math.max(8, component.width * 0.18);
    const padY = Math.max(8, component.height * 0.18);
    const minX = Math.max(0, component.minX - padX) / sample.scaleX;
    const minY = Math.max(0, component.minY - padY) / sample.scaleY;
    const maxX = Math.min(sample.width, component.maxX + padX) / sample.scaleX;
    const maxY = Math.min(sample.height, component.maxY + padY) / sample.scaleY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radiusX = Math.max(10, (maxX - minX) / 2);
    const radiusY = Math.max(10, (maxY - minY) / 2);
    const points = [];

    for (let step = 0; step < 20; step += 1) {
      const angle = (Math.PI * 2 * step) / 20;
      points.push({
        x: clamp(centerX + Math.cos(angle) * radiusX, 0, state.image.naturalWidth),
        y: clamp(centerY + Math.sin(angle) * radiusY, 0, state.image.naturalHeight)
      });
    }

    state.woundPoints = points;
    state.analysis = null;
    draw();
    setStatus("Auto outline added. Review it, then Analyze.");
  }

  function largestComponent(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    const minArea = Math.max(28, Math.round(mask.length * 0.001));
    let best = null;

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) {
        continue;
      }

      let head = 0;
      let tail = 0;
      let area = 0;
      let minX = width - 1;
      let minY = height - 1;
      let maxX = 0;
      let maxY = 0;
      let centerScore = 0;
      visited[start] = 1;
      queue[tail] = start;
      tail += 1;

      while (head < tail) {
        const current = queue[head];
        head += 1;
        const x = current % width;
        const y = Math.floor(current / width);
        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        const normalizedDx = (x - width / 2) / (width / 2);
        const normalizedDy = (y - height / 2) / (height / 2);
        centerScore += Math.max(0.35, 1 - Math.hypot(normalizedDx, normalizedDy) * 0.45);

        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const next of neighbors) {
          if (next < 0 || next >= mask.length || visited[next] || !mask[next]) {
            continue;
          }
          const nx = next % width;
          const isWrapped = Math.abs(nx - x) > 1;
          if (isWrapped) {
            continue;
          }
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const coversTooMuch = componentWidth * componentHeight > mask.length * 0.78;
      if (area < minArea || coversTooMuch) {
        continue;
      }

      const score = area * (centerScore / area);
      if (!best || score > best.score) {
        best = {
          minX,
          minY,
          maxX,
          maxY,
          width: componentWidth,
          height: componentHeight,
          area,
          score
        };
      }
    }

    return best;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function runAnalysis() {
    if (!state.image) {
      setStatus("Take a photo first.");
      return;
    }

    if (state.woundPoints.length < 3) {
      setStatus("Add at least three wound edge points or use Auto outline.");
      return;
    }

    const pxPerCm = getPxPerCm();
    const depthCm = getDepthCm();
    const tissue = analyzeTissue(state.woundPoints);
    const dimensions = pxPerCm ? computeDimensions(state.woundPoints, pxPerCm) : null;

    state.analysis = {
      capturedAt: new Date(),
      points: state.woundPoints.length,
      scaleReady: Boolean(pxPerCm),
      dimensions,
      depthCm,
      tissue
    };

    updateResults();
    draw();

    if (!pxPerCm) {
      setStatus("Tissue estimated. Set the scale reference to calculate length and width.");
    } else if (!depthCm) {
      setStatus("Length and width estimated. Add measured depth if needed.");
    } else {
      setStatus("Analysis complete.");
    }
  }

  function fmtCm(value) {
    return Number.isFinite(value) ? `${value.toFixed(value < 10 ? 2 : 1)} cm` : "--";
  }

  function fmtArea(value) {
    return Number.isFinite(value) ? `${value.toFixed(value < 10 ? 2 : 1)} cm2` : "--";
  }

  function fmtPct(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "--";
  }

  function updateResults() {
    const analysis = state.analysis;
    const depthCm = getDepthCm();

    if (!analysis) {
      els.lengthValue.textContent = "--";
      els.widthValue.textContent = "--";
      els.depthValue.textContent = depthCm ? `${fmtCm(depthCm)} manual` : "--";
      els.areaValue.textContent = "--";
      els.healthyValue.textContent = "--";
      els.unhealthyValue.textContent = "--";
      els.classifiedValue.textContent = "--";
      updateBars();
      els.reportOutput.value = composeReport(null);
      return;
    }

    els.lengthValue.textContent = analysis.dimensions ? fmtCm(analysis.dimensions.lengthCm) : "Set scale";
    els.widthValue.textContent = analysis.dimensions ? fmtCm(analysis.dimensions.widthCm) : "Set scale";
    els.depthValue.textContent = analysis.depthCm ? `${fmtCm(analysis.depthCm)} manual` : "Manual";
    els.areaValue.textContent = analysis.dimensions ? fmtArea(analysis.dimensions.areaCm2) : "Set scale";
    els.healthyValue.textContent = fmtPct(analysis.tissue.healthyPercent);
    els.unhealthyValue.textContent = fmtPct(analysis.tissue.unhealthyPercent);
    els.classifiedValue.textContent = fmtPct(analysis.tissue.classifiedPercent);
    updateBars(analysis.tissue.areaPercents);
    els.reportOutput.value = composeReport(analysis);
  }

  function updateBars(percents) {
    const fallback = {
      granulation: 0,
      epithelial: 0,
      slough: 0,
      necrotic: 0,
      other: 0
    };
    const values = percents || fallback;

    Object.keys(categoryLabels).forEach((key) => {
      const percent = values[key] || 0;
      els[`${key}Bar`].style.width = `${Math.max(0, Math.min(100, percent))}%`;
      els[`${key}Value`].textContent = percents ? fmtPct(percent) : "--";
    });
  }

  function composeReport(analysis) {
    const date = new Date();
    if (!analysis) {
      return [
        "WoundMeasure note",
        `Created: ${date.toLocaleString()}`,
        "Photo: not analyzed yet.",
        "Reminder: include a visible scale reference in the image. Depth must be measured separately."
      ].join("\n");
    }

    const tissue = analysis.tissue;
    const dimensions = analysis.dimensions;
    const measurementText = dimensions
      ? `${fmtCm(dimensions.lengthCm)} length x ${fmtCm(dimensions.widthCm)} width x ${
          analysis.depthCm ? fmtCm(analysis.depthCm) : "depth not entered"
        }; area ${fmtArea(dimensions.areaCm2)}.`
      : `Scale not set; length and width not calculated. Depth: ${analysis.depthCm ? fmtCm(analysis.depthCm) : "not entered"}.`;

    return [
      "WoundMeasure note",
      `Created: ${analysis.capturedAt.toLocaleString()}`,
      `Measurement: ${measurementText}`,
      `Tissue estimate: likely healthy ${fmtPct(tissue.healthyPercent)}, likely unhealthy ${fmtPct(tissue.unhealthyPercent)}, classified tissue ${fmtPct(tissue.classifiedPercent)}.`,
      `Composition by wound area: granulation ${fmtPct(tissue.areaPercents.granulation)}, epithelial ${fmtPct(
        tissue.areaPercents.epithelial
      )}, slough ${fmtPct(tissue.areaPercents.slough)}, necrotic ${fmtPct(tissue.areaPercents.necrotic)}, unclassified ${fmtPct(
        tissue.areaPercents.other
      )}.`,
      "Limits: color estimate only, not a diagnosis. Depth is manual because one flat photo cannot measure depth."
    ].join("\n");
  }

  async function copyReport() {
    const text = els.reportOutput.value;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Note copied.");
    } catch (error) {
      els.reportOutput.focus();
      els.reportOutput.select();
      setStatus("Select and copy the note text.");
    }
  }

  function downloadReport() {
    const blob = new Blob([els.reportOutput.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `woundmeasure-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Note downloaded.");
  }

  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      els.installBtn.hidden = false;
    });

    els.installBtn.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) {
        return;
      }
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      els.installBtn.hidden = true;
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Local HTTP testing from a phone is allowed to run without offline install support.
    });
  }

  function bindEvents() {
    els.photoInput.addEventListener("change", (event) => {
      handlePhotoFile(event.target.files && event.target.files[0]);
    });

    els.choosePhotoBtn.addEventListener("click", () => {
      els.photoInput.removeAttribute("capture");
      els.photoInput.click();
      window.setTimeout(() => els.photoInput.setAttribute("capture", "environment"), 0);
    });

    els.resetBtn.addEventListener("click", resetAll);

    els.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    els.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      addCanvasPoint(event);
    });

    els.undoBtn.addEventListener("click", undoPoint);
    els.clearWoundBtn.addEventListener("click", clearWound);
    els.autoBtn.addEventListener("click", autoDetectWound);
    els.analyzeBtn.addEventListener("click", runAnalysis);
    els.copyReportBtn.addEventListener("click", copyReport);
    els.downloadReportBtn.addEventListener("click", downloadReport);
    els.referenceLength.addEventListener("input", () => {
      state.analysis = null;
      updateResults();
      draw();
    });
    els.referenceUnit.addEventListener("change", () => {
      state.analysis = null;
      updateResults();
      draw();
    });
    els.depthInput.addEventListener("input", updateResults);
    els.depthUnit.addEventListener("change", updateResults);

    window.addEventListener("resize", resizeCanvas);

    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeCanvas).observe(els.canvas.parentElement);
    }
  }

  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  resizeCanvas();
  updateResults();
})();
