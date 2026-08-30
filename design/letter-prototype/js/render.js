// 今日信笺渲染：生日贴画排版 + 干员 chips
(function () {
  /* ---------------- 干员稀有度 → 胶囊色框 ----------------
     金(6★) / 黄(5★) / 紫(4★) / 蓝(3★) / 灰(1-2★)；星星统一黄色 */
  const RARITY_COLORS = {
    6: "#d08a2e",
    5: "#e0b73e",
    4: "#9b7fd4",
    3: "#5b9bd5",
    2: "#9a9a90",
    1: "#9a9a90",
  };

  function renderChips() {
    const groups = { recent: window.RECENT_OPERATORS || [], pool: window.POOL_OPERATORS || [] };
    for (const [key, list] of Object.entries(groups)) {
      const root = document.querySelector(`.recent-chips[data-group="${key}"]`);
      if (!root) continue;
      for (const op of list) {
        const chip = document.createElement("span");
        chip.className = "chip chip--operator";
        chip.style.setProperty("--rarity-color", RARITY_COLORS[op.rarity] || RARITY_COLORS[2]);
        chip.title = `${op.rarity} 星${op.tag ? " · " + op.tag : ""}`;
        chip.innerHTML = `${op.name}<i class="chip-stars">${"★".repeat(op.rarity)}</i>`;
        root.append(chip);
      }
    }
  }

  /* ---------------- 生日贴画排版 ----------------
     宽度 168px 的拍立得，横向只压 20%（step = 0.8 * width）；
     一行放满后起第二行，逐行居中；越靠后 z-index 越高、透明度略降。 */
  const CARD_W = 168;
  const OVERLAP = 0.2;
  const STEP = Math.round(CARD_W * (1 - OVERLAP));

  function layoutCollage() {
    const root = document.getElementById("collage");
    if (!root || !window.BIRTHDAY_STICKERS) return;
    root.innerHTML = "";

    const stickers = window.BIRTHDAY_STICKERS;
    const containerW = root.clientWidth || 1100;
    const perRow = Math.max(1, Math.floor((containerW - CARD_W) / STEP) + 1);

    // 预生成 DOM 计算行高
    const cards = stickers.map((s) => {
      const card = document.createElement("figure");
      card.className = "sticker";
      card.style.setProperty("--tilt", `${s.tilt}deg`);
      card.style.setProperty("--tape-color", s.tape);
      const img = document.createElement("img");
      img.src = s.img;
      img.alt = s.name;
      const name = document.createElement("figcaption");
      name.className = "sticker-name signature";
      name.textContent = s.name;
      card.append(img, name);
      return card;
    });

    const cardH = Math.max(...cards.map((c) => c.offsetHeight || 276));
    const rowGap = 18;
    const rows = Math.ceil(stickers.length / perRow);

    stickers.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const indexInRow = i % perRow;
      const inRow = Math.min(perRow, stickers.length - row * perRow);
      const rowSpan = CARD_W + (inRow - 1) * STEP;
      const left0 = Math.max(0, (containerW - rowSpan) / 2);
      const card = cards[i];

      card.style.left = `${left0 + indexInRow * STEP}px`;
      card.style.top = `${row * (cardH + rowGap)}px`;
      card.style.zIndex = i + 1;
      // 压在上面的贴纸半透明；每行第一张不透明
      card.style.opacity = indexInRow === 0 ? 1 : Math.max(0.8, 1 - 0.05 * (i % perRow + row));
      // 行内奇偶上下错落：上抬让被压住贴画的名字行露出来
      card.style.marginTop = `${indexInRow % 2 === 1 ? -16 : 6 + row * 4}px`;

      root.append(card);
    });

    root.style.height = `${rows * (cardH + rowGap)}px`;
  }

  document.fonts?.ready?.then(() => {
    layoutCollage();
    // 字体加载会改变卡片高度，再校一次
    setTimeout(layoutCollage, 300);
  });
  window.addEventListener("resize", layoutCollage);

  renderChips();
})();
