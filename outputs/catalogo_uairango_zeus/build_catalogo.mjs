import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourceUrl = "https://www.uairango.com/mg/adega-tabacaria";
const apiUrl = "https://www.uairango.com/api-v2/oauth/cardapio/10999";
const outputDir = new URL("./", import.meta.url);
const outputPath = fileURLToPath(outputDir);

const response = await fetch(apiUrl);
if (!response.ok) throw new Error(`Falha ao consultar o catalogo: HTTP ${response.status}`);
const menu = await response.json();

const categoryRows = [];
const catalogRows = [];
let productCount = 0;

for (const [categoryName, category] of Object.entries(menu)) {
  const products = Array.isArray(category.inteira) ? category.inteira : [];
  categoryRows.push([categoryName.trim(), products.length]);
  productCount += products.length;

  for (const product of products) {
    const options = Array.isArray(product.opcoes) && product.opcoes.length
      ? product.opcoes
      : [{ descricao: "", valorAtual: null, valor: null }];

    for (const option of options) {
      const currentPrice = Number.isFinite(Number(option.valorAtual)) ? Number(option.valorAtual) : null;
      const basePrice = Number.isFinite(Number(option.valor)) ? Number(option.valor) : null;
      const hasDiscount = currentPrice !== null && basePrice !== null && currentPrice < basePrice;
      catalogRows.push([
        categoryName.trim(),
        String(product.produto ?? "").trim(),
        String(product.descricao ?? "").trim(),
        String(option.descricao ?? "").trim(),
        currentPrice,
        hasDiscount ? basePrice : null,
        product.promocao === 1 || hasDiscount ? "Sim" : "Nao",
        Number(product.id_produto),
      ]);
    }
  }
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Resumo");
const catalog = workbook.worksheets.add("Catalogo");
summary.showGridLines = false;
catalog.showGridLines = false;
summary.tabColor = "#C79A24";
catalog.tabColor = "#172033";

summary.getRange("A2:F2").merge();
summary.getRange("A2").values = [["Catálogo público - Adega & Tabacaria Zeus"]];
summary.getRange("A2:F2").format = {
  font: { name: "Arial", size: 15, bold: true, color: "#172033" },
  verticalAlignment: "center",
};
summary.getRange("A3").values = [["Fonte"]];
summary.getRange("B3:F3").merge();
summary.getRange("B3").values = [[sourceUrl]];
summary.getRange("A4").values = [["Coleta"]];
summary.getRange("B4").values = [[new Date("2026-09-11T12:00:00-03:00")]];
summary.getRange("B4").format.numberFormat = "dd/mm/yyyy";
summary.getRange("A6:B6").values = [["Indicador", "Quantidade"]];
summary.getRange("A7:B8").values = [
  ["Categorias", categoryRows.length],
  ["Produtos", productCount],
];
summary.getRange("A10:B10").values = [["Categoria", "Produtos"]];
summary.getRange("A11").write(categoryRows);
const summaryEnd = 10 + categoryRows.length;
summary.tables.add(`A10:B${summaryEnd}`, true, "CategoriasTable").style = "TableStyleMedium2";
summary.getRange("A6:B6").format = {
  fill: "#172033",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A7:B8").format.font = { name: "Arial", size: 11, bold: true };
summary.getRange(`A3:F${summaryEnd}`).format.font = { name: "Arial", size: 10 };
summary.getRange("A3:A4").format.font = { name: "Arial", size: 10, bold: true, color: "#172033" };
summary.getRange("A:A").format.columnWidth = 34;
summary.getRange("B:B").format.columnWidth = 16;
summary.getRange("C:F").format.columnWidth = 12;

catalog.getRange("A2:H2").merge();
catalog.getRange("A2").values = [["Itens do catálogo público - Adega & Tabacaria Zeus"]];
catalog.getRange("A2:H2").format = {
  font: { name: "Arial", size: 15, bold: true, color: "#172033" },
  verticalAlignment: "center",
};
catalog.getRange("A3").values = [["Fonte"]];
catalog.getRange("B3:H3").merge();
catalog.getRange("B3").values = [[sourceUrl]];
catalog.getRange("A5:H5").values = [[
  "Categoria",
  "Produto",
  "Descrição",
  "Opção",
  "Preço atual",
  "Preço anterior",
  "Promoção",
  "ID do produto",
]];
catalog.getRange("A6").write(catalogRows);
const catalogEnd = 5 + catalogRows.length;
catalog.tables.add(`A5:H${catalogEnd}`, true, "CatalogoTable").style = "TableStyleMedium2";
catalog.getRange(`A2:H${catalogEnd}`).format.font = { name: "Arial", size: 10 };
catalog.getRange("A2:H2").format.font = { name: "Arial", size: 15, bold: true, color: "#172033" };
catalog.getRange("A3").format.font = { name: "Arial", size: 10, bold: true, color: "#172033" };
catalog.getRange(`E6:F${catalogEnd}`).format.numberFormat = '"R$" #,##0.00';
catalog.getRange(`A6:D${catalogEnd}`).format.verticalAlignment = "top";
catalog.getRange(`C6:C${catalogEnd}`).format.wrapText = true;
catalog.getRange("A:A").format.columnWidth = 30;
catalog.getRange("B:B").format.columnWidth = 38;
catalog.getRange("C:C").format.columnWidth = 52;
catalog.getRange("D:D").format.columnWidth = 20;
catalog.getRange("E:F").format.columnWidth = 16;
catalog.getRange("G:G").format.columnWidth = 12;
catalog.getRange("H:H").format.columnWidth = 16;
catalog.freezePanes.freezeRows(5);

workbook.recalculate();

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: `Resumo!A2:B${summaryEnd}`,
  include: "values,formulas",
  tableMaxRows: 40,
  tableMaxCols: 4,
});
console.log(summaryCheck.ndjson);

const catalogCheck = await workbook.inspect({
  kind: "table",
  range: `Catalogo!A2:H${Math.min(catalogEnd, 15)}`,
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 8,
});
console.log(catalogCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const summaryPreview = await workbook.render({ sheetName: "Resumo", range: `A1:F${summaryEnd + 1}`, scale: 1, format: "png" });
await fs.writeFile(new URL("preview_resumo.png", outputDir), new Uint8Array(await summaryPreview.arrayBuffer()));
const catalogPreview = await workbook.render({ sheetName: "Catalogo", range: "A1:H24", scale: 1, format: "png" });
await fs.writeFile(new URL("preview_catalogo.png", outputDir), new Uint8Array(await catalogPreview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputPath, "catalogo_adega_tabacaria_zeus.xlsx"));

console.log(JSON.stringify({ categories: categoryRows.length, products: productCount, rows: catalogRows.length, catalogEnd }));
