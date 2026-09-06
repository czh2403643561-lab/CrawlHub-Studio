import { mockProducts } from "../modules/products/mock-products.js";

const tableBody = document.querySelector("#product-table-body");
const productCount = document.querySelector("#product-count");
const productCountNote = document.querySelector("#product-count-note");
const tableCount = document.querySelector("#table-count");
const productSource = document.querySelector("#product-source");
const importFile = document.querySelector("#import-file");
const importButton = document.querySelector("#import-button");
const importFeedback = document.querySelector("#import-feedback");
const importFileName = document.querySelector("#import-file-name");
const importFileSize = document.querySelector("#import-file-size");
const importValidation = document.querySelector("#import-validation");

let selectedImport = {
  file: null,
  payload: null,
  recordCount: 0,
  valid: false
};

function renderProducts(products, sourceLabel) {
  productCount.textContent = `${products.length} 条商品`;
  tableCount.textContent = `${products.length} 条`;
  productCountNote.textContent = sourceLabel === "已保存数据" ? "已保存到当前电脑" : "使用模拟数据验证页面";
  productSource.textContent = sourceLabel;

  tableBody.innerHTML = products.map(renderProductRow).join("");
  tableBody.querySelectorAll(".product-thumb").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    });
  });
}

function renderProductRow(product) {
  const imageMarkup = product.imageUrl
    ? `<img class="product-thumb" src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" />`
    : "";

  return `
    <tr>
      <td class="rank-cell">${formatRank(product.rank)}</td>
      <td class="change-cell">${formatRankChange(product.rankChange)}</td>
      <td class="product-cell">
        <div class="thumb-wrap">
          ${imageMarkup}
          <span class="thumb-fallback" ${product.imageUrl ? "hidden" : ""}>${escapeHtml(product.imageLabel)}</span>
        </div>
        <div class="product-copy">
          <strong class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong>
          <span class="product-rating-note">评分 ${formatRating(product.rating)}</span>
        </div>
      </td>
      <td class="metric-cell">${escapeHtml(product.priceText || formatNumber(product.price))}</td>
      <td class="metric-cell">${escapeHtml(product.gmvText || formatNumber(product.gmv))}</td>
      <td class="metric-cell">${escapeHtml(product.clicksText || formatNumber(product.clicks))}</td>
      <td class="metric-cell">${escapeHtml(product.ctrText || `${product.ctr}%`)}</td>
      <td class="rating-cell">${formatRating(product.rating)}</td>
      <td class="shop-cell" title="${escapeHtml(product.shopName)}">${escapeHtml(product.shopName)}</td>
      <td class="similar-cell">${formatNumber(product.similarProducts)}</td>
      <td class="action-cell">
        <button class="table-action" type="button" disabled title="商品详情功能待接入">查看</button>
        <button class="table-action secondary" type="button" disabled title="收藏功能待接入">收藏</button>
      </td>
    </tr>`;
}

function formatRank(value) {
  const rank = Number(value);
  if (rank === 1) return "♛ 1";
  if (rank === 2) return "♛ 2";
  if (rank === 3) return "♛ 3";
  return Number.isFinite(rank) ? String(rank) : "-";
}

function formatRankChange(value) {
  const change = Number(value);
  if (!Number.isFinite(change) || change === 0) return '<span class="change-flat">—</span>';
  const direction = change > 0 ? "up" : "down";
  const symbol = change > 0 ? "↑" : "↓";
  return `<span class="change-${direction}">${symbol} ${formatNumber(Math.abs(change))}</span>`;
}

function formatRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? `${rating.toFixed(1)}/5` : "-";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number) : "-";
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

importFile.addEventListener("change", async () => {
  const [file] = importFile.files;
  selectedImport = { file, payload: null, recordCount: 0, valid: false };
  importButton.disabled = true;

  if (!file) {
    importFileName.textContent = "尚未选择文件";
    importFileSize.textContent = "";
    setValidation("选择文件后将进行 JSON 格式和商品数据校验。", "neutral");
    return;
  }

  importFileName.textContent = file.name;
  importFileSize.textContent = formatFileSize(file.size);
  setValidation("正在读取并校验文件…", "neutral");
  importFeedback.textContent = "正在解析商品数据…";

  try {
    if (!file.name.toLowerCase().endsWith(".json")) {
      throw new Error("当前只支持 .json 文件");
    }

    const payload = JSON.parse(await file.text());
    const records = getImportRecords(payload);
    if (records.length === 0) {
      throw new Error("文件中没有商品数据");
    }

    const validRecordCount = records.filter(isProductRecord).length;
    if (validRecordCount !== records.length) {
      throw new Error(`${records.length - validRecordCount} 条记录缺少商品名称`);
    }

    selectedImport = { file, payload, recordCount: records.length, valid: true };
    importButton.disabled = false;
    setValidation(`✓ JSON 格式有效 · ✓ 解析 ${records.length} 条商品 · ✓ 关键字段可用`, "success");
    importFeedback.textContent = `已读取 ${records.length} 条商品数据，可以导入保存。`;
  } catch (error) {
    setValidation(`✕ ${error.message || "文件校验失败"}`, "error");
    importFeedback.textContent = "文件未导入，请修正后重新选择。";
  }
});

importButton.addEventListener("click", async () => {
  if (!selectedImport.valid) {
    importFeedback.textContent = "请先选择并通过校验的 JSON 商品文件。";
    return;
  }

  importButton.disabled = true;
  importFeedback.textContent = "正在导入并保存…";

  try {
    const response = await fetch("/api/products/import", {
      body: JSON.stringify({
        products: selectedImport.payload,
        rank_type: selectedImport.payload?.rank_type ?? selectedImport.payload?.metadata?.rank_type,
        sourceFile: selectedImport.file.name
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "导入失败");
    }

    renderProducts(result.products, "已保存数据");
    setValidation(`✓ 导入完成 · 已保存 ${result.importedCount} 条商品 · 榜单类型：${result.rank_type || "总榜"}`, "success");
    importFeedback.textContent = `导入成功：${result.importedCount} 条商品已保存到本地。`;
  } catch (error) {
    importFeedback.textContent = `导入失败：${error.message || "请检查 JSON 文件格式。"}`;
  } finally {
    importButton.disabled = !selectedImport.valid;
  }
});

function getImportRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  throw new Error("JSON 文件中未找到商品数据数组");
}

function isProductRecord(record) {
  return Boolean(record && typeof record === "object" && (record.product_name || record.name));
}

function setValidation(message, state) {
  importValidation.className = `import-validation ${state}`;
  importValidation.textContent = message;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadStoredProducts();
