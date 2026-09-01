/* 长图 · 长微博排版
   排版全在 canvas 里做：先量字、断行、分页，再一张张画出来。
   宽度固定 1080 —— 微博按这个宽度显示，再大只会被它重新压一遍。 */

'use strict';

const W = 1080;                 // 出图宽度
const PAD_X = 92;               // 左右留白
const PAD_TOP = 104;
const PAD_BOTTOM = 84;

const SIZES = { s: 36, m: 41, l: 47 };

const FONTS = {
  song: '"Songti SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",serif',
  hei : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif',
};

// 白底。正文墨色偏暖，其余都是它的淡度
const C = { bg:'#FFFFFF', ink:'#141310', sub:'#A6A099', hair:'#D9D4CB', faint:'#E2DCD1' };

// 不能出现在行首 / 行尾的标点
const NO_HEAD = new Set('，。、；：？！）】》」』〉％,.;:?!)]}…—·”’');
const NO_TAIL = new Set('（【《「『〈([{“‘');

const state = {
  title:'', body:'', sign:'',
  font:'song', size:'m', style:'rule', height:1440, indent:1,
};

const $ = s => document.querySelector(s);
const el = { title:$('#title'), body:$('#body'), sign:$('#sign'),
             sheets:$('#sheets'), hint:$('#hint'), count:$('#count'), pages:$('#pages'), save:$('#save') };

const measurer = document.createElement('canvas').getContext('2d');

/* ── 断行 ───────────────────────────────────────────── */

// 连续的拉丁字母和数字算一个整体，别把单词劈开
function tokenize(text){
  const out = [];
  const re = /[A-Za-z0-9]+(?:[''\-.][A-Za-z0-9]+)*/g;
  let last = 0, m;
  while ((m = re.exec(text))){
    for (const ch of text.slice(last, m.index)) out.push(ch);
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  for (const ch of text.slice(last)) out.push(ch);
  return out;
}

function wrap(text, maxW, indentW){
  const lines = [];
  let toks = [], w = 0, avail = maxW - indentW, indent = indentW;

  const flush = () => { lines.push({ toks, w, indent, avail, last:false }); toks = []; w = 0; indent = 0; avail = maxW; };

  for (const tok of tokenize(text)){
    const tw = measurer.measureText(tok).width;
    if (w + tw <= avail || toks.length === 0){ toks.push(tok); w += tw; continue; }

    // 标点悬挂：句读跟着上一行走，不另起一行
    if (tok.length === 1 && NO_HEAD.has(tok)){ toks.push(tok); w += tw; continue; }

    // 开引号、开括号不留在行尾
    let carry = null;
    const tail = toks[toks.length - 1];
    if (toks.length > 1 && tail.length === 1 && NO_TAIL.has(tail)){
      carry = toks.pop(); w -= measurer.measureText(carry).width;
    }
    flush();
    if (carry){ toks.push(carry); w += measurer.measureText(carry).width; }
    toks.push(tok); w += tw;
  }
  if (toks.length) flush();
  if (lines.length) lines[lines.length - 1].last = true;
  return lines;
}

/* ── 排版 ───────────────────────────────────────────── */

function layout(){
  const size   = SIZES[state.size];
  const font   = FONTS[state.font];
  const lh     = Math.round(size * 1.95);
  const tSize  = Math.round(size * 1.52);
  const tLh    = Math.round(tSize * 1.48);
  const fSize  = Math.round(size * 0.56);
  const gap    = state.indent ? Math.round(size * 0.34) : Math.round(size * 0.95);
  const maxW   = W - PAD_X * 2;
  const indentW= state.indent ? size * 2 : 0;

  const bodyFont = `${size}px ${font}`;
  measurer.font = bodyFont;
  const spaceW = measurer.measureText('　').width;

  const paras = state.body.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const blocks = [];

  // 标题：四种版式，高度各算各的
  const st = state.style;
  if (state.title.trim()){
    measurer.font = `600 ${tSize}px ${font}`;
    const tl = wrap(state.title.trim(), maxW, 0);
    const above = st === 'quote'  ? Math.round(tSize * 1.02) : 0;
    const under = st === 'rule'   ? Math.round(size * 0.70) + 2
                : st === 'center' ? Math.round(size * 0.62) + 1 : 0;
    const below = Math.round(size * 1.3);
    blocks.push({ kind:'title', style:st, lines:tl, tLh, tSize, above, under,
                  h: above + tl.length * tLh + under + below });
  }

  measurer.font = bodyFont;
  for (const p of paras) blocks.push({ kind:'para', lines: wrap(p, maxW, indentW) });

  // 分页
  const H = state.height;
  const footH = fSize + 34;
  const bottom = H - PAD_BOTTOM - footH;
  const pages = [];
  let page = [], y = PAD_TOP;

  const newPage = () => { if (page.length) pages.push({ items:page, h:H }); page = []; y = PAD_TOP; };

  for (const b of blocks){
    if (b.kind === 'title'){
      page.push({ ...b, y });
      y += b.h;
      continue;
    }
    if (page.length) y += gap;
    const n = b.lines.length;
    for (let i = 0; i < n; i++){
      const room = bottom - y;
      // 段首孤行、段尾寡行都不要
      const need = (i === 0 && n > 1) || (i === n - 2) ? lh * 2 : lh;
      if (room < need && page.length) newPage();
      page.push({ kind:'line', line:b.lines[i], y, lh });
      y += lh;
    }
  }
  newPage();

  // 收尾：末页画个小菱形，再按内容把高度收一收
  const tail = pages[pages.length - 1];
  if (tail){
    let maxY = PAD_TOP;
    for (const it of tail.items){
      maxY = Math.max(maxY, it.kind === 'title' ? it.y + it.h - Math.round(size * 0.7) : it.y + lh);
    }
    let end = maxY;
    const markY = maxY + Math.round(size * 1.15);
    if (markY + Math.round(size * 0.6) + footH + PAD_BOTTOM <= H){
      tail.items.push({ kind:'mark', y:markY });
      end = markY + Math.round(size * 0.5);
    }
    tail.h = Math.min(H, Math.max(Math.round(H * 0.45), Math.round(end + footH + PAD_BOTTOM)));
  }

  return { pages, size, font, lh, fSize, H };
}

/* ── 画 ─────────────────────────────────────────────── */

function drawLine(ctx, line, x, y, maxW){
  const gapW = line.avail - line.w;
  // 中间的行两端对齐，末行保持自然长度
  if (!line.last && line.toks.length > 1 && gapW > 0.5 && gapW < line.avail * 0.2){
    const extra = gapW / (line.toks.length - 1);
    let cx = x + line.indent;
    for (const t of line.toks){ ctx.fillText(t, cx, y); cx += ctx.measureText(t).width + extra; }
  } else {
    ctx.fillText(line.toks.join(''), x + line.indent, y);
  }
}

function drawTitle(ctx, it, L){
  const maxW = W - PAD_X * 2;
  const top = it.y + it.above;

  if (it.style === 'quote'){
    // 引号的墨只占字身上半截，得按实际墨迹定位，不然会飘得很远
    ctx.fillStyle = C.faint;
    ctx.font = `${Math.round(it.tSize * 2.2)}px ${FONTS.song}`;
    const g = '\u201C';
    const m = ctx.measureText(g);
    let base = top - Math.round(it.tSize * 0.26) - m.actualBoundingBoxDescent;
    const over = it.y - (base - m.actualBoundingBoxAscent);
    if (over > 0) base += over;
    ctx.fillText(g, PAD_X - Math.round(it.tSize * 0.06), base);
  }
  if (it.style === 'bar'){
    ctx.fillStyle = C.ink;
    ctx.fillRect(PAD_X - 30, top + Math.round(it.tLh * 0.24), 3,
                 it.lines.length * it.tLh - Math.round(it.tLh * 0.42));
  }

  ctx.fillStyle = C.ink;
  ctx.font = `600 ${it.tSize}px ${L.font}`;
  it.lines.forEach((ln, i) => {
    const x = it.style === 'center' ? PAD_X + (maxW - ln.w) / 2 : PAD_X;
    ctx.fillText(ln.toks.join(''), x, top + it.tLh * (i + 0.78));
  });

  const ry = top + it.lines.length * it.tLh + Math.round(L.size * 0.6);
  if (it.style === 'rule'){
    ctx.fillStyle = C.ink;
    ctx.fillRect(PAD_X, ry, 56, 2);
  } else if (it.style === 'center'){
    const w = Math.round(maxW * 0.26);
    ctx.fillStyle = C.hair;
    ctx.fillRect(PAD_X + (maxW - w) / 2, ry, w, 1);
  }
}

function render(){
  const L = layout();
  const total = L.pages.length;
  const out = [];

  L.pages.forEach((pg, idx) => {
    const H = pg.h;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    for (const it of pg.items){
      if (it.kind === 'title'){
        drawTitle(ctx, it, L);
      } else if (it.kind === 'mark'){
        ctx.save();
        ctx.translate(W / 2, it.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = C.hair;
        const d = Math.round(L.size * 0.19);
        ctx.fillRect(-d, -d, d * 2, d * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = C.ink;
        ctx.font = `${L.size}px ${L.font}`;
        drawLine(ctx, it.line, PAD_X, it.y + L.lh * 0.76, W - PAD_X * 2);
      }
    }

    // 页脚
    ctx.font = `${L.fSize}px ${FONTS.hei}`;
    ctx.fillStyle = C.sub;
    const fy = H - PAD_BOTTOM + L.fSize * 0.4;
    if (state.sign.trim()) ctx.fillText(state.sign.trim(), PAD_X, fy);
    if (total > 1){
      const label = `${idx + 1} / ${total}`;
      ctx.fillText(label, W - PAD_X - ctx.measureText(label).width, fy);
    }
    out.push(cv);
  });

  paint(out);
  return out;
}

function paint(canvases){
  el.sheets.replaceChildren();
  canvases.forEach((cv, i) => {
    const box = document.createElement('div');
    box.className = 'sheet';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = String(i + 1).padStart(2, '0');
    box.append(tag, cv);
    el.sheets.append(box);
  });

  const n = canvases.length;
  const chars = state.body.replace(/\s/g, '').length;
  el.count.textContent = `${chars} 字`;
  el.pages.textContent = `${n} 张`;
  el.hint.hidden = n > 0;
  el.save.disabled = n === 0;
}

/* ── 存 ─────────────────────────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function download(){
  const canvases = render();
  if (!canvases.length) return;
  const base = (state.title.trim() || '长图').replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  el.save.disabled = true;
  el.save.textContent = '正在导出…';

  for (let i = 0; i < canvases.length; i++){
    const blob = await new Promise(r => canvases[i].toBlob(r, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = canvases.length > 1 ? `${base}-${String(i + 1).padStart(2, '0')}.png` : `${base}.png`;
    a.click();
    URL.revokeObjectURL(url);
    await sleep(260);
  }
  el.save.textContent = '下载全部';
  el.save.disabled = false;
}

/* ── 连线 ───────────────────────────────────────────── */

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { render(); store(); }, 160); };

function store(){
  try { localStorage.setItem('longpic', JSON.stringify(state)); } catch {}
}
function restore(){
  try {
    const s = JSON.parse(localStorage.getItem('longpic') || '{}');
    Object.assign(state, s);
  } catch {}
  el.title.value = state.title;
  el.body.value = state.body;
  el.sign.value = state.sign;
  for (const [id, key] of [['#font','font'],['#size','size'],['#style','style'],['#height','height'],['#indent','indent']]){
    document.querySelectorAll(`${id} button`).forEach(b => {
      b.classList.toggle('on', String(state[key]) === b.dataset.v);
    });
  }
}

for (const [id, key, cast] of [['#font','font',String],['#size','size',String],['#style','style',String],
                               ['#height','height',Number],['#indent','indent',Number]]){
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = cast(b.dataset.v);
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    schedule();
  });
}

el.title.addEventListener('input', e => { state.title = e.target.value; schedule(); });
el.body .addEventListener('input', e => { state.body  = e.target.value; schedule(); });
el.sign .addEventListener('input', e => { state.sign  = e.target.value; schedule(); });
el.save .addEventListener('click', download);

$('#demo').addEventListener('click', () => {
  state.title = '夜航船';
  state.body = [
    '船是傍晚开的。上船的人不多，各自占一张条凳，谁也不看谁。',
    '同舱有个念过书的，一路都在说话。说到山川，说到典故，说到某年某月某地的一场大雪。听的人不作声，他便当作是佩服。',
    '船行到半夜，江上起了雾。有人问，此地是何处。念过书的答不上来，只说，总归是往下走的。',
    '天亮时靠了岸。众人各自散去，谁也没有再提夜里的事。',
    '后来我常想起那一晚。人在船上，说什么都可以；一上岸，话就作数了。',
  ].join('\n\n');
  el.title.value = state.title;
  el.body.value = state.body;
  schedule();
});

restore();
render();
