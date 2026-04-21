const canvas = document.querySelector("#domainCanvas");
const ctx = canvas.getContext("2d");

const state = {
  mode: "binary",
  threshold: 0.5,
  smoothness: 68,
  showProbability: true,
  showUncertainty: true,
  showSamples: true,
  showBoundaries: true,
};

const colors = {
  chlorite: "#278263",
  potassic: "#c88f2f",
  quartz: "#227c92",
  argillic: "#c1534a",
  waste: "#7b7f83",
  uncertainty: "rgba(255, 255, 255, 0.46)",
  line: "rgba(28, 33, 38, 0.78)",
  drillhole: "rgba(24, 29, 34, 0.68)",
};

const domainSets = {
  binary: [
    { key: "d1", label: "Chlorite-sericite / potassic group", color: colors.chlorite },
    { key: "d2", label: "Quartz-sericite / argillic group", color: colors.quartz },
    { key: "uncertainty", label: "High uncertainty", color: "#ffffff" },
  ],
  four: [
    { key: "chlorite", label: "Chlorite-sericite", color: colors.chlorite },
    { key: "potassic", label: "Potassic", color: colors.potassic },
    { key: "quartz", label: "Quartz-sericite", color: colors.quartz },
    { key: "argillic", label: "Argillic", color: colors.argillic },
    { key: "uncertainty", label: "High uncertainty", color: "#ffffff" },
  ],
};

const controls = {
  threshold: document.querySelector("#threshold"),
  smoothness: document.querySelector("#smoothness"),
  thresholdValue: document.querySelector("#thresholdValue"),
  smoothnessValue: document.querySelector("#smoothnessValue"),
  domainShare: document.querySelector("#domainShare"),
  modeLabel: document.querySelector("#modeLabel"),
  viewTitle: document.querySelector("#viewTitle"),
  legend: document.querySelector("#legend"),
  showProbability: document.querySelector("#showProbability"),
  showUncertainty: document.querySelector("#showUncertainty"),
  showSamples: document.querySelector("#showSamples"),
  showBoundaries: document.querySelector("#showBoundaries"),
  resetView: document.querySelector("#resetView"),
};

const samples = createSamples();
const dpr = Math.max(1, window.devicePixelRatio || 1);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function logistic(value, scale = 1) {
  return 1 / (1 + Math.exp(-value / scale));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const blue = Math.round(lerp(a.b, b.b, t));
  return `rgb(${r}, ${g}, ${blue})`;
}

function terrain(x) {
  return 0.11 + 0.018 * Math.sin(x * Math.PI * 2.2) + 0.012 * Math.sin(x * Math.PI * 6.5 + 0.8);
}

function mainBoundary(x, smoothness) {
  const detail = (100 - smoothness) / 100;
  const smooth = 0.48 + 0.11 * Math.sin((x - 0.08) * Math.PI * 1.45);
  const local = detail * (0.055 * Math.sin(x * Math.PI * 7.2 + 0.9) + 0.035 * Math.sin(x * Math.PI * 13.2));
  return smooth + local;
}

function upperSplit(x, smoothness) {
  const detail = (100 - smoothness) / 120;
  return 0.34 + 0.075 * Math.sin(x * Math.PI * 2.8 + 1.4) + detail * 0.045 * Math.sin(x * Math.PI * 8.5);
}

function lowerSplit(x, smoothness) {
  const detail = (100 - smoothness) / 120;
  return 0.67 + 0.08 * Math.sin(x * Math.PI * 2.1 - 0.6) + detail * 0.035 * Math.sin(x * Math.PI * 9.6 + 0.2);
}

function fieldAt(x, y) {
  const surface = terrain(x);
  const rockY = clamp((y - surface) / (0.92 - surface), 0, 1);
  const main = mainBoundary(x, state.smoothness);
  const transition = lerp(0.032, 0.058, state.smoothness / 100);
  const pDomainOne = logistic(main - rockY, transition);
  const pUpper = logistic(upperSplit(x, state.smoothness) - rockY, transition * 0.95);
  const pLower = logistic(lowerSplit(x, state.smoothness) - rockY, transition * 1.05);

  const isDomainOne = pDomainOne >= state.threshold;
  let classKey = isDomainOne ? "d1" : "d2";
  let classColor = isDomainOne ? colors.chlorite : colors.quartz;
  let confidence = Math.abs(pDomainOne - state.threshold) / 0.5;

  if (state.mode === "four") {
    if (isDomainOne) {
      const potassicProbability = 1 - pUpper;
      classKey = potassicProbability > 0.5 ? "potassic" : "chlorite";
      classColor = potassicProbability > 0.5 ? colors.potassic : colors.chlorite;
      confidence = Math.min(confidence, Math.abs(potassicProbability - 0.5) * 2);
    } else {
      const argillicProbability = 1 - pLower;
      classKey = argillicProbability > 0.5 ? "argillic" : "quartz";
      classColor = argillicProbability > 0.5 ? colors.argillic : colors.quartz;
      confidence = Math.min(confidence, Math.abs(argillicProbability - 0.5) * 2);
    }
  }

  return {
    rockY,
    pDomainOne,
    pUpper,
    pLower,
    classKey,
    classColor,
    confidence: clamp(confidence, 0, 1),
    uncertainty: 1 - clamp(confidence, 0, 1),
  };
}

function createSamples() {
  const holes = [0.08, 0.16, 0.24, 0.33, 0.42, 0.52, 0.63, 0.74, 0.84, 0.93];
  const result = [];

  holes.forEach((x, holeIndex) => {
    const collar = terrain(x) + 0.015;
    const bottom = 0.89 + 0.02 * Math.sin(holeIndex * 1.7);
    const count = 18 + (holeIndex % 3);
    for (let i = 0; i < count; i += 1) {
      const y = lerp(collar, bottom, i / (count - 1));
      const offset = 0.006 * Math.sin(i * 2.3 + holeIndex);
      result.push({ x: clamp(x + offset, 0.02, 0.98), y });
    }
  });

  return result;
}

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#e6ebe6");
  gradient.addColorStop(0.22, "#d7ddd4");
  gradient.addColorStop(1, "#b9b0a2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#aaa394";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let px = 0; px <= canvas.width; px += 12) {
    const x = px / canvas.width;
    ctx.lineTo(px, terrain(x) * canvas.height);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();
}

function drawDomains() {
  const cell = Math.max(2, Math.floor(canvas.width / 330));
  let domainOneCells = 0;
  let totalCells = 0;

  for (let py = 0; py < canvas.height; py += cell) {
    for (let px = 0; px < canvas.width; px += cell) {
      const x = (px + cell / 2) / canvas.width;
      const y = (py + cell / 2) / canvas.height;
      if (y < terrain(x)) {
        continue;
      }

      const field = fieldAt(x, y);
      totalCells += 1;
      if (field.pDomainOne >= state.threshold) {
        domainOneCells += 1;
      }

      const depthShade = clamp((field.rockY - 0.04) * 0.13, 0, 0.12);
      let fill = field.classColor;

      if (state.showProbability) {
        if (state.mode === "binary") {
          fill = mixColor(colors.quartz, colors.chlorite, field.pDomainOne);
        } else {
          const faded = mixColor("#f2ecdd", field.classColor, 0.72 + field.confidence * 0.22);
          fill = faded;
        }
      }

      ctx.fillStyle = fill;
      ctx.fillRect(px, py, cell + 1, cell + 1);

      if (depthShade > 0) {
        ctx.fillStyle = `rgba(20, 24, 28, ${depthShade})`;
        ctx.fillRect(px, py, cell + 1, cell + 1);
      }

      if (state.showUncertainty && field.uncertainty > 0.62) {
        const alpha = clamp((field.uncertainty - 0.55) * 0.72, 0.08, 0.34);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(px, py, cell + 1, cell + 1);
      }
    }
  }

  const share = totalCells ? Math.round((domainOneCells / totalCells) * 100) : 0;
  controls.domainShare.textContent = `${share}%`;
}

function drawBoundaries() {
  if (!state.showBoundaries) {
    return;
  }

  drawBoundaryLine((x) => {
    const surface = terrain(x);
    return surface + mainBoundary(x, state.smoothness) * (0.92 - surface);
  }, "rgba(16, 19, 22, 0.82)", 3.4);

  if (state.mode === "four") {
    drawBoundaryLine((x) => {
      const surface = terrain(x);
      return surface + upperSplit(x, state.smoothness) * (0.92 - surface);
    }, rgba(colors.potassic, 0.86), 2.1);

    drawBoundaryLine((x) => {
      const surface = terrain(x);
      return surface + lowerSplit(x, state.smoothness) * (0.92 - surface);
    }, rgba(colors.argillic, 0.86), 2.1);
  }
}

function drawBoundaryLine(yForX, strokeStyle, width) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = strokeStyle;
  ctx.setLineDash([14, 8]);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let px = 0; px <= canvas.width; px += 8) {
    const x = px / canvas.width;
    const y = yForX(x) * canvas.height;
    if (px === 0) {
      ctx.moveTo(px, y);
    } else {
      ctx.lineTo(px, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawSamples() {
  if (!state.showSamples) {
    return;
  }

  ctx.save();
  ctx.lineWidth = 1.35;
  ctx.strokeStyle = "rgba(18, 22, 26, 0.45)";

  const grouped = new Map();
  samples.forEach((sample) => {
    const key = Math.round(sample.x * 1000);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(sample);
  });

  grouped.forEach((hole) => {
    const sorted = [...hole].sort((a, b) => a.y - b.y);
    ctx.beginPath();
    sorted.forEach((sample, index) => {
      const px = sample.x * canvas.width;
      const py = sample.y * canvas.height;
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
  });

  samples.forEach((sample) => {
    const field = fieldAt(sample.x, sample.y);
    const px = sample.x * canvas.width;
    const py = sample.y * canvas.height;
    ctx.beginPath();
    ctx.fillStyle = field.classColor;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 1.5;
    ctx.arc(px, py, 3.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawDomainLabels() {
  ctx.save();
  ctx.font = `700 ${Math.max(13, canvas.width / 88)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.strokeStyle = "rgba(16, 19, 22, 0.24)";
  ctx.lineWidth = 4;

  const labels = state.mode === "binary"
    ? [
        { text: "Domain group 1", x: 0.28, y: 0.35 },
        { text: "Domain group 2", x: 0.72, y: 0.68 },
      ]
    : [
        { text: "Chlorite-sericite", x: 0.24, y: 0.31 },
        { text: "Potassic", x: 0.55, y: 0.48 },
        { text: "Quartz-sericite", x: 0.78, y: 0.58 },
        { text: "Argillic", x: 0.58, y: 0.79 },
      ];

  labels.forEach((label) => {
    const x = label.x * canvas.width;
    const y = label.y * canvas.height;
    ctx.strokeText(label.text, x, y);
    ctx.fillText(label.text, x, y);
  });
  ctx.restore();
}

function drawSurfaceAndGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const y = (i / 6) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#6b6255";
  ctx.beginPath();
  ctx.moveTo(0, terrain(0) * canvas.height);
  for (let px = 0; px <= canvas.width; px += 10) {
    const x = px / canvas.width;
    ctx.lineTo(px, terrain(x) * canvas.height);
  }
  ctx.lineTo(canvas.width, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(18, 22, 26, 0.48)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let px = 0; px <= canvas.width; px += 10) {
    const x = px / canvas.width;
    const y = terrain(x) * canvas.height;
    if (px === 0) {
      ctx.moveTo(px, y);
    } else {
      ctx.lineTo(px, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function renderLegend() {
  controls.legend.innerHTML = "";
  domainSets[state.mode].forEach((item) => {
    if (item.key === "uncertainty" && !state.showUncertainty) {
      return;
    }
    const element = document.createElement("span");
    element.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = item.key === "uncertainty"
      ? "repeating-linear-gradient(45deg, #ffffff, #ffffff 4px, #d8d0c2 4px, #d8d0c2 8px)"
      : item.color;

    const label = document.createElement("span");
    label.textContent = item.label;
    element.append(swatch, label);
    controls.legend.append(element);
  });
}

function updateText() {
  controls.thresholdValue.textContent = state.threshold.toFixed(2);
  controls.smoothnessValue.textContent = String(state.smoothness);
  controls.modeLabel.textContent = state.mode === "binary" ? "Binary model" : "Four-domain model";
  controls.viewTitle.textContent = state.mode === "binary"
    ? "Binary probability domain"
    : "Hierarchical four-domain model";
}

function render() {
  clear();
  drawBackground();
  drawDomains();
  drawSurfaceAndGrid();
  drawBoundaries();
  drawDomainLabels();
  drawSamples();
  renderLegend();
  updateText();
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const nextWidth = Math.max(700, Math.round(rect.width * dpr));
  const nextHeight = Math.max(430, Math.round(rect.height * dpr));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

function bindControls() {
  document.querySelectorAll("input[name='modelMode']").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.mode = event.target.value;
      render();
    });
  });

  controls.threshold.addEventListener("input", (event) => {
    state.threshold = Number(event.target.value);
    render();
  });

  controls.smoothness.addEventListener("input", (event) => {
    state.smoothness = Number(event.target.value);
    render();
  });

  ["showProbability", "showUncertainty", "showSamples", "showBoundaries"].forEach((key) => {
    controls[key].addEventListener("change", (event) => {
      state[key] = event.target.checked;
      render();
    });
  });

  controls.resetView.addEventListener("click", () => {
    state.mode = "binary";
    state.threshold = 0.5;
    state.smoothness = 68;
    state.showProbability = true;
    state.showUncertainty = true;
    state.showSamples = true;
    state.showBoundaries = true;

    document.querySelector("input[name='modelMode'][value='binary']").checked = true;
    controls.threshold.value = state.threshold;
    controls.smoothness.value = state.smoothness;
    controls.showProbability.checked = state.showProbability;
    controls.showUncertainty.checked = state.showUncertainty;
    controls.showSamples.checked = state.showSamples;
    controls.showBoundaries.checked = state.showBoundaries;
    render();
  });
}

bindControls();
window.addEventListener("resize", () => {
  sizeCanvas();
  render();
});
sizeCanvas();
render();
