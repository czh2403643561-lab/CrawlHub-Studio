/**
 * 商品数据模型。
 * 后续导入模块将把采集文件转换为这个结构。
 *
 * @typedef {Object} Product
 * @property {string} id 商品唯一标识
 * @property {string} name 商品名称
 * @property {string} imageUrl 商品图片地址
 * @property {string} imageLabel 图片未加载时的简短标识
 * @property {number} price 商品价格区间下限
 * @property {string} priceText 商品价格原始文本
 * @property {number} gmv 商品成交额区间下限
 * @property {string} gmvText 商品成交额原始文本
 * @property {number} clicks 点击量区间下限
 * @property {string} clicksText 商品点击量原始文本
 * @property {number} ctr 点击率区间下限（百分比）
 * @property {string} ctrText 商品点击率原始文本
 * @property {number} rating 商品评分
 * @property {string} shopName 店铺名称
 * @property {number} rank 商品排名
 * @property {number} rankChange 排名变化
 * @property {string} rank_type 榜单类型
 */

export const productFields = [
  "id",
  "name",
  "imageUrl",
  "price",
  "gmv",
  "clicks",
  "ctr",
  "rating",
  "shopName",
  "rank",
  "rank_type"
];

/**
 * 将采集记录转换为工作台使用的商品结构。
 * 同时支持采集字段和未来可能传入的标准字段。
 */
export function normalizeProduct(source, index = 0, defaultRankType = "总榜") {
  const name = asText(source.product_name ?? source.name, `未命名商品 ${index + 1}`);
  const priceText = asText(source.priceText ?? source.price);
  const gmvText = asText(source.gmvText ?? source.gmv);
  const clicksText = asText(source.clicksText ?? source.clicks);
  const ctrText = asText(source.ctrText ?? source.ctr);
  const rank = asNumber(source.rank, index + 1);

  return {
    id: asText(source.id, `product-${rank}-${hashText(name)}`),
    name,
    imageUrl: asText(source.imageUrl ?? source.image),
    imageLabel: asText(source.imageLabel, createImageLabel(name)),
    price: parseRangeNumber(source.price, 0),
    priceText,
    gmv: parseRangeNumber(source.gmv, 0),
    gmvText,
    clicks: parseRangeNumber(source.clicks, 0),
    clicksText,
    ctr: parseRangeNumber(source.ctr, 0),
    ctrText,
    rating: asNumber(source.rating, 0),
    shopName: asText(source.shopName ?? source.shop, "未提供店铺"),
    rank,
    rankChange: asNumber(source.rankChange ?? source.rank_change, 0),
    similarProducts: asNumber(source.similarProducts ?? source.similar_products, 0),
    rank_type: asText(source.rank_type ?? source.rankType, defaultRankType)
  };
}

function asText(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value).trim() || fallback;
}

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseRangeNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value ?? "").match(/(\d[\d,.]*)(万|千|k)?/iu);
  if (!match) {
    return fallback;
  }

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
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
