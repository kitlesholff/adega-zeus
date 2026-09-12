(function () {
  const button = document.querySelector('#importZeusCatalog');
  if (!button) return;
  const status = document.querySelector('#catalogImportStatus');
  let running = false;
  window.importZeusCatalog = async function () {
    if (running) return;
    if (!await StoreAPI.isAuthenticated()) throw new Error('Entre no painel para importar o catálogo.');
    running = true;
    button.disabled = true;
    status.textContent = 'Carregando produtos…';
    try {
      const response = await fetch('data/catalogo-zeus.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('Não foi possível carregar o arquivo do catálogo.');
      const catalog = await response.json();
      const result = await StoreAPI.importProducts(catalog.products);
      status.textContent = `${result.inserted} produtos cadastrados. ${result.skipped} já existentes foram preservados.`;
      window.dispatchEvent(new CustomEvent('zeus:catalog-imported'));
      return result;
    } catch (error) {
      status.textContent = error.message || 'Não foi possível importar o catálogo.';
      throw error;
    } finally {
      running = false;
      button.disabled = false;
    }
  };
  button.addEventListener('click', () => window.importZeusCatalog().catch(error => window.AdminFeedback?.notify(error.message,'danger')));
})();
