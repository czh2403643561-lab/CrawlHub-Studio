import { mockProducts } from "../modules/products/mock-products.js";

const productGrid = document.querySelector("#product-grid");
const productCount = document.querySelector("#product-count");

productCount.textContent = mockProducts.length;

productGrid.innerHTML = mockProducts
  .map(
    (product) => `
      <article class="product-card">
        <div class="product-image" aria-hidden="true">${product.imageLabel}</div>
        <div class="product-info">
          <span class="rank">排名 #${product.rank}</span>
          <h3>${product.name}</h3>
          <p>${product.shopName}</p>
          <div class="product-metrics">
            <span>价格 <strong>$${product.price.toFixed(2)}</strong></span>
            <span>GMV <strong>$${formatNumber(product.gmv)}</strong></span>
            <span>CTR <strong>${product.ctr}%</strong></span>
          </div>
        </div>
      </article>`
  )
  .join("");

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
