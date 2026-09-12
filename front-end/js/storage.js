(function () {
  const cfg = window.APP_CONFIG;
  const cloudConfigured = Boolean(cfg.supabaseUrl || cfg.supabaseAnonKey);
  const hasCloud = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const client = hasCloud ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const productKey = 'snoop_products_v1';
  const orderKey = 'snoop_orders_v1';
  const expenseKey = 'snoop_expenses_v1';
  const categoryKey = 'snoop_categories_v1';
  const adminSessionKey = 'snoop_admin_session_v1';
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function localProducts() {
    const stored = localStorage.getItem(productKey);
    if (!stored) {
      localStorage.setItem(productKey, JSON.stringify(window.DEFAULT_PRODUCTS));
      return clone(window.DEFAULT_PRODUCTS);
    }
    const products = JSON.parse(stored);
    let migrated=false;
    for(const base of [...products]){
      if(!base.box_option)continue;
      const box=base.box_option;
      if(!products.some(p=>p.parent_product_id===base.id))products.push({id:crypto.randomUUID(),parent_product_id:base.id,box_units:box.units,name:`Fardo de ${base.name} (${box.units} un.)`,description:base.description||'',category:localStorage.getItem('zeus_box_category_name')||'Fardo',price:box.price,sale_price:box.sale_price||null,promotion_label:box.promotion_label||null,image:box.image,available:base.available,kit_items:[],box_option:null});
      base.box_option=null;migrated=true;
    }
    for(const product of products){if(/^caixinhas?$/i.test(product.category)){product.category='Fardo';migrated=true;}if(/^Caixinha de /.test(product.name)){product.name=product.name.replace(/^Caixinha de /,'Fardo de ');migrated=true;}}
    if(migrated)localStorage.setItem(productKey,JSON.stringify(products));
    return products;
  }

  function localExpenses() {
    const ledger = JSON.parse(localStorage.getItem('snoop_register_v2') || '{"movements":[]}');
    return [...JSON.parse(localStorage.getItem(expenseKey) || '[]'), ...ledger.movements.filter(m => m.kind === 'expense').map(m => ({id:m.id, description:m.description, amount:m.amount, spentBy:m.created_by, spentAt:m.created_at, cash_movement_id:m.id, payment_method:m.method}))];
  }

  function localCategories() {
    const stored = localStorage.getItem(categoryKey);
    if (stored) return [...new Set(JSON.parse(stored).map(name=>/^caixinhas?$/i.test(name)?'Fardo':name))];
    const categories = [...new Set(localProducts().map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    localStorage.setItem(categoryKey, JSON.stringify(categories));
    return categories;
  }

  function saveLocalExpense(expense) {
    const saved = { ...expense, id: expense.id || crypto.randomUUID(), createdAt: expense.createdAt || new Date().toISOString() };
    const expenses = localExpenses();
    expenses.unshift(saved);
    localStorage.setItem(expenseKey, JSON.stringify(expenses));
    return saved;
  }

  function expenseTableMissing(error) {
    return ['42P01', 'PGRST204', 'PGRST205'].includes(error?.code);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });
  }

  async function resizeProductImage(file) {
    const image = await createImageBitmap(file), size = 900;
    try {
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d'), crop = Math.min(image.width, image.height);
      const sourceX = (image.width - crop) / 2, sourceY = (image.height - crop) / 2;
      context.drawImage(image, sourceX, sourceY, crop, crop, 0, 0, size, size);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível redimensionar a imagem.')), 'image/webp', 0.9));
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'produto';
      return new File([blob], `${baseName}-900x900.webp`, { type: 'image/webp', lastModified: Date.now() });
    } finally { image.close(); }
  }

  window.StoreAPI = {
    mode: cloudConfigured ? 'cloud' : 'local',
    client,
    boxCategoryName: /^caixinhas?$/i.test(localStorage.getItem('zeus_box_category_name')||'')?'Fardo':localStorage.getItem('zeus_box_category_name') || 'Fardo',
    async getProducts(includeUnavailable = false) {
      if (!hasCloud) return localProducts().filter((p) => includeUnavailable || p.available);
      let query = client.from('products').select('*').order('created_at');
      if (!includeUnavailable) query = query.eq('available', true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async importProducts(catalog) {
      if (!await this.isAuthenticated()) throw new Error('Entre no painel para importar o catálogo.');
      if (!Array.isArray(catalog) || !catalog.length || catalog.length > 1000) throw new Error('Catálogo inválido.');
      if (hasCloud) {
        const {data,error}=await client.rpc('import_catalog_products',{catalog});
        if(error){if(error.code==='PGRST202')throw new Error('Execute 30-fardos-combos-importacao.sql no SQL Editor do Supabase e tente novamente.');throw error;}
        return data;
      }
      const perform=()=>{
        const products=localProducts(),ids=new Set(products.map(p=>p.id));
        const additions=catalog.filter(p=>!ids.has(p.id)).map(p=>({...clone(p),category:p.category==='Fardo'?this.boxCategoryName:p.category}));
        const names=[...new Set([...localCategories(),...additions.map(p=>p.category)])];
        localStorage.setItem(productKey,JSON.stringify([...products,...additions]));
        localStorage.setItem(categoryKey,JSON.stringify(names));
        return {inserted:additions.length,skipped:catalog.length-additions.length};
      };
      return navigator.locks?navigator.locks.request('zeus_catalog_import',perform):perform();
    },
    async saveProduct(product) {
      if (!hasCloud) {
        const products = localProducts();
        const index = products.findIndex((p) => p.id === product.id);
        if (index >= 0) products[index] = product; else products.push(product);
        localStorage.setItem(productKey, JSON.stringify(products));
        return product;
      }
      const { data, error } = await client.from('products').upsert(product).select().single();
      if (error) {
        if (['PGRST204','42703'].includes(error.code) && /product_type/i.test(error.message || '')) throw new Error('Execute 30-fardos-combos-importacao.sql no Supabase para ativar os tipos Produto, Fardo e Combo.');
        if (['PGRST204','42703'].includes(error.code) && /parent_product_id|box_units/i.test(error.message || '')) throw new Error('Execute back-end/supabase/28-caixinhas-produtos-independentes.sql no Supabase para cadastrar fardos como produtos.');
        if (['PGRST204','42703'].includes(error.code) && /promotion_label/i.test(error.message || '')) throw new Error('Ative os nomes de promoções: execute back-end/supabase/26-nome-promocao.sql no SQL Editor do Supabase.');
        if (['PGRST204','42703'].includes(error.code) && /featured/i.test(error.message || '')) throw new Error('Ative os destaques: execute back-end/supabase/25-produtos-carrossel.sql no SQL Editor do Supabase.');
        if (['PGRST204','42703'].includes(error.code) && /sale_price/i.test(error.message || '')) throw new Error('Ative as promoções: execute back-end/supabase/24-promocoes.sql no SQL Editor do Supabase.');
        if (['PGRST204','42703'].includes(error.code) && /box_option/i.test(error.message || '')) throw new Error('Ative os fardos: execute back-end/supabase/14-caixinhas-produtos.sql no SQL Editor do Supabase.');
        if (['PGRST204','42703'].includes(error.code) && /kit_items/i.test(error.message || '')) throw new Error('Ative os kits: execute back-end/supabase/13-kits-produtos.sql no SQL Editor do Supabase.');
        throw error;
      }
      return data;
    },
    async deleteProduct(id) {
      if (!hasCloud) {
        localStorage.setItem(productKey, JSON.stringify(localProducts().filter((p) => p.id !== id)));
        return;
      }
      const { error } = await client.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    async getCategories() {
      if (!hasCloud) {const names=[...new Set([...localCategories(),this.boxCategoryName])];localStorage.setItem(categoryKey,JSON.stringify(names));return names;}
      const { data, error } = await client.from('product_categories').select('*').order('name');
      if (error) {
        if (expenseTableMissing(error)) return localCategories();
        throw error;
      }
      this.boxCategoryName=data.find(category=>category.system_key==='boxes')?.name||'Fardo';
      return data.map((category) => category.name);
    },
    async renameCategory(oldName,newName){
      newName=newName.trim();
      if(newName.length<2||newName.length>50)throw new Error('O nome deve ter entre 2 e 50 caracteres.');
      if(newName===oldName)return;
      if(!hasCloud){
        const names=await this.getCategories();
        if(names.some(name=>name.toLocaleLowerCase('pt-BR')===newName.toLocaleLowerCase('pt-BR')))throw new Error('Esta categoria já existe.');
        const products=localProducts().map(p=>p.category===oldName?{...p,category:newName}:p);
        localStorage.setItem(productKey,JSON.stringify(products));
        localStorage.setItem(categoryKey,JSON.stringify(names.map(name=>name===oldName?newName:name)));
        if(oldName===this.boxCategoryName){this.boxCategoryName=newName;localStorage.setItem('zeus_box_category_name',newName);}
        return;
      }
      const {error}=await client.rpc('rename_product_category',{old_name:oldName,new_name:newName});
      if(error){if(error.code==='PGRST202')throw new Error('Execute 30-fardos-combos-importacao.sql no Supabase para ativar a edição de categorias.');throw error;}
      if(oldName===this.boxCategoryName)this.boxCategoryName=newName;
    },
    async createCategory(name) {
      if (!hasCloud) {
        const categories = [...new Set([...localCategories(), name])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        localStorage.setItem(categoryKey, JSON.stringify(categories));
        return name;
      }
      const { error } = await client.from('product_categories').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true });
      if (error) {
        if (expenseTableMissing(error)) {
          const categories = [...new Set([...localCategories(), name])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
          localStorage.setItem(categoryKey, JSON.stringify(categories));
          return name;
        }
        throw error;
      }
      return name;
    },
    async deleteCategory(name) {
      if(name===this.boxCategoryName)throw new Error('A categoria de fardos pode ser editada, mas não excluída.');
      if (!hasCloud) {
        localStorage.setItem(categoryKey, JSON.stringify(localCategories().filter((category) => category !== name)));
        return;
      }
      const { error } = await client.from('product_categories').delete().eq('name', name);
      if (error) {
        if (expenseTableMissing(error)) {
          localStorage.setItem(categoryKey, JSON.stringify(localCategories().filter((category) => category !== name)));
          return;
        }
        throw error;
      }
    },
    async uploadProductImage(file) {
      const resized = await resizeProductImage(file);
      if (!hasCloud) return fileToDataUrl(resized);
      const rawExtension = resized.name.split('.').pop() || 'webp';
      const extension = rawExtension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'webp';
      const path = `products/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage.from('product-images').upload(path, resized, { cacheControl: '31536000', contentType: resized.type, upsert: false });
      if (error) throw error;
      const { data } = client.storage.from('product-images').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('Não foi possível gerar o endereço público da imagem.');
      return data.publicUrl;
    },
    async createOrder(payload) {
      if (!hasCloud) {
        const products = localProducts();
        const items = payload.items.map((item) => {
          const product = products.find((p) => p.id === item.productId && p.available);
          if (!product) throw new Error('Um produto do carrinho não está mais disponível.');
          const box = item.variant === 'box' ? product.box_option : null;
          if (item.variant === 'box' && (!box || Number(box.units) < 2 || Number(box.price) <= 0)) throw new Error('A opção de fardo não está mais disponível.');
          const promotion=Number(product.sale_price),original=Number(product.price),boxPromotion=Number(box?.sale_price),boxOriginal=Number(box?.price),unitPrice=box?(boxPromotion>0&&boxPromotion<boxOriginal?boxPromotion:boxOriginal):(promotion>0&&promotion<original?promotion:original),name = box ? `Fardo de ${product.name} (${box.units} un.)` : product.name;
          return { productId: product.id, name, quantity: item.quantity, unitPrice, subtotal: unitPrice * item.quantity, variant: box ? 'box' : 'unit' };
        });
        const trustedTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const order = { ...payload, id: crypto.randomUUID(), code: `AZ${Date.now().toString().slice(-8)}`, items, trustedTotal, clientTotal: payload.clientTotal, status: 'pending', createdAt: new Date().toISOString() };
        const orders = JSON.parse(localStorage.getItem(orderKey) || '[]');
        orders.unshift(order);
        localStorage.setItem(orderKey, JSON.stringify(orders));
        return order;
      }
      const { data, error } = await client.rpc('create_order', { order_payload: payload });
      if (error) throw error;
      return data;
    },
    async getOrders() {
      if (!hasCloud) return window.CashRegisterStore ? window.CashRegisterStore.localOrders() : JSON.parse(localStorage.getItem(orderKey) || '[]');
      const { data, error } = await client.from('orders_with_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((o) => ({
        ...o,
        customerName: o.customer_name,
        deliveryType: o.delivery_type,
        trustedTotal: Number(o.trusted_total),
        clientTotal: Number(o.client_total),
        createdAt: o.created_at,
        confirmedAt: o.confirmed_at
      }));
    },
    async updateOrderStatus(id, status) {
      if (!hasCloud) {
        if (!window.CashRegisterStore) throw new Error('Atualize o painel para confirmar e contabilizar o pedido.');
        return window.CashRegisterStore.rpc('order_status', {id,status});
      }
      const { error } = await client.rpc('set_order_status', { p_id:id, p_status:status });
      if (error) {
        if (['PGRST202','42883'].includes(error.code)) throw new Error('Execute back-end/supabase/09-confirmacao-recebimento.sql no Supabase para ativar a confirmação com recebimento automático.');
        throw error;
      }
    },
    async getExpenses() {
      if (!hasCloud) return localExpenses();
      const { data, error } = await client.from('expenses').select('*').order('spent_at', { ascending: false });
      if (error) {
        if (expenseTableMissing(error)) throw new Error('Consulta de despesas indispon\u00edvel. Verifique a configura\u00e7\u00e3o do banco.');
        throw error;
      }
      return data.map((expense) => ({
        ...expense,
        amount: Number(expense.amount),
        spentBy: expense.spent_by,
        spentAt: expense.spent_at,
        createdAt: expense.created_at
      }));
    },
    async createExpense(expense) {
      if (window.CashRegisterStore) {
        const state = await window.CashRegisterStore.rpc('preview');
        if (!state.session || state.session.closed_at) throw new Error('Abra o caixa antes de registrar uma saída.');
        return window.CashRegisterStore.rpc('movement', { id: expense.id || crypto.randomUUID(), session_id: state.session.id, kind:'expense', method:expense.method, amount:expense.amount, description:expense.description });
      }
      if (!hasCloud) return saveLocalExpense(expense);
      const { data, error } = await client.from('expenses').insert({ description: expense.description, amount: expense.amount, spent_by: expense.spentBy, spent_at: expense.spentAt }).select().single();
      if (error) {
        if (expenseTableMissing(error)) throw new Error('Despesa n\u00e3o salva: servi\u00e7o indispon\u00edvel. Tente novamente mais tarde.');
        throw error;
      }
      return { ...data, amount: Number(data.amount), spentBy: data.spent_by, spentAt: data.spent_at, createdAt: data.created_at };
    },
    async deleteExpense(id) {
      if (!hasCloud) {
        if (localExpenses().some(e => e.id === id && e.cash_movement_id)) throw new Error('Despesa vinculada ao caixa: o lançamento e o histórico são preservados.');
        localStorage.setItem(expenseKey, JSON.stringify(JSON.parse(localStorage.getItem(expenseKey) || '[]').filter((expense) => expense.id !== id)));
        return;
      }
      const { error } = await client.from('expenses').delete().eq('id', id);
      if (error) {
        if (expenseTableMissing(error)) throw new Error('Despesa n\u00e3o removida: servi\u00e7o indispon\u00edvel. Tente novamente mais tarde.');
        throw error;
      }
    },
    async verifyAdminPassword(password) {
      if (!hasCloud) return password === cfg.demoAdminPin;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const email = userData?.user?.email;
      if (!email) throw new Error('Não foi possível identificar o administrador conectado.');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) return true;
      if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) return false;
      throw error;
    },
    async resetOperationalData(confirmation) {
      if (confirmation !== 'ZERAR') throw new Error('Digite ZERAR para confirmar a limpeza geral.');
      if (!await this.isAuthenticated()) throw new Error('Entre no painel para executar o reset.');
      if (!hasCloud) {
        const reset = () => {
        const cash = JSON.parse(localStorage.getItem('snoop_register_v2') || '{"sessions":[],"movements":[],"closings":[]}');
        const result = {
          orders: JSON.parse(localStorage.getItem(orderKey) || '[]').length,
          expenses: localExpenses().length,
          sessions: cash.sessions.length, movements:cash.movements.length,
          closings:cash.closings.length + JSON.parse(localStorage.getItem('snoop_cash_closings_v1') || '[]').length
        };
        localStorage.setItem(orderKey, '[]');
        localStorage.setItem(expenseKey, '[]');
        localStorage.removeItem('snoop_register_v2');
        localStorage.removeItem('snoop_cash_closings_v1');
        return result;
        };
        return navigator.locks ? navigator.locks.request('snoop_register_v2',reset) : reset();
      }
      const { data, error } = await client.rpc('reset_operational_data', {p_confirmation:confirmation});
      if (error) {
        if (['PGRST202', '42883'].includes(error.code)) {
          throw new Error('Execute back-end/supabase/10-rotina-diaria-reset.sql no SQL Editor do Supabase para ativar a limpeza geral.');
        }
        throw error;
      }
      return data;
    },
    async login(email, password) {
      if (!hasCloud) {
        const authenticated = password === cfg.demoAdminPin;
        if (authenticated) sessionStorage.setItem(adminSessionKey, 'authenticated');
        return authenticated;
      }
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return true;
    },
    async isAuthenticated() {
      if (!hasCloud) return sessionStorage.getItem(adminSessionKey) === 'authenticated';
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return Boolean(data.session);
    },
    async logout() {
      if (!hasCloud) {
        sessionStorage.removeItem(adminSessionKey);
        return;
      }
      await client.auth.signOut();
    }
  };
  // A configured production store must never silently write demo data.
  if (cloudConfigured && !hasCloud) {
    for (const key of Object.keys(window.StoreAPI)) {
      if (typeof window.StoreAPI[key] === 'function') window.StoreAPI[key] = async () => {
        throw new Error('Conex\u00e3o com a loja indispon\u00edvel. Verifique a internet e recarregue a p\u00e1gina.');
      };
    }
  }
})();
