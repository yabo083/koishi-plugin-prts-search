// 印章摆放 helper：拖拽放置 / 滚轮缩放 / 滑杆旋转 / 导出 JSON
(function () {
  const header = document.getElementById("header");
  const palette = document.getElementById("palette");
  const output = document.getElementById("output");
  const rotInput = document.getElementById("rot");
  const scaleInput = document.getElementById("scale");
  const rotVal = document.getElementById("rot-val");
  const scaleVal = document.getElementById("scale-val");
  const deleteBtn = document.getElementById("delete");

  const placed = []; // { el, design, x, y, w, rot, scale }

  /* ---------- 款式面板 ---------- */
  for (const [key, design] of Object.entries(window.STAMP_DESIGNS)) {
    const item = document.createElement("figure");
    item.className = `palette-item${design.w > 100 ? " palette-item--wide" : ""}`;
    item.innerHTML = `${design.svg}<figcaption>${design.label}</figcaption>`;
    item.addEventListener("pointerdown", (e) => startPlace(e, key));
    palette.append(item);
  }

  function headerPoint(e) {
    const rect = header.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /* ---------- 从面板拖出新印章 ---------- */
  function startPlace(e, designKey) {
    e.preventDefault();
    const design = window.STAMP_DESIGNS[designKey];
    const start = headerPoint(e);
    const stamp = createStamp(designKey, start.x - design.w / 2, start.y - 30, design.w, -7);
    select(stamp);
    dragExisting(e, stamp);
  }

  function createStamp(designKey, x, y, w, rot) {
    const el = document.createElement("div");
    el.className = "stamp-item";
    el.innerHTML = window.STAMP_DESIGNS[designKey].svg;
    header.append(el);
    const stamp = { el, design: designKey, x, y, w, rot };
    placed.push(stamp);
    applyStamp(stamp);
    bindMove(stamp);
    return stamp;
  }

  function applyStamp(s) {
    s.el.style.left = `${s.x}px`;
    s.el.style.top = `${s.y}px`;
    s.el.style.width = `${s.w}px`;
    s.el.style.transform = `rotate(${s.rot}deg)`;
  }

  /* ---------- 拖动 / 选中 ---------- */
  function bindMove(stamp) {
    stamp.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      select(stamp);
      dragExisting(e, stamp);
    });
    stamp.el.addEventListener("wheel", (e) => {
      e.preventDefault();
      stamp.w = Math.round(Math.min(300, Math.max(40, stamp.w - e.deltaY * 0.15)));
      applyStamp(stamp);
      syncControls(stamp);
      exportData();
    }, { passive: false });
  }

  function dragExisting(e, stamp) {
    const start = headerPoint(e);
    const base = { x: stamp.x, y: stamp.y };
    const move = (ev) => {
      const p = headerPoint(ev);
      stamp.x = Math.round(base.x + p.x - start.x);
      stamp.y = Math.round(base.y + p.y - start.y);
      applyStamp(stamp);
      exportData();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- 选中与控制 ---------- */
  let selected = null;

  function select(stamp) {
    placed.forEach((s) => s.el.classList.remove("stamp-item--selected"));
    selected = stamp;
    if (stamp) {
      stamp.el.classList.add("stamp-item--selected");
      rotInput.disabled = scaleInput.disabled = deleteBtn.disabled = false;
      syncControls(stamp);
    } else {
      rotInput.disabled = scaleInput.disabled = deleteBtn.disabled = true;
    }
  }

  function syncControls(stamp) {
    rotInput.value = stamp.rot;
    rotVal.textContent = stamp.rot;
    scaleInput.value = stamp.w / window.STAMP_DESIGNS[stamp.design].w;
    scaleVal.textContent = (stamp.w / window.STAMP_DESIGNS[stamp.design].w).toFixed(2);
  }

  rotInput.addEventListener("input", () => {
    if (!selected) return;
    selected.rot = Number(rotInput.value);
    rotVal.textContent = selected.rot;
    applyStamp(selected);
    exportData();
  });
  scaleInput.addEventListener("input", () => {
    if (!selected) return;
    selected.w = Math.round(window.STAMP_DESIGNS[selected.design].w * Number(scaleInput.value));
    scaleVal.textContent = Number(scaleInput.value).toFixed(2);
    applyStamp(selected);
    exportData();
  });
  deleteBtn.addEventListener("click", () => {
    if (!selected) return;
    selected.el.remove();
    placed.splice(placed.indexOf(selected), 1);
    select(null);
    exportData();
  });
  document.getElementById("clear").addEventListener("click", () => {
    placed.forEach((s) => s.el.remove());
    placed.length = 0;
    select(null);
    exportData();
  });
  document.getElementById("copy").addEventListener("click", async () => {
    output.select();
    await navigator.clipboard.writeText(output.value).catch(() => {});
  });
  header.addEventListener("pointerdown", (e) => {
    if (e.target === header) select(null);
  });

  /* ---------- 导出 ---------- */
  function exportData() {
    const data = placed.map(({ design, x, y, w, rot }) => ({ design, x, y, w, rot }));
    output.value = JSON.stringify(data, null, 2);
  }
  exportData();
})();
