using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CategoriesController(DbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<Category>(
            "SELECT category_id, category_name, description FROM categories ORDER BY category_name");
        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Create(Category c)
    {
        using var conn = db.Create();
        // Take the id from the sequence ourselves so we can return it to the client.
        var id = await conn.ExecuteScalarAsync<int>("SELECT categories_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            "INSERT INTO categories (category_id, category_name, description) VALUES (:id, :name, :descr)",
            new { id, name = c.CategoryName, descr = c.Description });
        return Ok(new { categoryId = id });
    }
}
