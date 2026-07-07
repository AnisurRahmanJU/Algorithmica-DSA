
/* =====================================================================
   ALGORITHMICA — DSA VISUALIZER CORE ENGINE
   ===================================================================== */

const LANGS = [
  {id:'javascript', label:'JavaScript'},
  {id:'python',     label:'Python'},
  {id:'java',       label:'Java'},
  {id:'cpp',        label:'C++'},
  {id:'c',          label:'C'},
  {id:'csharp',     label:'C#'}
];

/* ---------------------------------------------------------------------
   Tiny syntax highlighter (keyword / string / type / comment / function)
   Not a full parser -- just enough to make the code panel feel alive.
--------------------------------------------------------------------- */
const KEYWORDS = ['if','else','for','while','return','def','function','class','public','private',
  'static','void','int','float','double','char','bool','boolean','string','String','let','const','var',
  'new','struct','import','from','include','using','namespace','def','elif','end','then','do','break',
  'continue','switch','case','default','null','None','nullptr','True','False','true','false','self',
  'this','def','func','print','console','System','Console','template','typename','virtual','override',
  'in','range','len','size','push_back','pop_back','ArrayList','List','vector','ref','out','sizeof'];

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightLine(line){
  let esc = escapeHtml(line);
  // comments
  esc = esc.replace(/(\/\/.*$)/g, '<span class="cm">$1</span>');
  esc = esc.replace(/(#.*$)/g, function(m){
    if(m.indexOf('#include')===0) return m;
    return '<span class="cm">'+m+'</span>';
  });
  // strings
  esc = esc.replace(/(&quot;.*?&quot;|"[^"]*"|'[^']*')/g, '<span class="st">$1</span>');
  // numbers
  esc = esc.replace(/\b(\d+)\b/g, '<span class="nm">$1</span>');
  // keywords
  const kwPattern = new RegExp('\\b('+KEYWORDS.join('|')+')\\b','g');
  esc = esc.replace(kwPattern, '<span class="kw">$1</span>');
  return esc;
}

/* ---------------------------------------------------------------------
   Global application state
--------------------------------------------------------------------- */
const APP = {
  currentAlgo: null,
  currentCategory: null,
  steps: [],
  stepIndex: 0,
  playing: false,
  timer: null,
  speed: 5,
  lang: 'javascript',
  params: {}
};

function speedToMs(v){
  // v: 1 (slow) .. 10 (fast)
  return 1400 - (v*120);
}

/* ---------------------------------------------------------------------
   Sidebar construction
--------------------------------------------------------------------- */
function buildSidebar(){
  const host = document.getElementById('sidebar');
  host.innerHTML = '';
  Object.keys(ALGO_REGISTRY).forEach(function(catKey, idx){
    const cat = ALGO_REGISTRY[catKey];
    const catEl = document.createElement('div');
    catEl.className = 'cat' + (idx===0 ? ' open' : '');
    const head = document.createElement('div');
    head.className = 'cat-head';
    head.innerHTML = '<span>'+cat.label+'</span><span class="chev">▶</span>';
    head.onclick = function(){ catEl.classList.toggle('open'); };
    const body = document.createElement('div');
    body.className = 'cat-body';
    cat.items.forEach(function(item){
      const it = document.createElement('div');
      it.className = 'algo-item';
      it.dataset.cat = catKey;
      it.dataset.id = item.id;
      it.innerHTML = '<span>'+item.name+'</span><span class="tag">'+item.tagLabel+'</span>';
      it.onclick = function(){ selectAlgorithm(catKey, item.id); if(window.innerWidth<=980) closeSidebar(); };
      body.appendChild(it);
    });
    catEl.appendChild(head);
    catEl.appendChild(body);
    host.appendChild(catEl);
  });
}

function markActiveSidebar(catKey, id){
  document.querySelectorAll('.algo-item').forEach(function(el){
    el.classList.toggle('active', el.dataset.cat===catKey && el.dataset.id===id);
  });
}

/* ---------------------------------------------------------------------
   Language tabs + code panel rendering
--------------------------------------------------------------------- */
function buildLangTabs(){
  const host = document.getElementById('langTabs');
  host.innerHTML = '';
  LANGS.forEach(function(l){
    const t = document.createElement('div');
    t.className = 'lang-tab' + (l.id===APP.lang ? ' active' : '');
    t.textContent = l.label;
    t.dataset.lang = l.id;
    t.onclick = function(){
      APP.lang = l.id;
      document.querySelectorAll('.lang-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      renderCodePanel();
    };
    host.appendChild(t);
  });
}

function renderCodePanel(){
  const algo = APP.currentAlgo;
  const area = document.getElementById('codeArea');
  area.innerHTML = '';
  if(!algo){ return; }
  const codeStr = algo.code[APP.lang] || '';
  const lines = codeStr.replace(/^\n/,'').split('\n');
  const frag = document.createDocumentFragment();
  lines.forEach(function(ln, i){
    const row = document.createElement('div');
    row.className = 'code-line';
    row.dataset.line = (i+1);
    row.innerHTML = '<span class="ln">'+(i+1)+'</span><span class="code-text">'+highlightLine(ln)+'</span>';
    frag.appendChild(row);
  });
  area.appendChild(frag);
  highlightActiveLine();
}

function highlightActiveLine(){
  const algo = APP.currentAlgo;
  if(!algo) return;
  document.querySelectorAll('.code-line').forEach(function(el){ el.classList.remove('active'); });
  const step = APP.steps[APP.stepIndex];
  if(!step || !step.tag) return;
  const map = algo.lineTags[APP.lang];
  if(!map) return;
  const lineNo = map[step.tag];
  if(!lineNo) return;
  const el = document.querySelector('.code-line[data-line="'+lineNo+'"]');
  if(el){
    el.classList.add('active');
    el.scrollIntoView({block:'center', behavior:'smooth'});
  }
}

/* ---------------------------------------------------------------------
   Complexity + legend rendering
--------------------------------------------------------------------- */
function renderComplexity(algo){
  const row = document.getElementById('complexityRow');
  row.innerHTML =
    '<div class="complexity-chip">Best <b class="v">'+algo.complexity.best+'</b></div>'+
    '<div class="complexity-chip">Average <b class="v">'+algo.complexity.avg+'</b></div>'+
    '<div class="complexity-chip">Worst <b class="v">'+algo.complexity.worst+'</b></div>'+
    '<div class="complexity-chip">Space <b class="v">'+algo.complexity.space+'</b></div>';
  document.getElementById('algoTitle').innerHTML = algo.name + ' <span class="badge">'+algo.category+'</span>';
}

function renderLegend(items){
  const row = document.getElementById('legendRow');
  row.innerHTML = '';
  (items||[]).forEach(function(li){
    const d = document.createElement('div');
    d.className = 'li';
    d.innerHTML = '<span class="sw" style="background:'+li.color+'"></span>'+li.label;
    row.appendChild(d);
  });
}

/* ---------------------------------------------------------------------
   Generic renderers for each visualization "view" type
--------------------------------------------------------------------- */
function clearHost(){
  const host = document.getElementById('canvasHost');
  host.innerHTML = '';
  return host;
}

function renderBars(step){
  const host = clearHost();
  const row = document.createElement('div');
  row.className = 'bars-row';
  const maxVal = Math.max(...step.array, 1);
  step.array.forEach(function(v, idx){
    const bar = document.createElement('div');
    let cls = 'bar';
    if(step.sorted && step.sorted.includes(idx)) cls += ' sorted';
    if(step.found===idx) cls += ' found';
    if(step.pivot===idx) cls += ' pivot';
    if(step.i===idx) cls += ' i-ptr';
    if(step.j===idx) cls += ' j-ptr';
    if(step.k===idx) cls += ' k-ptr';
    bar.className = cls;
    bar.style.height = Math.max(18,(v/maxVal)*230)+'px';
    let ptrHtml = '';
    if(step.i===idx) ptrHtml += '<span class="ptr">i</span>';
    if(step.j===idx) ptrHtml += '<span class="ptr">j</span>';
    if(step.k===idx) ptrHtml += '<span class="ptr">k</span>';
    bar.innerHTML = ptrHtml + '<span class="val">'+v+'</span>';
    row.appendChild(bar);
  });
  host.appendChild(row);
}

function renderStack(step){
  const host = clearHost();
  if(step.array.length===0){
    host.innerHTML = '<div class="empty-hint">Stack is empty</div>';
    return;
  }
  const col = document.createElement('div');
  col.className = 'stack-col';
  step.array.forEach(function(v, idx){
    const box = document.createElement('div');
    box.className = 'dsbox' + (idx===step.array.length-1 ? ' top' : '');
    box.textContent = v;
    col.appendChild(box);
  });
  host.appendChild(col);
}

function renderQueue(step){
  const host = clearHost();
  if(step.array.length===0){
    host.innerHTML = '<div class="empty-hint">Queue is empty</div>';
    return;
  }
  const row = document.createElement('div');
  row.className = 'queue-row';
  step.array.forEach(function(v, idx){
    const box = document.createElement('div');
    let cls = 'dsbox';
    if(idx===0) cls += ' front';
    if(idx===step.array.length-1) cls += ' rear';
    box.className = cls;
    box.textContent = v;
    row.appendChild(box);
  });
  host.appendChild(row);
}

function renderLinkedList(step){
  const host = clearHost();
  if(step.array.length===0){
    host.innerHTML = '<div class="empty-hint">List is empty (head → NULL)</div>';
    return;
  }
  const row = document.createElement('div');
  row.className = 'll-row';
  step.array.forEach(function(v, idx){
    const node = document.createElement('div');
    let cls = 'll-node';
    if(step.active===idx) cls += ' active';
    if(step.newNode===idx) cls += ' new';
    node.className = cls;
    node.innerHTML = '<span class="val">'+v+'</span><span class="nxt">next</span>';
    row.appendChild(node);
    if(idx < step.array.length-1){
      const arrow = document.createElement('div');
      arrow.className = 'll-arrow';
      arrow.textContent = '→';
      row.appendChild(arrow);
    }
  });
  const nullEl = document.createElement('div');
  nullEl.className = 'll-null';
  nullEl.textContent = '→ NULL';
  row.appendChild(nullEl);
  host.appendChild(row);
}

/* Binary tree renderer: expects step.tree = {nodes:[{id,val,x,y,left,right}], activeId, visitedIds:[]} */
function renderTree(step){
  const host = clearHost();
  const W = 640, H = 320;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('class','dstruct');
  const nodes = step.tree.nodes;
  const byId = {};
  nodes.forEach(n=>byId[n.id]=n);
  nodes.forEach(function(n){
    [n.left,n.right].forEach(function(childId){
      if(childId===null || childId===undefined) return;
      const c = byId[childId];
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',n.x); line.setAttribute('y1',n.y);
      line.setAttribute('x2',c.x); line.setAttribute('y2',c.y);
      line.setAttribute('class','edge-line');
      svg.appendChild(line);
    });
  });
  nodes.forEach(function(n){
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circ.setAttribute('cx',n.x); circ.setAttribute('cy',n.y); circ.setAttribute('r',20);
    let cls = 'node-circle';
    if(step.tree.visitedIds && step.tree.visitedIds.includes(n.id)) cls += ' visited';
    if(step.tree.activeId===n.id) cls += ' active';
    circ.setAttribute('class',cls);
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x',n.x); text.setAttribute('y',n.y+5);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('class','node-text');
    text.textContent = n.val;
    g.appendChild(circ); g.appendChild(text);
    svg.appendChild(g);
  });
  host.appendChild(svg);
}

/* Graph renderer: step.graph = {nodes:[{id,label,x,y}], edges:[{a,b}], activeId, visited:[], frontier:[]} */
function renderGraph(step){
  const host = clearHost();
  const W = 640, H = 320;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('class','dstruct');
  const byId = {};
  step.graph.nodes.forEach(n=>byId[n.id]=n);
  step.graph.edges.forEach(function(e){
    const a = byId[e.a], b = byId[e.b];
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
    line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
    let cls = 'edge-line';
    if(step.activeEdge && ((step.activeEdge.a===e.a && step.activeEdge.b===e.b)||(step.activeEdge.a===e.b && step.activeEdge.b===e.a))) cls += ' active';
    line.setAttribute('class',cls);
    svg.appendChild(line);
  });
  step.graph.nodes.forEach(function(n){
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circ.setAttribute('cx',n.x); circ.setAttribute('cy',n.y); circ.setAttribute('r',20);
    let cls = 'node-circle';
    if(step.graph.visited && step.graph.visited.includes(n.id)) cls += ' visited';
    if(step.graph.frontier && step.graph.frontier.includes(n.id)) cls += ' frontier';
    if(step.graph.activeId===n.id) cls += ' active';
    circ.setAttribute('class',cls);
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x',n.x); text.setAttribute('y',n.y+5);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('class','node-text');
    text.textContent = n.label;
    g.appendChild(circ); g.appendChild(text);
    svg.appendChild(g);
  });
  host.appendChild(svg);
}

/* DP 1D array (fibonacci) */
function renderDPArray(step){
  const host = clearHost();
  const row = document.createElement('div');
  row.className = 'bars-row';
  row.style.paddingBottom = '0';
  row.style.alignItems = 'center';
  step.array.forEach(function(v, idx){
    const box = document.createElement('div');
    let cls = 'dsbox';
    if(step.i===idx) cls += ' top';
    box.className = cls;
    box.style.minWidth = '54px';
    box.textContent = (v===null || v===undefined) ? '·' : v;
    row.appendChild(box);
  });
  host.appendChild(row);
}

/* DP 2D grid (knapsack / LCS) */
function renderDPGrid(step){
  const host = clearHost();
  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  table.style.fontFamily = "'JetBrains Mono',monospace";
  table.style.fontSize = '12px';
  const grid = step.grid;
  grid.forEach(function(rowArr, r){
    const tr = document.createElement('tr');
    rowArr.forEach(function(cell, c){
      const td = document.createElement('td');
      td.style.border = '1px solid var(--line)';
      td.style.width = '36px';
      td.style.height = '30px';
      td.style.textAlign = 'center';
      td.style.color = 'var(--ink)';
      td.textContent = (cell===null||cell===undefined) ? '' : cell;
      if(step.activeCell && step.activeCell[0]===r && step.activeCell[1]===c){
        td.style.background = 'rgba(255,180,84,0.25)';
        td.style.border = '1px solid var(--amber)';
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  host.appendChild(table);
}

const RENDERERS = {
  bars: renderBars,
  stack: renderStack,
  queue: renderQueue,
  linkedlist: renderLinkedList,
  tree: renderTree,
  graph: renderGraph,
  dparray: renderDPArray,
  dpgrid: renderDPGrid
};

/* ---------------------------------------------------------------------
   Step engine controls
--------------------------------------------------------------------- */
function renderStep(){
  const algo = APP.currentAlgo;
  if(!algo || APP.steps.length===0) return;
  const step = APP.steps[APP.stepIndex];
  RENDERERS[step.view](step);
  document.getElementById('stepNo').textContent = (APP.stepIndex+1)+' / '+APP.steps.length;
  document.getElementById('stepDesc').innerHTML = step.desc || '';
  highlightActiveLine();
  document.getElementById('btnPrev').disabled = APP.stepIndex===0;
  document.getElementById('btnStep').disabled = APP.stepIndex>=APP.steps.length-1;
}

function stepForward(){
  if(APP.stepIndex < APP.steps.length-1){
    APP.stepIndex++;
    renderStep();
  } else {
    pausePlay();
  }
}
function stepBackward(){
  if(APP.stepIndex>0){
    APP.stepIndex--;
    renderStep();
  }
}
function playPause(){
  if(APP.playing){ pausePlay(); } else { startPlay(); }
}
function startPlay(){
  if(APP.stepIndex>=APP.steps.length-1) APP.stepIndex=0;
  APP.playing = true;
  document.getElementById('btnPlay').textContent = '⏸ Pause';
  clearInterval(APP.timer);
  APP.timer = setInterval(function(){
    if(APP.stepIndex>=APP.steps.length-1){ pausePlay(); return; }
    stepForward();
  }, speedToMs(APP.speed));
}
function pausePlay(){
  APP.playing = false;
  document.getElementById('btnPlay').textContent = '▶ Play';
  clearInterval(APP.timer);
}
function resetPlay(){
  pausePlay();
  APP.stepIndex = 0;
  renderStep();
}

/* =====================================================================
   SORTING ALGORITHMS
   ===================================================================== */

function bubbleSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  const n = a.length;
  const sorted = [];
  steps.push({view:'bars', array:a.slice(), sorted:sorted.slice(), tag:'start', desc:'Starting <b>Bubble Sort</b> on the array.'});
  for(let i=0;i<n-1;i++){
    for(let j=0;j<n-i-1;j++){
      steps.push({view:'bars', array:a.slice(), i:j, j:j+1, sorted:sorted.slice(), tag:'compare',
        desc:'Comparing <b>a['+j+']='+a[j]+'</b> with <b>a['+(j+1)+']='+a[j+1]+'</b>.'});
      if(a[j] > a[j+1]){
        const t=a[j]; a[j]=a[j+1]; a[j+1]=t;
        steps.push({view:'bars', array:a.slice(), i:j, j:j+1, sorted:sorted.slice(), tag:'swap',
          desc:'<b>'+a[j+1]+' &gt; '+a[j]+'</b> → swapped positions '+j+' and '+(j+1)+'.'});
      }
    }
    sorted.unshift(n-1-i);
    steps.push({view:'bars', array:a.slice(), sorted:sorted.slice(), tag:'markSorted',
      desc:'Largest remaining element bubbled to index <b>'+(n-1-i)+'</b>.'});
  }
  sorted.unshift(0);
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

function selectionSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  const n = a.length;
  const sorted = [];
  steps.push({view:'bars', array:a.slice(), sorted:[], tag:'start', desc:'Starting <b>Selection Sort</b>.'});
  for(let i=0;i<n-1;i++){
    let minIdx = i;
    steps.push({view:'bars', array:a.slice(), i:i, sorted:sorted.slice(), tag:'outerLoop',
      desc:'Assume index <b>'+i+'</b> holds the minimum so far.'});
    for(let j=i+1;j<n;j++){
      steps.push({view:'bars', array:a.slice(), i:minIdx, j:j, sorted:sorted.slice(), tag:'compare',
        desc:'Comparing current min <b>a['+minIdx+']='+a[minIdx]+'</b> with <b>a['+j+']='+a[j]+'</b>.'});
      if(a[j] < a[minIdx]){
        minIdx = j;
        steps.push({view:'bars', array:a.slice(), i:minIdx, j:j, sorted:sorted.slice(), tag:'newMin',
          desc:'New minimum found at index <b>'+minIdx+'</b>.'});
      }
    }
    if(minIdx!==i){
      const t=a[i]; a[i]=a[minIdx]; a[minIdx]=t;
      steps.push({view:'bars', array:a.slice(), i:i, j:minIdx, sorted:sorted.slice(), tag:'swap',
        desc:'Swapping index <b>'+i+'</b> with minimum found at <b>'+minIdx+'</b>.'});
    }
    sorted.push(i);
    steps.push({view:'bars', array:a.slice(), sorted:sorted.slice(), tag:'markSorted',
      desc:'Index <b>'+i+'</b> is now in its final sorted position.'});
  }
  sorted.push(n-1);
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

function insertionSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  const n = a.length;
  steps.push({view:'bars', array:a.slice(), sorted:[0], tag:'start', desc:'Starting <b>Insertion Sort</b>. First element is trivially sorted.'});
  for(let i=1;i<n;i++){
    let key = a[i];
    let j = i-1;
    steps.push({view:'bars', array:a.slice(), i:i, sorted:Array.from({length:i},(_,k)=>k), tag:'pickKey',
      desc:'Picking element <b>a['+i+']='+key+'</b> to insert into the sorted portion.'});
    while(j>=0 && a[j] > key){
      steps.push({view:'bars', array:a.slice(), i:j, j:j+1, sorted:Array.from({length:i},(_,k)=>k), tag:'shift',
        desc:'<b>'+a[j]+' &gt; '+key+'</b> → shifting it one position right.'});
      a[j+1] = a[j];
      j--;
    }
    a[j+1] = key;
    steps.push({view:'bars', array:a.slice(), i:j+1, sorted:Array.from({length:i+1},(_,k)=>k), tag:'place',
      desc:'Inserted <b>'+key+'</b> at index <b>'+(j+1)+'</b>.'});
  }
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

function mergeSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  steps.push({view:'bars', array:a.slice(), tag:'start', desc:'Starting <b>Merge Sort</b> — divide and conquer.'});
  function merge(lo, mid, hi){
    const left = a.slice(lo, mid+1);
    const right = a.slice(mid+1, hi+1);
    let i=0,j=0,k=lo;
    steps.push({view:'bars', array:a.slice(), i:lo, j:hi, tag:'split',
      desc:'Merging sub-arrays <b>['+lo+'..'+mid+']</b> and <b>['+(mid+1)+'..'+hi+']</b>.'});
    while(i<left.length && j<right.length){
      steps.push({view:'bars', array:a.slice(), i:lo+i, j:mid+1+j, tag:'compareMerge',
        desc:'Comparing <b>'+left[i]+'</b> and <b>'+right[j]+'</b>.'});
      if(left[i] <= right[j]){ a[k]=left[i]; i++; } else { a[k]=right[j]; j++; }
      steps.push({view:'bars', array:a.slice(), k:k, tag:'placeMerge', desc:'Placed <b>'+a[k]+'</b> at index <b>'+k+'</b>.'});
      k++;
    }
    while(i<left.length){ a[k]=left[i]; steps.push({view:'bars', array:a.slice(), k:k, tag:'copyBack', desc:'Copying remaining left element <b>'+a[k]+'</b>.'}); i++;k++; }
    while(j<right.length){ a[k]=right[j]; steps.push({view:'bars', array:a.slice(), k:k, tag:'copyBack', desc:'Copying remaining right element <b>'+a[k]+'</b>.'}); j++;k++; }
  }
  function sort(lo, hi){
    if(lo>=hi) return;
    const mid = Math.floor((lo+hi)/2);
    sort(lo,mid);
    sort(mid+1,hi);
    merge(lo,mid,hi);
  }
  sort(0, a.length-1);
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

function quickSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  steps.push({view:'bars', array:a.slice(), tag:'start', desc:'Starting <b>Quick Sort</b> — partition around a pivot.'});
  function partition(lo, hi){
    const pivot = a[hi];
    steps.push({view:'bars', array:a.slice(), pivot:hi, tag:'choosePivot', desc:'Chosen pivot <b>a['+hi+']='+pivot+'</b>.'});
    let i = lo-1;
    for(let j=lo;j<hi;j++){
      steps.push({view:'bars', array:a.slice(), pivot:hi, j:j, tag:'compare',
        desc:'Comparing <b>a['+j+']='+a[j]+'</b> with pivot <b>'+pivot+'</b>.'});
      if(a[j] < pivot){
        i++;
        const t=a[i]; a[i]=a[j]; a[j]=t;
        steps.push({view:'bars', array:a.slice(), pivot:hi, i:i, j:j, tag:'swap', desc:'Swapping index <b>'+i+'</b> and <b>'+j+'</b>.'});
      }
    }
    const t=a[i+1]; a[i+1]=a[hi]; a[hi]=t;
    steps.push({view:'bars', array:a.slice(), i:i+1, tag:'placePivot', desc:'Placing pivot in its correct sorted position <b>'+(i+1)+'</b>.'});
    return i+1;
  }
  function sort(lo, hi){
    if(lo<hi){
      const p = partition(lo,hi);
      sort(lo,p-1);
      sort(p+1,hi);
    }
  }
  sort(0, a.length-1);
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

function heapSortSteps(arr){
  const a = arr.slice();
  const steps = [];
  const n = a.length;
  steps.push({view:'bars', array:a.slice(), tag:'start', desc:'Starting <b>Heap Sort</b> — build a max-heap first.'});
  function heapify(size, root){
    let largest = root, l=2*root+1, r=2*root+2;
    steps.push({view:'bars', array:a.slice(), i:root, tag:'heapify', desc:'Heapifying at root index <b>'+root+'</b>.'});
    if(l<size){
      steps.push({view:'bars', array:a.slice(), i:largest, j:l, tag:'compare', desc:'Comparing left child <b>a['+l+']='+a[l]+'</b>.'});
      if(a[l] > a[largest]) largest=l;
    }
    if(r<size){
      steps.push({view:'bars', array:a.slice(), i:largest, j:r, tag:'compare', desc:'Comparing right child <b>a['+r+']='+a[r]+'</b>.'});
      if(a[r] > a[largest]) largest=r;
    }
    if(largest!==root){
      const t=a[root]; a[root]=a[largest]; a[largest]=t;
      steps.push({view:'bars', array:a.slice(), i:root, j:largest, tag:'swap', desc:'Swapping index <b>'+root+'</b> and <b>'+largest+'</b>.'});
      heapify(size, largest);
    }
  }
  for(let i=Math.floor(n/2)-1;i>=0;i--) heapify(n,i);
  steps.push({view:'bars', array:a.slice(), tag:'built', desc:'Max-heap built. Largest element is now at the root.'});
  const sorted=[];
  for(let i=n-1;i>0;i--){
    const t=a[0]; a[0]=a[i]; a[i]=t;
    sorted.unshift(i);
    steps.push({view:'bars', array:a.slice(), sorted:sorted.slice(), tag:'extractMax', desc:'Moved max element to index <b>'+i+'</b>.'});
    heapify(i,0);
  }
  sorted.unshift(0);
  steps.push({view:'bars', array:a.slice(), sorted:a.map((_,i)=>i), tag:'done', desc:'<b>Array fully sorted!</b>'});
  return steps;
}

/* ---------------- CODE TEXT BLOCKS: BUBBLE SORT ---------------- */
const CODE_BUBBLE = {
javascript:
`function bubbleSort(arr) {
  let n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}`,
python:
`def bubble_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr`,
java:
`static void bubbleSort(int[] arr) {
    int n = arr.length;
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,
cpp:
`void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,
c:
`void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`,
csharp:
`static void BubbleSort(int[] arr) {
    int n = arr.Length;
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}`
};
const LINES_BUBBLE = {
javascript:{start:2, compare:5, swap:7, markSorted:3, done:12},
python:{start:2, compare:5, swap:6, markSorted:3, done:7},
java:{start:2, compare:5, swap:7, markSorted:3, done:1},
cpp:{start:2, compare:5, swap:7, markSorted:3, done:1},
c:{start:1, compare:4, swap:6, markSorted:2, done:1},
csharp:{start:2, compare:5, swap:7, markSorted:3, done:1}
};

/* ---------------- CODE TEXT BLOCKS: SELECTION SORT ---------------- */
const CODE_SELECTION = {
javascript:
`function selectionSort(arr) {
  let n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    for (let j = i + 1; j < n; j++) {
      if (arr[j] < arr[minIdx]) {
        minIdx = j;
      }
    }
    let temp = arr[i];
    arr[i] = arr[minIdx];
    arr[minIdx] = temp;
  }
  return arr;
}`,
python:
`def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr`,
java:
`static void selectionSort(int[] arr) {
    int n = arr.length;
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int temp = arr[i];
        arr[i] = arr[minIdx];
        arr[minIdx] = temp;
    }
}`,
cpp:
`void selectionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int temp = arr[i];
        arr[i] = arr[minIdx];
        arr[minIdx] = temp;
    }
}`,
c:
`void selectionSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int temp = arr[i];
        arr[i] = arr[minIdx];
        arr[minIdx] = temp;
    }
}`,
csharp:
`static void SelectionSort(int[] arr) {
    int n = arr.Length;
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int temp = arr[i];
        arr[i] = arr[minIdx];
        arr[minIdx] = temp;
    }
}`
};
const LINES_SELECTION = {
javascript:{start:2, outerLoop:4, compare:6, newMin:7, swap:10, markSorted:3, done:14},
python:{start:2, outerLoop:4, compare:6, newMin:7, swap:8, markSorted:3, done:9},
java:{start:2, outerLoop:4, compare:6, newMin:7, swap:10, markSorted:3, done:1},
cpp:{start:2, outerLoop:4, compare:6, newMin:7, swap:10, markSorted:3, done:1},
c:{start:1, outerLoop:2, compare:4, newMin:5, swap:8, markSorted:2, done:1},
csharp:{start:2, outerLoop:4, compare:6, newMin:7, swap:10, markSorted:3, done:1}
};

/* ---------------- CODE TEXT BLOCKS: INSERTION SORT ---------------- */
const CODE_INSERTION = {
javascript:
`function insertionSort(arr) {
  let n = arr.length;
  for (let i = 1; i < n; i++) {
    let key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j = j - 1;
    }
    arr[j + 1] = key;
  }
  return arr;
}`,
python:
`def insertion_sort(arr):
    n = len(arr)
    for i in range(1, n):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr`,
java:
`static void insertionSort(int[] arr) {
    int n = arr.length;
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j = j - 1;
        }
        arr[j + 1] = key;
    }
}`,
cpp:
`void insertionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j = j - 1;
        }
        arr[j + 1] = key;
    }
}`,
c:
`void insertionSort(int arr[], int n) {
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j = j - 1;
        }
        arr[j + 1] = key;
    }
}`,
csharp:
`static void InsertionSort(int[] arr) {
    int n = arr.Length;
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j = j - 1;
        }
        arr[j + 1] = key;
    }
}`
};
const LINES_INSERTION = {
javascript:{start:2, pickKey:4, shift:7, place:10, done:12},
python:{start:2, pickKey:4, shift:7, place:9, done:10},
java:{start:2, pickKey:4, shift:7, place:10, done:1},
cpp:{start:2, pickKey:4, shift:7, place:10, done:1},
c:{start:1, pickKey:3, shift:6, place:9, done:1},
csharp:{start:2, pickKey:4, shift:7, place:10, done:1}
};

/* ---------------- CODE TEXT BLOCKS: MERGE SORT ---------------- */
const CODE_MERGE = {
javascript:
`function mergeSort(arr, lo, hi) {
  if (lo >= hi) return;
  let mid = Math.floor((lo + hi) / 2);
  mergeSort(arr, lo, mid);
  mergeSort(arr, mid + 1, hi);
  merge(arr, lo, mid, hi);
}
function merge(arr, lo, mid, hi) {
  let left = arr.slice(lo, mid + 1);
  let right = arr.slice(mid + 1, hi + 1);
  let i = 0, j = 0, k = lo;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) arr[k++] = left[i++];
    else arr[k++] = right[j++];
  }
  while (i < left.length) arr[k++] = left[i++];
  while (j < right.length) arr[k++] = right[j++];
}`,
python:
`def merge_sort(arr, lo, hi):
    if lo >= hi:
        return
    mid = (lo + hi) // 2
    merge_sort(arr, lo, mid)
    merge_sort(arr, mid + 1, hi)
    merge(arr, lo, mid, hi)

def merge(arr, lo, mid, hi):
    left = arr[lo:mid + 1]
    right = arr[mid + 1:hi + 1]
    i = j = 0
    k = lo
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            arr[k] = left[i]; i += 1
        else:
            arr[k] = right[j]; j += 1
        k += 1
    while i < len(left):
        arr[k] = left[i]; i += 1; k += 1
    while j < len(right):
        arr[k] = right[j]; j += 1; k += 1`,
java:
`static void mergeSort(int[] arr, int lo, int hi) {
    if (lo >= hi) return;
    int mid = (lo + hi) / 2;
    mergeSort(arr, lo, mid);
    mergeSort(arr, mid + 1, hi);
    merge(arr, lo, mid, hi);
}
static void merge(int[] arr, int lo, int mid, int hi) {
    int[] left = Arrays.copyOfRange(arr, lo, mid + 1);
    int[] right = Arrays.copyOfRange(arr, mid + 1, hi + 1);
    int i = 0, j = 0, k = lo;
    while (i < left.length && j < right.length) {
        if (left[i] <= right[j]) arr[k++] = left[i++];
        else arr[k++] = right[j++];
    }
    while (i < left.length) arr[k++] = left[i++];
    while (j < right.length) arr[k++] = right[j++];
}`,
cpp:
`void merge(vector<int>& arr, int lo, int mid, int hi) {
    vector<int> left(arr.begin()+lo, arr.begin()+mid+1);
    vector<int> right(arr.begin()+mid+1, arr.begin()+hi+1);
    int i=0, j=0, k=lo;
    while (i<left.size() && j<right.size()) {
        if (left[i] <= right[j]) arr[k++] = left[i++];
        else arr[k++] = right[j++];
    }
    while (i<left.size()) arr[k++] = left[i++];
    while (j<right.size()) arr[k++] = right[j++];
}
void mergeSort(vector<int>& arr, int lo, int hi) {
    if (lo >= hi) return;
    int mid = (lo + hi) / 2;
    mergeSort(arr, lo, mid);
    mergeSort(arr, mid + 1, hi);
    merge(arr, lo, mid, hi);
}`,
c:
`void merge(int arr[], int lo, int mid, int hi) {
    int n1 = mid - lo + 1, n2 = hi - mid;
    int left[50], right[50];
    for (int x = 0; x < n1; x++) left[x] = arr[lo + x];
    for (int x = 0; x < n2; x++) right[x] = arr[mid + 1 + x];
    int i = 0, j = 0, k = lo;
    while (i < n1 && j < n2) {
        if (left[i] <= right[j]) arr[k++] = left[i++];
        else arr[k++] = right[j++];
    }
    while (i < n1) arr[k++] = left[i++];
    while (j < n2) arr[k++] = right[j++];
}
void mergeSort(int arr[], int lo, int hi) {
    if (lo >= hi) return;
    int mid = (lo + hi) / 2;
    mergeSort(arr, lo, mid);
    mergeSort(arr, mid + 1, hi);
    merge(arr, lo, mid, hi);
}`,
csharp:
`static void Merge(int[] arr, int lo, int mid, int hi) {
    int[] left = arr[lo..(mid + 1)];
    int[] right = arr[(mid + 1)..(hi + 1)];
    int i = 0, j = 0, k = lo;
    while (i < left.Length && j < right.Length) {
        if (left[i] <= right[j]) arr[k++] = left[i++];
        else arr[k++] = right[j++];
    }
    while (i < left.Length) arr[k++] = left[i++];
    while (j < right.Length) arr[k++] = right[j++];
}
static void MergeSort(int[] arr, int lo, int hi) {
    if (lo >= hi) return;
    int mid = (lo + hi) / 2;
    MergeSort(arr, lo, mid);
    MergeSort(arr, mid + 1, hi);
    Merge(arr, lo, mid, hi);
}`
};
const LINES_MERGE = {
javascript:{start:1, split:8, compareMerge:13, placeMerge:13, copyBack:16, done:1},
python:{start:1, split:9, compareMerge:14, placeMerge:15, copyBack:20, done:1},
java:{start:1, split:8, compareMerge:13, placeMerge:13, copyBack:16, done:1},
cpp:{start:12, split:1, compareMerge:6, placeMerge:6, copyBack:9, done:1},
c:{start:14, split:1, compareMerge:7, placeMerge:7, copyBack:10, done:1},
csharp:{start:11, split:1, compareMerge:6, placeMerge:6, copyBack:9, done:1}
};

/* ---------------- CODE TEXT BLOCKS: QUICK SORT ---------------- */
const CODE_QUICK = {
javascript:
`function quickSort(arr, lo, hi) {
  if (lo < hi) {
    let p = partition(arr, lo, hi);
    quickSort(arr, lo, p - 1);
    quickSort(arr, p + 1, hi);
  }
}
function partition(arr, lo, hi) {
  let pivot = arr[hi];
  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {
      i++;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  [arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]];
  return i + 1;
}`,
python:
`def quick_sort(arr, lo, hi):
    if lo < hi:
        p = partition(arr, lo, hi)
        quick_sort(arr, lo, p - 1)
        quick_sort(arr, p + 1, hi)

def partition(arr, lo, hi):
    pivot = arr[hi]
    i = lo - 1
    for j in range(lo, hi):
        if arr[j] < pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i + 1], arr[hi] = arr[hi], arr[i + 1]
    return i + 1`,
java:
`static void quickSort(int[] arr, int lo, int hi) {
    if (lo < hi) {
        int p = partition(arr, lo, hi);
        quickSort(arr, lo, p - 1);
        quickSort(arr, p + 1, hi);
    }
}
static int partition(int[] arr, int lo, int hi) {
    int pivot = arr[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (arr[j] < pivot) {
            i++;
            int t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
    }
    int t = arr[i + 1]; arr[i + 1] = arr[hi]; arr[hi] = t;
    return i + 1;
}`,
cpp:
`int partition(vector<int>& arr, int lo, int hi) {
    int pivot = arr[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(arr[i], arr[j]);
        }
    }
    swap(arr[i + 1], arr[hi]);
    return i + 1;
}
void quickSort(vector<int>& arr, int lo, int hi) {
    if (lo < hi) {
        int p = partition(arr, lo, hi);
        quickSort(arr, lo, p - 1);
        quickSort(arr, p + 1, hi);
    }
}`,
c:
`int partition(int arr[], int lo, int hi) {
    int pivot = arr[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (arr[j] < pivot) {
            i++;
            int t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
    }
    int t = arr[i + 1]; arr[i + 1] = arr[hi]; arr[hi] = t;
    return i + 1;
}
void quickSort(int arr[], int lo, int hi) {
    if (lo < hi) {
        int p = partition(arr, lo, hi);
        quickSort(arr, lo, p - 1);
        quickSort(arr, p + 1, hi);
    }
}`,
csharp:
`static int Partition(int[] arr, int lo, int hi) {
    int pivot = arr[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (arr[j] < pivot) {
            i++;
            int t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
    }
    int t2 = arr[i + 1]; arr[i + 1] = arr[hi]; arr[hi] = t2;
    return i + 1;
}
static void QuickSort(int[] arr, int lo, int hi) {
    if (lo < hi) {
        int p = Partition(arr, lo, hi);
        QuickSort(arr, lo, p - 1);
        QuickSort(arr, p + 1, hi);
    }
}`
};
const LINES_QUICK = {
javascript:{start:1, choosePivot:9, compare:11, swap:14, placePivot:17, done:1},
python:{start:1, choosePivot:8, compare:10, swap:12, placePivot:14, done:1},
java:{start:1, choosePivot:9, compare:11, swap:14, placePivot:16, done:1},
cpp:{start:12, choosePivot:2, compare:4, swap:6, placePivot:9, done:1},
c:{start:13, choosePivot:2, compare:4, swap:6, placePivot:9, done:1},
csharp:{start:13, choosePivot:2, compare:4, swap:6, placePivot:9, done:1}
};

/* ---------------- CODE TEXT BLOCKS: HEAP SORT ---------------- */
const CODE_HEAP = {
javascript:
`function heapify(arr, size, root) {
  let largest = root, l = 2*root+1, r = 2*root+2;
  if (l < size && arr[l] > arr[largest]) largest = l;
  if (r < size && arr[r] > arr[largest]) largest = r;
  if (largest !== root) {
    [arr[root], arr[largest]] = [arr[largest], arr[root]];
    heapify(arr, size, largest);
  }
}
function heapSort(arr) {
  let n = arr.length;
  for (let i = Math.floor(n/2)-1; i >= 0; i--) heapify(arr, n, i);
  for (let i = n-1; i > 0; i--) {
    [arr[0], arr[i]] = [arr[i], arr[0]];
    heapify(arr, i, 0);
  }
}`,
python:
`def heapify(arr, size, root):
    largest = root
    l, r = 2*root+1, 2*root+2
    if l < size and arr[l] > arr[largest]:
        largest = l
    if r < size and arr[r] > arr[largest]:
        largest = r
    if largest != root:
        arr[root], arr[largest] = arr[largest], arr[root]
        heapify(arr, size, largest)

def heap_sort(arr):
    n = len(arr)
    for i in range(n//2 - 1, -1, -1):
        heapify(arr, n, i)
    for i in range(n - 1, 0, -1):
        arr[0], arr[i] = arr[i], arr[0]
        heapify(arr, i, 0)`,
java:
`static void heapify(int[] arr, int size, int root) {
    int largest = root, l = 2*root+1, r = 2*root+2;
    if (l < size && arr[l] > arr[largest]) largest = l;
    if (r < size && arr[r] > arr[largest]) largest = r;
    if (largest != root) {
        int t = arr[root]; arr[root] = arr[largest]; arr[largest] = t;
        heapify(arr, size, largest);
    }
}
static void heapSort(int[] arr) {
    int n = arr.length;
    for (int i = n/2 - 1; i >= 0; i--) heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        int t = arr[0]; arr[0] = arr[i]; arr[i] = t;
        heapify(arr, i, 0);
    }
}`,
cpp:
`void heapify(vector<int>& arr, int size, int root) {
    int largest = root, l = 2*root+1, r = 2*root+2;
    if (l < size && arr[l] > arr[largest]) largest = l;
    if (r < size && arr[r] > arr[largest]) largest = r;
    if (largest != root) {
        swap(arr[root], arr[largest]);
        heapify(arr, size, largest);
    }
}
void heapSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = n/2 - 1; i >= 0; i--) heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        swap(arr[0], arr[i]);
        heapify(arr, i, 0);
    }
}`,
c:
`void heapify(int arr[], int size, int root) {
    int largest = root, l = 2*root+1, r = 2*root+2;
    if (l < size && arr[l] > arr[largest]) largest = l;
    if (r < size && arr[r] > arr[largest]) largest = r;
    if (largest != root) {
        int t = arr[root]; arr[root] = arr[largest]; arr[largest] = t;
        heapify(arr, size, largest);
    }
}
void heapSort(int arr[], int n) {
    for (int i = n/2 - 1; i >= 0; i--) heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        int t = arr[0]; arr[0] = arr[i]; arr[i] = t;
        heapify(arr, i, 0);
    }
}`,
csharp:
`static void Heapify(int[] arr, int size, int root) {
    int largest = root, l = 2*root+1, r = 2*root+2;
    if (l < size && arr[l] > arr[largest]) largest = l;
    if (r < size && arr[r] > arr[largest]) largest = r;
    if (largest != root) {
        int t = arr[root]; arr[root] = arr[largest]; arr[largest] = t;
        Heapify(arr, size, largest);
    }
}
static void HeapSort(int[] arr) {
    int n = arr.Length;
    for (int i = n/2 - 1; i >= 0; i--) Heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        int t = arr[0]; arr[0] = arr[i]; arr[i] = t;
        Heapify(arr, i, 0);
    }
}`
};
const LINES_HEAP = {
javascript:{start:10, heapify:1, compare:3, swap:6, built:11, extractMax:14, done:1},
python:{start:13, heapify:1, compare:4, swap:9, built:15, extractMax:17, done:1},
java:{start:10, heapify:1, compare:3, swap:6, built:11, extractMax:14, done:1},
cpp:{start:10, heapify:1, compare:3, swap:6, built:11, extractMax:14, done:1},
c:{start:10, heapify:1, compare:3, swap:6, built:11, extractMax:13, done:1},
csharp:{start:10, heapify:1, compare:3, swap:6, built:11, extractMax:14, done:1}
};

/* =====================================================================
   SEARCHING ALGORITHMS
   ===================================================================== */

function linearSearchSteps(arr, target){
  const steps = [];
  steps.push({view:'bars', array:arr.slice(), tag:'start', desc:'Searching for <b>'+target+'</b> using Linear Search.'});
  let foundIdx = -1;
  for(let i=0;i<arr.length;i++){
    steps.push({view:'bars', array:arr.slice(), i:i, tag:'compare', desc:'Checking index <b>'+i+'</b>: is <b>'+arr[i]+' == '+target+'</b>?'});
    if(arr[i]===target){ foundIdx=i; break; }
  }
  if(foundIdx>=0){
    steps.push({view:'bars', array:arr.slice(), found:foundIdx, tag:'found', desc:'<b>Found '+target+'</b> at index <b>'+foundIdx+'</b>!'});
  } else {
    steps.push({view:'bars', array:arr.slice(), tag:'notFound', desc:'<b>'+target+'</b> was not found in the array.'});
  }
  return steps;
}

function binarySearchSteps(arr, target){
  const a = arr.slice().sort((x,y)=>x-y);
  const steps = [];
  steps.push({view:'bars', array:a.slice(), tag:'start', desc:'Array sorted. Searching for <b>'+target+'</b> using Binary Search.'});
  let lo=0, hi=a.length-1, foundIdx=-1;
  while(lo<=hi){
    const mid = Math.floor((lo+hi)/2);
    steps.push({view:'bars', array:a.slice(), i:lo, j:hi, k:mid, tag:'mid', desc:'Range ['+lo+'..'+hi+'] → checking middle index <b>'+mid+'</b> = <b>'+a[mid]+'</b>.'});
    if(a[mid]===target){ foundIdx=mid; break; }
    else if(a[mid] < target){ steps.push({view:'bars', array:a.slice(), k:mid, tag:'goRight', desc:'<b>'+a[mid]+' &lt; '+target+'</b> → search the right half.'}); lo=mid+1; }
    else { steps.push({view:'bars', array:a.slice(), k:mid, tag:'goLeft', desc:'<b>'+a[mid]+' &gt; '+target+'</b> → search the left half.'}); hi=mid-1; }
  }
  if(foundIdx>=0) steps.push({view:'bars', array:a.slice(), found:foundIdx, tag:'found', desc:'<b>Found '+target+'</b> at index <b>'+foundIdx+'</b>!'});
  else steps.push({view:'bars', array:a.slice(), tag:'notFound', desc:'<b>'+target+'</b> was not found in the array.'});
  return steps;
}

const CODE_LINEAR = {
javascript:
`function linearSearch(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) {
      return i;
    }
  }
  return -1;
}`,
python:
`def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1`,
java:
`static int linearSearch(int[] arr, int target) {
    for (int i = 0; i < arr.length; i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`,
cpp:
`int linearSearch(vector<int>& arr, int target) {
    for (int i = 0; i < arr.size(); i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`,
c:
`int linearSearch(int arr[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`,
csharp:
`static int LinearSearch(int[] arr, int target) {
    for (int i = 0; i < arr.Length; i++) {
        if (arr[i] == target) {
            return i;
        }
    }
    return -1;
}`
};
const LINES_LINEAR = {
javascript:{start:1, compare:3, found:4, notFound:7},
python:{start:1, compare:3, found:4, notFound:5},
java:{start:1, compare:3, found:4, notFound:7},
cpp:{start:1, compare:3, found:4, notFound:7},
c:{start:1, compare:3, found:4, notFound:7},
csharp:{start:1, compare:3, found:4, notFound:7}
};

const CODE_BINARY = {
javascript:
`function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    let mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    else if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
python:
`def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
java:
`static int binarySearch(int[] arr, int target) {
    int lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
cpp:
`int binarySearch(vector<int>& arr, int target) {
    int lo = 0, hi = arr.size() - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
c:
`int binarySearch(int arr[], int n, int target) {
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
csharp:
`static int BinarySearch(int[] arr, int target) {
    int lo = 0, hi = arr.Length - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`
};
const LINES_BINARY = {
javascript:{start:1, mid:4, found:5, goRight:6, goLeft:7},
python:{start:1, mid:4, found:6, goRight:8, goLeft:10},
java:{start:1, mid:4, found:5, goRight:6, goLeft:7},
cpp:{start:1, mid:4, found:5, goRight:6, goLeft:7},
c:{start:1, mid:4, found:5, goRight:6, goLeft:7},
csharp:{start:1, mid:4, found:5, goRight:6, goLeft:7}
};

/* =====================================================================
   STACK  (push / pop / peek demo)
   ===================================================================== */
function stackDemoSteps(){
  const steps = [];
  let s = [];
  steps.push({view:'stack', array:s.slice(), tag:'init', desc:'Empty stack created. Stack follows <b>LIFO</b> (Last-In-First-Out).'});
  [10,20,30].forEach(function(v){
    s.push(v);
    steps.push({view:'stack', array:s.slice(), tag:'push', desc:'<b>push('+v+')</b> → placed on top of the stack.'});
  });
  steps.push({view:'stack', array:s.slice(), tag:'peek', desc:'<b>peek()</b> → returns top element <b>'+s[s.length-1]+'</b> without removing it.'});
  const popped = s.pop();
  steps.push({view:'stack', array:s.slice(), tag:'pop', desc:'<b>pop()</b> → removed and returned <b>'+popped+'</b> from the top.'});
  s.push(40);
  steps.push({view:'stack', array:s.slice(), tag:'push', desc:'<b>push(40)</b> → placed on top of the stack.'});
  steps.push({view:'stack', array:s.slice(), tag:'done', desc:'Demo complete. Current stack top is <b>'+s[s.length-1]+'</b>.'});
  return steps;
}
const CODE_STACK = {
javascript:
`class Stack {
  constructor() { this.items = []; }
  push(val) { this.items.push(val); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
}`,
python:
`class Stack:
    def __init__(self):
        self.items = []

    def push(self, val):
        self.items.append(val)

    def pop(self):
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0`,
java:
`class Stack {
    private ArrayList<Integer> items = new ArrayList<>();
    void push(int val) { items.add(val); }
    int pop() { return items.remove(items.size() - 1); }
    int peek() { return items.get(items.size() - 1); }
    boolean isEmpty() { return items.isEmpty(); }
}`,
cpp:
`class Stack {
    vector<int> items;
public:
    void push(int val) { items.push_back(val); }
    int pop() { int v = items.back(); items.pop_back(); return v; }
    int peek() { return items.back(); }
    bool isEmpty() { return items.empty(); }
};`,
c:
`#define MAX 100
int items[MAX], top = -1;
void push(int val) { items[++top] = val; }
int pop() { return items[top--]; }
int peek() { return items[top]; }
int isEmpty() { return top == -1; }`,
csharp:
`class Stack {
    private List<int> items = new List<int>();
    public void Push(int val) { items.Add(val); }
    public int Pop() { int v = items[^1]; items.RemoveAt(items.Count-1); return v; }
    public int Peek() { return items[^1]; }
    public bool IsEmpty() { return items.Count == 0; }
}`
};
const LINES_STACK = {
javascript:{init:2, push:3, pop:4, peek:5, done:1},
python:{init:2, push:6, pop:9, peek:12, done:1},
java:{init:2, push:3, pop:4, peek:5, done:1},
cpp:{init:2, push:4, pop:5, peek:6, done:1},
c:{init:2, push:3, pop:4, peek:5, done:1},
csharp:{init:2, push:3, pop:4, peek:5, done:1}
};

/* =====================================================================
   QUEUE  (enqueue / dequeue / peek demo)
   ===================================================================== */
function queueDemoSteps(){
  const steps = [];
  let q = [];
  steps.push({view:'queue', array:q.slice(), tag:'init', desc:'Empty queue created. Queue follows <b>FIFO</b> (First-In-First-Out).'});
  [5,15,25].forEach(function(v){
    q.push(v);
    steps.push({view:'queue', array:q.slice(), tag:'enqueue', desc:'<b>enqueue('+v+')</b> → added to the rear of the queue.'});
  });
  steps.push({view:'queue', array:q.slice(), tag:'peek', desc:'<b>peek()</b> → front element is <b>'+q[0]+'</b>.'});
  const removed = q.shift();
  steps.push({view:'queue', array:q.slice(), tag:'dequeue', desc:'<b>dequeue()</b> → removed <b>'+removed+'</b> from the front.'});
  q.push(35);
  steps.push({view:'queue', array:q.slice(), tag:'enqueue', desc:'<b>enqueue(35)</b> → added to the rear of the queue.'});
  steps.push({view:'queue', array:q.slice(), tag:'done', desc:'Demo complete. Current front is <b>'+q[0]+'</b>.'});
  return steps;
}
const CODE_QUEUE = {
javascript:
`class Queue {
  constructor() { this.items = []; }
  enqueue(val) { this.items.push(val); }
  dequeue() { return this.items.shift(); }
  peek() { return this.items[0]; }
  isEmpty() { return this.items.length === 0; }
}`,
python:
`from collections import deque

class Queue:
    def __init__(self):
        self.items = deque()

    def enqueue(self, val):
        self.items.append(val)

    def dequeue(self):
        return self.items.popleft()

    def peek(self):
        return self.items[0]`,
java:
`class Queue {
    private LinkedList<Integer> items = new LinkedList<>();
    void enqueue(int val) { items.addLast(val); }
    int dequeue() { return items.removeFirst(); }
    int peek() { return items.getFirst(); }
    boolean isEmpty() { return items.isEmpty(); }
}`,
cpp:
`#include <queue>
class Queue {
    queue<int> items;
public:
    void enqueue(int val) { items.push(val); }
    int dequeue() { int v = items.front(); items.pop(); return v; }
    int peek() { return items.front(); }
    bool isEmpty() { return items.empty(); }
};`,
c:
`#define MAX 100
int items[MAX], front = 0, rear = -1, count = 0;
void enqueue(int val) { items[++rear] = val; count++; }
int dequeue() { count--; return items[front++]; }
int peek() { return items[front]; }
int isEmpty() { return count == 0; }`,
csharp:
`class Queue2 {
    private Queue<int> items = new Queue<int>();
    public void Enqueue(int val) { items.Enqueue(val); }
    public int Dequeue() { return items.Dequeue(); }
    public int Peek() { return items.Peek(); }
    public bool IsEmpty() { return items.Count == 0; }
}`
};
const LINES_QUEUE = {
javascript:{init:2, enqueue:3, dequeue:4, peek:5, done:1},
python:{init:5, enqueue:8, dequeue:11, peek:14, done:1},
java:{init:2, enqueue:3, dequeue:4, peek:5, done:1},
cpp:{init:3, enqueue:5, dequeue:6, peek:7, done:1},
c:{init:2, enqueue:3, dequeue:4, peek:5, done:1},
csharp:{init:2, enqueue:3, dequeue:4, peek:5, done:1}
};

/* =====================================================================
   LINKED LIST  (insert head / insert tail / delete / traverse demo)
   ===================================================================== */
function linkedListDemoSteps(){
  const steps = [];
  let list = [];
  steps.push({view:'linkedlist', array:list.slice(), tag:'init', desc:'Empty linked list. <b>head → NULL</b>.'});
  list.push(10);
  steps.push({view:'linkedlist', array:list.slice(), newNode:0, tag:'insertTail', desc:'<b>insertAtTail(10)</b> → new node becomes the only node.'});
  list.push(20);
  steps.push({view:'linkedlist', array:list.slice(), newNode:1, tag:'insertTail', desc:'<b>insertAtTail(20)</b> → traverse to the end, link new node.'});
  list.unshift(5);
  steps.push({view:'linkedlist', array:list.slice(), newNode:0, tag:'insertHead', desc:'<b>insertAtHead(5)</b> → new node points to old head, becomes new head.'});
  list.push(30);
  steps.push({view:'linkedlist', array:list.slice(), newNode:list.length-1, tag:'insertTail', desc:'<b>insertAtTail(30)</b> → appended at the end.'});
  for(let i=0;i<list.length;i++){
    steps.push({view:'linkedlist', array:list.slice(), active:i, tag:'traverse', desc:'Traversing: visiting node with value <b>'+list[i]+'</b>.'});
  }
  const delIdx = 1;
  const delVal = list[delIdx];
  steps.push({view:'linkedlist', array:list.slice(), active:delIdx, tag:'findDelete', desc:'Found node with value <b>'+delVal+'</b> to delete — relinking previous node to skip it.'});
  list.splice(delIdx,1);
  steps.push({view:'linkedlist', array:list.slice(), tag:'delete', desc:'<b>delete('+delVal+')</b> complete — node removed, memory freed.'});
  steps.push({view:'linkedlist', array:list.slice(), tag:'done', desc:'Linked list operations demo complete.'});
  return steps;
}
const CODE_LINKEDLIST = {
javascript:
`class Node {
  constructor(val) { this.val = val; this.next = null; }
}
class LinkedList {
  constructor() { this.head = null; }
  insertAtHead(val) {
    let node = new Node(val);
    node.next = this.head;
    this.head = node;
  }
  insertAtTail(val) {
    let node = new Node(val);
    if (!this.head) { this.head = node; return; }
    let cur = this.head;
    while (cur.next) cur = cur.next;
    cur.next = node;
  }
  delete(val) {
    if (!this.head) return;
    if (this.head.val === val) { this.head = this.head.next; return; }
    let cur = this.head;
    while (cur.next && cur.next.val !== val) cur = cur.next;
    if (cur.next) cur.next = cur.next.next;
  }
  traverse() {
    let cur = this.head;
    while (cur) { console.log(cur.val); cur = cur.next; }
  }
}`,
python:
`class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None

    def insert_at_head(self, val):
        node = Node(val)
        node.next = self.head
        self.head = node

    def insert_at_tail(self, val):
        node = Node(val)
        if not self.head:
            self.head = node
            return
        cur = self.head
        while cur.next:
            cur = cur.next
        cur.next = node

    def delete(self, val):
        if not self.head:
            return
        if self.head.val == val:
            self.head = self.head.next
            return
        cur = self.head
        while cur.next and cur.next.val != val:
            cur = cur.next
        if cur.next:
            cur.next = cur.next.next

    def traverse(self):
        cur = self.head
        while cur:
            print(cur.val)
            cur = cur.next`,
java:
`class Node {
    int val; Node next;
    Node(int val) { this.val = val; }
}
class LinkedList {
    Node head;
    void insertAtHead(int val) {
        Node node = new Node(val);
        node.next = head;
        head = node;
    }
    void insertAtTail(int val) {
        Node node = new Node(val);
        if (head == null) { head = node; return; }
        Node cur = head;
        while (cur.next != null) cur = cur.next;
        cur.next = node;
    }
    void delete(int val) {
        if (head == null) return;
        if (head.val == val) { head = head.next; return; }
        Node cur = head;
        while (cur.next != null && cur.next.val != val) cur = cur.next;
        if (cur.next != null) cur.next = cur.next.next;
    }
    void traverse() {
        Node cur = head;
        while (cur != null) { System.out.println(cur.val); cur = cur.next; }
    }
}`,
cpp:
`struct Node {
    int val; Node* next;
    Node(int v) : val(v), next(nullptr) {}
};
class LinkedList {
    Node* head = nullptr;
public:
    void insertAtHead(int val) {
        Node* node = new Node(val);
        node->next = head;
        head = node;
    }
    void insertAtTail(int val) {
        Node* node = new Node(val);
        if (!head) { head = node; return; }
        Node* cur = head;
        while (cur->next) cur = cur->next;
        cur->next = node;
    }
    void deleteVal(int val) {
        if (!head) return;
        if (head->val == val) { head = head->next; return; }
        Node* cur = head;
        while (cur->next && cur->next->val != val) cur = cur->next;
        if (cur->next) cur->next = cur->next->next;
    }
    void traverse() {
        Node* cur = head;
        while (cur) { cout << cur->val << endl; cur = cur->next; }
    }
};`,
c:
`struct Node { int val; struct Node* next; };
struct Node* head = NULL;
void insertAtHead(int val) {
    struct Node* node = malloc(sizeof(struct Node));
    node->val = val; node->next = head; head = node;
}
void insertAtTail(int val) {
    struct Node* node = malloc(sizeof(struct Node));
    node->val = val; node->next = NULL;
    if (!head) { head = node; return; }
    struct Node* cur = head;
    while (cur->next) cur = cur->next;
    cur->next = node;
}
void deleteVal(int val) {
    if (!head) return;
    if (head->val == val) { head = head->next; return; }
    struct Node* cur = head;
    while (cur->next && cur->next->val != val) cur = cur->next;
    if (cur->next) cur->next = cur->next->next;
}
void traverse() {
    struct Node* cur = head;
    while (cur) { printf("%d\\n", cur->val); cur = cur->next; }
}`,
csharp:
`class Node {
    public int Val; public Node Next;
    public Node(int v) { Val = v; }
}
class LinkedList {
    Node head;
    public void InsertAtHead(int val) {
        Node node = new Node(val);
        node.Next = head;
        head = node;
    }
    public void InsertAtTail(int val) {
        Node node = new Node(val);
        if (head == null) { head = node; return; }
        Node cur = head;
        while (cur.Next != null) cur = cur.Next;
        cur.Next = node;
    }
    public void Delete(int val) {
        if (head == null) return;
        if (head.Val == val) { head = head.Next; return; }
        Node cur = head;
        while (cur.Next != null && cur.Next.Val != val) cur = cur.Next;
        if (cur.Next != null) cur.Next = cur.Next.Next;
    }
    public void Traverse() {
        Node cur = head;
        while (cur != null) { Console.WriteLine(cur.Val); cur = cur.Next; }
    }
}`
};
const LINES_LINKEDLIST = {
javascript:{init:5, insertHead:6, insertTail:11, findDelete:19, delete:21, traverse:26, done:1},
python:{init:6, insertHead:9, insertTail:14, findDelete:25, delete:29, traverse:33, done:1},
java:{init:5, insertHead:6, insertTail:11, findDelete:19, delete:21, traverse:26, done:1},
cpp:{init:6, insertHead:8, insertTail:13, findDelete:21, delete:23, traverse:28, done:1},
c:{init:2, insertHead:3, insertTail:7, findDelete:14, delete:16, traverse:20, done:1},
csharp:{init:5, insertHead:6, insertTail:11, findDelete:19, delete:21, traverse:26, done:1}
};

/* =====================================================================
   BINARY SEARCH TREE  (insert + inorder/preorder/postorder traversal)
   ===================================================================== */
function buildBSTLayout(values){
  // Build BST then assign x,y coordinates for a balanced-ish visual layout
  let idCounter = 0;
  const root = {};
  function insert(node, val){
    if(node===null) return {id:idCounter++, val:val, left:null, right:null};
    if(val < node.val) node.left = insert(node.left, val);
    else node.right = insert(node.right, val);
    return node;
  }
  let treeRoot = null;
  values.forEach(v=>{ treeRoot = insert(treeRoot, v); });
  const nodes = [];
  function assignXY(node, depth, xMin, xMax){
    if(!node) return;
    const x = (xMin+xMax)/2;
    const y = 40 + depth*70;
    nodes.push({id:node.id, val:node.val, x:x, y:y, left:node.left?node.left.id:null, right:node.right?node.right.id:null});
    if(node.left) assignXY(node.left, depth+1, xMin, x);
    if(node.right) assignXY(node.right, depth+1, x, xMax);
  }
  assignXY(treeRoot, 0, 20, 620);
  return {root:treeRoot, nodes:nodes};
}

function bstDemoSteps(values){
  const steps = [];
  const layout = buildBSTLayout(values);
  const nodes = layout.nodes;
  steps.push({view:'tree', tree:{nodes:nodes, activeId:null, visitedIds:[]}, tag:'built', desc:'Binary Search Tree built from values: <b>'+values.join(', ')+'</b>.'});
  // Inorder traversal
  const order = [];
  function inorder(id){
    if(id===null||id===undefined) return;
    const n = nodes.find(x=>x.id===id);
    inorder(n.left);
    order.push(id);
    steps.push({view:'tree', tree:{nodes:nodes, activeId:id, visitedIds:order.slice()}, tag:'inorder',
      desc:'<b>Inorder</b> visit: node <b>'+n.val+'</b> (Left → Root → Right).'});
    inorder(n.right);
  }
  inorder(layout.root.id);
  steps.push({view:'tree', tree:{nodes:nodes, activeId:null, visitedIds:order.slice()}, tag:'inorderDone',
    desc:'Inorder traversal complete: <b>'+order.map(id=>nodes.find(n=>n.id===id).val).join(' → ')+'</b> (sorted order!).'});
  // Preorder
  const order2 = [];
  function preorder(id){
    if(id===null||id===undefined) return;
    const n = nodes.find(x=>x.id===id);
    order2.push(id);
    steps.push({view:'tree', tree:{nodes:nodes, activeId:id, visitedIds:order2.slice()}, tag:'preorder',
      desc:'<b>Preorder</b> visit: node <b>'+n.val+'</b> (Root → Left → Right).'});
    preorder(n.left);
    preorder(n.right);
  }
  preorder(layout.root.id);
  steps.push({view:'tree', tree:{nodes:nodes, activeId:null, visitedIds:order2.slice()}, tag:'preorderDone',
    desc:'Preorder traversal complete: <b>'+order2.map(id=>nodes.find(n=>n.id===id).val).join(' → ')+'</b>.'});
  // Postorder
  const order3 = [];
  function postorder(id){
    if(id===null||id===undefined) return;
    const n = nodes.find(x=>x.id===id);
    postorder(n.left);
    postorder(n.right);
    order3.push(id);
    steps.push({view:'tree', tree:{nodes:nodes, activeId:id, visitedIds:order3.slice()}, tag:'postorder',
      desc:'<b>Postorder</b> visit: node <b>'+n.val+'</b> (Left → Right → Root).'});
  }
  postorder(layout.root.id);
  steps.push({view:'tree', tree:{nodes:nodes, activeId:null, visitedIds:order3.slice()}, tag:'done',
    desc:'Postorder traversal complete: <b>'+order3.map(id=>nodes.find(n=>n.id===id).val).join(' → ')+'</b>. Demo finished.'});
  return steps;
}

const CODE_BST = {
javascript:
`class TreeNode {
  constructor(val) { this.val = val; this.left = null; this.right = null; }
}
function insert(root, val) {
  if (root === null) return new TreeNode(val);
  if (val < root.val) root.left = insert(root.left, val);
  else root.right = insert(root.right, val);
  return root;
}
function inorder(root, out) {
  if (!root) return;
  inorder(root.left, out);
  out.push(root.val);
  inorder(root.right, out);
}
function preorder(root, out) {
  if (!root) return;
  out.push(root.val);
  preorder(root.left, out);
  preorder(root.right, out);
}
function postorder(root, out) {
  if (!root) return;
  postorder(root.left, out);
  postorder(root.right, out);
  out.push(root.val);
}`,
python:
`class TreeNode:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return TreeNode(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

def inorder(root, out):
    if not root:
        return
    inorder(root.left, out)
    out.append(root.val)
    inorder(root.right, out)

def preorder(root, out):
    if not root:
        return
    out.append(root.val)
    preorder(root.left, out)
    preorder(root.right, out)

def postorder(root, out):
    if not root:
        return
    postorder(root.left, out)
    postorder(root.right, out)
    out.append(root.val)`,
java:
`class TreeNode {
    int val; TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}
static TreeNode insert(TreeNode root, int val) {
    if (root == null) return new TreeNode(val);
    if (val < root.val) root.left = insert(root.left, val);
    else root.right = insert(root.right, val);
    return root;
}
static void inorder(TreeNode root, List<Integer> out) {
    if (root == null) return;
    inorder(root.left, out);
    out.add(root.val);
    inorder(root.right, out);
}
static void preorder(TreeNode root, List<Integer> out) {
    if (root == null) return;
    out.add(root.val);
    preorder(root.left, out);
    preorder(root.right, out);
}
static void postorder(TreeNode root, List<Integer> out) {
    if (root == null) return;
    postorder(root.left, out);
    postorder(root.right, out);
    out.add(root.val);
}`,
cpp:
`struct TreeNode {
    int val; TreeNode *left, *right;
    TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
};
TreeNode* insert(TreeNode* root, int val) {
    if (!root) return new TreeNode(val);
    if (val < root->val) root->left = insert(root->left, val);
    else root->right = insert(root->right, val);
    return root;
}
void inorder(TreeNode* root, vector<int>& out) {
    if (!root) return;
    inorder(root->left, out);
    out.push_back(root->val);
    inorder(root->right, out);
}
void preorder(TreeNode* root, vector<int>& out) {
    if (!root) return;
    out.push_back(root->val);
    preorder(root->left, out);
    preorder(root->right, out);
}
void postorder(TreeNode* root, vector<int>& out) {
    if (!root) return;
    postorder(root->left, out);
    postorder(root->right, out);
    out.push_back(root->val);
}`,
c:
`struct Node { int val; struct Node *left, *right; };
struct Node* insert(struct Node* root, int val) {
    if (root == NULL) {
        struct Node* n = malloc(sizeof(struct Node));
        n->val = val; n->left = n->right = NULL;
        return n;
    }
    if (val < root->val) root->left = insert(root->left, val);
    else root->right = insert(root->right, val);
    return root;
}
void inorder(struct Node* root) {
    if (!root) return;
    inorder(root->left);
    printf("%d ", root->val);
    inorder(root->right);
}
void preorder(struct Node* root) {
    if (!root) return;
    printf("%d ", root->val);
    preorder(root->left);
    preorder(root->right);
}
void postorder(struct Node* root) {
    if (!root) return;
    postorder(root->left);
    postorder(root->right);
    printf("%d ", root->val);
}`,
csharp:
`class TreeNode {
    public int Val; public TreeNode Left, Right;
    public TreeNode(int v) { Val = v; }
}
static TreeNode Insert(TreeNode root, int val) {
    if (root == null) return new TreeNode(val);
    if (val < root.Val) root.Left = Insert(root.Left, val);
    else root.Right = Insert(root.Right, val);
    return root;
}
static void Inorder(TreeNode root, List<int> outList) {
    if (root == null) return;
    Inorder(root.Left, outList);
    outList.Add(root.Val);
    Inorder(root.Right, outList);
}
static void Preorder(TreeNode root, List<int> outList) {
    if (root == null) return;
    outList.Add(root.Val);
    Preorder(root.Left, outList);
    Preorder(root.Right, outList);
}
static void Postorder(TreeNode root, List<int> outList) {
    if (root == null) return;
    Postorder(root.Left, outList);
    Postorder(root.Right, outList);
    outList.Add(root.Val);
}`
};
const LINES_BST = {
javascript:{built:4, inorder:11, inorderDone:1, preorder:16, preorderDone:1, postorder:21, done:1},
python:{built:6, inorder:19, inorderDone:1, preorder:24, preorderDone:1, postorder:30, done:1},
java:{built:5, inorder:14, inorderDone:1, preorder:19, preorderDone:1, postorder:24, done:1},
cpp:{built:6, inorder:15, inorderDone:1, preorder:20, preorderDone:1, postorder:25, done:1},
c:{built:2, inorder:15, inorderDone:1, preorder:20, preorderDone:1, postorder:25, done:1},
csharp:{built:5, inorder:14, inorderDone:1, preorder:19, preorderDone:1, postorder:24, done:1}
};

/* =====================================================================
   GRAPH — BFS and DFS on a small fixed sample graph
   ===================================================================== */
function sampleGraph(){
  const nodes = [
    {id:0, label:'A', x:100, y:60}, {id:1, label:'B', x:280, y:60}, {id:2, label:'C', x:460, y:60},
    {id:3, label:'D', x:100, y:220}, {id:4, label:'E', x:280, y:220}, {id:5, label:'F', x:460, y:220}
  ];
  const edges = [
    {a:0,b:1}, {a:0,b:3}, {a:1,b:2}, {a:1,b:4}, {a:2,b:5}, {a:3,b:4}, {a:4,b:5}
  ];
  const adj = {};
  nodes.forEach(n=>adj[n.id]=[]);
  edges.forEach(e=>{ adj[e.a].push(e.b); adj[e.b].push(e.a); });
  return {nodes:nodes, edges:edges, adj:adj};
}

function bfsSteps(){
  const g = sampleGraph();
  const steps = [];
  steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:[], frontier:[], activeId:null}, tag:'start',
    desc:'Starting <b>BFS</b> from node <b>A</b>. Using a queue to explore level by level.'});
  const visited = [0];
  const queue = [0];
  steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:queue.slice(), activeId:null}, tag:'enqueueStart',
    desc:'Enqueue start node <b>A</b>. Mark it visited.'});
  while(queue.length){
    const u = queue.shift();
    steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:queue.slice(), activeId:u}, tag:'dequeue',
      desc:'Dequeue node <b>'+g.nodes[u].label+'</b> and visit its neighbors.'});
    g.adj[u].forEach(function(v){
      if(!visited.includes(v)){
        visited.push(v); queue.push(v);
        steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:queue.slice(), activeId:u}, activeEdge:{a:u,b:v}, tag:'visitNeighbor',
          desc:'Neighbor <b>'+g.nodes[v].label+'</b> is unvisited → mark visited, enqueue it.'});
      }
    });
  }
  steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:[], activeId:null}, tag:'done',
    desc:'BFS complete. Visit order: <b>'+visited.map(id=>g.nodes[id].label).join(' → ')+'</b>.'});
  return steps;
}

function dfsSteps(){
  const g = sampleGraph();
  const steps = [];
  steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:[], frontier:[], activeId:null}, tag:'start',
    desc:'Starting <b>DFS</b> from node <b>A</b>. Using recursion (a stack) to go deep first.'});
  const visited = [];
  function dfs(u, parent){
    visited.push(u);
    steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:[], activeId:u},
      activeEdge: parent!==null ? {a:parent,b:u} : null, tag:'visit',
      desc:'Visit node <b>'+g.nodes[u].label+'</b>, mark it visited.'});
    g.adj[u].forEach(function(v){
      if(!visited.includes(v)){
        steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:[], activeId:u}, activeEdge:{a:u,b:v}, tag:'recurse',
          desc:'Recurse into unvisited neighbor <b>'+g.nodes[v].label+'</b>.'});
        dfs(v, u);
      }
    });
  }
  dfs(0, null);
  steps.push({view:'graph', graph:{nodes:g.nodes, edges:g.edges, visited:visited.slice(), frontier:[], activeId:null}, tag:'done',
    desc:'DFS complete. Visit order: <b>'+visited.map(id=>g.nodes[id].label).join(' → ')+'</b>.'});
  return steps;
}

const CODE_BFS = {
javascript:
`function bfs(adj, start) {
  let visited = new Set([start]);
  let queue = [start];
  let order = [];
  while (queue.length) {
    let u = queue.shift();
    order.push(u);
    for (let v of adj[u]) {
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
      }
    }
  }
  return order;
}`,
python:
`from collections import deque

def bfs(adj, start):
    visited = {start}
    queue = deque([start])
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            if v not in visited:
                visited.add(v)
                queue.append(v)
    return order`,
java:
`static List<Integer> bfs(Map<Integer, List<Integer>> adj, int start) {
    Set<Integer> visited = new HashSet<>();
    Queue<Integer> queue = new LinkedList<>();
    List<Integer> order = new ArrayList<>();
    visited.add(start); queue.add(start);
    while (!queue.isEmpty()) {
        int u = queue.poll();
        order.add(u);
        for (int v : adj.get(u)) {
            if (!visited.contains(v)) {
                visited.add(v);
                queue.add(v);
            }
        }
    }
    return order;
}`,
cpp:
`vector<int> bfs(vector<vector<int>>& adj, int start) {
    vector<bool> visited(adj.size(), false);
    queue<int> q;
    vector<int> order;
    visited[start] = true; q.push(start);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : adj[u]) {
            if (!visited[v]) {
                visited[v] = true;
                q.push(v);
            }
        }
    }
    return order;
}`,
c:
`int visited[100];
void bfs(int adj[][100], int n, int start) {
    int queue[100], front = 0, rear = 0;
    queue[rear++] = start; visited[start] = 1;
    while (front < rear) {
        int u = queue[front++];
        printf("%d ", u);
        for (int v = 0; v < n; v++) {
            if (adj[u][v] && !visited[v]) {
                visited[v] = 1;
                queue[rear++] = v;
            }
        }
    }
}`,
csharp:
`static List<int> Bfs(Dictionary<int, List<int>> adj, int start) {
    var visited = new HashSet<int> { start };
    var queue = new Queue<int>(); queue.Enqueue(start);
    var order = new List<int>();
    while (queue.Count > 0) {
        int u = queue.Dequeue();
        order.Add(u);
        foreach (int v in adj[u]) {
            if (!visited.Contains(v)) {
                visited.Add(v);
                queue.Enqueue(v);
            }
        }
    }
    return order;
}`
};
const LINES_BFS = {
javascript:{start:2, enqueueStart:3, dequeue:6, visitNeighbor:9, done:1},
python:{start:4, enqueueStart:5, dequeue:8, visitNeighbor:11, done:1},
java:{start:5, enqueueStart:5, dequeue:7, visitNeighbor:10, done:1},
cpp:{start:5, enqueueStart:5, dequeue:7, visitNeighbor:10, done:1},
c:{start:4, enqueueStart:4, dequeue:6, visitNeighbor:9, done:1},
csharp:{start:2, enqueueStart:3, dequeue:6, visitNeighbor:9, done:1}
};

const CODE_DFS = {
javascript:
`function dfs(adj, u, visited = new Set(), order = []) {
  visited.add(u);
  order.push(u);
  for (let v of adj[u]) {
    if (!visited.has(v)) {
      dfs(adj, v, visited, order);
    }
  }
  return order;
}`,
python:
`def dfs(adj, u, visited=None, order=None):
    if visited is None:
        visited, order = set(), []
    visited.add(u)
    order.append(u)
    for v in adj[u]:
        if v not in visited:
            dfs(adj, v, visited, order)
    return order`,
java:
`static void dfs(Map<Integer, List<Integer>> adj, int u, Set<Integer> visited, List<Integer> order) {
    visited.add(u);
    order.add(u);
    for (int v : adj.get(u)) {
        if (!visited.contains(v)) {
            dfs(adj, v, visited, order);
        }
    }
}`,
cpp:
`void dfs(vector<vector<int>>& adj, int u, vector<bool>& visited, vector<int>& order) {
    visited[u] = true;
    order.push_back(u);
    for (int v : adj[u]) {
        if (!visited[v]) {
            dfs(adj, v, visited, order);
        }
    }
}`,
c:
`int visited[100];
void dfs(int adj[][100], int n, int u) {
    visited[u] = 1;
    printf("%d ", u);
    for (int v = 0; v < n; v++) {
        if (adj[u][v] && !visited[v]) {
            dfs(adj, n, v);
        }
    }
}`,
csharp:
`static void Dfs(Dictionary<int, List<int>> adj, int u, HashSet<int> visited, List<int> order) {
    visited.Add(u);
    order.Add(u);
    foreach (int v in adj[u]) {
        if (!visited.Contains(v)) {
            Dfs(adj, v, visited, order);
        }
    }
}`
};
const LINES_DFS = {
javascript:{start:2, visit:2, recurse:6, done:1},
python:{start:4, visit:4, recurse:8, done:1},
java:{start:2, visit:2, recurse:6, done:1},
cpp:{start:2, visit:2, recurse:6, done:1},
c:{start:3, visit:3, recurse:7, done:1},
csharp:{start:2, visit:2, recurse:6, done:1}
};

/* =====================================================================
   DYNAMIC PROGRAMMING — Fibonacci (memoized), 0/1 Knapsack, LCS
   ===================================================================== */
function fibSteps(n){
  const steps = [];
  const dp = new Array(n+1).fill(null);
  steps.push({view:'dparray', array:dp.slice(), tag:'start', desc:'Computing Fibonacci('+n+') using bottom-up <b>Dynamic Programming</b>.'});
  dp[0]=0;
  steps.push({view:'dparray', array:dp.slice(), i:0, tag:'base', desc:'Base case: <b>dp[0] = 0</b>.'});
  if(n>=1){
    dp[1]=1;
    steps.push({view:'dparray', array:dp.slice(), i:1, tag:'base', desc:'Base case: <b>dp[1] = 1</b>.'});
  }
  for(let i=2;i<=n;i++){
    dp[i] = dp[i-1]+dp[i-2];
    steps.push({view:'dparray', array:dp.slice(), i:i, tag:'compute',
      desc:'<b>dp['+i+'] = dp['+(i-1)+'] + dp['+(i-2)+'] = '+dp[i-1]+' + '+dp[i-2]+' = '+dp[i]+'</b>.'});
  }
  steps.push({view:'dparray', array:dp.slice(), i:n, tag:'done', desc:'<b>Fibonacci('+n+') = '+dp[n]+'</b>. Each value computed once — O(n) time!'});
  return steps;
}
const CODE_FIB = {
javascript:
`function fib(n) {
  let dp = new Array(n + 1).fill(0);
  dp[0] = 0;
  if (n >= 1) dp[1] = 1;
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}`,
python:
`def fib(n):
    dp = [0] * (n + 1)
    dp[0] = 0
    if n >= 1:
        dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]`,
java:
`static int fib(int n) {
    int[] dp = new int[n + 1];
    dp[0] = 0;
    if (n >= 1) dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}`,
cpp:
`int fib(int n) {
    vector<int> dp(n + 1, 0);
    dp[0] = 0;
    if (n >= 1) dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}`,
c:
`int fib(int n) {
    int dp[100];
    dp[0] = 0;
    if (n >= 1) dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}`,
csharp:
`static int Fib(int n) {
    int[] dp = new int[n + 1];
    dp[0] = 0;
    if (n >= 1) dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}`
};
const LINES_FIB = {
javascript:{start:2, base:3, compute:6, done:1},
python:{start:2, base:3, compute:7, done:1},
java:{start:2, base:3, compute:6, done:1},
cpp:{start:2, base:3, compute:6, done:1},
c:{start:2, base:3, compute:6, done:1},
csharp:{start:2, base:3, compute:6, done:1}
};

function knapsackSteps(weights, values, cap){
  const n = weights.length;
  const grid = Array.from({length:n+1}, ()=>new Array(cap+1).fill(0));
  const steps = [];
  steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), tag:'start', desc:'0/1 Knapsack: capacity <b>'+cap+'</b>, '+n+' items. Building DP table.'});
  for(let i=1;i<=n;i++){
    for(let w=0;w<=cap;w++){
      steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,w], tag:'cell',
        desc:'Item '+i+' (w='+weights[i-1]+', v='+values[i-1]+'), capacity '+w+'.'});
      if(weights[i-1] <= w){
        grid[i][w] = Math.max(values[i-1] + grid[i-1][w-weights[i-1]], grid[i-1][w]);
        steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,w], tag:'fits',
          desc:'Fits! <b>dp['+i+']['+w+'] = max(include, exclude) = '+grid[i][w]+'</b>.'});
      } else {
        grid[i][w] = grid[i-1][w];
        steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,w], tag:'skip',
          desc:'Too heavy — <b>dp['+i+']['+w+'] = dp['+(i-1)+']['+w+'] = '+grid[i][w]+'</b>.'});
      }
    }
  }
  steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[n,cap], tag:'done', desc:'<b>Maximum value = '+grid[n][cap]+'</b>.'});
  return steps;
}
const CODE_KNAPSACK = {
javascript:
`function knapsack(weights, values, cap) {
  let n = weights.length;
  let dp = Array.from({length: n + 1}, () => new Array(cap + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= cap; w++) {
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(
          values[i - 1] + dp[i - 1][w - weights[i - 1]],
          dp[i - 1][w]
        );
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }
  return dp[n][cap];
}`,
python:
`def knapsack(weights, values, cap):
    n = len(weights)
    dp = [[0] * (cap + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(cap + 1):
            if weights[i - 1] <= w:
                dp[i][w] = max(
                    values[i - 1] + dp[i - 1][w - weights[i - 1]],
                    dp[i - 1][w]
                )
            else:
                dp[i][w] = dp[i - 1][w]
    return dp[n][cap]`,
java:
`static int knapsack(int[] weights, int[] values, int cap) {
    int n = weights.length;
    int[][] dp = new int[n + 1][cap + 1];
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= cap; w++) {
            if (weights[i - 1] <= w) {
                dp[i][w] = Math.max(
                    values[i - 1] + dp[i - 1][w - weights[i - 1]],
                    dp[i - 1][w]
                );
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }
    return dp[n][cap];
}`,
cpp:
`int knapsack(vector<int>& weights, vector<int>& values, int cap) {
    int n = weights.size();
    vector<vector<int>> dp(n + 1, vector<int>(cap + 1, 0));
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= cap; w++) {
            if (weights[i - 1] <= w) {
                dp[i][w] = max(values[i - 1] + dp[i - 1][w - weights[i - 1]], dp[i - 1][w]);
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }
    return dp[n][cap];
}`,
c:
`int knapsack(int weights[], int values[], int n, int cap) {
    int dp[50][50] = {0};
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= cap; w++) {
            if (weights[i - 1] <= w) {
                int inc = values[i - 1] + dp[i - 1][w - weights[i - 1]];
                dp[i][w] = inc > dp[i - 1][w] ? inc : dp[i - 1][w];
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }
    return dp[n][cap];
}`,
csharp:
`static int Knapsack(int[] weights, int[] values, int cap) {
    int n = weights.Length;
    int[,] dp = new int[n + 1, cap + 1];
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= cap; w++) {
            if (weights[i - 1] <= w) {
                dp[i, w] = Math.Max(values[i - 1] + dp[i - 1, w - weights[i - 1]], dp[i - 1, w]);
            } else {
                dp[i, w] = dp[i - 1, w];
            }
        }
    }
    return dp[n, cap];
}`
};
const LINES_KNAPSACK = {
javascript:{start:3, cell:5, fits:7, skip:12, done:1},
python:{start:3, cell:5, fits:7, skip:11, done:1},
java:{start:3, cell:5, fits:7, skip:12, done:1},
cpp:{start:3, cell:5, fits:7, skip:9, done:1},
c:{start:2, cell:4, fits:6, skip:9, done:1},
csharp:{start:3, cell:5, fits:7, skip:9, done:1}
};

function lcsSteps(s1, s2){
  const m=s1.length, n=s2.length;
  const grid = Array.from({length:m+1}, ()=>new Array(n+1).fill(0));
  const steps = [];
  steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), tag:'start', desc:'Finding <b>Longest Common Subsequence</b> of "'+s1+'" and "'+s2+'".'});
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,j], tag:'cell',
        desc:'Comparing <b>'+s1[i-1]+'</b> (row '+i+') and <b>'+s2[j-1]+'</b> (col '+j+').'});
      if(s1[i-1]===s2[j-1]){
        grid[i][j] = grid[i-1][j-1]+1;
        steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,j], tag:'match',
          desc:'Characters match! <b>dp['+i+']['+j+'] = dp['+(i-1)+']['+(j-1)+'] + 1 = '+grid[i][j]+'</b>.'});
      } else {
        grid[i][j] = Math.max(grid[i-1][j], grid[i][j-1]);
        steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[i,j], tag:'noMatch',
          desc:'No match — <b>dp['+i+']['+j+'] = max(dp['+(i-1)+']['+j+'], dp['+i+']['+(j-1)+']) = '+grid[i][j]+'</b>.'});
      }
    }
  }
  steps.push({view:'dpgrid', grid:grid.map(r=>r.slice()), activeCell:[m,n], tag:'done', desc:'<b>LCS length = '+grid[m][n]+'</b>.'});
  return steps;
}
const CODE_LCS = {
javascript:
`function lcs(s1, s2) {
  let m = s1.length, n = s2.length;
  let dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}`,
python:
`def lcs(s1, s2):
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]`,
java:
`static int lcs(String s1, String s2) {
    int m = s1.length(), n = s2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}`,
cpp:
`int lcs(string s1, string s2) {
    int m = s1.size(), n = s2.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (s1[i - 1] == s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}`,
c:
`int lcs(char* s1, char* s2, int m, int n) {
    int dp[50][50] = {0};
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (s1[i - 1] == s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
            }
        }
    }
    return dp[m][n];
}`,
csharp:
`static int Lcs(string s1, string s2) {
    int m = s1.Length, n = s2.Length;
    int[,] dp = new int[m + 1, n + 1];
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (s1[i - 1] == s2[j - 1]) {
                dp[i, j] = dp[i - 1, j - 1] + 1;
            } else {
                dp[i, j] = Math.Max(dp[i - 1, j], dp[i, j - 1]);
            }
        }
    }
    return dp[m, n];
}`
};
const LINES_LCS = {
javascript:{start:3, cell:5, match:7, noMatch:9, done:1},
python:{start:3, cell:5, match:7, noMatch:9, done:1},
java:{start:3, cell:5, match:7, noMatch:9, done:1},
cpp:{start:3, cell:5, match:7, noMatch:9, done:1},
c:{start:2, cell:4, match:6, noMatch:8, done:1},
csharp:{start:3, cell:5, match:7, noMatch:9, done:1}
};

/* =====================================================================
   ALGORITHM REGISTRY  — wires generators + code + complexity + controls
   ===================================================================== */
function randArray(size, max){
  max = max || 90;
  const a = [];
  for(let i=0;i<size;i++) a.push(3 + Math.floor(Math.random()*max));
  return a;
}

const ALGO_REGISTRY = {
  sorting: {
    label: 'Sorting',
    items: [
      { id:'bubble', name:'Bubble Sort', tagLabel:'O(n²)', category:'Sorting',
        complexity:{best:'O(n)', avg:'O(n²)', worst:'O(n²)', space:'O(1)'},
        code:CODE_BUBBLE, lineTags:LINES_BUBBLE, controlType:'array',
        buildSteps:(p)=>bubbleSortSteps(p.array),
        legend:[{color:'var(--amber)',label:'i pointer'},{color:'var(--teal)',label:'j pointer'},{color:'var(--green)',label:'sorted'}] },
      { id:'selection', name:'Selection Sort', tagLabel:'O(n²)', category:'Sorting',
        complexity:{best:'O(n²)', avg:'O(n²)', worst:'O(n²)', space:'O(1)'},
        code:CODE_SELECTION, lineTags:LINES_SELECTION, controlType:'array',
        buildSteps:(p)=>selectionSortSteps(p.array),
        legend:[{color:'var(--amber)',label:'i / min so far'},{color:'var(--teal)',label:'j pointer'},{color:'var(--green)',label:'sorted'}] },
      { id:'insertion', name:'Insertion Sort', tagLabel:'O(n²)', category:'Sorting',
        complexity:{best:'O(n)', avg:'O(n²)', worst:'O(n²)', space:'O(1)'},
        code:CODE_INSERTION, lineTags:LINES_INSERTION, controlType:'array',
        buildSteps:(p)=>insertionSortSteps(p.array),
        legend:[{color:'var(--amber)',label:'current index'},{color:'var(--green)',label:'sorted portion'}] },
      { id:'merge', name:'Merge Sort', tagLabel:'O(n log n)', category:'Sorting',
        complexity:{best:'O(n log n)', avg:'O(n log n)', worst:'O(n log n)', space:'O(n)'},
        code:CODE_MERGE, lineTags:LINES_MERGE, controlType:'array',
        buildSteps:(p)=>mergeSortSteps(p.array),
        legend:[{color:'var(--amber)',label:'range start'},{color:'var(--teal)',label:'range end'},{color:'var(--violet)',label:'write index k'}] },
      { id:'quick', name:'Quick Sort', tagLabel:'O(n log n)', category:'Sorting',
        complexity:{best:'O(n log n)', avg:'O(n log n)', worst:'O(n²)', space:'O(log n)'},
        code:CODE_QUICK, lineTags:LINES_QUICK, controlType:'array',
        buildSteps:(p)=>quickSortSteps(p.array),
        legend:[{color:'var(--rose)',label:'pivot'},{color:'var(--amber)',label:'i (boundary)'},{color:'var(--teal)',label:'j pointer'}] },
      { id:'heap', name:'Heap Sort', tagLabel:'O(n log n)', category:'Sorting',
        complexity:{best:'O(n log n)', avg:'O(n log n)', worst:'O(n log n)', space:'O(1)'},
        code:CODE_HEAP, lineTags:LINES_HEAP, controlType:'array',
        buildSteps:(p)=>heapSortSteps(p.array),
        legend:[{color:'var(--amber)',label:'root/current'},{color:'var(--teal)',label:'child compared'},{color:'var(--green)',label:'sorted'}] }
    ]
  },
  searching: {
    label: 'Searching',
    items: [
      { id:'linear', name:'Linear Search', tagLabel:'O(n)', category:'Searching',
        complexity:{best:'O(1)', avg:'O(n)', worst:'O(n)', space:'O(1)'},
        code:CODE_LINEAR, lineTags:LINES_LINEAR, controlType:'search',
        buildSteps:(p)=>linearSearchSteps(p.array, p.target),
        legend:[{color:'var(--amber)',label:'current index'},{color:'var(--green)',label:'found'}] },
      { id:'binary', name:'Binary Search', tagLabel:'O(log n)', category:'Searching',
        complexity:{best:'O(1)', avg:'O(log n)', worst:'O(log n)', space:'O(1)'},
        code:CODE_BINARY, lineTags:LINES_BINARY, controlType:'search',
        buildSteps:(p)=>binarySearchSteps(p.array, p.target),
        legend:[{color:'var(--amber)',label:'lo'},{color:'var(--teal)',label:'hi'},{color:'var(--violet)',label:'mid'},{color:'var(--green)',label:'found'}] }
    ]
  },
  stack: {
    label: 'Stack',
    items: [
      { id:'stackdemo', name:'Push / Pop / Peek', tagLabel:'O(1)', category:'Stack',
        complexity:{best:'O(1)', avg:'O(1)', worst:'O(1)', space:'O(n)'},
        code:CODE_STACK, lineTags:LINES_STACK, controlType:'none',
        buildSteps:()=>stackDemoSteps(),
        legend:[{color:'var(--amber)',label:'top of stack'}] }
    ]
  },
  queue: {
    label: 'Queue',
    items: [
      { id:'queuedemo', name:'Enqueue / Dequeue / Peek', tagLabel:'O(1)', category:'Queue',
        complexity:{best:'O(1)', avg:'O(1)', worst:'O(1)', space:'O(n)'},
        code:CODE_QUEUE, lineTags:LINES_QUEUE, controlType:'none',
        buildSteps:()=>queueDemoSteps(),
        legend:[{color:'var(--teal)',label:'front'},{color:'var(--violet)',label:'rear'}] }
    ]
  },
  linkedlist: {
    label: 'Linked List',
    items: [
      { id:'lldemo', name:'Insert / Delete / Traverse', tagLabel:'O(n)', category:'Linked List',
        complexity:{best:'O(1)', avg:'O(n)', worst:'O(n)', space:'O(n)'},
        code:CODE_LINKEDLIST, lineTags:LINES_LINKEDLIST, controlType:'none',
        buildSteps:()=>linkedListDemoSteps(),
        legend:[{color:'var(--teal)',label:'active/traversed node'},{color:'var(--violet)',label:'newly inserted'}] }
    ]
  },
  tree: {
    label: 'Tree (BST)',
    items: [
      { id:'bstdemo', name:'Insert + Traversals', tagLabel:'O(log n)', category:'Tree',
        complexity:{best:'O(log n)', avg:'O(log n)', worst:'O(n)', space:'O(n)'},
        code:CODE_BST, lineTags:LINES_BST, controlType:'treeArray',
        buildSteps:(p)=>bstDemoSteps(p.values),
        legend:[{color:'var(--amber)',label:'current node'},{color:'var(--green)',label:'visited'}] }
    ]
  },
  graph: {
    label: 'Graph',
    items: [
      { id:'bfs', name:'Breadth-First Search', tagLabel:'O(V+E)', category:'Graph',
        complexity:{best:'O(V+E)', avg:'O(V+E)', worst:'O(V+E)', space:'O(V)'},
        code:CODE_BFS, lineTags:LINES_BFS, controlType:'none',
        buildSteps:()=>bfsSteps(),
        legend:[{color:'var(--amber)',label:'current node'},{color:'var(--teal)',label:'in queue'},{color:'var(--green)',label:'visited'}] },
      { id:'dfs', name:'Depth-First Search', tagLabel:'O(V+E)', category:'Graph',
        complexity:{best:'O(V+E)', avg:'O(V+E)', worst:'O(V+E)', space:'O(V)'},
        code:CODE_DFS, lineTags:LINES_DFS, controlType:'none',
        buildSteps:()=>dfsSteps(),
        legend:[{color:'var(--amber)',label:'current node'},{color:'var(--green)',label:'visited'}] }
    ]
  },
  dp: {
    label: 'Dynamic Programming',
    items: [
      { id:'fib', name:'Fibonacci (Tabulation)', tagLabel:'O(n)', category:'Dynamic Programming',
        complexity:{best:'O(n)', avg:'O(n)', worst:'O(n)', space:'O(n)'},
        code:CODE_FIB, lineTags:LINES_FIB, controlType:'fib',
        buildSteps:(p)=>fibSteps(p.n),
        legend:[{color:'var(--amber)',label:'current dp[i]'}] },
      { id:'knapsack', name:'0/1 Knapsack', tagLabel:'O(n·W)', category:'Dynamic Programming',
        complexity:{best:'O(n·W)', avg:'O(n·W)', worst:'O(n·W)', space:'O(n·W)'},
        code:CODE_KNAPSACK, lineTags:LINES_KNAPSACK, controlType:'none',
        buildSteps:()=>knapsackSteps([2,3,4,5],[3,4,5,6],5),
        legend:[{color:'var(--amber)',label:'active cell'}] },
      { id:'lcs', name:'Longest Common Subsequence', tagLabel:'O(m·n)', category:'Dynamic Programming',
        complexity:{best:'O(m·n)', avg:'O(m·n)', worst:'O(m·n)', space:'O(m·n)'},
        code:CODE_LCS, lineTags:LINES_LCS, controlType:'none',
        buildSteps:()=>lcsSteps('ABCBDAB','BDCABA'),
        legend:[{color:'var(--amber)',label:'active cell'}] }
    ]
  }
};

/* ---------------------------------------------------------------------
   Dynamic per-algorithm parameter controls
--------------------------------------------------------------------- */
function buildDynamicControls(item){
  const host = document.getElementById('dynamicControls');
  host.innerHTML = '';
  if(item.controlType==='array'){
    const genBtn = document.createElement('button');
    genBtn.className='btn'; genBtn.textContent='🎲 New Random Array';
    genBtn.onclick = function(){ runAlgorithm(item, {array: randArray(9)}); };
    host.appendChild(genBtn);
    APP.params.array = APP.params.array && APP.params.array.length ? APP.params.array : randArray(9);
  } else if(item.controlType==='search'){
    const arr = APP.params.array && APP.params.array.length ? APP.params.array : randArray(9);
    APP.params.array = arr;
    const genBtn = document.createElement('button');
    genBtn.className='btn'; genBtn.textContent='🎲 New Random Array';
    genBtn.onclick = function(){
      const a = randArray(9);
      runAlgorithm(item, {array:a, target:a[Math.floor(Math.random()*a.length)]});
    };
    const input = document.createElement('input');
    input.className='mini-input'; input.type='number'; input.placeholder='target';
    input.value = APP.params.target || arr[0];
    const goBtn = document.createElement('button');
    goBtn.className='btn primary'; goBtn.textContent='Search';
    goBtn.onclick = function(){
      runAlgorithm(item, {array:APP.params.array, target: parseInt(input.value,10) || 0});
    };
    host.appendChild(genBtn); host.appendChild(input); host.appendChild(goBtn);
  } else if(item.controlType==='treeArray'){
    const input = document.createElement('input');
    input.className='mini-input wide'; input.type='text';
    input.value = (APP.params.values||[50,30,70,20,40,60,80]).join(',');
    const goBtn = document.createElement('button');
    goBtn.className='btn primary'; goBtn.textContent='Build Tree';
    goBtn.onclick = function(){
      const values = input.value.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));
      runAlgorithm(item, {values: values.length? values : [50,30,70]});
    };
    host.appendChild(input); host.appendChild(goBtn);
  } else if(item.controlType==='fib'){
    const input = document.createElement('input');
    input.className='mini-input'; input.type='number'; input.min=2; input.max=15;
    input.value = APP.params.n || 8;
    const goBtn = document.createElement('button');
    goBtn.className='btn primary'; goBtn.textContent='Compute';
    goBtn.onclick = function(){
      let n = parseInt(input.value,10); if(isNaN(n)||n<2) n=2; if(n>15) n=15;
      runAlgorithm(item, {n:n});
    };
    host.appendChild(input); host.appendChild(goBtn);
  }
}

/* ---------------------------------------------------------------------
   Selection + run
--------------------------------------------------------------------- */
function selectAlgorithm(catKey, id){
  const cat = ALGO_REGISTRY[catKey];
  const item = cat.items.find(x=>x.id===id);
  if(!item) return;
  markActiveSidebar(catKey, id);
  APP.currentCategory = catKey;
  let params = {};
  if(item.controlType==='array') params = {array: randArray(9)};
  else if(item.controlType==='search'){ const a = randArray(9); params = {array:a, target:a[Math.floor(Math.random()*a.length)]}; }
  else if(item.controlType==='treeArray') params = {values:[50,30,70,20,40,60,80]};
  else if(item.controlType==='fib') params = {n:8};
  runAlgorithm(item, params);
}

function runAlgorithm(item, params){
  pausePlay();
  APP.currentAlgo = item;
  APP.params = params || {};
  APP.steps = item.buildSteps(APP.params);
  APP.stepIndex = 0;
  renderComplexity(item);
  renderLegend(item.legend);
  buildDynamicControls(item);
  buildLangTabs();
  renderCodePanel();
  renderStep();
}

/* ---------------------------------------------------------------------
   Wire up static controls + keyboard shortcuts + init
--------------------------------------------------------------------- */
document.getElementById('btnPlay').addEventListener('click', playPause);
document.getElementById('btnStep').addEventListener('click', function(){ pausePlay(); stepForward(); });
document.getElementById('btnPrev').addEventListener('click', function(){ pausePlay(); stepBackward(); });
document.getElementById('btnReset').addEventListener('click', resetPlay);
document.getElementById('speedSlider').addEventListener('input', function(e){
  APP.speed = parseInt(e.target.value,10);
  if(APP.playing){ startPlay(); }
});
document.addEventListener('keydown', function(e){
  if(e.code==='Space'){ e.preventDefault(); playPause(); }
  else if(e.code==='ArrowRight'){ e.preventDefault(); pausePlay(); stepForward(); }
  else if(e.code==='ArrowLeft'){ e.preventDefault(); pausePlay(); stepBackward(); }
});

/* ---------------------------------------------------------------------
   Mobile sidebar drawer (hamburger menu)
--------------------------------------------------------------------- */
const sidebarEl = document.getElementById('sidebar');
const backdropEl = document.getElementById('sidebarBackdrop');
const menuToggleEl = document.getElementById('menuToggle');

function openSidebar(){
  sidebarEl.classList.add('open');
  backdropEl.classList.add('show');
}
function closeSidebar(){
  sidebarEl.classList.remove('open');
  backdropEl.classList.remove('show');
}
menuToggleEl.addEventListener('click', function(){
  if(sidebarEl.classList.contains('open')) closeSidebar(); else openSidebar();
});
backdropEl.addEventListener('click', closeSidebar);

buildSidebar();
buildLangTabs();
selectAlgorithm('sorting','bubble');
