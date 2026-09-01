/* 长图 · 长微博排版
   排版全在 canvas 里做：先量字、断行、分页，再一张张画出来。

   页面尺寸不是随便定的。微博的规矩是：一边超过 1080、另一边不到 1080，
   且宽高比大于 2，就原样保留；否则把长边压到 1080。所以 1080×1440 会被
   压成 810×1080，字缩了两成半，看着就糊。这里出图一律 1080 宽、
   高度至少 2240（比 2.07），落在「不动」那一档里。
   剩下的只有文件体积：超过 500KB 会被转成 70% 质量的 JPG。 */

'use strict';

const W = 1080;                 // 出图宽度
const PAD_X = 92;               // 左右留白
const PAD_TOP = 116;
const PAD_BOTTOM = 92;
const MIN_H = 2240;             // 宽高比 2.07，刚过微博那道线
const SAFE_BYTES = 500 * 1024;  // 超过这个会被重新压

const SIZES = { s: 36, m: 41, l: 47 };

const FONTS = {
  song: '"Songti SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",serif',
  hei : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif',
};

// 白底。正文墨色偏暖，其余都是它的淡度
const C = { bg:'#FFFFFF', ink:'#141310', sub:'#A29C93', hair:'#DAD5CC', rule:'#C7C1B7', faint:'#E4DED4' };

// 不能出现在行首 / 行尾的标点
const NO_HEAD = new Set('，。、；：？！）】》」』〉％,.;:?!)]}…—·”’');
const NO_TAIL = new Set('（【《「『〈([{“‘');

const state = {
  title:'', body:'', sign:'',
  font:'song', size:'m', style:'masthead', height:3200, indent:1,
};

const $ = s => document.querySelector(s);
const el = { title:$('#title'), body:$('#body'), sign:$('#sign'),
             sheets:$('#sheets'), hint:$('#hint'), count:$('#count'), pages:$('#pages'), save:$('#save') };

const measurer = document.createElement('canvas').getContext('2d');

/* ── 断行 ───────────────────────────────────────────── */

// 连续的拉丁字母和数字算一个整体，别把单词劈开
function tokenize(text){
  const out = [];
  const re = /[A-Za-z0-9]+(?:['’\-.][A-Za-z0-9]+)*/g;
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

/* ── 量 ─────────────────────────────────────────────── */

function metrics(){
  const size = SIZES[state.size];
  const font = FONTS[state.font];
  const st   = state.style;

  const m = {
    st, size, font,
    maxW  : W - PAD_X * 2,
    lh    : Math.round(size * 1.95),
    fSize : Math.round(size * 0.56),
    gap   : state.indent ? Math.round(size * 0.34) : Math.round(size * 0.95),
    indentW: state.indent ? size * 2 : 0,
  };
  m.footH = m.fSize + 40;

  // 标题：每种版式的字号和行距各不一样
  m.tSize = st === 'oversize' ? Math.round(size * 2.15)
          : st === 'band'     ? Math.round(size * 1.26)
          : st === 'vertical' ? Math.round(size * 1.34)
          : Math.round(size * 1.56);
  m.tLh   = st === 'oversize' ? Math.round(m.tSize * 1.32) : Math.round(m.tSize * 1.46);
  m.track = Math.round(m.tSize * 0.2);        // 双线版的字距
  m.vStep = Math.round(m.tSize * 1.2);        // 竖题的字距
  return m;
}

// 一行字带字距时的实际宽度
function trackedW(line, track){
  return line.w + track * Math.max(0, line.toks.length - 1);
}

function buildBlocks(m){
  const blocks = [];
  const title = state.title.trim();

  if (title){
    if (m.st === 'vertical'){
      const chars = [...title].filter(c => c.trim());
      blocks.push({ kind:'title', style:m.st, chars,
                    h: chars.length * m.vStep + Math.round(m.size * 1.5) });
    } else {
      measurer.font = `600 ${m.tSize}px ${m.font}`;
      const lines = wrap(title, m.maxW, 0);
      const above = m.st === 'masthead' ? (state.sign.trim() ? m.fSize + 22 : 4)
                  : m.st === 'band' ? Math.round(m.size * 0.85) : 0;
      const under = m.st === 'masthead' ? 0 : m.st === 'band' ? Math.round(m.size * 0.85) : 0;
      const below = m.st === 'oversize' ? Math.round(m.size * 1.85) : Math.round(m.size * 1.5);
      blocks.push({ kind:'title', style:m.st, lines, above, under,
                    h: above + lines.length * m.tLh + under + below });
    }
  }

  measurer.font = `${m.size}px ${m.font}`;
  for (const p of state.body.split(/\n+/).map(s => s.trim()).filter(Boolean)){
    blocks.push({ kind:'para', lines: wrap(p, m.maxW, m.indentW) });
  }
  return blocks;
}

/* ── 分页 ───────────────────────────────────────────── */

function paginate(blocks, m, bottom){
  const pages = [];
  let page = [], y = PAD_TOP;
  const flush = () => { if (page.length) pages.push(page); page = []; y = PAD_TOP; };

  for (const b of blocks){
    if (b.kind === 'title'){ page.push({ ...b, y }); y += b.h; continue; }
    if (page.length) y += m.gap;
    const n = b.lines.length;
    for (let i = 0; i < n; i++){
      // 段首孤行、段尾寡行都不要
      const need = ((i === 0 && n > 1) || i === n - 2) ? m.lh * 2 : m.lh;
      if (bottom - y < need && page.length) flush();
      page.push({ kind:'line', line:b.lines[i], y });
      y += m.lh;
    }
  }
  flush();
  return pages;
}

function contentBottom(items, m){
  let end = PAD_TOP;
  for (const it of items){
    end = Math.max(end, it.kind === 'title' ? it.y + it.h - Math.round(m.size * 0.8) : it.y + m.lh);
  }
  return end;
}

function layout(){
  const m = metrics();
  const blocks = buildBlocks(m);
  if (!blocks.length) return { pages:[], m };

  const chrome = m.footH + PAD_BOTTOM;
  const roomMax = Math.max(MIN_H, state.height) - chrome;
  const n = paginate(blocks, m, roomMax).length;

  // 页数不变的前提下，每页少装一点 —— 这样几张的疏密才匀，
  // 不会第一张塞满、最后一张只剩两行。
  let lo = PAD_TOP + m.lh, hi = roomMax;
  while (lo < hi){
    const mid = lo + Math.floor((hi - lo) / 2);
    if (paginate(blocks, m, mid).length <= n) hi = mid; else lo = mid + 1;
  }
  let sheets = paginate(blocks, m, hi);
  if (sheets.length > n) sheets = paginate(blocks, m, roomMax);

  // 页高：装得下就行，但不能低于 MIN_H，否则微博要压
  const H = Math.max(MIN_H, hi + chrome);
  const pages = sheets.map(items => ({ items, h:H }));

  // 末页收尾点个小菱形
  const tail = pages[pages.length - 1];
  const markY = contentBottom(tail.items, m) + Math.round(m.size * 1.3);
  if (markY + Math.round(m.size * 0.6) + chrome <= H) tail.items.push({ kind:'mark', y:markY });

  // 页高有富余时整体往下坐一点，比顶在上面好看
  for (const pg of pages){
    const room = H - chrome - contentBottom(pg.items, m);
    if (room > 60){
      const shift = Math.round(room * 0.3);
      for (const it of pg.items) it.y += shift;
    }
  }
  return { pages, m };
}

/* ── 画 ─────────────────────────────────────────────── */

function drawLine(ctx, line, y, m){
  const gapW = line.avail - line.w;
  // 中间的行两端对齐，末行保持自然长度
  if (!line.last && line.toks.length > 1 && gapW > 0.5 && gapW < line.avail * 0.2){
    const extra = gapW / (line.toks.length - 1);
    let cx = PAD_X + line.indent;
    for (const t of line.toks){ ctx.fillText(t, cx, y); cx += ctx.measureText(t).width + extra; }
  } else {
    ctx.fillText(line.toks.join(''), PAD_X + line.indent, y);
  }
}

function drawTracked(ctx, line, cx, y, track){
  let x = cx - trackedW(line, track) / 2;
  for (const t of line.toks){ ctx.fillText(t, x, y); x += ctx.measureText(t).width + track; }
}

function drawTitle(ctx, it, m){
  const sign = state.sign.trim();

  if (it.style === 'vertical'){
    const cx = PAD_X + m.maxW - Math.round(m.tSize * 0.5);
    ctx.fillStyle = C.ink;
    ctx.font = `600 ${m.tSize}px ${m.font}`;
    ctx.textAlign = 'center';
    it.chars.forEach((ch, i) => ctx.fillText(ch, cx, it.y + m.vStep * (i + 0.82)));
    ctx.textAlign = 'left';
    return;
  }

  const top = it.y + it.above;

  if (it.style === 'masthead'){
    if (sign){
      ctx.fillStyle = C.sub;
      ctx.font = `${m.fSize}px ${FONTS.hei}`;
      const w = ctx.measureText(sign).width;
      ctx.fillText(sign, PAD_X + m.maxW - w, top - 16);
    }
    ctx.fillStyle = C.ink;
    ctx.fillRect(PAD_X, top - 2, m.maxW, 2);
  }
  if (it.style === 'band'){
    ctx.fillStyle = C.rule;
    ctx.fillRect(PAD_X, it.y, m.maxW, 2);
  }

  ctx.fillStyle = C.ink;
  ctx.font = `600 ${m.tSize}px ${m.font}`;
  const cx = PAD_X + m.maxW / 2;
  it.lines.forEach((ln, i) => {
    const y = top + m.tLh * (i + 0.8);
    if (it.style === 'band') drawTracked(ctx, ln, cx, y, m.track);
    else ctx.fillText(ln.toks.join(''), PAD_X, y);
  });

  if (it.style === 'band'){
    ctx.fillStyle = C.rule;
    ctx.fillRect(PAD_X, top + it.lines.length * m.tLh + it.under - 2, m.maxW, 2);
  }
}

function render(){
  const { pages, m } = layout();
  const total = pages.length;
  const out = [];

  pages.forEach((pg, idx) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = pg.h;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, pg.h);

    for (const it of pg.items){
      if (it.kind === 'title'){
        drawTitle(ctx, it, m);
      } else if (it.kind === 'mark'){
        ctx.save();
        ctx.translate(W / 2, it.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = C.hair;
        const d = Math.round(m.size * 0.19);
        ctx.fillRect(-d, -d, d * 2, d * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = C.ink;
        ctx.font = `${m.size}px ${m.font}`;
        drawLine(ctx, it.line, it.y + m.lh * 0.76, m);
      }
    }

    // 页脚：落款在左，页码在右。刊头版的落款已经在题头上了
    ctx.font = `${m.fSize}px ${FONTS.hei}`;
    ctx.fillStyle = C.sub;
    const fy = pg.h - PAD_BOTTOM + m.fSize * 0.4;
    const sign = state.sign.trim();
    if (sign && m.st !== 'masthead') ctx.fillText(sign, PAD_X, fy);
    if (total > 1){
      const label = `${idx + 1} / ${total}`;
      ctx.fillText(label, W - PAD_X - ctx.measureText(label).width, fy);
    }
    out.push(cv);
  });

  paint(out);
  return out;
}

/* ── 摆出来 ─────────────────────────────────────────── */

let sizeJob = 0;

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
  el.count.textContent = `${state.body.replace(/\s/g, '').length} 字`;
  el.pages.textContent = `${n} 张`;
  el.hint.hidden = n > 0;
  el.save.disabled = n === 0;

  // 体积单独算：超过 500KB 微博会重新压一遍，得让人看得见
  const job = ++sizeJob;
  if (n) setTimeout(async () => {
    for (let i = 0; i < canvases.length; i++){
      const blob = await new Promise(r => canvases[i].toBlob(r, 'image/png'));
      if (job !== sizeJob) return;
      const tag = el.sheets.children[i]?.querySelector('.tag');
      if (!tag) return;
      const kb = Math.round(blob.size / 1024);
      tag.textContent = `${String(i + 1).padStart(2, '0')}   ${kb} KB`;
      tag.classList.toggle('over', blob.size > SAFE_BYTES);
    }
  }, 420);
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

const KEYS = [['#style','style',String],['#font','font',String],['#size','size',String],
              ['#height','height',Number],['#indent','indent',Number]];

function store(){
  try { localStorage.setItem('longpic', JSON.stringify(state)); } catch {}
}

function restore(){
  try { Object.assign(state, JSON.parse(localStorage.getItem('longpic') || '{}')); } catch {}
  if (!(state.height >= MIN_H)) state.height = 3200;      // 早先存的页高太矮，会被微博压
  if (!['masthead','band','oversize','vertical'].includes(state.style)) state.style = 'masthead';
  el.title.value = state.title;
  el.body.value  = state.body;
  el.sign.value  = state.sign;
  for (const [id, key] of KEYS){
    $(id)?.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(state[key]) === b.dataset.v));
  }
}

for (const [id, key, cast] of KEYS){
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
