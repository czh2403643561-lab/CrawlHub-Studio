import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import {
  createProductIdentity,
  normalizeProduct,
  normalizeRankType,
  selectPrimaryRanking
} from "./public/modules/products/product.js";

const port = Number(process.env.PORT) || 4173;
const publicDirectory = resolve("public");
const dataDirectory = resolve("data");
const productsFile = resolve(dataDirectory, "products.json");
const maxImportSize = 5 * 1024 * 1024;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function getStoredProducts() {
  try {
    const storedData = JSON.parse(await readFile(productsFile, "utf8"));
    const products = Array.isArray(storedData.products)
      ? storedData.products.map((product, index) => normalizeProduct(product, index, storedData.rank_type ?? "总榜", {
        sourceFile: storedData.sourceFile,
        importedAt: storedData.importedAt
      }))
      : [];
    return { importedAt: storedData.importedAt ?? null, products, sourceFiles: storedData.sourceFiles ?? [] };
  } catch (error) {
    if (error.code === "ENOENT") return { importedAt: null, products: [], sourceFiles: [] };
    throw error;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > maxImportSize) throw new Error("导入数据不能超过 5 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getProductRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  throw new Error("JSON 文件中未找到商品数据数组");
}

function getImportEntries(payload) {
  const imports = Array.isArray(payload.imports) ? payload.imports : [payload];
  return imports.map((entry) => {
    const productsPayload = entry.products ?? entry;
    const records = getProductRecords(productsPayload);
    const metadata = entry.metadata ?? productsPayload.metadata ?? {};
    const rankType = detectRankType(entry.rank_type ?? entry.rankType ?? metadata.rank_type, entry.sourceFile);
    const invalidCount = records.filter((record) => !isProductRecord(record)).length;
    if (invalidCount) throw new Error(`${entry.sourceFile ?? "文件"} 有 ${invalidCount} 条记录缺少商品名称`);
    if (!records.length) throw new Error(`${entry.sourceFile ?? "文件"} 没有可导入的商品数据`);
    return { records, rankType, metadata, sourceFile: asNullableText(entry.sourceFile) };
  });
}

function detectRankType(value, sourceFile = "") {
  const candidate = `${value ?? ""} ${sourceFile}`;
  for (const rankType of ["直播榜", "短视频榜", "商品卡", "达人榜", "新品榜", "总榜"]) {
    if (candidate.includes(rankType)) return rankType;
  }
  return normalizeRankType(value);
}

function mergeImports(existingProducts, entries, importedAt) {
  const products = [...existingProducts];
  const indexedProducts = new Map(products.map((product, index) => [createProductIdentity(product.name, product.shopName), index]));
  let importedRecordCount = 0;
  let mergedCount = 0;

  for (const entry of entries) {
    const context = {
      sourceFile: entry.sourceFile,
      importedAt,
      category: entry.metadata.category_short ?? entry.metadata.category,
      sourceUrl: entry.metadata.url
    };
    entry.records.forEach((record, index) => {
      const incoming = normalizeProduct(record, index, entry.rankType, context);
      const identity = createProductIdentity(incoming.name, incoming.shopName);
      const existingIndex = indexedProducts.get(identity);
      importedRecordCount += 1;
      if (existingIndex === undefined) {
        products.push(incoming);
        indexedProducts.set(identity, products.length - 1);
        return;
      }
      products[existingIndex] = mergeProduct(products[existingIndex], incoming);
      mergedCount += 1;
    });
  }
  return { products, importedRecordCount, mergedCount };
}

function mergeProduct(existing, incoming) {
  const mergedRankings = [...existing.rankings];
  for (const incomingRanking of incoming.rankings) {
    const rankingIndex = mergedRankings.findIndex((ranking) => ranking.rank_type === incomingRanking.rank_type);
    if (rankingIndex === -1) mergedRankings.push(incomingRanking);
    else mergedRankings[rankingIndex] = incomingRanking;
  }
  const primaryRanking = selectPrimaryRanking(mergedRankings);
  return {
    ...existing,
    ...incoming,
    rank: primaryRanking.rank,
    rankChange: primaryRanking.rankChange,
    rank_type: primaryRanking.rank_type,
    rankings: mergedRankings,
    videoCount: Math.max(existing.videoCount ?? 0, incoming.videoCount ?? 0),
    creatorCount: Math.max(existing.creatorCount ?? 0, incoming.creatorCount ?? 0),
    liveAccount: incoming.liveAccount || existing.liveAccount || ""
  };
}

async function saveProducts(products, sourceFiles, importedAt) {
  const storedData = { version: 2, importedAt, products, sourceFiles };
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${productsFile}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(storedData, null, 2), "utf8");
  await rename(temporaryFile, productsFile);
  return storedData;
}

const server = createServer(async (request, response) => {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  try {
    if (request.method === "GET" && requestedPath === "/api/products") {
      sendJson(response, 200, await getStoredProducts());
      return;
    }
    if (request.method === "POST" && requestedPath === "/api/products/import") {
      const payload = await readJsonBody(request);
      const entries = getImportEntries(payload);
      const previous = await getStoredProducts();
      const importedAt = new Date().toISOString();
      const result = mergeImports(previous.products, entries, importedAt);
      const sourceFiles = entries.map((entry) => ({
        fileName: entry.sourceFile,
        rank_type: entry.rankType,
        category: entry.metadata.category_short ?? entry.metadata.category ?? null,
        importedAt
      }));
      const storedData = await saveProducts(result.products, sourceFiles, importedAt);
      sendJson(response, 201, {
        importedAt,
        importedCount: result.importedRecordCount,
        importedFileCount: entries.length,
        mergedCount: result.mergedCount,
        products: storedData.products,
        sourceFiles
      });
      return;
    }
    if (requestedPath.startsWith("/api/")) {
      sendJson(response, 404, { error: "接口不存在" });
      return;
    }
  } catch (error) {
    sendJson(response, 400, { error: error.message || "导入失败" });
    return;
  }

  const relativePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = resolve(publicDirectory, `.${relativePath}`);
  if (relative(publicDirectory, filePath).startsWith("..")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function isProductRecord(record) {
  return Boolean(record && typeof record === "object" && (record.product_name || record.name));
}

function asNullableText(value) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text || null;
}

server.listen(port, () => console.log(`CrawlHub Studio is running at http://localhost:${port}`));
