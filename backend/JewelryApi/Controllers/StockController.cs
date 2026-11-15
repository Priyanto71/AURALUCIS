using System.Data;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StockController(DbConnectionFactory db) : ControllerBase
{
    [HttpPost("restock")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Restock(RestockRequest req)
    {
        if (req.Quantity <= 0) return BadRequest(new { error = "Quantity must be greater than 0." });

        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.restock_product",
            new
            {
                p_product_id = req.ProductId, p_qty = req.Quantity,
                p_remarks = string.IsNullOrWhiteSpace(req.Remarks) ? "RESTOCK" : req.Remarks,
                p_unit_cost = req.UnitCost, p_supplier_id = req.SupplierId
            },
            commandType: CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "RESTOCK", "Product", req.ProductId.ToString(), $"+{req.Quantity} at cost {req.UnitCost} {req.Remarks}");
        return NoContent();
    }

    // Manager only. Damaged, lost, found or a counting correction.
    // QuantityChange is negative to REMOVE stock and positive to ADD it. A reason is required.
    [HttpPost("adjust")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Adjust(AdjustStockRequest req)
    {
        if (req.QuantityChange == 0) return BadRequest(new { error = "Adjustment quantity cannot be zero." });
        if (string.IsNullOrWhiteSpace(req.Reason)) return BadRequest(new { error = "A reason is required for a stock adjustment." });

        var reason = string.IsNullOrWhiteSpace(req.Note) ? req.Reason.Trim() : $"{req.Reason.Trim()} - {req.Note.Trim()}";

        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.adjust_stock",
            new { p_product_id = req.ProductId, p_qty_change = req.QuantityChange, p_reason = reason },
            commandType: CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "ADJUST", "Product", req.ProductId.ToString(), $"{req.QuantityChange:+#;-#} ({reason})");
        return NoContent();
    }

    // Latest 100 stock movements (ROWNUM wrapper works on every Oracle version).
    [HttpGet("transactions")]
    public async Task<IActionResult> Transactions()
    {
        using var conn = db.Create();
        var rows = (await conn.QueryAsync<StockTxn>(
            @"SELECT * FROM (
                SELECT t.txn_id, t.product_id, p.product_name, t.txn_type, t.quantity, t.txn_date, t.remarks,
                       t.unit_cost, s.supplier_name
                FROM stock_transactions t
                JOIN products p ON p.product_id = t.product_id
                LEFT JOIN suppliers s ON s.supplier_id = t.supplier_id
                ORDER BY t.txn_id DESC)
              WHERE ROWNUM <= 100")).ToList();
        if (!User.IsInRole("Manager")) rows.ForEach(r => r.UnitCost = null); // purchase costs are for Managers only
        return Ok(rows);
    }
}
