/* Unified accessible navigation used on all TBench and UniJack pages. */
(()=>{
  const header=document.querySelector('#tb-unified-header');
  if(!header)return;
  const menu=header.querySelector('#tb-primary-menu');
  const toggle=header.querySelector('#tb-menu-toggle');
  const products=header.querySelector('#tb-products-button');
  const productsList=header.querySelector('#tb-product-links');
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
  document.documentElement.dataset.tbenchNavReady='true';
})();