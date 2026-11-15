using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RatesController(DbConnectionFactory db) : ControllerBase
{
    // Today's rate of every metal + purity (any logged-in employee can see them).
    // productCount = how many RATE products are priced from this rate.
    [HttpGet]
    public async Task<IActionResult> Current()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<MetalRate>(
            @"SELECT cr.rate_id, cr.metal_type, cr.purity, cr.rate_per_gram, cr.effective_from,
                     e.first_name || ' ' || e.last_name AS set_by_name,
                     (SELECT COUNT(*) FROM products p
                      WHERE p.pricing_mode = 'RATE' AND p.metal_type = cr.metal_type
                        AND NVL(p.purity, '-') = NVL(cr.purity, '-')) AS product_count
              FROM vw_current_rates cr
              LEFT JOIN employees e ON e.employee_id = cr.set_by
              ORDER BY cr.metal_type, cr.purity");
        return Ok(rows);
    }

    // The latest 100 rates ever set (history).
    [HttpGet("history")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> History()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<MetalRate>(
            @"SELECT * FROM (
                SELECT r.rate_id, r.metal_type, r.purity, r.rate_per_gram, r.effective_from,
                       e.first_name || ' ' || e.last_name AS set_by_name
                FROM metal_rates r LEFT JOIN employees e ON e.employee_id = r.set_by
                ORDER BY r.rate_id DESC)
              WHERE ROWNUM <= 100");
        return Ok(rows);
    }

    // Manager only: set today's rate. Every product that is priced by rate is repriced at once.
    [HttpPost]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Set(RateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.MetalType)) return BadRequest(new { error = "The metal is required." });
        if (req.RatePerGram <= 0) return BadRequest(new { error = "The rate must be greater than 0." });

        var metal = req.MetalType.Trim();
        var purity = req.Purity?.Trim() ?? "";

        using var conn = db.Create();
        var count = await conn.ExecuteScalarAsync<int>(
            @"SELECT COUNT(*) FROM products
              WHERE pricing_mode = 'RATE' AND metal_type = :m AND NVL(purity, '-') = NVL(:p, '-')",
            new { m = metal, p = purity });

        await conn.ExecuteAsync("set_metal_rate",
            new { p_metal = metal, p_purity = purity, p_rate = req.RatePerGram, p_employee_id = User.GetEmployeeId() },
            commandType: System.Data.CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "SET_RATE", "Rate", null,
            $"{metal} {purity}: {req.RatePerGram} per gram, {count} product(s) repriced");
        return Ok(new { repriced = count });
    }
}
