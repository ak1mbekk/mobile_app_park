(() => {
  const board = document.getElementById('matchBoard');
  const hint = document.getElementById('matchHint');
  const names = ['Малина','Груша','Яблоко','Орех','Слива'];
  const width=6, target=9;
  let cells=[], selected=-1, moves=12, berries=0, resolving=false, finished=false, pointer=null;
  let roundId=0;
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
  function matches(board){
    const out=new Set();
    for(let i=0;i<board.length;i++){
      for(const step of [1,width]){
        if(step===1 && i%width>width-3)continue;
        if(i+step*2>=board.length)continue;
        if(board[i]===board[i+step]&&board[i]===board[i+step*2]){
          out.add(i);out.add(i+step);out.add(i+step*2);
        }
      }
    }
    return out;
  }
  function swap(board,a,b){[board[a],board[b]]=[board[b],board[a]];}
  function hasMove(board){
    for(let i=0;i<board.length;i++){
      for(const j of [i+1,i+width]){
        if(j>=board.length||(j===i+1&&j%width===0))continue;
        swap(board,i,j);const valid=matches(board).size>0;swap(board,i,j);if(valid)return true;
      }
    }
    return false;
  }
  function fillPlayable(){
    let board;
    do{
      board=[];
      for(let i=0;i<width*width;i++){
        const allowed=names.map((_,n)=>n).filter(n=>
          !(i%width>=2&&board[i-1]===n&&board[i-2]===n)&&
          !(i>=2*width&&board[i-width]===n&&board[i-2*width]===n));
        board.push(allowed[Math.floor(Math.random()*allowed.length)]);
      }
    }while(!hasMove(board));
    return board;
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
    const prior=window.petDemo.stats().match?.id;
    roundId=Number.isSafeInteger(prior)&&prior>0?prior+1:1;
    cells=fillPlayable();selected=-1;moves=12;berries=0;finished=false;resolving=false;
    window.petDemo.storeGame('match',{id:roundId,cells:cells.slice(),moves,berries,finished,won:false});
    hint.textContent='Поменяй соседние плоды местами.';paint();
  }
  function outcome(){
    if(berries>=target)return 'Корзинка полна! +10 опыта и 5 листьев.';
    if(moves===0)return 'Ходы закончились. Попробуешь ещё?';
    return 'Поменяй соседние плоды местами.';
  }
  function restore(){
    const game=window.petDemo.stats().match;
    if(!game || !Number.isSafeInteger(game.id) || game.id<1 ||
       !Array.isArray(game.cells) || game.cells.length!==36 ||
       !game.cells.every(n=>Number.isInteger(n)&&n>=0&&n<names.length) ||
       !Number.isInteger(game.moves)||game.moves<0||game.moves>12 ||
       !Number.isSafeInteger(game.berries)||game.berries<0 || matches(game.cells).size ||
       game.finished!==(game.berries>=target||game.moves===0) ||
       (!game.finished&&!hasMove(game.cells))){
      start();return;
    }
    roundId=game.id;cells=game.cells.slice();moves=game.moves;berries=game.berries;
    finished=game.finished;hint.textContent=outcome();paint();
  }
  function dropPieces(next,removed){
    const falls=[];
    for(let x=0;x<width;x++){
      const kept=[];
      for(let y=width-1;y>=0;y--){
        const index=y*width+x;
        if(!removed.has(index))kept.push({piece:next[index],row:y});
      }
      const added=width-kept.length;
      for(let y=width-1;y>=0;y--){
        const old=kept[width-1-y],index=y*width+x;
        next[index]=old?.piece??randomPiece();
        const distance=old?y-old.row:added;
        if(distance>0)falls.push({index,distance});
      }
    }
    return falls;
  }
  async function choose(i){
    if(resolving||finished)return;
    if(selected===i){selected=-1;paint();return;}
    const distance=selected<0?0:Math.abs(i%width-selected%width)+Math.abs(Math.floor(i/width)-Math.floor(selected/width));
    if(distance!==1){selected=i;paint();return;}
    const previous=selected;selected=-1;resolving=true;
    const next=cells.slice();swap(next,previous,i);
    let removed=matches(next);
    if(!removed.size){
      await animateSwap(previous,i);await awaitBoard();
      swap(cells,previous,i);paint();await animateSwap(previous,i);await awaitBoard();swap(cells,previous,i);
      hint.textContent='Нужна линия хотя бы из трёх плодов.';resolving=false;paint();return;
    }
    // Resolve once. Reloading during any animation restores exactly this outcome.
    const cascades=[];
    let collected=berries;
    while(removed.size){
      const before=next.slice();
      for(const index of removed)if(next[index]===0)collected++;
      const falls=dropPieces(next,removed);
      cascades.push({before,removed,falls,after:next.slice(),collected});
      removed=matches(next);
    }
    const remaining=moves-1,won=collected>=target,ended=won||remaining===0;
    const shuffle=!ended&&!hasMove(next);
    const settled=shuffle?fillPlayable():next;
    window.petDemo.storeGame('match',{id:roundId,cells:settled.slice(),moves:remaining,berries:collected,finished:ended,won});
    await animateSwap(previous,i);await awaitBoard();
    moves=remaining;hint.textContent='Плоды собраны!';
    for(const cascade of cascades){
      cells=cascade.before;paint();
      for(const index of cascade.removed)board.children[index].classList.add('pop');
      await delay(reduced.matches?0:210);await awaitBoard();
      cells=cascade.after;berries=cascade.collected;paint();
      if(!reduced.matches){
        await Promise.all(cascade.falls.map(({index,distance})=>board.children[index].animate(
          [{transform:'translateY(-'+distance*100+'%)',opacity:.65},{transform:'none',opacity:1}],
          {duration:Math.min(360,140+distance*46),easing:'cubic-bezier(.32,.04,.55,1)'}
        ).finished));
      }
      await awaitBoard();
    }
    cells=settled;finished=ended;resolving=false;
    hint.textContent=shuffle?'Поле перемешано. Новый ход готов.':outcome();paint();
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
  document.addEventListener('conceptscreen',e=>{if(e.detail==='match'&&!cells.length)restore();});
})();
