using System.Data;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController(DbConnectionFactory db) : ControllerBase
{
    private const string SelectOne =
        @"SELECT product_id, product_name, category_id, supplier_id, metal_type, purity,
                 weight_grams, making_charge, unit_price, stock_quantity, cost_price,
                 DBMS_LOB.SUBSTR(description, 4000, 1) AS description, image_url, is_published,
                 sku, barcode, hallmark_number, hallmark_details, certificate_number, certificate_issuer, certificate_date
          FROM products WHERE product_id = :id";

    // List uses the view, so category/supplier names and stock value come pre-joined.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = (await conn.QueryAsync<ProductCatalogItem>(
            @"SELECT p.product_id, p.product_name, c.category_name, s.supplier_name, p.metal_type, p.purity,
                     p.weight_grams, p.making_charge, p.unit_price, p.stock_quantity, (p.stock_quantity * p.unit_price) AS stock_value, p.cost_price,
                     p.pricing_mode, p.making_percent, DBMS_LOB.SUBSTR(p.description, 4000, 1) AS description, p.image_url, p.is_published,
                     p.sku, p.barcode, p.hallmark_number, p.hallmark_details, p.certificate_number, p.certificate_issuer, p.certificate_date
              FROM products p LEFT JOIN categories c ON c.category_id = p.category_id LEFT JOIN suppliers s ON s.supplier_id = p.supplier_id ORDER BY p.product_id")).ToList();
        if (!User.IsInRole("Manager") && !User.IsInRole("Owner")) rows.ForEach(r => r.CostPrice = 0); // cost prices are for Managers only
        return Ok(rows);
    }

    // Single product comes from the table (edit forms need the raw category_id / supplier_id).
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        using var conn = db.Create();
        var p = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        if (p is not null && !User.IsInRole("Manager") && !User.IsInRole("Owner")) p.CostPrice = 0;
        return p is null ? NotFound() : Ok(p);
    }

    // PricingMode "FIXED": the unit price is typed in.
    // PricingMode "RATE":  the price is weight x today's metal rate (the database calculates it).
    // MakingPercent: making charge as a % of the price (empty = the fixed making charge is used).
    [HttpPost]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Create(Product p)
    {
        var problem = Validate(p);
        if (problem is not null) return BadRequest(new { error = problem });

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var id = await conn.ExecuteScalarAsync<int>("SELECT products_seq.NEXTVAL FROM DUAL", transaction: tx);
            await conn.ExecuteAsync(
                @"INSERT INTO products (product_id, product_name, category_id, supplier_id, metal_type, purity,
                                        weight_grams, making_charge, unit_price, stock_quantity, cost_price,
                                        pricing_mode, making_percent, description, image_url, is_published,
                                        sku, barcode, hallmark_number, hallmark_details, certificate_number, certificate_issuer, certificate_date)
                  VALUES (:id, :name, :cat, :sup, :metal, :purity, :weight, :making, :price, :stock, :cost, :pmode, :pct, :description, :imageUrl, :published,
                          :sku, :barcode, :hallmarkNumber, :hallmarkDetails, :certificateNumber, :certificateIssuer, :certificateDate)",
                new
                {
                    id, name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                    purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge, price = p.UnitPrice,
                    stock = p.StockQuantity, cost = p.CostPrice, pmode = p.PricingMode, pct = p.MakingPercent,
                    description = p.Description, imageUrl = p.ImageUrl, published = p.IsPublished,
                    sku = p.Sku, barcode = p.Barcode, hallmarkNumber = p.HallmarkNumber, hallmarkDetails = p.HallmarkDetails,
                    certificateNumber = p.CertificateNumber, certificateIssuer = p.CertificateIssuer, certificateDate = p.CertificateDate
                }, tx);

            await RepriceAsync(conn, tx, p, id);

            var price = await conn.ExecuteScalarAsync<decimal>(
                "SELECT unit_price FROM products WHERE product_id = :id", new { id }, tx);

            await AuditLogger.LogAsync(conn, tx, User.GetEmployeeId(), "CREATE", "Product", id.ToString(),
                $"{p.ProductName} | {p.PricingMode} price {price} | cost {p.CostPrice} | opening stock {p.StockQuantity}");

            tx.Commit();
            return Ok(new { productId = id });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Update(int id, Product p)
    {
        var problem = Validate(p);
        if (problem is not null) return BadRequest(new { error = problem });

        using var conn = db.Create();
        var old = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        if (old is null) return NotFound();

        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            await conn.ExecuteAsync(
                @"UPDATE products SET product_name = :name, category_id = :cat, supplier_id = :sup,
                         metal_type = :metal, purity = :purity, weight_grams = :weight,
                         making_charge = :making, unit_price = :price, cost_price = :cost,
                         pricing_mode = :pmode, making_percent = :pct, description = :description, image_url = :imageUrl, is_published = :published,
                         sku = :sku, barcode = :barcode, hallmark_number = :hallmarkNumber, hallmark_details = :hallmarkDetails,
                         certificate_number = :certificateNumber, certificate_issuer = :certificateIssuer, certificate_date = :certificateDate
                  WHERE product_id = :id",
                new
                {
                    name = p.ProductName, cat = p.CategoryId, sup = p.SupplierId, metal = p.MetalType,
                    purity = p.Purity, weight = p.WeightGrams, making = p.MakingCharge, price = p.UnitPrice,
                    cost = p.CostPrice, pmode = p.PricingMode, pct = p.MakingPercent,
                    description = p.Description, imageUrl = p.ImageUrl, published = p.IsPublished,
                    sku = p.Sku, barcode = p.Barcode, hallmarkNumber = p.HallmarkNumber, hallmarkDetails = p.HallmarkDetails,
                    certificateNumber = p.CertificateNumber, certificateIssuer = p.CertificateIssuer, certificateDate = p.CertificateDate, id
                }, tx);

            await RepriceAsync(conn, tx, p, id);

            var now = await conn.QueryFirstAsync<Product>(SelectOne, new { id }, tx);
            await AuditLogger.LogAsync(conn, tx, User.GetEmployeeId(), "UPDATE", "Product", id.ToString(),
                $"{old.ProductName}: {Diff(old, now)}");

            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }

        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Delete(int id)
    {
        using var conn = db.Create();
        var old = await conn.QueryFirstOrDefaultAsync<Product>(SelectOne, new { id });
        var n = await conn.ExecuteAsync("DELETE FROM products WHERE product_id = :id", new { id });
        if (n == 0) return NotFound();

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "DELETE", "Product", id.ToString(), old?.ProductName);
        return NoContent();
    }

    private static string? Validate(Product p)
    {
        if (p.PricingMode != "FIXED" && p.PricingMode != "RATE") return "Pricing must be FIXED or RATE.";
        if (p.MakingPercent is < 0 or > 100) return "The making charge percent must be between 0 and 100.";
        if (p.Sku?.Length > 50) return "SKU must be 50 characters or fewer.";
        if (p.Barcode?.Length > 100) return "Barcode must be 100 characters or fewer.";
        if (p.HallmarkNumber?.Length > 100) return "Hallmark number must be 100 characters or fewer.";
        if (p.HallmarkDetails?.Length > 500) return "Hallmark details must be 500 characters or fewer.";
        if (p.CertificateNumber?.Length > 100) return "Certificate number must be 100 characters or fewer.";
        if (p.CertificateIssuer?.Length > 150) return "Certificate issuer must be 150 characters or fewer.";
        if (p.PricingMode == "FIXED" && p.UnitPrice <= 0) return "Enter the unit price.";
        return null;
    }

    // Lets the database work out the price / making charge. Needed for RATE products and for a making %.
    private static async Task RepriceAsync(OracleConnection conn, IDbTransaction tx, Product p, int id)
    {
        if (p.PricingMode == "RATE" || p.MakingPercent is not null)
            await conn.ExecuteAsync("reprice_products", new { p_product_id = id }, tx, commandType: CommandType.StoredProcedure);
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
        Check("pricing", o.PricingMode, n.PricingMode);
        Check("making %", o.MakingPercent, n.MakingPercent);
        Check("making charge", o.MakingCharge, n.MakingCharge);
        Check("unit price", o.UnitPrice, n.UnitPrice);
        Check("cost price", o.CostPrice, n.CostPrice);
        Check("category", o.CategoryId, n.CategoryId);
        Check("supplier", o.SupplierId, n.SupplierId);
        Check("SKU", o.Sku, n.Sku);
        Check("barcode", o.Barcode, n.Barcode);
        Check("hallmark number", o.HallmarkNumber, n.HallmarkNumber);
        Check("hallmark details", o.HallmarkDetails, n.HallmarkDetails);
        Check("certificate number", o.CertificateNumber, n.CertificateNumber);
        Check("certificate issuer", o.CertificateIssuer, n.CertificateIssuer);
        Check("certificate date", o.CertificateDate, n.CertificateDate);
        return changes.Count == 0 ? "no field changed" : string.Join("; ", changes);
    }
}
