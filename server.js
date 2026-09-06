import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { normalizeProduct } from "./public/modules/products/product.js";

const port = Number(process.env.PORT) || 4173;
const publicDirectory = resolve("public");
const dataDirectory = resolve("data");
const productsFile = resolve(dataDirectory, "products.json");

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
    const content = await readFile(productsFile, "utf8");
    const storedData = JSON.parse(content);
    return {
      importedAt: storedData.importedAt ?? null,
      products: Array.isArray(storedData.products) ? storedData.products : [],
      sourceFile: storedData.sourceFile ?? null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { importedAt: null, products: [], sourceFile: null };
    }
    throw error;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > 5 * 1024 * 1024) {
      throw new Error("导入文件不能超过 5 MB");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getProductRecords(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.products)) {
    return payload.products;
  }
  throw new Error("JSON 文件中未找到商品数据数组");
}

async function saveProducts(products, sourceFile) {
  const storedData = {
    version: 1,
    importedAt: new Date().toISOString(),
    products,
    sourceFile: typeof sourceFile === "string" ? sourceFile : null
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
      sendJson(response, 200, await getStoredProducts());
      return;
    }

    if (request.method === "POST" && requestedPath === "/api/products/import") {
      const payload = await readJsonBody(request);
      const rawProducts = getProductRecords(payload.products ?? payload);
      const products = rawProducts
        .filter((product) => product && typeof product === "object")
        .map((product, index) => normalizeProduct(product, index));

      if (products.length === 0) {
        throw new Error("没有可导入的商品数据");
      }

      const storedData = await saveProducts(products, payload.sourceFile);
      sendJson(response, 201, {
        importedAt: storedData.importedAt,
        importedCount: products.length,
        products,
        sourceFile: storedData.sourceFile
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
    if (!file.isFile()) {
      throw new Error("Not a file");
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`CrawlHub Studio is running at http://localhost:${port}`);
});
