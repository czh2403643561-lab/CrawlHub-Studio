import { mockProducts } from "../modules/products/mock-products.js";

const productGrid = document.querySelector("#product-grid");
const productCount = document.querySelector("#product-count");
const productCountNote = document.querySelector("#product-count-note");
const productSource = document.querySelector("#product-source");
const importFile = document.querySelector("#import-file");
const importButton = document.querySelector("#import-button");
const importFeedback = document.querySelector("#import-feedback");

let displayedProducts = mockProducts;

function renderProducts(products, sourceLabel) {
  displayedProducts = products;
  productCount.textContent = products.length;
  productCountNote.textContent = sourceLabel === "已保存数据" ? "已保存到当前电脑" : "用于验证商品数据结构";
  productSource.textContent = sourceLabel;

  productGrid.innerHTML = products
  .map(
    (product) => `
      <article class="product-card">
        <div class="product-image" aria-hidden="true">${escapeHtml(product.imageLabel)}</div>
        <div class="product-info">
          <span class="rank">排名 #${product.rank}</span>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.shopName)}</p>
          <div class="product-metrics">
            <span>价格 <strong>${escapeHtml(product.priceText || `$${product.price.toFixed(2)}`)}</strong></span>
            <span>GMV <strong>${escapeHtml(product.gmvText || `$${formatNumber(product.gmv)}`)}</strong></span>
            <span>CTR <strong>${escapeHtml(product.ctrText || `${product.ctr}%`)}</strong></span>
          </div>
        </div>
      </article>`
  )
  .join("");
}

async function loadStoredProducts() {
  try {
    const response = await fetch("/api/products");
    const storedData = await response.json();
    if (storedData.products?.length) {
      renderProducts(storedData.products, "已保存数据");
      importFeedback.textContent = `已读取 ${storedData.products.length} 条本地保存的商品数据。`;
      return;
    }
  } catch {
    importFeedback.textContent = "暂时无法读取本地商品数据。";
  }

  renderProducts(mockProducts, "模拟数据");
}

importButton.addEventListener("click", async () => {
  const [file] = importFile.files;
  if (!file) {
    importFeedback.textContent = "请先选择一个 JSON 商品文件。";
    return;
  }

  importButton.disabled = true;
  importFeedback.textContent = "正在导入并保存…";

  try {
    const products = JSON.parse(await file.text());
    const response = await fetch("/api/products/import", {
      body: JSON.stringify({ products, sourceFile: file.name }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "导入失败");
    }

    renderProducts(result.products, "已保存数据");
    importFeedback.textContent = `已导入并保存 ${result.importedCount} 条商品数据。`;
    importFile.value = "";
  } catch (error) {
    importFeedback.textContent = `导入失败：${error.message || "请检查 JSON 文件格式。"}`;
  } finally {
    importButton.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

loadStoredProducts();
