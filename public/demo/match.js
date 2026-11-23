(() => {
  const board = document.getElementById('matchBoard');
  const hint = document.getElementById('matchHint');
  const end = document.getElementById('matchEnd');
  const again = document.getElementById('matchAgain');
  const combo = document.getElementById('matchCombo');
  const progress = document.getElementById('matchProgress');
  const instructions = 'Сдвинь плод — собери три в ряд.';
  const names = ['Малина','Груша','Яблоко','Орех','Слива'];
  const width=6, target=9;
  let cells=[], selected=-1, moves=12, berries=0, resolving=false, finished=false, pointer=null;
  let roundId=0,bonus=0,focusIndex=0;
  const animations=new Set();
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
  function phase(value){board.dataset.phase=value;board.setAttribute('aria-busy',String(value!=='idle'));}
  function clearMotion(){for(const animation of animations)animation.cancel();animations.clear();}
  function motion(element,frames,duration,easing='cubic-bezier(.2,.7,.25,1)'){
    if(reduced.matches)return Promise.resolve();
    const animation=element.animate(frames,{duration,easing,fill:'both'});
    animations.add(animation);
    return animation.finished.catch(()=>{});
  }
  reduced.addEventListener('change',()=>{if(reduced.matches)clearMotion();});
  async function animateSwap(from,to,returning=false){
    phase(returning?'return':'swap');
    const a=board.children[from],b=board.children[to];
    const dx=b.offsetLeft-a.offsetLeft,dy=b.offsetTop-a.offsetTop;
    a.classList.add('swapping');b.classList.add('swapping');
    await Promise.all([a,b].map((tile,i)=>motion(tile.firstElementChild,
      [{transform:tile.firstElementChild.style.transform||'none'},{transform:'translate('+(i?-dx:dx)+'px,'+(i?-dy:dy)+'px)'}],
      returning?190:180,'cubic-bezier(.35,0,.2,1)'
    )));
  }
  async function animateClear(cascade){
    phase('clear');
    await Promise.all([...cascade.removed].map(index=>{
      const tile=board.children[index];
      tile.classList.add('pop');
      if(cascade.longest>=4)tile.classList.add(cascade.longest>=5?'match-five':'match-four');
      return motion(tile.firstElementChild,[
        {transform:'scale(1)',opacity:1},
        {transform:'scale(1.12)',opacity:1,offset:.35},
        {transform:'scale(.35)',opacity:0}
      ],cascade.longest>=4?340:260);
    }));
  }
  async function animateFalls(falls){
    phase('fall');
    const stride=board.children[width].offsetTop-board.children[0].offsetTop;
    await Promise.all(falls.map(({index,distance})=>motion(board.children[index].firstElementChild,[
      {transform:`translateY(${-distance*stride}px)`},
      {transform:'translateY(2px)',offset:.86},
      {transform:'none'}
    ],Math.min(480,230+distance*42),'cubic-bezier(.32,.02,.45,1)')));
  }
  function findLines(state){
    const removed=new Set(),lengths=[];
    for(const vertical of [false,true]){
      const step=vertical?width:1;
      for(let lane=0;lane<width;lane++){
        const start=vertical?lane:lane*width;
        for(let offset=0;offset<width;){
          const first=start+offset*step;
          let end=offset+1;
          while(end<width && state[start+end*step]===state[first])end++;
          if(end-offset>=3){
            lengths.push(end-offset);
            for(let n=offset;n<end;n++)removed.add(start+n*step);
          }
          offset=end;
        }
      }
    }
    return {removed,lengths};
  }
  function swap(board,a,b){[board[a],board[b]]=[board[b],board[a]];}
  function hasMove(board){
    for(let i=0;i<board.length;i++){
      for(const j of [i+1,i+width]){
        if(j>=board.length||(j===i+1&&j%width===0))continue;
        swap(board,i,j);const valid=findLines(board).removed.size>0;swap(board,i,j);if(valid)return true;
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
    clearMotion();
    const focusWasOnBoard = board.contains(document.activeElement);
    if(board.childElementCount!==cells.length){
      board.replaceChildren(...cells.map((_,i)=>{
        const button=document.createElement('button');
        button.type='button';button.className='piece';button.dataset.cell=i;
        const image=document.createElement('img');image.alt='';image.draggable=false;
        button.append(image);return button;
      }));
    }
    cells.forEach((n,i)=>{
      const button=board.children[i],image=button.firstElementChild;
      image.style.transform='';
      button.classList.toggle('chosen',i===selected);
      button.classList.remove('pop','swapping','match-four','match-five','swap-target','dragging');
      button.setAttribute('aria-pressed',String(i===selected));
      button.setAttribute('aria-label',names[n]+', ряд '+(1+Math.floor(i/width))+', место '+(1+i%width));
      button.disabled=finished;
      button.tabIndex=i===focusIndex?0:-1;
      const src='assets/piece-'+n+'.webp';
      if(image.getAttribute('src')!==src)image.src=src;
    });
    document.getElementById('matchGoal').textContent='Малина '+Math.min(target,berries)+' из '+target;
    document.getElementById('matchMoves').textContent='Ходы: '+moves;
    progress.value=Math.min(target,berries);
    progress.setAttribute('aria-valuetext',Math.min(target,berries)+' из '+target+' ягод малины');
    end.hidden=!finished;
    if(finished&&focusWasOnBoard)again.focus({preventScroll:true});
  }
  function start(){
    const prior=window.petDemo.stats().match?.id;
    roundId=Number.isSafeInteger(prior)&&prior>0?prior+1:1;
    cells=fillPlayable();selected=-1;moves=12;berries=0;bonus=0;finished=false;resolving=false;pointer=null;focusIndex=0;
    window.petDemo.storeGame('match',{id:roundId,cells:cells.slice(),moves,berries,bonus,finished,won:false});
    hint.textContent=instructions;combo.hidden=true;phase('idle');paint();
  }
  function outcome(){
    if(berries<target&&moves>0)return instructions;
    const reward=window.petDemo.stats().match?.reward;
    const headline=berries>=target?'Корзинка полна!':'Ходы закончились. Попробуешь ещё?';
    const items=[];
    if(reward?.leaves>0)items.push('Листья +'+reward.leaves);
    if(reward?.xp>0)items.push('Опыт +'+reward.xp);
    return items.length?headline+'\n'+items.join(' · '):headline;
  }
  function restore(){
    const game=window.petDemo.stats().match;
    if(!game || !Number.isSafeInteger(game.id) || game.id<1 ||
       !Array.isArray(game.cells) || game.cells.length!==36 ||
       !game.cells.every(n=>Number.isInteger(n)&&n>=0&&n<names.length) ||
       !Number.isInteger(game.moves)||game.moves<0||game.moves>12 ||
       !Number.isSafeInteger(game.berries)||game.berries<0 || findLines(game.cells).removed.size ||
       game.finished!==(game.berries>=target||game.moves===0) ||
       (!game.finished&&!hasMove(game.cells))){
      start();return;
    }
    roundId=game.id;cells=game.cells.slice();moves=game.moves;berries=game.berries;
    bonus=Math.max(0,Math.min(5,Number(game.bonus)||0));
    finished=game.finished;hint.textContent=outcome();phase('idle');paint();
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
    if(selected===i){selected=-1;hint.textContent=instructions;paint();return;}
    const distance=selected<0?0:Math.abs(i%width-selected%width)+Math.abs(Math.floor(i/width)-Math.floor(selected/width));
    if(distance!==1){selected=i;hint.textContent=names[cells[i]]+' · Выбери соседний плод.';paint();return;}
    const previous=selected;selected=-1;resolving=true;
    const next=cells.slice();swap(next,previous,i);
    let lines=findLines(next);
    if(!lines.removed.size){
      await animateSwap(previous,i);await awaitBoard();
      swap(cells,previous,i);paint();await animateSwap(previous,i,true);await awaitBoard();swap(cells,previous,i);
      hint.textContent='Нужна линия хотя бы из трёх плодов.';resolving=false;phase('idle');paint();return;
    }
    // Resolve once. Reloading during any animation restores exactly this outcome.
    const cascades=[];
    let collected=berries;
    while(lines.removed.size){
      const {removed,lengths}=lines;
      const longest=Math.max(...lengths);
      const extra=lengths.reduce((sum,n)=>sum+(n>=5?2:n===4?1:0),cascades.length?1:0);
      bonus=Math.min(5,bonus+extra);
      const before=next.slice();
      for(const index of removed)if(next[index]===0)collected++;
      const falls=dropPieces(next,removed);
      cascades.push({before,removed,falls,after:next.slice(),collected,longest});
      lines=findLines(next);
    }
    const remaining=moves-1,won=collected>=target,ended=won||remaining===0;
    const shuffle=!ended&&!hasMove(next);
    const settled=shuffle?fillPlayable():next;
    window.petDemo.storeGame('match',{id:roundId,cells:settled.slice(),moves:remaining,berries:collected,bonus,finished:ended,won});
    await animateSwap(previous,i);await awaitBoard();
    moves=remaining;hint.textContent='Плоды собраны!';
    for(const [i,cascade] of cascades.entries()){
      hint.textContent=(i>0?'Каскад ×'+(i+1)+' · ':'')+'В ряд '+cascade.longest;
      combo.hidden=cascade.longest<4&&i===0;
      combo.textContent=i>0?'Каскад ×'+(i+1):cascade.longest+' в ряд!';
      combo.dataset.level=cascade.longest>=5?'five':'four';
      cells=cascade.before;paint();
      await animateClear(cascade);await awaitBoard();
      cells=cascade.after;berries=cascade.collected;paint();
      await animateFalls(cascade.falls);
      await awaitBoard();
    }
    if(shuffle){
      phase('shuffle');
      await Promise.all([...board.children].map(tile=>motion(tile.firstElementChild,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.8)'}],140)));
    }
    cells=settled;finished=ended;resolving=false;
    combo.hidden=true;phase('idle');
    hint.textContent=shuffle?'Поле перемешано. Новый ход готов.':(!ended && bonus?'Бонус за комбинации: '+bonus:outcome());paint();
  }
  function swipeTarget(e){
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.hypot(dx,dy)<Math.max(12,board.children[pointer.start].offsetWidth*.22))return pointer.start;
    const horizontal=Math.abs(dx)>Math.abs(dy),step=horizontal?(dx>0?1:-1):(dy>0?width:-width);
    const target=pointer.start+step;
    return target<0||target>=cells.length||(horizontal&&Math.floor(target/width)!==Math.floor(pointer.start/width))?-1:target;
  }
  function cancelPointer(keepVisual=false){
    if(pointer&&board.hasPointerCapture(pointer.id))board.releasePointerCapture(pointer.id);
    pointer=null;
    for(const tile of board.children){
      tile.classList.remove('dragging','swap-target');
      if(!keepVisual)tile.firstElementChild.style.transform='';
    }
  }
  board.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-cell]');if(!b||resolving||finished||pointer||e.isPrimary===false||e.button!==0)return;
    pointer={id:e.pointerId,start:Number(b.dataset.cell),x:e.clientX,y:e.clientY};board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const target=swipeTarget(e);
    for(const tile of board.children){tile.classList.remove('dragging','swap-target');tile.firstElementChild.style.transform='';}
    if(target>=0&&target!==pointer.start){
      board.children[pointer.start].classList.add('dragging');board.children[target].classList.add('swap-target');
      const a=board.children[pointer.start],b=board.children[target],horizontal=Math.abs(target-pointer.start)===1;
      const pitch=horizontal?Math.abs(b.offsetLeft-a.offsetLeft):Math.abs(b.offsetTop-a.offsetTop);
      const distance=Math.max(-pitch*.85,Math.min(pitch*.85,horizontal?e.clientX-pointer.x:e.clientY-pointer.y));
      a.firstElementChild.style.transform=`translate${horizontal?'X':'Y'}(${distance}px)`;
      b.firstElementChild.style.transform=`translate${horizontal?'X':'Y'}(${-distance}px)`;
    }
  });
  board.addEventListener('pointercancel',e=>{if(pointer?.id===e.pointerId)cancelPointer();});
  board.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId)cancelPointer();});
  board.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const start=pointer.start,target=swipeTarget(e);cancelPointer(target>=0);
    if(target<0)return;
    if(start!==target)selected=start;choose(target);
  });
  board.addEventListener('click',e=>{if(e.detail===0&&e.target.closest('[data-cell]'))choose(Number(e.target.closest('[data-cell]').dataset.cell));});
  board.addEventListener('focusin',e=>{
    const cell=e.target.closest('[data-cell]');if(!cell)return;
    focusIndex=Number(cell.dataset.cell);
    for(const tile of board.children)tile.tabIndex=tile===cell?0:-1;
  });
  board.addEventListener('keydown',e=>{
    const cell=e.target.closest('[data-cell]');if(!cell)return;
    const i=Number(cell.dataset.cell),row=Math.floor(i/width),col=i%width;
    const next={ArrowLeft:col?i-1:i,ArrowRight:col<width-1?i+1:i,ArrowUp:row?i-width:i,ArrowDown:row<width-1?i+width:i,Home:row*width,End:row*width+width-1}[e.key];
    if(next!==undefined){e.preventDefault();board.children[next].focus({preventScroll:true});}
    else if(e.key==='Escape'&&!resolving){e.preventDefault();selected=-1;hint.textContent=instructions;paint();}
  });
  again.onclick=()=>{start();board.firstElementChild?.focus({preventScroll:true});};
  document.addEventListener('conceptscreen',e=>{cancelPointer();if(e.detail==='match'&&!cells.length)restore();});
})();
