const presets = {
  desktop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 }
};

const state = {
  width: 1366,
  height: 768,
  rows: 8,
  cols: 12,
  showGrid: true,
  snapToGrid: false,
  markers: [],
  selectedMarkerId: null
};

let markerCounter = 1;
let dragState = null;
let suppressNextStageClick = false;

const stage = document.getElementById("stage");
const stageScroll = document.getElementById("stageScroll");
const stageViewport = document.getElementById("stageViewport");
const markerLayer = document.getElementById("markerLayer");
const markerList = document.getElementById("markerList");
const emptyState = document.getElementById("emptyState");

const presetSelect = document.getElementById("preset");
const stageWidthInput = document.getElementById("stageWidth");
const stageHeightInput = document.getElementById("stageHeight");
const rowsInput = document.getElementById("rows");
const colsInput = document.getElementById("cols");
const toggleGridInput = document.getElementById("toggleGrid");
const snapToGridInput = document.getElementById("snapToGrid");

const applySizeBtn = document.getElementById("applySizeBtn");
const applyGridBtn = document.getElementById("applyGridBtn");
const clearMarkersBtn = document.getElementById("clearMarkersBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");

function round(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyPreset(presetKey) {
  if (presetKey === "custom") return;
  const preset = presets[presetKey];
  if (!preset) return;

  stageWidthInput.value = preset.width;
  stageHeightInput.value = preset.height;
}

function fitStageToViewport() {
  if (!stageScroll || !stageViewport || !stage) return;

  const padding = 8;
  const availableWidth = Math.max(stageScroll.clientWidth - padding * 2, 0);
  const availableHeight = Math.max(stageScroll.clientHeight - padding * 2, 0);

  if (!availableWidth || !availableHeight || !state.width || !state.height) return;

  const scale = Math.min(
    availableWidth / state.width,
    availableHeight / state.height,
    1
  );

  stage.style.transform = `scale(${scale})`;
  stageViewport.style.width = `${state.width * scale}px`;
  stageViewport.style.height = `${state.height * scale}px`;
}

function applyStageSize() {
  const width = Math.max(100, parseInt(stageWidthInput.value, 10) || state.width);
  const height = Math.max(100, parseInt(stageHeightInput.value, 10) || state.height);

  state.width = width;
  state.height = height;

  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  renderAll();
}

function applyGridSettings() {
  state.rows = Math.max(1, parseInt(rowsInput.value, 10) || state.rows);
  state.cols = Math.max(1, parseInt(colsInput.value, 10) || state.cols);
  state.showGrid = toggleGridInput.checked;
  state.snapToGrid = snapToGridInput.checked;

  stage.style.setProperty("--rows", state.rows);
  stage.style.setProperty("--cols", state.cols);
  stage.classList.toggle("show-grid", state.showGrid);

  renderAll();
}

function getRelativePosition(event) {
  const rect = stage.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);

  return { x, y, rect };
}

function toPercentCoordinates(x, y, rect) {
  return {
    xPct: (x / rect.width) * 100,
    yPct: (y / rect.height) * 100
  };
}

function snapPercentToGrid(xPct, yPct) {
  if (!state.snapToGrid) {
    return {
      xPct: clamp(xPct, 0, 100),
      yPct: clamp(yPct, 0, 100)
    };
  }

  const cellWidth = 100 / state.cols;
  const cellHeight = 100 / state.rows;

  const snappedColIndex = clamp(
    Math.round((xPct / cellWidth) - 0.5),
    0,
    state.cols - 1
  );

  const snappedRowIndex = clamp(
    Math.round((yPct / cellHeight) - 0.5),
    0,
    state.rows - 1
  );

  return {
    xPct: (snappedColIndex + 0.5) * cellWidth,
    yPct: (snappedRowIndex + 0.5) * cellHeight
  };
}

function getGridPosition(xPct, yPct) {
  return {
    col: clamp(Math.floor((xPct / 100) * state.cols) + 1, 1, state.cols),
    row: clamp(Math.floor((yPct / 100) * state.rows) + 1, 1, state.rows)
  };
}

function getMarkerById(id) {
  return state.markers.find((marker) => marker.id === id);
}

function selectMarker(id) {
  state.selectedMarkerId = id;
  renderAll();
}

function addMarker(xPct, yPct) {
  const snapped = snapPercentToGrid(xPct, yPct);
  const defaultLabel = `Button ${markerCounter}`;
  const labelInput = window.prompt("Enter a label for this button:", defaultLabel);
  const label = (labelInput && labelInput.trim()) ? labelInput.trim() : defaultLabel;

  const marker = {
    id: (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `marker-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    xPct: round(snapped.xPct, 4),
    yPct: round(snapped.yPct, 4)
  };

  state.markers.push(marker);
  state.selectedMarkerId = marker.id;
  markerCounter += 1;

  renderAll();
}

function deleteMarker(id) {
  state.markers = state.markers.filter((marker) => marker.id !== id);
  if (state.selectedMarkerId === id) {
    state.selectedMarkerId = state.markers.length ? state.markers[0].id : null;
  }
  renderAll();
}

function renameMarker(id) {
  const marker = getMarkerById(id);
  if (!marker) return;

  const nextLabel = window.prompt("Rename button:", marker.label);
  if (!nextLabel || !nextLabel.trim()) return;

  marker.label = nextLabel.trim();
  renderAll();
}

function updateMarkerPosition(id, xPct, yPct) {
  const marker = getMarkerById(id);
  if (!marker) return;

  const snapped = snapPercentToGrid(xPct, yPct);
  marker.xPct = round(clamp(snapped.xPct, 0, 100), 4);
  marker.yPct = round(clamp(snapped.yPct, 0, 100), 4);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markerDetails(marker) {
  const xPx = round((marker.xPct / 100) * state.width, 2);
  const yPx = round((marker.yPct / 100) * state.height, 2);
  const grid = getGridPosition(marker.xPct, marker.yPct);

  return {
    xPx,
    yPx,
    xPct: round(marker.xPct, 2),
    yPct: round(marker.yPct, 2),
    row: grid.row,
    col: grid.col
  };
}

function buildMarkerElement(marker) {
  const button = document.createElement("button");
  button.className = "marker";
  if (marker.id === state.selectedMarkerId) {
    button.classList.add("selected");
  }

  button.type = "button";
  button.textContent = marker.label;
  button.title = marker.label;
  button.style.left = `${marker.xPct}%`;
  button.style.top = `${marker.yPct}%`;
  button.dataset.id = marker.id;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectMarker(marker.id);
  });

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    selectMarker(marker.id);

    dragState = {
      markerId: marker.id,
      pointerId: event.pointerId,
      started: false
    };

    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.markerId !== marker.id) return;

    dragState.started = true;
    const { x, y, rect } = getRelativePosition(event);
    const { xPct, yPct } = toPercentCoordinates(x, y, rect);
    updateMarkerPosition(marker.id, xPct, yPct);
    renderAll(false);
  });

  button.addEventListener("pointerup", () => {
    if (dragState && dragState.markerId === marker.id) {
      if (dragState.started) {
        suppressNextStageClick = true;
      }
      dragState = null;
      renderAll();
    }
  });

  button.addEventListener("pointercancel", () => {
    dragState = null;
    renderAll();
  });

  return button;
}

function renderMarkers() {
  markerLayer.innerHTML = "";
  state.markers.forEach((marker) => {
    markerLayer.appendChild(buildMarkerElement(marker));
  });
}

function renderSidebar() {
  markerList.innerHTML = "";

  if (!state.markers.length) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  state.markers.forEach((marker) => {
    const details = markerDetails(marker);

    const card = document.createElement("div");
    card.className = "marker-card";
    if (marker.id === state.selectedMarkerId) {
      card.classList.add("selected");
    }

    card.innerHTML = `
      <div class="marker-card-header">
        <h3 class="marker-card-title">${escapeHtml(marker.label)}</h3>
      </div>

      <ul class="coord-list">
        <li><span class="coord-label">Pixels:</span> x: ${details.xPx}, y: ${details.yPx}</li>
        <li><span class="coord-label">Percent:</span> x: ${details.xPct}%, y: ${details.yPct}%</li>
        <li><span class="coord-label">Grid:</span> column ${details.col}, row ${details.row}</li>
      </ul>

      <div class="card-actions">
        <button class="small-btn rename-btn" data-id="${marker.id}" type="button">Rename</button>
        <button class="small-btn delete delete-btn" data-id="${marker.id}" type="button">Delete</button>
      </div>
    `;

    card.addEventListener("click", () => selectMarker(marker.id));
    markerList.appendChild(card);
  });

  markerList.querySelectorAll(".rename-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      renameMarker(btn.dataset.id);
    });
  });

  markerList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMarker(btn.dataset.id);
    });
  });
}

function renderAll(full = true) {
  if (full) {
    stage.style.width = `${state.width}px`;
    stage.style.height = `${state.height}px`;
    stage.style.setProperty("--rows", state.rows);
    stage.style.setProperty("--cols", state.cols);
    stage.classList.toggle("show-grid", state.showGrid);
  }

  renderMarkers();
  renderSidebar();
  fitStageToViewport();
}

function exportJson() {
  const payload = {
    screen: {
      preset: presetSelect.value,
      width: state.width,
      height: state.height
    },
    grid: {
      rows: state.rows,
      cols: state.cols,
      showGrid: state.showGrid,
      snapToGrid: state.snapToGrid
    },
    markers: state.markers.map((marker) => {
      const details = markerDetails(marker);
      return {
        id: marker.id,
        label: marker.label,
        xPercent: details.xPct,
        yPercent: details.yPct,
        xPixels: details.xPx,
        yPixels: details.yPx,
        gridColumn: details.col,
        gridRow: details.row
      };
    })
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "button-layout.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

presetSelect.addEventListener("change", () => {
  applyPreset(presetSelect.value);
});

applySizeBtn.addEventListener("click", () => {
  applyStageSize();
});

applyGridBtn.addEventListener("click", () => {
  applyGridSettings();
});

clearMarkersBtn.addEventListener("click", () => {
  const confirmed = window.confirm("Clear all markers?");
  if (!confirmed) return;

  state.markers = [];
  state.selectedMarkerId = null;
  renderAll();
});

exportJsonBtn.addEventListener("click", exportJson);

stage.addEventListener("click", (event) => {
  if (suppressNextStageClick) {
    suppressNextStageClick = false;
    return;
  }

  const { x, y, rect } = getRelativePosition(event);
  const { xPct, yPct } = toPercentCoordinates(x, y, rect);
  addMarker(xPct, yPct);
});

window.addEventListener("resize", fitStageToViewport);

if ("ResizeObserver" in window) {
  const observer = new ResizeObserver(() => fitStageToViewport());
  observer.observe(stageScroll);
}

applyPreset("desktop");
applyStageSize();
applyGridSettings();
renderAll();
