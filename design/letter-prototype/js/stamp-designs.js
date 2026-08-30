// 传统印章设计库：朱文双框 / 白文实心 / 横向闲章 / 田字格
// 均为内联 SVG，红色印泥 #c34a3a，字符用霞鹜文楷；filter 做篆刻残缺感
window.STAMP_DESIGNS = {
  zhuwen: {
    label: "朱文双框·竖排",
    w: 100,
    svg: `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="rough-zhuwen" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8"/>
  </filter></defs>
  <g filter="url(#rough-zhuwen)">
    <rect x="5" y="5" width="90" height="90" rx="9" fill="none" stroke="#c34a3a" stroke-width="5.5"/>
    <rect x="14" y="14" width="72" height="72" rx="4" fill="none" stroke="#c34a3a" stroke-width="1.6"/>
    <text x="50" y="40" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="30" fill="#c34a3a">今</text>
    <text x="50" y="72" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="30" fill="#c34a3a">日</text>
  </g>
</svg>`,
  },
  baiwen: {
    label: "白文实心章",
    w: 100,
    svg: `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="rough-baiwen" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
  </filter></defs>
  <g filter="url(#rough-baiwen)">
    <rect x="4" y="4" width="92" height="92" rx="10" fill="#c34a3a"/>
    <text x="50" y="40" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="32" fill="#f8f3e7">今</text>
    <text x="50" y="73" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="32" fill="#f8f3e7">日</text>
  </g>
</svg>`,
  },
  xianzhang: {
    label: "横向闲章",
    w: 150,
    svg: `
<svg viewBox="0 0 150 72" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="rough-xianzhang" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8"/>
  </filter></defs>
  <g filter="url(#rough-xianzhang)">
    <rect x="4" y="4" width="142" height="64" rx="8" fill="none" stroke="#c34a3a" stroke-width="4.5"/>
    <text x="52" y="37" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="30" fill="#c34a3a">今</text>
    <text x="92" y="37" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="30" fill="#c34a3a">日</text>
    <circle cx="122" cy="30" r="3" fill="#c34a3a"/>
    <circle cx="122" cy="43" r="3" fill="#c34a3a"/>
    <path d="M 22 26 L 30 37 L 22 48" fill="none" stroke="#c34a3a" stroke-width="2.5" stroke-linecap="round"/>
  </g>
</svg>`,
  },
  tianzige: {
    label: "田字格章",
    w: 100,
    svg: `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="rough-tianzige" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/>
  </filter></defs>
  <g filter="url(#rough-tianzige)">
    <rect x="5" y="5" width="90" height="90" rx="7" fill="none" stroke="#c34a3a" stroke-width="4.5"/>
    <path d="M 50 8 V 92 M 8 50 H 92" stroke="#c34a3a" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.65"/>
    <text x="71" y="29" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="27" fill="#c34a3a">今</text>
    <text x="29" y="72" text-anchor="middle" dominant-baseline="central" font-family="'LXGW WenKai Lite','KaiTi',serif" font-weight="700" font-size="27" fill="#c34a3a">日</text>
  </g>
</svg>`,
  },
};
