(() => {
  const board = document.getElementById('matchBoard');
  const hint = document.getElementById('matchHint');
  const names = ['Малина','Груша','Яблоко','Орех','Слива'];
  const width=6, target=9;
  let cells=[], selected=-1, moves=12, berries=0, resolving=false, finished=false, pointer=null;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const randomPiece=()=>Math.floor(Math.random()*names.length);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function awaitBoard(){
    const visible=()=>!document.hidden&&document.getElementById('match').classList.contains('current');
    if(visible())return Promise.resolve();
    return new Promise(resolve=>{
      function resume(){
        if(!visible())return;
        document.removeEventListener('visibilitychange',resume);document.removeEventListener('conceptscreen',resume);
        resolve();
      }
      document.addEventListener('visibilitychange',resume);document.addEventListener('conceptscreen',resume);
    });
  }
  async function animateSwap(from,to){
    if(reduced.matches)return;
    const a=board.children[from],b=board.children[to];
    const dx=b.offsetLeft-a.offsetLeft,dy=b.offsetTop-a.offsetTop;
    await Promise.all([a,b].map((tile,i)=>tile.animate(
      [{transform:'none'},{transform:'translate('+(i?-dx:dx)+'px,'+(i?-dy:dy)+'px)'}],
      {duration:130,easing:'ease-in-out'}
    ).finished));
  }
  function matches(){
    const out=new Set();
    for(let i=0;i<cells.length;i++){
      for(const step of [1,width]){
        if(step===1 && i%width>width-3)continue;
        if(i+step*2>=cells.length)continue;
        if(cells[i]===cells[i+step]&&cells[i]===cells[i+step*2]){
          out.add(i);out.add(i+step);out.add(i+step*2);
        }
      }
    }
    return out;
  }
  function swap(a,b){[cells[a],cells[b]]=[cells[b],cells[a]];}
  function hasMove(){
    for(let i=0;i<cells.length;i++){
      for(const j of [i+1,i+width]){
        if(j>=cells.length||(j===i+1&&j%width===0))continue;
        swap(i,j);const valid=matches().size>0;swap(i,j);if(valid)return true;
      }
    }
    return false;
  }
  function fillPlayable(){
    do{
      cells=[];
      for(let i=0;i<width*width;i++){
        const allowed=names.map((_,n)=>n).filter(n=>
          !(i%width>=2&&cells[i-1]===n&&cells[i-2]===n)&&
          !(i>=2*width&&cells[i-width]===n&&cells[i-2*width]===n));
        cells.push(allowed[Math.floor(Math.random()*allowed.length)]);
      }
    }while(!hasMove());
  }
  function paint(){
    board.replaceChildren(...cells.map((n,i)=>{
      const b=document.createElement('button');b.className='piece'+(i===selected?' chosen':'');
      b.dataset.cell=i;b.setAttribute('aria-label',names[n]+', ряд '+(1+Math.floor(i/width))+', место '+(1+i%width));
      const img=document.createElement('img');img.alt='';img.draggable=false;img.src='assets/piece-'+n+'.webp';b.append(img);return b;
    }));
    document.getElementById('matchGoal').textContent='Малина '+Math.min(target,berries)+' / '+target;
    document.getElementById('matchMoves').textContent='Ходы: '+moves;
    document.getElementById('matchEnd').hidden=!finished;
  }
  function start(){
    fillPlayable();selected=-1;moves=12;berries=0;finished=false;resolving=false;
    hint.textContent='Поменяй соседние плоды местами.';paint();
  }
  async function choose(i){
    if(resolving||finished)return;
    if(selected===i){selected=-1;paint();return;}
    const distance=selected<0?0:Math.abs(i%width-selected%width)+Math.abs(Math.floor(i/width)-Math.floor(selected/width));
    if(distance!==1){selected=i;paint();return;}
    const previous=selected;selected=-1;resolving=true;
    await animateSwap(previous,i);await awaitBoard();
    swap(previous,i);
    let found=matches();
    if(!found.size){
      paint();await animateSwap(previous,i);await awaitBoard();swap(previous,i);
      hint.textContent='Нужна линия хотя бы из трёх плодов.';resolving=false;paint();return;
    }
    resolving=true;moves--;hint.textContent='Плоды собраны!';paint();
    while(found.size){
      for(const idx of found){if(cells[idx]===0)berries++;board.children[idx].classList.add('pop');}
      await delay(reduced.matches?0:210);await awaitBoard();
      const falls=[];
      for(let x=0;x<width;x++){
        const kept=[];
        for(let y=width-1;y>=0;y--){const k=y*width+x;if(!found.has(k))kept.push({piece:cells[k],row:y});}
        const added=width-kept.length;
        for(let y=width-1;y>=0;y--){
          const old=kept[width-1-y],index=y*width+x;
          cells[index]=old?.piece??randomPiece();
          const distance=old?y-old.row:added;
          if(distance>0)falls.push({index,distance});
        }
      }
      paint();
      if(!reduced.matches){
        await Promise.all(falls.map(({index,distance})=>board.children[index].animate(
          [{transform:'translateY(-'+distance*100+'%)',opacity:.65},{transform:'none',opacity:1}],
          {duration:Math.min(360,140+distance*46),easing:'cubic-bezier(.32,.04,.55,1)'}
        ).finished));
      }
      await awaitBoard();found=matches();
    }
    finished=berries>=target||moves===0;
    if(berries>=target){window.petDemo.gameReward();hint.textContent='Корзинка полна! +10 опыта и 5 листьев.';}
    else if(finished)hint.textContent='Ходы закончились. Попробуешь ещё?';
    else if(!hasMove()){fillPlayable();hint.textContent='Поле перемешано. Новый ход готов.';}
    resolving=false;paint();
  }
  board.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-cell]');if(!b||resolving||finished)return;
    pointer={id:e.pointerId,start:Number(b.dataset.cell)};board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointercancel',()=>pointer=null);
  board.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');
    const start=pointer.start;pointer=null;if(!cell)return;
    const end=Number(cell.dataset.cell);if(start!==end)selected=start;choose(end);
  });
  board.addEventListener('click',e=>{if(e.detail===0&&e.target.closest('[data-cell]'))choose(Number(e.target.closest('[data-cell]').dataset.cell));});
  document.getElementById('matchAgain').onclick=start;
  document.addEventListener('conceptscreen',e=>{if(e.detail==='match'&&!cells.length)start();});
})();
