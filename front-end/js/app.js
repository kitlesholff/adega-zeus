(function(){
  function allowOnlyTypedNumberChanges(){
    document.addEventListener('wheel',event=>{const input=event.target.closest?.('input[type="number"]');if(input)input.blur();},{capture:true,passive:true});
    document.addEventListener('keydown',event=>{if(event.target.matches?.('input[type="number"]')&&['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key))event.preventDefault();});
  }
  allowOnlyTypedNumberChanges();
  const money=(v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
  const productPrice=product=>{const sale=Number(product?.sale_price),original=Number(product?.price)||0;return sale>0&&sale<original?sale:original};
  const boxPrice=box=>{const sale=Number(box?.sale_price),original=Number(box?.price)||0;return sale>0&&sale<original?sale:original};
  const kitCount=product=>(product?.kit_items||[]).length;
  const sentenceCase=value=>String(value||'').trim().toLocaleLowerCase('pt-BR').replace(/\p{L}/u,letter=>letter.toLocaleUpperCase('pt-BR'));
  const alphabetical=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true}).compare;
  const productDisplayName=product=>sentenceCase(product?.kit_items?.length?product.kit_items.map(item=>item.name).join(' + '):product?.name||'');
  const isKitProduct=product=>Boolean(product?.kit_items?.length)||product?.product_type==='combo';
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const priceMarkup=product=>{const original=Number(product.price),sale=productPrice(product),promotional=sale<original,discount=promotional?Math.round((1-sale/original)*100):0;return promotional?`<s>${money(original)}</s><span>${money(sale)}</span><em class="promotion-discount">-${discount}%</em>`:money(original)};
  const boxPriceMarkup=box=>{const original=Number(box.price),sale=boxPrice(box),promotional=sale<original,discount=promotional?Math.round((1-sale/original)*100):0;return promotional?`<s>${money(original)}</s><span>${money(sale)}</span><em class="promotion-discount">-${discount}%</em>`:money(original)};
  const els={grid:document.querySelector('#productGrid'),categories:document.querySelector('#categories'),search:document.querySelector('#searchInput'),drawer:document.querySelector('#cartDrawer'),overlay:document.querySelector('#overlay'),items:document.querySelector('#cartItems'),empty:document.querySelector('#cartEmpty'),form:document.querySelector('#checkoutForm'),count:document.querySelector('#cartCount'),total:document.querySelector('#cartTotal'),toast:document.querySelector('#toast'),imageDialog:document.querySelector('#productImageDialog'),imageDialogPhoto:document.querySelector('#productImageDialogPhoto'),imageDialogTitle:document.querySelector('#productImageDialogTitle'),purchaseDialog:document.querySelector('#purchaseDialog'),purchaseForm:document.querySelector('#purchaseForm'),purchaseOptions:document.querySelector('#purchaseOptions'),purchaseDialogTitle:document.querySelector('#purchaseDialogTitle'),purchaseTotal:document.querySelector('#purchaseTotal')};
  let products=[];let cart=JSON.parse(localStorage.getItem('snoop_cart_v1')||'{}');let active='Todos';
  function toast(text){els.toast.textContent=text;els.toast.classList.add('show');setTimeout(()=>els.toast.classList.remove('show'),2400)}
  function persist(){localStorage.setItem('snoop_cart_v1',JSON.stringify(cart));renderCart()}
  function renderCategories(){const cats=['Todos',...[...new Set(products.map(p=>p.category).filter(c=>!/^kits?$/i.test(c)))].sort(alphabetical)];els.categories.replaceChildren(...cats.map(c=>{const button=document.createElement('button');button.type='button';button.className=`category-button ${c===active?'active':''}`;button.dataset.category=c;button.textContent=sentenceCase(c);button.setAttribute('aria-pressed',String(c===active));button.setAttribute('aria-controls','productGrid');return button}))}
  function catalogGroups(){
    const byId=new Map(products.map(p=>[p.id,p])),groups=new Map();
    for(const product of products){
      const base=byId.get(product.parent_product_id)||product;
      if(!groups.has(base.id))groups.set(base.id,{base,options:[]});
      const group=groups.get(base.id);
      group.options.push({...product,orderVariant:'unit',optionKey:product.id});
      if(product.box_option&&!products.some(p=>p.parent_product_id===product.id)){
        const box=product.box_option;
        group.options.push({...box,id:product.id,name:`Fardo de ${product.name} (${box.units} un.)`,category:'Fardo',box_units:box.units,orderVariant:'box',optionKey:product.id+'::box'});
      }
    }
    for(const group of groups.values())group.options.sort((a,b)=>Number(a.id!==group.base.id||a.orderVariant==='box')-Number(b.id!==group.base.id||b.orderVariant==='box'));
    return [...groups.values()];
  }
  function renderProducts(){
    const mobile=window.matchMedia('(max-width: 820px)').matches;
    const openCategories=new Set([...els.grid.querySelectorAll('details[open]')].map(item=>item.dataset.catalogCategory));
    const term=els.search.value.trim().toLowerCase();
    const filtered=catalogGroups().filter(group=>(active==='Todos'||group.options.some(p=>p.category===active))&&group.options.some(p=>[p.name,p.description,...(p.kit_items||[]).map(i=>i.name)].join(' ').toLowerCase().includes(term)));
    const sortGroups=(groups,category)=>groups.sort((a,b)=>alphabetical(productDisplayName(a.options.find(p=>p.category===category)||a.options[0]),productDisplayName(b.options.find(p=>p.category===category)||b.options[0])));
    const renderCard=({base,options},category=active)=>{
      const selected=options.find(p=>p.category===category)||options[0];
      const kit=selected.kit_items||[],promotional=productPrice(selected)<Number(selected.price),displayName=productDisplayName(selected),items=kitCount(selected);
      return `<article class="product-card" data-product-card="${escapeHtml(base.id)}"><button type="button" class="product-image" data-view-product-image aria-label="Ampliar imagem de ${escapeHtml(displayName)}"><img data-product-image src="${escapeHtml(selected.image)}" alt="${escapeHtml(displayName)}" loading="lazy"></button><div class="product-content"><span class="product-category">${escapeHtml(sentenceCase(selected.category))}${promotional?`<b class="promotion-badge">${escapeHtml(selected.promotion_label||'Promoção')}</b>`:''}${kit.length?`<b class="kit-badge">Combo · ${items} ${items===1?'item':'itens'}</b>`:''}</span><h3>${escapeHtml(displayName)}</h3><p>${escapeHtml(selected.description||'')}</p>${kit.length?`<p class="product-kit-summary">Inclui: ${kit.map(item=>`${item.quantity?item.quantity+'x ':''}${escapeHtml(item.name)}`).join(' + ')}</p>`:''}<div class="product-buy"><strong class="product-price ${promotional?'promotional':''}">${priceMarkup(selected)}</strong><button class="add-button" data-add="${escapeHtml(base.id)}" data-default-option="${escapeHtml(selected.optionKey)}">Adicionar</button></div></div></article>`;
    };
    if(mobile){
      const categories=[...new Set(filtered.flatMap(group=>group.options.map(p=>p.category)))].sort(alphabetical);
      els.grid.innerHTML=categories.map(category=>{
        const groups=sortGroups(filtered.filter(group=>group.options.some(p=>p.category===category)),category);
        return `<details class="catalog-category" data-catalog-category="${escapeHtml(category)}" ${term||openCategories.has(category)?'open':''}><summary><span class="catalog-category-arrow" aria-hidden="true">›</span><span>${escapeHtml(sentenceCase(category))}</span><small>${groups.length}</small></summary><div class="catalog-category-list">${groups.map(group=>renderCard(group,category)).join('')}</div></details>`;
      }).join('');
    }else els.grid.innerHTML=sortGroups(filtered,active).map(group=>renderCard(group)).join('');
    document.querySelector('#emptyState').hidden=filtered.length>0;
    const results=document.querySelector('#catalogResults');if(results)results.textContent=`${filtered.length} ${filtered.length===1?'produto':'produtos'} · ${active==='Todos'?'Todas as categorias':sentenceCase(active)}${term?' · Busca ativa':''}`;
  }
  window.matchMedia('(max-width: 820px)').addEventListener('change',()=>{active='Todos';renderCategories();renderProducts()});
  let pendingPurchaseOptions=[];
  function purchaseQuantity(optionKey){const input=els.purchaseOptions.querySelector(`[data-purchase-quantity="${CSS.escape(optionKey)}"]`),value=Math.trunc(Number(input?.value)||1);return Math.min(99,Math.max(1,value))}
  function purchaseTotalMarkup(option,quantity){const original=Number(option.price)*quantity,sale=productPrice(option)*quantity,promotional=productPrice(option)<Number(option.price);return priceMarkup({price:original,sale_price:promotional?sale:null})}
  function updatePurchaseTotals(){
    for(const option of pendingPurchaseOptions){const quantity=purchaseQuantity(option.optionKey),price=els.purchaseOptions.querySelector(`[data-option-total="${CSS.escape(option.optionKey)}"]`);if(price)price.innerHTML=purchaseTotalMarkup(option,quantity)}
    const selectedKey=els.purchaseForm.elements.purchaseOption?.value,selected=pendingPurchaseOptions.find(option=>option.optionKey===selectedKey);els.purchaseTotal.textContent=selected?money(productPrice(selected)*purchaseQuantity(selected.optionKey)):money(0);
  }
  function openPurchaseDialog(baseId,defaultOption){
    const group=catalogGroups().find(item=>item.base.id===baseId);if(!group)return;
    pendingPurchaseOptions=group.options;
    els.purchaseDialogTitle.textContent=productDisplayName(group.base);
    els.purchaseOptions.innerHTML=group.options.map(option=>{const checked=option.optionKey===(defaultOption||group.options[0].optionKey),box=Boolean(option.box_units)||/^(fardo|caixinhas)$/i.test(option.category),kit=isKitProduct(option),items=kitCount(option),promotional=productPrice(option)<Number(option.price),label=kit?'combos':box?(option.box_units?`fardos de ${option.box_units} unidades`:'fardos'):'unidades';return `<label class="purchase-option"><input type="radio" name="purchaseOption" value="${escapeHtml(option.optionKey)}" ${checked?'checked':''}><span class="purchase-option-image"><img src="${escapeHtml(option.image)}" alt=""></span><span class="purchase-option-copy"><strong>${kit?'Combo completo':box?(option.box_units?`Fardo · ${option.box_units} un.`:'Fardo'):'Unidade'}</strong><small>${kit?(items?`${items} ${items===1?'produto':'produtos'} no combo`:'Composição não informada'):box?'Caixa fechada':'Produto avulso'}</small></span><span class="purchase-quantity" aria-label="Quantidade"><button type="button" data-purchase-delta="-1" data-option-key="${escapeHtml(option.optionKey)}" aria-label="Diminuir quantidade de ${label}">−</button><input type="number" inputmode="numeric" min="1" max="99" step="1" value="1" data-purchase-quantity="${escapeHtml(option.optionKey)}" aria-label="Quantidade de ${label}"><button type="button" data-purchase-delta="1" data-option-key="${escapeHtml(option.optionKey)}" aria-label="Aumentar quantidade de ${label}">+</button></span><b class="purchase-option-price ${promotional?'promotional':''}" data-option-total="${escapeHtml(option.optionKey)}">${priceMarkup(option)}</b></label>`}).join('');
    updatePurchaseTotals();
    els.purchaseDialog.showModal();
    els.purchaseOptions.querySelector('input:checked')?.focus({preventScroll:true});
  }
  function cartLines(){return Object.entries(cart).map(([cartId,quantity])=>{const [id,variant='unit']=cartId.split('::'),product=products.find(p=>p.id===id);if(!product)return null;const box=variant==='box'?product.box_option:null;if(variant==='box'&&!box)return null;return{...product,cartId,variant,quantity,name:box?`Fardo de ${product.name} (${box.units} un.)`:productDisplayName(product),price:box?boxPrice(box):productPrice(product),image:box?.image||product.image}}).filter(Boolean)}
  function renderCart(){const lines=cartLines();const count=lines.reduce((s,i)=>s+i.quantity,0);const total=lines.reduce((s,i)=>s+i.price*i.quantity,0);els.count.textContent=count;els.total.textContent=money(total);els.empty.hidden=lines.length>0;els.form.hidden=!lines.length;els.items.innerHTML=lines.map(i=>`<div class="cart-line"><img src="${escapeHtml(i.image)}" alt=""><div><h4>${escapeHtml(i.name)}</h4><small>${money(i.price*i.quantity)}</small><div class="quantity"><button data-qty="${escapeHtml(i.cartId)}" data-delta="-1">−</button><b>${i.quantity}</b><button data-qty="${escapeHtml(i.cartId)}" data-delta="1">+</button></div></div><button class="remove-button" data-remove="${escapeHtml(i.cartId)}">Remover</button></div>`).join('')}
  function openCart(){els.overlay.hidden=false;els.drawer.classList.add('open');els.drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}function closeCart(){els.drawer.classList.remove('open');els.drawer.setAttribute('aria-hidden','true');els.overlay.hidden=true;document.body.style.overflow=''}
  els.grid.addEventListener('click',e=>{const imageButton=e.target.closest('[data-view-product-image]');if(imageButton){const image=imageButton.querySelector('img');els.imageDialogPhoto.src=image.src;els.imageDialogPhoto.alt=image.alt;els.imageDialogTitle.textContent=image.alt;els.imageDialog.showModal();return}const add=e.target.closest('[data-add]');if(add)openPurchaseDialog(add.dataset.add,add.dataset.defaultOption)});
  els.purchaseOptions.addEventListener('click',event=>{const button=event.target.closest('[data-purchase-delta]');if(!button)return;event.preventDefault();const optionKey=button.dataset.optionKey,input=els.purchaseOptions.querySelector(`[data-purchase-quantity="${CSS.escape(optionKey)}"]`),radio=els.purchaseOptions.querySelector(`input[name="purchaseOption"][value="${CSS.escape(optionKey)}"]`);radio.checked=true;input.value=Math.min(99,Math.max(1,(Number(input.value)||1)+Number(button.dataset.purchaseDelta)));updatePurchaseTotals()});
  els.purchaseOptions.addEventListener('input',event=>{const input=event.target.closest('[data-purchase-quantity]');if(!input)return;els.purchaseOptions.querySelector(`input[name="purchaseOption"][value="${CSS.escape(input.dataset.purchaseQuantity)}"]`).checked=true;updatePurchaseTotals()});
  els.purchaseOptions.addEventListener('change',event=>{const input=event.target.closest('[data-purchase-quantity]');if(input)input.value=purchaseQuantity(input.dataset.purchaseQuantity);updatePurchaseTotals()});
  els.purchaseForm.addEventListener('submit',event=>{event.preventDefault();const optionKey=new FormData(els.purchaseForm).get('purchaseOption'),option=pendingPurchaseOptions.find(item=>item.optionKey===optionKey);if(!option)return;const quantity=purchaseQuantity(option.optionKey),key=`${option.id}::${option.orderVariant||'unit'}`,isKit=Boolean(option.kit_items?.length);cart[key]=(cart[key]||0)+quantity;persist();els.purchaseDialog.close();toast(`${quantity} ${isKit?(quantity===1?'combo adicionado':'combos adicionados'):option.box_units?(quantity===1?'fardo adicionado':'fardos adicionados'):(quantity===1?'produto adicionado':'produtos adicionados')} ao carrinho`)});
  document.querySelector('#closePurchaseDialog').addEventListener('click',()=>els.purchaseDialog.close());
  els.purchaseDialog.addEventListener('click',event=>{if(event.target===els.purchaseDialog)els.purchaseDialog.close()});
  els.categories.addEventListener('click',e=>{const button=e.target.closest('[data-category]');if(!button)return;active=button.dataset.category;els.categories.querySelectorAll('[data-category]').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected))});renderProducts()});els.search.addEventListener('input',renderProducts);
  els.items.addEventListener('click',e=>{const id=e.target.dataset.qty||e.target.dataset.remove;if(!id)return;if(e.target.dataset.remove)delete cart[id];else{cart[id]+=Number(e.target.dataset.delta);if(cart[id]<=0)delete cart[id]}persist()});
  document.querySelector('#openCart').addEventListener('click',openCart);document.querySelector('#closeCart').addEventListener('click',closeCart);els.overlay.addEventListener('click',closeCart);
  document.querySelector('#closeProductImage').addEventListener('click',()=>els.imageDialog.close());els.imageDialog.addEventListener('click',e=>{if(e.target===els.imageDialog)els.imageDialog.close()});
  els.form.deliveryType.addEventListener('change',()=>{const delivery=els.form.deliveryType.value==='Entrega';document.querySelector('#addressField').hidden=!delivery;els.form.address.required=delivery});
  els.form.addEventListener('submit',async e=>{e.preventDefault();const lines=cartLines();if(!lines.length)return;const form=new FormData(els.form);const total=lines.reduce((s,i)=>s+i.price*i.quantity,0);const button=els.form.querySelector('button[type=submit]');button.disabled=true;button.querySelector('strong').textContent='Registrando...';try{const order=await StoreAPI.createOrder({customerName:form.get('customerName').trim(),deliveryType:form.get('deliveryType'),address:form.get('address').trim(),payment:form.get('payment'),notes:form.get('notes').trim(),clientTotal:total,items:lines.map(i=>({productId:i.id,quantity:i.quantity,variant:i.variant}))});const itemText=order.items.map(i=>`• ${i.quantity}x ${i.name} — ${money(i.subtotal)}`).join('\n');const msg=`Olá! Quero fazer este pedido:\n\n*Pedido ${order.code}*\n${itemText}\n\n*Total dos produtos: ${money(order.trustedTotal)}*\n\nCliente: ${order.customerName}\n${order.deliveryType}: ${order.address||'Retirada no local'}\nPagamento: ${order.payment}${order.notes?`\nObservação: ${order.notes}`:''}\n\nCódigo para conferência: ${order.code}`;window.open(`https://wa.me/${APP_CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`,'_blank','noopener');cart={};persist();els.form.reset();closeCart();toast(`Pedido ${order.code} registrado`) }catch(err){toast(err.message||'Não foi possível registrar o pedido.')}finally{button.disabled=false;button.querySelector('strong').textContent='Enviar pedido'}});
  window.addEventListener('zeus:buy-product',event=>{const product=products.find(item=>item.id===event.detail?.productId&&item.available);if(!product)return;const base=products.find(item=>item.id===product.parent_product_id)||product,optionKey=product.parent_product_id?product.id:event.detail?.variant==='box'?product.id+'::box':product.id;openPurchaseDialog(base.id,optionKey)});
  let refreshingCatalog=false,catalogSnapshot=null;
  async function refreshCatalog(initial=false){
    if(refreshingCatalog)return;
    refreshingCatalog=true;
    try{
      const latest=await StoreAPI.getProducts(),snapshot=JSON.stringify(latest);
      if(snapshot===catalogSnapshot)return;
      products=latest;catalogSnapshot=snapshot;
      for(const [key,quantity] of Object.entries(cart)){
        const [id,variant]=key.split('::');
        if(variant!=='box')continue;
        const box=products.find(p=>p.parent_product_id===id);
        if(box){const newKey=`${box.id}::unit`;cart[newKey]=(cart[newKey]||0)+quantity;delete cart[key];}
      }
      localStorage.setItem('snoop_cart_v1',JSON.stringify(cart));
      if(active!=='Todos'&&!products.some(p=>p.category===active))active='Todos';
      renderCategories();renderProducts();renderCart();
      window.dispatchEvent(new CustomEvent('zeus:products-loaded',{detail:{products}}));
    }catch(error){if(initial)toast('Erro ao carregar o catálogo.');}
    finally{refreshingCatalog=false;}
  }
  els.form.address.required=true;
  refreshCatalog(true);
  setInterval(()=>{if(!document.hidden)refreshCatalog();},10000);
  window.addEventListener('focus',()=>refreshCatalog());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalog();});
  window.addEventListener('storage',event=>{if(event.key==='snoop_products_v1')refreshCatalog();});
})();
