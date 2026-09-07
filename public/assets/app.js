import { mockProducts } from "../modules/products/mock-products.js";

const tableBody = document.querySelector("#product-table-body");
const productCount = document.querySelector("#product-count");
const productCountNote = document.querySelector("#product-count-note");
const tableCount = document.querySelector("#table-count");
const productSource = document.querySelector("#product-source");
const importFile = document.querySelector("#import-file");
const importDirectory = document.querySelector("#import-directory");
const importButton = document.querySelector("#import-button");
const importFeedback = document.querySelector("#import-feedback");
const importFileName = document.querySelector("#import-file-name");
const importFileSize = document.querySelector("#import-file-size");
const importValidation = document.querySelector("#import-validation");

let selectedImport = { imports: [], fileCount: 0, recordCount: 0, rankTypes: [], valid: false };

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
      <td class="source-cell">${renderSources(product)}</td>
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

function renderSources(product) {
  const rankings = Array.isArray(product.rankings) && product.rankings.length
    ? product.rankings
    : [{ rank_type: product.rank_type || "总榜", rank: product.rank }];
  return `<div class="source-list">${rankings.map((ranking) => {
    const hasRank = ranking.rank !== null && ranking.rank !== undefined && ranking.rank !== "";
    const rank = hasRank && Number.isFinite(Number(ranking.rank)) ? ` #${ranking.rank}` : "";
    return `<span class="source-tag" title="${escapeHtml(`${ranking.rank_type}${rank}`)}">${escapeHtml(ranking.rank_type)}</span>`;
  }).join("")}</div>`;
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

importFile.addEventListener("change", () => prepareImport(Array.from(importFile.files), "JSON 文件"));
importDirectory.addEventListener("change", () => prepareImport(Array.from(importDirectory.files), "榜单文件夹"));

async function prepareImport(files, selectionLabel) {
  selectedImport = { imports: [], fileCount: files.length, recordCount: 0, rankTypes: [], valid: false };
  importButton.disabled = true;
  if (!files.length) {
    importFileName.textContent = "尚未选择文件";
    importFileSize.textContent = "";
    setValidation("选择 JSON 文件或六榜数据文件夹后将进行校验。", "neutral");
    return;
  }

  importFileName.textContent = `已选择 ${files.length} 个 JSON 文件（${selectionLabel}）`;
  importFileSize.textContent = formatFileSize(files.reduce((sum, file) => sum + file.size, 0));
  setValidation("正在读取并校验文件…", "neutral");
  importFeedback.textContent = "正在解析商品数据…";
  try {
    const imports = await createImportEntries(files);
    const recordCount = imports.reduce((sum, entry) => sum + entry.recordCount, 0);
    const rankTypes = [...new Set(imports.map((entry) => entry.rankType))];
    selectedImport = { imports, fileCount: files.length, recordCount, rankTypes, valid: true };
    importButton.disabled = false;
    setValidation(`✓ 识别 ${imports.length} 个榜单 · ✓ 解析 ${recordCount} 条商品 · ✓ ${rankTypes.join("、")}`, "success");
    importFeedback.textContent = `已读取 ${recordCount} 条商品数据，可以导入保存。`;
  } catch (error) {
    setValidation(`✕ ${error.message || "文件校验失败"}`, "error");
    importFeedback.textContent = "文件未导入，请修正后重新选择。";
  }
}

async function createImportEntries(files) {
  const parsedFiles = await Promise.all(files.map(async (file) => ({
    file,
    payload: JSON.parse(await file.text()),
    directory: getDirectoryKey(file)
  })));
  const metadataByDirectory = new Map();
  for (const item of parsedFiles.filter((item) => item.file.name.toLowerCase() === "metadata.json")) {
    metadataByDirectory.set(item.directory, item.payload);
  }
  const productFiles = parsedFiles.filter((item) => item.file.name.toLowerCase() !== "metadata.json");
  if (!productFiles.length) throw new Error("未找到 products.json 商品数据文件");

  return productFiles.map((item) => {
    const records = getImportRecords(item.payload);
    const validRecordCount = records.filter(isProductRecord).length;
    if (!records.length) throw new Error(`${item.file.name} 中没有商品数据`);
    if (validRecordCount !== records.length) throw new Error(`${item.file.name} 有 ${records.length - validRecordCount} 条记录缺少商品名称`);
    const metadata = metadataByDirectory.get(item.directory) ?? item.payload.metadata ?? {};
    return {
      products: item.payload,
      metadata,
      sourceFile: item.file.webkitRelativePath || item.file.name,
      recordCount: records.length,
      rankType: detectRankType(metadata.rank_type ?? item.payload.rank_type, item.file.webkitRelativePath || item.file.name)
    };
  });
}

importButton.addEventListener("click", async () => {
  if (!selectedImport.valid) {
    importFeedback.textContent = "请先选择并通过校验的 JSON 商品文件。";
    return;
  }
  importButton.disabled = true;
  importFeedback.textContent = "正在合并并保存到本地…";
  try {
    const response = await fetch("/api/products/import", {
      body: JSON.stringify({ imports: selectedImport.imports.map(({ recordCount, rankType, ...entry }) => entry) }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "导入失败");
    renderProducts(result.products, "已保存数据");
    const recognizedLabels = (result.recognizedRankTypes || []).map(rankTypeLabel).join("、") || "无";
    const missingLabels = (result.missingRankTypes || []).map(rankTypeLabel).join("、");
    const missingMessage = missingLabels ? ` · 缺失榜单：${missingLabels}` : " · 六榜齐全";
    setValidation(`✓ 商品 ${result.productCount} 条 · 榜单记录 ${result.rankRecordCount} 条 · 已识别：${recognizedLabels}${missingMessage}`, "success");
    importFeedback.textContent = `导入成功：${result.importedCount} 条榜单记录，合并 ${result.mergedProductCount} 个重复商品，本地共保存 ${result.productCount} 个商品。`;
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

function getDirectoryKey(file) {
  const path = file.webkitRelativePath || "";
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function detectRankType(value, sourceFile = "") {
  const candidate = `${value ?? ""} ${sourceFile}`;
  return ["直播榜", "短视频榜", "商品卡", "达人榜", "新品榜", "总榜"].find((rankType) => candidate.includes(rankType)) ?? "总榜";
}

function rankTypeLabel(rankType) {
  return {
    overall: "总榜",
    live: "直播榜",
    short_video: "短视频榜",
    product_card: "商品卡",
    creator: "达人榜",
    new_product: "新品榜"
  }[rankType] || rankType;
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
