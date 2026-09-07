import { mockProducts } from "../modules/products/mock-products.js";

const RANK_CONFIG = {
  overall: {
    label: "总榜",
    description: "TikTok Shop 全渠道热卖商品榜，按 GMV 表现排序。",
    columns: ["rank", "change", "product", "gmv", "clicks", "ctr", "rating", "shop", "actions"]
  },
  live: {
    label: "直播榜",
    description: "直播渠道产生的商品 GMV 排名。",
    columns: ["rank", "product", "liveAccount", "gmv", "actions"]
  },
  short_video: {
    label: "短视频榜",
    description: "通过短视频挂车渠道成交的商品榜单。",
    columns: ["rank", "product", "videos", "gmv", "actions"]
  },
  product_card: {
    label: "商品卡",
    description: "商品卡渠道的商品 GMV 与转化表现。",
    columns: ["rank", "product", "gmv", "clicks", "ctr", "actions"]
  },
  creator: {
    label: "达人榜",
    description: "达人合作带货产生的商品 GMV 排名。",
    columns: ["rank", "product", "creators", "gmv", "actions"]
  },
  new_product: {
    label: "新品榜",
    description: "近期上架商品的 GMV 与转化表现。",
    columns: ["rank", "product", "gmv", "clicks", "ctr", "actions"]
  }
};

const COLUMN_LABELS = {
  rank: "排名",
  change: "变化",
  product: "商品",
  gmv: "GMV",
  clicks: "点击量",
  ctr: "CTR",
  rating: "评分",
  shop: "店铺",
  liveAccount: "直播账号",
  videos: "视频相关信息",
  creators: "达人信息",
  actions: "操作"
};

const table = document.querySelector("#product-table");
const tableHead = document.querySelector("#product-table-head");
const tableBody = document.querySelector("#product-table-body");
const productCount = document.querySelector("#product-count");
const productCountNote = document.querySelector("#product-count-note");
const tableCount = document.querySelector("#table-count");
const productSource = document.querySelector("#product-source");
const activeRankTitle = document.querySelector("#active-rank-title");
const productListTitle = document.querySelector("#product-list-title");
const rankTabs = [...document.querySelectorAll(".rank-tab")];
const importFile = document.querySelector("#import-file");
const importDirectory = document.querySelector("#import-directory");
const importButton = document.querySelector("#import-button");
const importFeedback = document.querySelector("#import-feedback");
const importFileName = document.querySelector("#import-file-name");
const importFileSize = document.querySelector("#import-file-size");
const importValidation = document.querySelector("#import-validation");

let activeRankType = "overall";
let products = [];
let sourceLabel = "模拟数据";
let selectedImport = { imports: [], fileCount: 0, recordCount: 0, rankTypes: [], valid: false };

function renderWorkspace() {
  const config = RANK_CONFIG[activeRankType];
  const rows = getRankRows(activeRankType);
  renderTabCounts();
  productCount.textContent = `${rows.length} 条商品`;
  tableCount.textContent = `${rows.length} 条`;
  productCountNote.textContent = sourceLabel === "已保存数据" ? config.description : "使用模拟数据验证页面";
  productSource.textContent = sourceLabel;
  activeRankTitle.textContent = `TikTok 热卖商品${config.label}`;
  productListTitle.textContent = `TikTok 热卖商品${config.label}`;
  table.className = `product-table rank-table rank-table-${activeRankType}`;
  tableHead.innerHTML = `<tr>${config.columns.map(renderHeader).join("")}</tr>`;
  tableBody.innerHTML = rows.length
    ? rows.map((row) => renderRankRow(row, config)).join("")
    : `<tr><td class="empty-cell" colspan="${config.columns.length}">暂无${config.label}数据，请导入对应榜单 JSON 文件。</td></tr>`;
  tableBody.querySelectorAll(".product-thumb, .video-thumb").forEach((image) => {
    image.addEventListener("error", () => image.closest(".thumb-wrap, .video-cover")?.classList.add("image-failed"));
  });
}

function renderTabCounts() {
  for (const [rankType] of Object.entries(RANK_CONFIG)) {
    const count = getRankRows(rankType).length;
    const countElement = document.querySelector(`[data-rank-count="${rankType}"]`);
    if (countElement) countElement.textContent = count;
  }
}

function renderHeader(column) {
  const textLeft = ["product", "liveAccount", "videos", "creators"].includes(column) ? " text-left" : "";
  return `<th scope="col" class="col-${column}${textLeft}">${COLUMN_LABELS[column]}</th>`;
}

function getRankRows(rankType) {
  return products
    .flatMap((product) => getRankRecords(product)
      .filter((record) => record.rankType === rankType)
      .map((record) => ({ product, record })))
    .sort((left, right) => compareRankRows(left.record, right.record));
}

function getRankRecords(product) {
  if (Array.isArray(product.rankRecords) && product.rankRecords.length) return product.rankRecords;
  return [{
    rankType: "overall",
    rank: product.rank,
    rankChange: product.rankChange,
    gmv: product.gmv,
    gmvText: product.gmvText,
    clicks: product.clicks,
    clicksText: product.clicksText,
    ctr: product.ctr,
    ctrText: product.ctrText,
    rating: product.rating,
    reviewCount: product.reviewCount,
    similarProducts: product.similarProducts
  }];
}

function compareRankRows(left, right) {
  const leftRank = toNullableNumber(left.rank);
  const rightRank = toNullableNumber(right.rank);
  if (leftRank === null && rightRank === null) return right.gmv - left.gmv;
  if (leftRank === null) return 1;
  if (rightRank === null) return -1;
  return leftRank - rightRank;
}

function renderRankRow({ product, record }, config) {
  return `<tr>${config.columns.map((column) => `<td class="cell-${column}">${renderCell(column, product, record)}</td>`).join("")}</tr>`;
}

function renderCell(column, product, record) {
  if (column === "rank") return formatRank(record.rank);
  if (column === "change") return formatRankChange(record.rankChange);
  if (column === "product") return renderProductCell(product, record);
  if (column === "gmv") return escapeHtml(record.gmvText || formatNumber(record.gmv));
  if (column === "clicks") return escapeHtml(record.clicksText || formatNumber(record.clicks));
  if (column === "ctr") return escapeHtml(record.ctrText || formatPercent(record.ctr));
  if (column === "rating") return formatRating(record.rating);
  if (column === "shop") return `<span title="${escapeHtml(product.shopName)}">${escapeHtml(product.shopName)}</span>`;
  if (column === "liveAccount") return renderLiveAccount(record.liveAccount);
  if (column === "videos") return renderVideos(record);
  if (column === "creators") return renderCreators(record);
  if (column === "actions") return renderActions();
  return "—";
}

function renderProductCell(product, record) {
  const imageMarkup = product.imageUrl
    ? `<img class="product-thumb" src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" />`
    : "";
  const rating = formatRating(record.rating);
  const ratingNote = rating === "—" ? "暂无评分" : `评分 ${rating}${record.reviewCount ? ` · ${formatNumber(record.reviewCount)} 条评价` : ""}`;
  return `<div class="product-cell">
    <div class="thumb-wrap">
      ${imageMarkup}
      <span class="thumb-fallback" ${product.imageUrl ? "hidden" : ""}>${escapeHtml(product.imageLabel)}</span>
    </div>
    <div class="product-copy">
      <strong class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong>
      <span class="product-meta">${escapeHtml(product.priceText || formatNumber(product.price))} · ${escapeHtml(product.shopName)}</span>
      <span class="product-rating-note">${ratingNote}</span>
    </div>
  </div>`;
}

function renderLiveAccount(value) {
  if (!value) return "—";
  const [accountName, accountId] = String(value).split(/\s+ID:\s*/i);
  return `<div class="account-cell"><strong>${escapeHtml(accountName)}</strong>${accountId ? `<span>ID: ${escapeHtml(accountId)}</span>` : ""}</div>`;
}

function renderVideos(record) {
  const videos = Array.isArray(record.videos) ? record.videos.filter((video) => video?.cover) : [];
  if (!videos.length && !record.videoCount && !record.bestVideoCount) return "—";
  const visibleVideos = videos.slice(0, 4);
  const total = record.videoCount || record.bestVideoCount || videos.length;
  const remaining = Math.max(total - visibleVideos.length, 0);
  const covers = visibleVideos.map((video) => `<span class="video-cover"><img class="video-thumb" src="${escapeHtml(video.cover)}" alt="" loading="lazy" /><i>▶</i></span>`).join("");
  const fallback = !covers ? '<span class="video-cover video-empty">▶</span>' : "";
  const more = remaining ? `<span class="video-more">+${remaining}</span>` : "";
  return `<div class="video-list">${covers || fallback}${more}</div>`;
}

function renderCreators(record) {
  if (!record.creatorCount && !record.creatorText) return "—";
  const count = record.creatorCount ? `共 ${record.creatorCount} 位达人` : "达人信息";
  return `<div class="creator-cell"><span class="creator-avatars">♙</span><div><strong>${escapeHtml(count)}</strong>${record.creatorText ? `<span>${escapeHtml(record.creatorText)}</span>` : ""}</div></div>`;
}

function renderActions() {
  return `<button class="table-action" type="button" disabled title="商品详情功能待接入">查看</button><button class="table-action secondary" type="button" disabled title="收藏功能待接入">收藏</button>`;
}

function formatRank(value) {
  const rank = toNullableNumber(value);
  if (rank === null) return "—";
  if (rank === 1) return "♛ 1";
  if (rank === 2) return "♛ 2";
  if (rank === 3) return "♛ 3";
  return String(rank);
}

function formatRankChange(value) {
  const change = Number(value);
  if (!Number.isFinite(change) || change === 0) return '<span class="change-flat">—</span>';
  return `<span class="change-${change > 0 ? "up" : "down"}">${change > 0 ? "↑" : "↓"} ${formatNumber(Math.abs(change))}</span>`;
}

function formatRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? `${rating.toFixed(1)}/5` : "—";
}

function formatPercent(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? `${percent}%` : "—";
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number) : "—";
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadStoredProducts() {
  try {
    const response = await fetch("/api/products");
    const storedData = await response.json();
    if (storedData.products?.length) {
      products = storedData.products;
      sourceLabel = "已保存数据";
      importFeedback.textContent = `已读取 ${storedData.productCount ?? products.length} 个本地商品和 ${storedData.rankRecordCount ?? 0} 条榜单记录。`;
      renderWorkspace();
      return;
    }
  } catch {
    importFeedback.textContent = "暂时无法读取本地商品数据。";
  }
  products = mockProducts;
  sourceLabel = "模拟数据";
  renderWorkspace();
}

rankTabs.forEach((tab) => tab.addEventListener("click", () => {
  activeRankType = tab.dataset.rankType;
  rankTabs.forEach((item) => item.classList.toggle("active", item === tab));
  renderWorkspace();
}));

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
  const parsedFiles = await Promise.all(files.map(async (file) => ({ file, payload: JSON.parse(await file.text()), directory: getDirectoryKey(file) })));
  const metadataByDirectory = new Map();
  for (const item of parsedFiles.filter((item) => item.file.name.toLowerCase() === "metadata.json")) metadataByDirectory.set(item.directory, item.payload);
  const productFiles = parsedFiles.filter((item) => item.file.name.toLowerCase() !== "metadata.json");
  if (!productFiles.length) throw new Error("未找到 products.json 商品数据文件");
  return productFiles.map((item) => {
    const records = getImportRecords(item.payload);
    const validRecordCount = records.filter(isProductRecord).length;
    if (!records.length) throw new Error(`${item.file.name} 中没有商品数据`);
    if (validRecordCount !== records.length) throw new Error(`${item.file.name} 有 ${records.length - validRecordCount} 条记录缺少商品名称`);
    const metadata = metadataByDirectory.get(item.directory) ?? item.payload.metadata ?? {};
    return { products: item.payload, metadata, sourceFile: item.file.webkitRelativePath || item.file.name, recordCount: records.length, rankType: rankTypeLabelFromFile(metadata.rank_type ?? item.payload.rank_type, item.file.webkitRelativePath || item.file.name) };
  });
}

importButton.addEventListener("click", async () => {
  if (!selectedImport.valid) return;
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
    products = result.products;
    sourceLabel = "已保存数据";
    renderWorkspace();
    const recognizedLabels = (result.recognizedRankTypes || []).map(rankTypeLabel).join("、") || "无";
    const missingLabels = (result.missingRankTypes || []).map(rankTypeLabel).join("、");
    setValidation(`✓ 商品 ${result.productCount} 条 · 榜单记录 ${result.rankRecordCount} 条 · 已识别：${recognizedLabels}${missingLabels ? ` · 缺失榜单：${missingLabels}` : " · 六榜齐全"}`, "success");
    importFeedback.textContent = `导入成功：${result.importedCount} 条榜单记录，合并 ${result.mergedProductCount} 个重复商品。`;
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

function rankTypeLabelFromFile(value, sourceFile = "") {
  const candidate = `${value ?? ""} ${sourceFile}`;
  return ["直播榜", "短视频榜", "商品卡", "达人榜", "新品榜", "总榜"].find((rankType) => candidate.includes(rankType)) ?? "总榜";
}

function rankTypeLabel(rankType) {
  return RANK_CONFIG[rankType]?.label || rankType;
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
