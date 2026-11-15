using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController(DbConnectionFactory db) : ControllerBase
{
    private const string SelectOne =
        @"SELECT product_id, product_name, category_id, supplier_id, metal_type, purity,
                 weight_grams, making_charge, unit_price, stock_quantity, cost_price
          FROM products WHERE product_id = :id";

    // List uses the view, so category/supplier names and stock value come pre-joined.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = (await conn.QueryAsync<ProductCatalogItem>(
            @"SELECT product_id, product_name, category_name, supplier_name, metal_type, purity,
                     weight_grams, making_charge, unit_price, stock_quantity, stock_value, cost_price
              FROM vw_product_catalog ORDER BY product_id")).ToList();
        if (!User.IsInRole("Manager")) rows.ForEach(r => r.CostPrice = 0); // cost prices are for Managers only
        return Ok(rows);
    }

    // Single product comes from the table (edit forms need the raw category_id / supplier_id).
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        using var conn = db.Create();
        var p = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        if (p is not null && !User.IsInRole("Manager")) p.CostPrice = 0;
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
                                    weight_grams, making_charge, unit_price, stock_quantity, cost_price)
              VALUES (:id, :name, :cat, :sup, :metal, :purity, :weight, :making, :price, :stock, :cost)",
            new
            {
                id, name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge,
                price = p.UnitPrice, stock = p.StockQuantity, cost = p.CostPrice
            });

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "CREATE", "Product", id.ToString(),
            $"{p.ProductName} | unit price {p.UnitPrice} | cost {p.CostPrice} | making charge {p.MakingCharge} | opening stock {p.StockQuantity}");
        return Ok(new { productId = id });
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Update(int id, Product p)
    {
        using var conn = db.Create();
        var old = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        if (old is null) return NotFound();

        await conn.ExecuteAsync(
            @"UPDATE products SET product_name = :name, category_id = :cat, supplier_id = :sup,
                     metal_type = :metal, purity = :purity, weight_grams = :weight,
                     making_charge = :making, unit_price = :price, cost_price = :cost
              WHERE product_id = :id",
            new
            {
                name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge, price = p.UnitPrice, cost = p.CostPrice, id
            });

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "UPDATE", "Product", id.ToString(), $"{old.ProductName}: {Diff(old, p)}");
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Delete(int id)
    {
        using var conn = db.Create();
        var old = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        var n = await conn.ExecuteAsync("DELETE FROM products WHERE product_id = :id", new { id });
        if (n == 0) return NotFound();

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "DELETE", "Product", id.ToString(), old?.ProductName);
        return NoContent();
    }

    // "unit price: 650 -> 700; making charge: 1200 -> 1000"
    private static string Diff(Product o, Product n)
    {
        var changes = new List<string>();
        void Check(string label, object? a, object? b) { if (!Equals(a, b)) changes.Add($"{label}: {a} -> {b}"); }
        Check("name", o.ProductName, n.ProductName);
        Check("metal", o.MetalType, n.MetalType);
        Check("purity", o.Purity, n.Purity);
        Check("weight", o.WeightGrams, n.WeightGrams);
        Check("making charge", o.MakingCharge, n.MakingCharge);
        Check("unit price", o.UnitPrice, n.UnitPrice);
        Check("cost price", o.CostPrice, n.CostPrice);
        Check("category", o.CategoryId, n.CategoryId);
        Check("supplier", o.SupplierId, n.SupplierId);
        return changes.Count == 0 ? "no field changed" : string.Join("; ", changes);
    }
}
