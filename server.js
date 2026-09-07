import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import {
  RANK_TYPES,
  createProductIdentity,
  normalizeProduct,
  normalizeRankType,
  rankTypeLabel,
  selectPrimaryRankRecord,
  toLegacyProductView
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

async function loadStore() {
  try {
    const storedData = JSON.parse(await readFile(productsFile, "utf8"));
    const defaultRankType = storedData.rankType ?? storedData.rank_type ?? "overall";
    const products = Array.isArray(storedData.products)
      ? storedData.products.map((product, index) => normalizeProduct(product, index, defaultRankType, {
        sourceFile: storedData.sourceFile,
        importedAt: storedData.importedAt
      }))
      : [];
    return {
      importedAt: storedData.importedAt ?? null,
      products,
      sourceFiles: Array.isArray(storedData.sourceFiles) ? storedData.sourceFiles : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { importedAt: null, products: [], sourceFiles: [] };
    throw error;
  }
}

function buildProductResponse(store, extra = {}) {
  const rankTypes = [...new Set(store.products.flatMap((product) => product.rankRecords.map((record) => record.rankType)))];
  return {
    importedAt: store.importedAt,
    products: store.products.map(toLegacyProductView),
    productCount: store.products.length,
    rankRecordCount: store.products.reduce((count, product) => count + product.rankRecords.length, 0),
    recognizedRankTypes: RANK_TYPES.filter((rankType) => rankTypes.includes(rankType)),
    missingRankTypes: RANK_TYPES.filter((rankType) => !rankTypes.includes(rankType)),
    sourceFiles: store.sourceFiles,
    ...extra
  };
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
    const rankType = detectRankType(
      entry.rankType ?? entry.rank_type ?? metadata.rankType ?? metadata.rank_type,
      entry.sourceFile
    );
    const invalidCount = records.filter((record) => !isProductRecord(record)).length;
    if (invalidCount) throw new Error(`${entry.sourceFile ?? "文件"} 有 ${invalidCount} 条记录缺少商品名称`);
    if (!records.length) throw new Error(`${entry.sourceFile ?? "文件"} 没有可导入的商品数据`);
    return { records, rankType, metadata, sourceFile: asNullableText(entry.sourceFile) };
  });
}

function detectRankType(value, sourceFile = "") {
  const candidate = `${value ?? ""} ${sourceFile}`;
  const labels = ["直播榜", "短视频榜", "商品卡", "达人榜", "新品榜", "总榜"];
  const label = labels.find((item) => candidate.includes(item));
  return normalizeRankType(label ?? value);
}

function mergeImports(existingProducts, entries, importedAt) {
  const products = [...existingProducts];
  const indexedProducts = new Map(products.map((product, index) => [
    createProductIdentity(product.name, product.shopName),
    index
  ]));
  let importedRecordCount = 0;
  let mergedProductCount = 0;

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
      importedRecordCount += incoming.rankRecords.length;
      if (existingIndex === undefined) {
        products.push(incoming);
        indexedProducts.set(identity, products.length - 1);
        return;
      }
      products[existingIndex] = mergeProduct(products[existingIndex], incoming);
      mergedProductCount += 1;
    });
  }
  return { products, importedRecordCount, mergedProductCount };
}

function mergeProduct(existing, incoming) {
  const rankRecords = [...existing.rankRecords];
  for (const incomingRecord of incoming.rankRecords) {
    const recordIndex = rankRecords.findIndex((record) => record.rankType === incomingRecord.rankType);
    if (recordIndex === -1) rankRecords.push(incomingRecord);
    else rankRecords[recordIndex] = incomingRecord;
  }
  return {
    ...existing,
    ...incoming,
    imageUrl: incoming.imageUrl || existing.imageUrl,
    imageLabel: incoming.imageLabel || existing.imageLabel,
    priceText: incoming.priceText || existing.priceText,
    price: incoming.price || existing.price,
    rankRecords
  };
}

function mergeSourceFiles(previousFiles, entries, importedAt) {
  const sourceFiles = Array.isArray(previousFiles) ? [...previousFiles] : [];
  for (const entry of entries) {
    const source = {
      fileName: entry.sourceFile,
      rankType: entry.rankType,
      rankLabel: rankTypeLabel(entry.rankType),
      category: entry.metadata.category_short ?? entry.metadata.category ?? null,
      importedAt
    };
    const sourceIndex = sourceFiles.findIndex((item) => item.rankType === source.rankType);
    if (sourceIndex === -1) sourceFiles.push(source);
    else sourceFiles[sourceIndex] = source;
  }
  return sourceFiles;
}

async function saveStore(products, sourceFiles, importedAt) {
  const storedData = {
    version: 3,
    schema: "product-rank-record",
    importedAt,
    products,
    sourceFiles
  };
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
      sendJson(response, 200, buildProductResponse(await loadStore()));
      return;
    }
    if (request.method === "POST" && requestedPath === "/api/products/import") {
      const payload = await readJsonBody(request);
      const entries = getImportEntries(payload);
      const previous = await loadStore();
      const importedAt = new Date().toISOString();
      const result = mergeImports(previous.products, entries, importedAt);
      const sourceFiles = mergeSourceFiles(previous.sourceFiles, entries, importedAt);
      const storedData = await saveStore(result.products, sourceFiles, importedAt);
      const recognizedRankTypes = RANK_TYPES.filter((rankType) => entries.some((entry) => entry.rankType === rankType));
      const missingRankTypes = RANK_TYPES.filter((rankType) => !recognizedRankTypes.includes(rankType));
      sendJson(response, 201, buildProductResponse(storedData, {
        importedCount: result.importedRecordCount,
        importedFileCount: entries.length,
        mergedProductCount: result.mergedProductCount,
        recognizedRankTypes,
        missingRankTypes
      }));
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
