(() => {
  const control=document.getElementById('visitor-theme');
  const preference=matchMedia('(prefers-color-scheme: dark)');
  let choice;
  try {choice=localStorage.getItem('zk-theme');} catch {}
  function apply(){
    const dark=choice==='dark'||(choice!=='light' && preference.matches);
    document.documentElement.classList.toggle('dark',dark);
    control.setAttribute('aria-pressed',String(dark));
  }
  control.onclick=()=>{
    choice=document.documentElement.classList.contains('dark')?'light':'dark';
    try {localStorage.setItem('zk-theme',choice);} catch {}
    apply();
  };
  preference.addEventListener('change',apply);
  apply();
})();
