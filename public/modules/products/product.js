/**
 * 统一商品数据模型。一个商品可以保留多个榜单中的排名来源。
 * 排名、视频、达人字段保持为可选，兼容不同榜单的数据差异。
 *
 * @typedef {Object} ProductRanking
 * @property {string} rank_type 榜单类型
 * @property {number|null} rank 榜单排名
 * @property {number} rankChange 排名变化
 * @property {string|null} sourceFile 来源文件名
 * @property {string|null} importedAt 导入时间
 * @property {string|null} category 分类
 * @property {string|null} sourceUrl 来源页面
 *
 * @typedef {Object} Product
 * @property {string} id 商品唯一标识
 * @property {string} name 商品名称
 * @property {string} imageUrl 商品图片地址
 * @property {number} price 商品价格区间下限
 * @property {number} gmv 商品成交额区间下限
 * @property {number} clicks 点击量区间下限
 * @property {number} ctr 点击率区间下限（百分比）
 * @property {number} rating 商品评分
 * @property {string} shopName 店铺名称
 * @property {ProductRanking[]} rankings 榜单来源与排名信息
 * @property {number} videoCount 关联视频数量
 * @property {number} creatorCount 关联达人数量
 * @property {string} liveAccount 直播账号信息
 */

export const RANK_TYPES = ["总榜", "直播榜", "短视频榜", "商品卡", "达人榜", "新品榜"];

export const productFields = [
  "id", "name", "imageUrl", "price", "gmv", "clicks", "ctr", "rating", "shopName",
  "rank", "rank_type", "rankings", "videoCount", "creatorCount", "liveAccount"
];

/** 将采集记录转换为工作台使用的统一商品结构。 */
export function normalizeProduct(source, index = 0, defaultRankType = "总榜", context = {}) {
  const name = asText(source.product_name ?? source.name, `未命名商品 ${index + 1}`);
  const rankType = normalizeRankType(source.rank_type ?? source.rankType ?? defaultRankType);
  const rankings = Array.isArray(source.rankings) && source.rankings.length
    ? source.rankings.map((ranking) => normalizeRanking(ranking, rankType, context))
    : [normalizeRanking(source, rankType, context)];
  const primaryRanking = selectPrimaryRanking(rankings);
  const videos = Array.isArray(source.videos) ? source.videos : [];

  return {
    id: asText(source.id, `product-${hashText(createProductIdentity(name, source.shopName ?? source.shop))}`),
    name,
    imageUrl: asText(source.imageUrl ?? source.image),
    imageLabel: asText(source.imageLabel, createImageLabel(name)),
    price: parseRangeNumber(source.priceText ?? source.price, 0),
    priceText: asText(source.priceText ?? source.price),
    gmv: parseRangeNumber(source.gmvText ?? source.gmv, 0),
    gmvText: asText(source.gmvText ?? source.gmv),
    clicks: parseRangeNumber(source.clicksText ?? source.clicks, 0),
    clicksText: asText(source.clicksText ?? source.clicks),
    ctr: parseRangeNumber(source.ctrText ?? source.ctr, 0),
    ctrText: asText(source.ctrText ?? source.ctr),
    rating: asNumber(source.rating, 0),
    reviewCount: asNumber(source.reviewCount ?? source.review_count, 0),
    shopName: asText(source.shopName ?? source.shop, "未提供店铺"),
    rank: primaryRanking.rank,
    rankChange: primaryRanking.rankChange,
    similarProducts: asNumber(source.similarProducts ?? source.similar_products, 0),
    rank_type: primaryRanking.rank_type,
    rankings,
    videoCount: videos.length || countRelated(source.related_content?.video, source.best_video),
    creatorCount: countRelated(source.related_content?.creator, source.creator),
    creatorText: asText(source.creator),
    liveAccount: asText(source.liveAccount ?? source.live_account),
    bestVideoCount: parseRangeNumber(source.best_video, 0)
  };
}

export function normalizeRanking(source, defaultRankType = "总榜", context = {}) {
  const hasRank = Object.hasOwn(source, "rank");
  return {
    rank_type: normalizeRankType(source.rank_type ?? source.rankType ?? defaultRankType),
    rank: hasRank ? asNullableNumber(source.rank) : null,
    rankChange: asNumber(source.rankChange ?? source.rank_change, 0),
    sourceFile: asNullableText(source.sourceFile ?? context.sourceFile),
    importedAt: asNullableText(source.importedAt ?? context.importedAt),
    category: asNullableText(source.category ?? context.category),
    sourceUrl: asNullableText(source.sourceUrl ?? context.sourceUrl)
  };
}

export function normalizeRankType(value) {
  const text = asText(value, "总榜");
  return RANK_TYPES.includes(text) ? text : "总榜";
}

export function selectPrimaryRanking(rankings = []) {
  return rankings.find((ranking) => ranking.rank_type === "总榜")
    ?? rankings.find((ranking) => ranking.rank !== null)
    ?? rankings[0]
    ?? normalizeRanking({}, "总榜");
}

export function createProductIdentity(name, shopName) {
  return `${normalizeIdentityPart(name)}|${normalizeIdentityPart(shopName)}`;
}

function normalizeIdentityPart(value) {
  return asText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function asText(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value).trim() || fallback;
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countRelated(related, fallback) {
  const relatedCount = asNumber(related?.visible_count, 0) + asNumber(related?.additional_count, 0);
  return relatedCount || parseRangeNumber(fallback, 0);
}

function parseRangeNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").match(/(\d[\d,.]*)(万|千|k)?/iu);
  if (!match) return fallback;
  const number = Number(match[1].replaceAll(",", ""));
  const multiplier = { 万: 10000, 千: 1000, k: 1000 }[match[2]?.toLowerCase()] ?? 1;
  return Number.isFinite(number) ? number * multiplier : fallback;
}

function createImageLabel(name) {
  const label = name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 6).toUpperCase();
  return label || "商品";
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}
