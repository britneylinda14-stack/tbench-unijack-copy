/* Unified accessible navigation used on all TBench and UniJack pages. */
(()=>{
  const header=document.querySelector('#tb-unified-header');
  if(!header)return;
  const menu=header.querySelector('#tb-primary-menu');
  const toggle=header.querySelector('#tb-menu-toggle');
  const products=header.querySelector('#tb-products-button');
  const productsList=header.querySelector('#tb-product-links');
  // Keep the two company editorial pages accessible from every existing header.
  const companyRoot=new URL('./',document.currentScript.src);
  const about=[...menu.querySelectorAll('a')].find(link=>link.textContent.trim()==='About');
  if(about){
    [['Research','research/'],['News','news/']].forEach(([label,path])=>{
      if([...menu.querySelectorAll('a')].some(a=>a.textContent.trim()===label))return;
      const link=document.createElement('a');link.textContent=label;link.href=new URL(path,companyRoot).href;
      menu.insertBefore(link,about);
    });
  }

  if(!menu||!toggle||!products||!productsList)return;
  const setProducts=open=>{productsList.hidden=!open;products.setAttribute('aria-expanded',String(open))};
  const setMenu=open=>{
    header.dataset.menuOpen=String(open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');
    if(!open)setProducts(false);
  };
  setProducts(false);setMenu(false);
  toggle.addEventListener('click',()=>setMenu(header.dataset.menuOpen!=='true'));
  products.addEventListener('click',()=>setProducts(products.getAttribute('aria-expanded')!=='true'));
  menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('click',e=>{
    if(!header.contains(e.target)){setMenu(false);return}
    if(!products.parentElement.contains(e.target))setProducts(false);
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!productsList.hidden){setProducts(false);products.focus()}
    else if(header.dataset.menuOpen==='true'){setMenu(false);toggle.focus()}
  });
  window.matchMedia('(min-width:1121px)').addEventListener('change',e=>{if(e.matches)setMenu(false)});
  // The header blends with the band beneath it: light over light sections,
  // dark otherwise. Checked a few times a second while scrolling.
  const themeOf=new WeakMap();let themeTimer=0;
  const bandTheme=()=>{
    themeTimer=0;let theme='dark';
    if(header.dataset.menuOpen!=='true'){
      const under=y=>document.elementsFromPoint(innerWidth/2,y).find(el=>!header.contains(el)&&!el.closest('.local-nav'));
      const bottom=header.getBoundingClientRect().bottom;
      // Sample the band behind the bar; at the very top of a page only the page ground is there, so look just below.
      let top=under(bottom*.6);if(!top||top===document.body||top===document.documentElement)top=under(bottom+2);
      for(let n=top;n&&n.nodeType===1;n=n.parentElement){
        let t=themeOf.get(n);
        if(t===undefined){const c=getComputedStyle(n).backgroundColor.match(/[\d.]+/g);t=null;if(c&&(c.length<4||+c[3]>.5))t=(.2126*c[0]+.7152*c[1]+.0722*c[2])/255>.6?'light':'dark';themeOf.set(n,t)}
        if(t){theme=t;break}
      }
    }
    if(header.dataset.theme!==theme){header.dataset.theme=theme;document.documentElement.dataset.headerTheme=theme}
  };
  const queueTheme=()=>{if(!themeTimer)themeTimer=setTimeout(bandTheme,120)};
  addEventListener('scroll',queueTheme,{passive:true});addEventListener('resize',queueTheme);
  toggle.addEventListener('click',()=>setTimeout(bandTheme,0));
  bandTheme();
  document.documentElement.dataset.tbenchNavReady='true';
})();