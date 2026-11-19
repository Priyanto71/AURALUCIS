using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using JewelryApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/catalog")]
public class CatalogController(DbConnectionFactory db, CloudinaryService cloudinary) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> List()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<PublicCatalogItem>(@"SELECT product_id AS ProductId, product_name AS ProductName, DBMS_LOB.SUBSTR(description, 4000, 1) AS Description,
            image_url AS ImageUrl, metal_type AS MetalType, purity AS Purity, weight_grams AS WeightGrams,
            making_charge AS MakingCharge, unit_price AS UnitPrice, (unit_price + NVL(making_charge,0)) AS SellingPrice,
            category_id AS CategoryId
            FROM products WHERE NVL(is_published,0) = 1 ORDER BY product_name");
        return Ok(rows);
    }

    [AllowAnonymous]
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        using var conn = db.Create();
        var row = await conn.QueryFirstOrDefaultAsync<PublicCatalogItem>(@"SELECT product_id AS ProductId, product_name AS ProductName, DBMS_LOB.SUBSTR(description, 4000, 1) AS Description,
            image_url AS ImageUrl, metal_type AS MetalType, purity AS Purity, weight_grams AS WeightGrams,
            making_charge AS MakingCharge, unit_price AS UnitPrice, (unit_price + NVL(making_charge,0)) AS SellingPrice
            FROM products WHERE product_id = :id AND NVL(is_published,0) = 1", new { id });
        return row is null ? NotFound() : Ok(row);
    }

    [Authorize(Roles = "Owner,Manager")]
    [HttpPost("image")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> UploadImage(IFormFile file, CancellationToken ct)
    {
        if (file is null) return BadRequest(new { error = "Choose an image file." });
        try { return Ok(new { imageUrl = await cloudinary.UploadAsync(file, ct) }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
