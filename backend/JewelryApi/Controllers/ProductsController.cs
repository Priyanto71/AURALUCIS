using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController(DbConnectionFactory db) : ControllerBase
{
    // List uses the view, so category/supplier names and stock value come pre-joined.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<ProductCatalogItem>(
            @"SELECT product_id, product_name, category_name, supplier_name, metal_type, purity,
                     weight_grams, making_charge, unit_price, stock_quantity, stock_value
              FROM vw_product_catalog ORDER BY product_id");
        return Ok(rows);
    }

    // Single product comes from the table (edit forms need the raw category_id / supplier_id).
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        using var conn = db.Create();
        var p = await conn.QueryFirstOrDefaultAsync<Product>(
            @"SELECT product_id, product_name, category_id, supplier_id, metal_type, purity,
                     weight_grams, making_charge, unit_price, stock_quantity
              FROM products WHERE product_id = :id", new { id });
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Create(Product p)
    {
        using var conn = db.Create();
        var id = await conn.ExecuteScalarAsync<int>("SELECT products_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            @"INSERT INTO products (product_id, product_name, category_id, supplier_id, metal_type, purity,
                                    weight_grams, making_charge, unit_price, stock_quantity)
              VALUES (:id, :name, :cat, :sup, :metal, :purity, :weight, :making, :price, :stock)",
            new
            {
                id, name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge,
                price = p.UnitPrice, stock = p.StockQuantity
            });
        return Ok(new { productId = id });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Update(int id, Product p)
    {
        using var conn = db.Create();
        var n = await conn.ExecuteAsync(
            @"UPDATE products SET product_name = :name, category_id = :cat, supplier_id = :sup,
                     metal_type = :metal, purity = :purity, weight_grams = :weight,
                     making_charge = :making, unit_price = :price
              WHERE product_id = :id",
            new
            {
                name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge, price = p.UnitPrice, id
            });
        return n == 0 ? NotFound() : NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Delete(int id)
    {
        using var conn = db.Create();
        var n = await conn.ExecuteAsync("DELETE FROM products WHERE product_id = :id", new { id });
        return n == 0 ? NotFound() : NoContent();
    }
}
