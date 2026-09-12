# Revisao do projeto - 12/09/2026

Correcoes aplicadas:
- Carrinho escapa nomes, imagens e identificadores antes de montar HTML.
- Loja configurada para Supabase recusa operacoes quando o SDK ou a configuracao estao indisponiveis, sem cair no modo local.
- Despesas nao usam armazenamento local para esconder tabela ausente no banco.
- PIN de demonstracao removido da configuracao publicada.
- Referencias de versao atualizadas para CSS, armazenamento e carrinho.
- Testes de interface alinhados ao catalogo atual: categorias expansiveis no celular, nomes em formato de frase, fardos e cores dos rankings.
- Mock de rede do teste de caixa aplicado a todas as abas para manter o teste isolado.

Arquivos removidos (1.579.419 bytes no total):
- front-end/assets/logo-zeus.svg
- front-end/assets/logo-snoop-header.png
- front-end/assets/hero-snoop-profissional.jpg
- front-end/.test-tools/catalog-1440.png
- front-end/.test-tools/catalog-390.png
- front-end/.test-tools/catalog-768.png
- front-end/.test-tools/catalog-categories-expanded.png

Validacao:
- Suite completa: 42 testes aprovados, sem falhas.
- Depois da ultima correcao de despesas: 3 testes direcionados de disponibilidade aprovados, incluindo um novo caso.
- Catalogo testado em 320, 360, 375, 390, 430, 560, 768, 820, 1024 e 1440 pixels.
- Sintaxe JavaScript, links locais e imagens do catalogo verificados.
- Banco PostgreSQL isolado: permissoes, pedidos, caixa, migracoes e importacao.

Limites e arquivos preservados:
- Nao houve deploy nem validacao da configuracao efetivamente aplicada no Supabase de producao.
- Migracoes SQL, testes, ferramentas de teste, planilha e fontes da importacao foram mantidos por terem utilidade de manutencao ou recuperacao.
- Imagens de produtos potencialmente referenciadas por registros do banco foram mantidas; ausencia de referencia estatica nao comprova desuso.
