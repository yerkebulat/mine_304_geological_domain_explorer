const steps = [
  {
    title: "Start with geochemical variables",
    text: "Geological knowledge and EDA select variables that separate alteration and mineralization behavior.",
    points: [
      "The paper uses multivariate geochemistry rather than a single grade threshold.",
      "Variable choice remains a geological decision, not a purely automatic step.",
      "The goal is to find populations that can represent geological domains.",
    ],
  },
  {
    title: "Create initial domain labels",
    text: "Unsupervised clustering separates sample populations so the classifier has training classes.",
    points: [
      "The workflow first estimates domain proportions from mixture behavior.",
      "Samples are assigned to domains by matching multivariate distributions.",
      "Logging is used for comparison, not as the direct training label.",
    ],
  },
  {
    title: "Interpolate with ensemble SVC",
    text: "Support vector classification learns a spatial boundary, while the ensemble reduces dependence on one training subset.",
    points: [
      "RBF kernels allow curved contacts instead of straight cutoffs.",
      "Multiple weak learners use different sample and variable subsets.",
      "Averaging model outputs gives a smoother probability field.",
    ],
  },
  {
    title: "Convert probabilities into domains",
    text: "The final model can be shown as hard categorical domains or as probabilities near the contact.",
    points: [
      "Binary performance was 91.3% balanced accuracy.",
      "The four-domain hierarchical model reached 73.0% balanced accuracy.",
      "Uncertain zones are useful because they mark where interpretation deserves attention.",
    ],
  },
];

const canvas = document.querySelector("#domainCanvas");
const ctx = canvas.getContext("2d");
const stepTitle = document.querySelector("#stepTitle");
const stepText = document.querySelector("#stepText");
const stepPoints = document.querySelector("#stepPoints");
const visualCaption = document.querySelector("#visualCaption");

const colors = {
  green: "#287c5b",
  teal: "#26758b",
  gold: "#c28b2f",
  red: "#bd524a",
  rock: "#746c60",
  grid: "rgba(255,255,255,0.26)",
  ink: "rgba(19, 24, 27, 0.78)",
};

let activeStep = 0;
let visualMode = "hard";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const blue = Math.round(lerp(a.b, b.b, t));
  return `rgb(${r}, ${g}, ${blue})`;
}

function surface(x) {
  return 0.16 + 0.018 * Math.sin(x * Math.PI * 2.4) + 0.009 * Math.sin(x * Math.PI * 7.5);
}

function contact(x) {
  return 0.47 + 0.11 * Math.sin((x - 0.12) * Math.PI * 1.6) + 0.025 * Math.sin(x * Math.PI * 5.5);
}

function probabilityAt(x, y) {
  const top = surface(x);
  const normalizedDepth = clamp((y - top) / (0.93 - top), 0, 1);
  const boundary = contact(x);
  return 1 / (1 + Math.exp((normalizedDepth - boundary) / 0.055));
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(760, Math.round(rect.width * dpr));
  const height = Math.max(360, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#e9eeeb");
  gradient.addColorStop(0.38, "#d5ddd8");
  gradient.addColorStop(1, "#b8b0a4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawDomains() {
  const cell = Math.max(3, Math.floor(canvas.width / 360));

  for (let y = 0; y < canvas.height; y += cell) {
    for (let x = 0; x < canvas.width; x += cell) {
      const nx = (x + cell / 2) / canvas.width;
      const ny = (y + cell / 2) / canvas.height;

      if (ny < surface(nx)) {
        continue;
      }

      const probability = probabilityAt(nx, ny);
      const hardColor = probability >= 0.5 ? colors.green : colors.teal;
      let fill = hardColor;

      if (visualMode === "probability") {
        fill = mix(colors.teal, colors.green, probability);
      }

      ctx.fillStyle = fill;
      ctx.fillRect(x, y, cell + 1, cell + 1);

      const depthShade = clamp((ny - surface(nx)) * 0.13, 0, 0.11);
      if (depthShade) {
        ctx.fillStyle = `rgba(16, 19, 21, ${depthShade})`;
        ctx.fillRect(x, y, cell + 1, cell + 1);
      }

      if (visualMode === "probability") {
        const uncertainty = 1 - Math.abs(probability - 0.5) * 2;
        if (uncertainty > 0.48) {
          ctx.fillStyle = `rgba(255,255,255,${0.12 + uncertainty * 0.22})`;
          ctx.fillRect(x, y, cell + 1, cell + 1);
        }
      }
    }
  }
}

function drawGridAndSurface() {
  ctx.save();
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const y = (i / 5) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = colors.rock;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= canvas.width; x += 10) {
    const nx = x / canvas.width;
    ctx.lineTo(x, surface(nx) * canvas.height);
  }
  ctx.lineTo(canvas.width, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(17,22,24,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 10) {
    const nx = x / canvas.width;
    const y = surface(nx) * canvas.height;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawContact() {
  ctx.save();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = visualMode === "hard" ? 4 : 2.5;
  ctx.setLineDash(visualMode === "hard" ? [] : [14, 9]);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 8) {
    const nx = x / canvas.width;
    const top = surface(nx);
    const y = (top + contact(nx) * (0.93 - top)) * canvas.height;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawSamples() {
  const holes = [0.09, 0.18, 0.28, 0.39, 0.51, 0.64, 0.76, 0.88];
  ctx.save();
  holes.forEach((x, holeIndex) => {
    const top = surface(x) + 0.025;
    const bottom = 0.88 + 0.02 * Math.sin(holeIndex * 1.7);
    ctx.strokeStyle = "rgba(18,23,26,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x * canvas.width, top * canvas.height);
    ctx.lineTo(x * canvas.width, bottom * canvas.height);
    ctx.stroke();

    for (let i = 0; i < 13; i += 1) {
      const y = lerp(top, bottom, i / 12);
      const probability = probabilityAt(x, y);
      ctx.fillStyle = probability >= 0.5 ? colors.green : colors.teal;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawLabels() {
  ctx.save();
  ctx.font = `800 ${Math.max(14, canvas.width / 90)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.strokeStyle = "rgba(12,16,18,0.24)";
  ctx.lineWidth = 4;

  const labels = visualMode === "hard"
    ? [
        ["Domain group 1", 0.29, 0.38],
        ["Domain group 2", 0.72, 0.70],
      ]
    : [
        ["High confidence", 0.25, 0.34],
        ["Uncertain contact", 0.55, 0.55],
        ["High confidence", 0.76, 0.76],
      ];

  labels.forEach(([text, x, y]) => {
    ctx.strokeText(text, x * canvas.width, y * canvas.height);
    ctx.fillText(text, x * canvas.width, y * canvas.height);
  });
  ctx.restore();
}

function drawCanvas() {
  sizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawDomains();
  drawGridAndSurface();
  drawContact();
  drawSamples();
  drawLabels();
}

function updateStep(index) {
  activeStep = index;
  const step = steps[activeStep];
  stepTitle.textContent = step.title;
  stepText.textContent = step.text;
  stepPoints.innerHTML = "";

  step.points.forEach((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    stepPoints.append(item);
  });

  document.querySelectorAll(".step-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.step) === activeStep);
  });
}

function updateVisualMode(mode) {
  visualMode = mode;
  visualCaption.textContent = visualMode === "hard"
    ? "Hard domains give a clean boundary, but they hide how confident the model is near the contact."
    : "The probability view turns the contact into an uncertainty zone, making the model more useful for geological review.";
  drawCanvas();
}

document.querySelectorAll(".step-button").forEach((button) => {
  button.addEventListener("click", () => updateStep(Number(button.dataset.step)));
});

document.querySelectorAll("input[name='visualMode']").forEach((input) => {
  input.addEventListener("change", (event) => updateVisualMode(event.target.value));
});

window.addEventListener("resize", drawCanvas);

updateStep(0);
drawCanvas();
