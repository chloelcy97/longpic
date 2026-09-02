/* 长图 · 长微博排版
   排版全在 canvas 里做：先量字、断行、分页，再一张张画出来。

   页面尺寸不是随便定的。微博的规矩是：一边超过 1080、另一边不到 1080，
   且宽高比大于 2，就原样保留；否则把长边压到 1080。所以 1080×1440 会被
   压成 810×1080，字缩了两成半，看着就糊。这里出图一律 1080 宽、
   高度至少 2240（比 2.07），落在「不动」那一档里。
   剩下的只有文件体积：超过 500KB 会被转成 70% 质量的 JPG。 */

'use strict';

const W = 1080;                 // 出图宽度
// 疏密：一整套留白，行距、段距、边距一起动
const AIR = {
  tight: { lh:1.72, para:0.55, padX:84,  padTop:92,  padBottom:96 },
  mid  : { lh:1.85, para:0.75, padX:96,  padTop:112, padBottom:118 },
  loose: { lh:2.00, para:1.00, padX:110, padTop:138, padBottom:146 },
};
const MIN_H = 2240;             // 宽高比 2.07，刚过微博那道线
const SAFE_BYTES = 500 * 1024;  // 超过这个会被重新压

const SIZES = { s: 36, m: 41, l: 47 };

const FONTS = {
  song: '"Songti SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",serif',
  hei : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif',
};

// 白底。正文墨色偏暖，其余都是它的淡度
const C = { bg:'#FFFFFF', ink:'#141310', sub:'#A29C93', hair:'#DAD5CC', rule:'#C7C1B7', faint:'#E4DED4',
            red:'#C0402A' };

// 不能出现在行首 / 行尾的标点
const NO_HEAD = new Set('，。、；：？！）】》」』〉％,.;:?!)]}…—·”’');
const NO_TAIL = new Set('（【《「『〈([{“‘');

const state = {
  title:'', body:'', sign:'',
  font:'hei', size:'m', style:'redbar', height:4000, indent:1, air:'mid',
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

  const air = AIR[state.air] || AIR.mid;
  const m = {
    st, size, font,
    padX  : air.padX,
    padTop: air.padTop,
    padBottom: air.padBottom,
    maxW  : W - air.padX * 2,
    lh    : Math.round(size * air.lh),
    fSize : Math.round(size * 0.56),
    gap   : Math.round(size * (state.indent ? air.para * 0.55 : air.para)),
    indentW: state.indent ? size * 2 : 0,
  };
  m.footH = m.fSize + 40;

  // 标题：每种版式的字号和行距各不一样
  m.tSize = st === 'oversize' ? Math.round(size * 2.15) : Math.round(size * 1.56);
  m.tLh   = st === 'oversize' ? Math.round(m.tSize * 1.32) : Math.round(m.tSize * 1.46);
  return m;
}

function buildBlocks(m){
  const blocks = [];
  const title = state.title.trim();

  if (title){
    measurer.font = `600 ${m.tSize}px ${m.font}`;
    const lines = wrap(title, m.maxW, 0);
    const above = m.st === 'masthead' ? (state.sign.trim() ? m.fSize + 22 : 4)
                : m.st === 'redbar'  ? Math.round(m.size * 0.92) : 0;
    const below = m.st === 'oversize' ? Math.round(m.size * 1.85) : Math.round(m.size * 1.5);
    blocks.push({ kind:'title', style:m.st, lines, above,
                  h: above + lines.length * m.tLh + below });
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
  let page = [], y = m.padTop;
  const flush = () => { if (page.length) pages.push(page); page = []; y = m.padTop; };

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
  let end = m.padTop;
  for (const it of items){
    end = Math.max(end, it.kind === 'title' ? it.y + it.h - Math.round(m.size * 0.8) : it.y + m.lh);
  }
  return end;
}

function layout(){
  const m = metrics();
  const blocks = buildBlocks(m);
  if (!blocks.length) return { pages:[], m };

  const chrome = m.footH + m.padBottom;
  const roomMax = Math.max(MIN_H, state.height) - chrome;
  const n = paginate(blocks, m, roomMax).length;

  // 页数不变的前提下，每页少装一点 —— 这样几张的疏密才匀，
  // 不会第一张塞满、最后一张只剩两行。
  let lo = m.padTop + m.lh, hi = roomMax;
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

  // 富余的留白一律留在下面。往下推过内容，标题上面就空出一片，很难看
  return { pages, m };
}

/* ── 画 ─────────────────────────────────────────────── */

function drawLine(ctx, line, y, m){
  const gapW = line.avail - line.w;
  // 中间的行两端对齐，末行保持自然长度
  if (!line.last && line.toks.length > 1 && gapW > 0.5 && gapW < line.avail * 0.2){
    const extra = gapW / (line.toks.length - 1);
    let cx = m.padX + line.indent;
    for (const t of line.toks){ ctx.fillText(t, cx, y); cx += ctx.measureText(t).width + extra; }
  } else {
    ctx.fillText(line.toks.join(''), m.padX + line.indent, y);
  }
}

function drawTitle(ctx, it, m){
  const sign = state.sign.trim();

  const top = it.y + it.above;

  if (it.style === 'redbar'){
    ctx.fillStyle = C.red;
    ctx.fillRect(m.padX, it.y + 2, Math.round(m.size * 1.9), 4);
  }
  if (it.style === 'masthead'){
    if (sign){
      ctx.fillStyle = C.sub;
      ctx.font = `${m.fSize}px ${FONTS.hei}`;
      const w = ctx.measureText(sign).width;
      ctx.fillText(sign, m.padX + m.maxW - w, top - 16);
    }
    ctx.fillStyle = C.ink;
    ctx.fillRect(m.padX, top - 2, m.maxW, 2);
  }
  ctx.fillStyle = C.ink;
  ctx.font = `600 ${m.tSize}px ${m.font}`;
  it.lines.forEach((ln, i) => ctx.fillText(ln.toks.join(''), m.padX, top + m.tLh * (i + 0.8)));
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
    const fy = pg.h - m.padBottom + m.fSize * 0.4;
    const sign = state.sign.trim();
    if (sign && m.st !== 'masthead') ctx.fillText(sign, m.padX, fy);
    if (total > 1){
      const label = `${idx + 1} / ${total}`;
      ctx.fillText(label, W - m.padX - ctx.measureText(label).width, fy);
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
    tag.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><i></i>`;
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
      const { blob, ext } = await encode(canvases[i]);
      if (job !== sizeJob) return;
      const tag = el.sheets.children[i]?.querySelector('.tag');
      if (!tag) return;
      tag.querySelector('i').textContent = `${Math.round(blob.size / 1024)} KB · ${ext.toUpperCase()}`;
      tag.classList.toggle('over', blob.size > SAFE_BYTES);
    }
  }, 420);
}

/* ── 存 ─────────────────────────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));

// 文字图 PNG 通常最省，但页面一长就会超过 500KB —— 超了微博会拿 70% 质量
// 重压一遍，不如自己用高质量 JPG 压到线以下。
async function encode(cv){
  const png = await toBlob(cv, 'image/png');
  if (png.size <= SAFE_BYTES) return { blob:png, ext:'png' };
  for (const q of [0.94, 0.88, 0.8, 0.72]){
    const jpg = await toBlob(cv, 'image/jpeg', q);
    if (jpg.size <= SAFE_BYTES) return { blob:jpg, ext:'jpg' };
  }
  const jpg = await toBlob(cv, 'image/jpeg', 0.72);
  return jpg.size < png.size ? { blob:jpg, ext:'jpg' } : { blob:png, ext:'png' };
}

async function download(){
  const canvases = render();
  if (!canvases.length) return;
  const base = (state.title.trim() || '长图').replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  el.save.disabled = true;
  el.save.textContent = '正在导出…';

  for (let i = 0; i < canvases.length; i++){
    const { blob, ext } = await encode(canvases[i]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = canvases.length > 1 ? `${base}-${String(i + 1).padStart(2, '0')}.${ext}` : `${base}.${ext}`;
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
              ['#air','air',String],['#height','height',Number],['#indent','indent',Number]];

function store(){
  try { localStorage.setItem('longpic', JSON.stringify(state)); } catch {}
}

function restore(){
  try { Object.assign(state, JSON.parse(localStorage.getItem('longpic') || '{}')); } catch {}
  el.title.value = state.title;
  el.body.value  = state.body;
  el.sign.value  = state.sign;
  // 存过的选项可能已经不在了（比如早先那些会被微博压的页高），退回默认那颗
  for (const [id, key, cast] of KEYS){
    const btns = [...$(id).querySelectorAll('button')];
    const fallback = btns.find(b => b.classList.contains('on')) || btns[0];
    const hit = btns.find(b => b.dataset.v === String(state[key])) || fallback;
    state[key] = cast(hit.dataset.v);
    btns.forEach(b => b.classList.toggle('on', b === hit));
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

// 示例：哈姆雷特第三幕第一场。原文早已进入公有领域，中文是这里自己译的，
// 不用现成译本 —— 译本另有版权。
$('#demo').addEventListener('click', () => {
  state.title = '哈姆雷特';
  state.body = [
    '哈姆雷特　　生存，还是毁灭，问题就在这里。默默忍受命运的暴击，还是挺身而出，与无边的苦难对抗，把它们一举扫平——哪一样更高贵？',
    '死了；睡着了；就完了。要是睡一觉就能了结心头的创痛，了结这血肉之躯注定要承受的千百种煎熬，那正是求之不得的收场。',
    '死了；睡着了。睡着了也许还会做梦——难就难在这里。我们卸下这身皮囊之后，那一场长眠里会来些什么梦，不能不叫人踌躇。就是这一点顾虑，让苦难活得那样长久。',
    '否则谁愿意忍受人世的鞭挞与讥讽，压迫者的横暴，傲慢者的白眼，被轻慢的爱情的惨痛，法律的迁延，官吏的骄纵，还有小人一次次加在善良身上的欺凌？',
    '只消一把小刀，就可以把自己了结干净。谁愿意扛着这样的重担，在疲惫的生命里流汗呻吟——若不是怕死后还有些什么，怕那个从没有一个旅人回来过的国土。',
    '正是这份怯懦，让我们宁可忍受眼前的祸患，也不敢飞向那未知的痛苦。',
    '思虑使我们都成了懦夫。决心本来的血色，被顾虑涂上一层病白；多少轰轰烈烈的大事，就在这一转念之间失了势头，再也称不上行动。',
    '——且慢。美丽的奥菲莉娅！仙女，在你的祷告里，别忘了替我忏悔。',
    '奥菲莉娅　　殿下，这几天您安好吗？',
    '哈姆雷特　　多谢多谢，很好，很好，很好。',
    '奥菲莉娅　　殿下，我这里还留着几件您送的东西，早就想还给您了。请您现在收回吧。',
    '哈姆雷特　　不，我没有送过你什么。',
    '奥菲莉娅　　殿下，您分明送过；送的时候还有许多甜言蜜语，衬得这些东西格外贵重。如今香气散了，请您拿回去吧。送礼的人变了心，再厚的礼也就轻了。',
    '哈姆雷特　　哈哈！你贞洁吗？',
    '奥菲莉娅　　殿下！',
    '哈姆雷特　　你美丽吗？',
    '奥菲莉娅　　殿下是什么意思？',
    '哈姆雷特　　你要是既贞洁又美丽，那么你的贞洁最好不要跟你的美丽来往。',
  ].join('\n\n');
  el.title.value = state.title;
  el.body.value = state.body;
  schedule();
});

restore();
render();
