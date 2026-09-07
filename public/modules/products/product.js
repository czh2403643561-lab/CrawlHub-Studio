/**
 * 六榜固定类型。存储层只允许使用这些英文枚举，界面显示名称由标签表转换。
 * @typedef {"overall" | "live" | "short_video" | "product_card" | "creator" | "new_product"} RankType
 */
export const RANK_TYPES = ["overall", "live", "short_video", "product_card", "creator", "new_product"];

export const RANK_TYPE_LABELS = {
  overall: "总榜",
  live: "直播榜",
  short_video: "短视频榜",
  product_card: "商品卡",
  creator: "达人榜",
  new_product: "新品榜"
};

const RANK_TYPE_ALIASES = {
  overall: "overall", 总榜: "overall", overall榜: "overall",
  live: "live", 直播榜: "live",
  short_video: "short_video", shortvideo: "short_video", 短视频榜: "short_video",
  product_card: "product_card", productcard: "product_card", 商品卡: "product_card",
  creator: "creator", 达人榜: "creator",
  new_product: "new_product", newproduct: "new_product", 新品榜: "new_product"
};

/** @typedef {Object} RankRecord
 * @property {RankType} rankType 固定榜单类型
 * @property {number|null} rank 榜单排名
 * @property {number} rankChange 排名变化
 * @property {number} gmv GMV 区间下限
 * @property {string} gmvText GMV 原始文本
 * @property {number} clicks 点击量区间下限
 * @property {string} clicksText 点击量原始文本
 * @property {number} ctr CTR 区间下限
 * @property {string} ctrText CTR 原始文本
 * @property {number} rating 评分
 * @property {number} reviewCount 评价数
 * @property {number} similarProducts 相似商品数
 * @property {number} videoCount 视频数
 * @property {number} creatorCount 达人数
 * @property {string} creatorText 达人原始文本
 * @property {string} liveAccount 直播账号
 * @property {number} bestVideoCount 表现最佳视频数量
 * @property {Object[]|null} videos 视频数据
 * @property {string|null} sourceFile 来源文件
 * @property {string|null} importedAt 导入时间
 * @property {string|null} category 分类
 * @property {string|null} sourceUrl 来源页面
 */

/** @typedef {Object} Product
 * @property {string} id 商品唯一标识
 * @property {string} name 商品名称
 * @property {string} imageUrl 商品图片地址
 * @property {string} imageLabel 图片占位文字
 * @property {number} price 商品价格区间下限
 * @property {string} priceText 商品价格原始文本
 * @property {string} shopName 店铺名称
 * @property {RankRecord[]} rankRecords 榜单记录
 */

export const productFields = ["id", "name", "imageUrl", "price", "shopName", "rankRecords"];

/** 将采集记录转换为新的 Product + RankRecord 结构。 */
export function normalizeProduct(source = {}, index = 0, defaultRankType = "overall", context = {}) {
  const name = asText(source.product_name ?? source.name, `未命名商品 ${index + 1}`);
  const rankRecords = Array.isArray(source.rankRecords) && source.rankRecords.length
    ? source.rankRecords.map((record) => normalizeRankRecord(record, defaultRankType, context))
    : Array.isArray(source.rankings) && source.rankings.length
      ? source.rankings.map((record) => normalizeRankRecord(record, defaultRankType, {
        ...context,
        legacyProduct: source
      }))
      : [normalizeRankRecord(source, defaultRankType, context)];

  return {
    id: asText(source.id, `product-${hashText(createProductIdentity(name, source.shopName ?? source.shop))}`),
    name,
    imageUrl: asText(source.imageUrl ?? source.image),
    imageLabel: asText(source.imageLabel, createImageLabel(name)),
    price: parseRangeNumber(source.priceText ?? source.price, 0),
    priceText: asText(source.priceText ?? source.price),
    shopName: asText(source.shopName ?? source.shop, "未提供店铺"),
    rankRecords
  };
}

export function normalizeRankRecord(source = {}, defaultRankType = "overall", context = {}) {
  const legacyProduct = context.legacyProduct ?? {};
  const rankType = normalizeRankType(source.rankType ?? source.rank_type ?? defaultRankType);
  const videos = Array.isArray(source.videos) ? source.videos : null;
  return {
    rankType,
    rank: hasValue(source, "rank") ? asNullableNumber(source.rank) : null,
    rankChange: asNumber(source.rankChange ?? source.rank_change, 0),
    gmv: parseRangeNumber(source.gmvText ?? source.gmv ?? legacyProduct.gmvText ?? legacyProduct.gmv, 0),
    gmvText: asText(source.gmvText ?? source.gmv ?? legacyProduct.gmvText ?? legacyProduct.gmv),
    clicks: parseRangeNumber(source.clicksText ?? source.clicks ?? legacyProduct.clicksText ?? legacyProduct.clicks, 0),
    clicksText: asText(source.clicksText ?? source.clicks ?? legacyProduct.clicksText ?? legacyProduct.clicks),
    ctr: parseRangeNumber(source.ctrText ?? source.ctr ?? legacyProduct.ctrText ?? legacyProduct.ctr, 0),
    ctrText: asText(source.ctrText ?? source.ctr ?? legacyProduct.ctrText ?? legacyProduct.ctr),
    rating: asNumber(source.rating ?? legacyProduct.rating, 0),
    reviewCount: asNumber(source.reviewCount ?? source.review_count ?? legacyProduct.reviewCount, 0),
    similarProducts: asNumber(source.similarProducts ?? source.similar_products ?? legacyProduct.similarProducts, 0),
    videoCount: videos?.length || asNumber(source.videoCount, 0) || countRelated(source.related_content?.video, source.best_video),
    creatorCount: asNumber(source.creatorCount, 0) || countRelated(source.related_content?.creator, source.creatorText ?? source.creator),
    creatorText: asText(source.creatorText ?? source.creator),
    liveAccount: asText(source.liveAccount ?? source.live_account),
    bestVideoCount: asNumber(source.bestVideoCount, parseRangeNumber(source.best_video, 0)),
    videos,
    sourceFile: asNullableText(source.sourceFile ?? context.sourceFile),
    importedAt: asNullableText(source.importedAt ?? context.importedAt),
    category: asNullableText(source.category ?? context.category),
    sourceUrl: asNullableText(source.sourceUrl ?? context.sourceUrl)
  };
}

/** 将固定枚举或历史中文值转换为固定 RankType；未知值统一回退总榜。 */
export function normalizeRankType(value) {
  const key = asText(value).toLocaleLowerCase().replace(/[\s-]+/g, "_");
  return RANK_TYPE_ALIASES[key] ?? "overall";
}

export function rankTypeLabel(rankType) {
  return RANK_TYPE_LABELS[normalizeRankType(rankType)];
}

export function createProductIdentity(name, shopName) {
  return `${normalizeIdentityPart(name)}|${normalizeIdentityPart(shopName)}`;
}

/** 为旧页面提供只读兼容字段，不写回旧结构。 */
export function toLegacyProductView(product) {
  const primary = selectPrimaryRankRecord(product.rankRecords);
  return {
    ...product,
    rank: primary.rank,
    rankChange: primary.rankChange,
    price: product.price,
    priceText: product.priceText,
    gmv: primary.gmv,
    gmvText: primary.gmvText,
    clicks: primary.clicks,
    clicksText: primary.clicksText,
    ctr: primary.ctr,
    ctrText: primary.ctrText,
    rating: primary.rating,
    reviewCount: primary.reviewCount,
    similarProducts: primary.similarProducts,
    rank_type: rankTypeLabel(primary.rankType),
    rankings: product.rankRecords.map(toLegacyRankingView),
    videoCount: primary.videoCount,
    creatorCount: primary.creatorCount,
    creatorText: primary.creatorText,
    liveAccount: primary.liveAccount,
    bestVideoCount: primary.bestVideoCount
  };
}

function toLegacyRankingView(record) {
  return {
    rank_type: rankTypeLabel(record.rankType),
    rank: record.rank,
    rankChange: record.rankChange,
    sourceFile: record.sourceFile,
    importedAt: record.importedAt,
    category: record.category,
    sourceUrl: record.sourceUrl
  };
}

export function selectPrimaryRankRecord(records = []) {
  return records.find((record) => record.rankType === "overall")
    ?? records.find((record) => record.rank !== null)
    ?? records[0]
    ?? normalizeRankRecord();
}

function normalizeIdentityPart(value) {
  return asText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function hasValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
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
