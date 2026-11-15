using System.Data;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

// What was bought from which supplier, at what cost, and what is still owed. Managers only.
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Manager")]
public class PurchasesController(DbConnectionFactory db) : ControllerBase
{
    private static readonly string[] Methods = { "Cash", "Card", "bKash", "Nagad", "Bank" };

    // Latest 200 purchases.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<PurchaseRow>(
            @"SELECT * FROM (
                SELECT purchase_id, purchase_date, invoice_no, supplier_name, employee_name,
                       total_amount, paid_amount, due_amount, item_count
                FROM vw_purchase_summary ORDER BY purchase_id DESC)
              WHERE ROWNUM <= 200");
        return Ok(rows);
    }

    // One purchase with its items and the payments made to the supplier.
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id)
    {
        using var conn = db.Create();
        var purchase = await conn.QueryFirstOrDefaultAsync<PurchaseRow>(
            @"SELECT p.purchase_id, p.purchase_date, p.invoice_no, p.supplier_id, s.supplier_name,
                     e.first_name || ' ' || e.last_name AS employee_name,
                     p.total_amount, p.paid_amount, p.total_amount - p.paid_amount AS due_amount,
                     (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.purchase_id) AS item_count,
                     p.note
              FROM purchases p
              JOIN suppliers s ON s.supplier_id = p.supplier_id
              LEFT JOIN employees e ON e.employee_id = p.employee_id
              WHERE p.purchase_id = :id", new { id });
        if (purchase is null) return NotFound(new { error = "Purchase not found." });

        var items = await conn.QueryAsync<PurchaseItemRow>(
            @"SELECT i.product_id, pr.product_name, i.quantity, i.unit_cost, i.line_total
              FROM purchase_items i JOIN products pr ON pr.product_id = i.product_id
              WHERE i.purchase_id = :id ORDER BY i.pi_id", new { id });

        var payments = await conn.QueryAsync<PurchasePaymentRow>(
            @"SELECT x.amount, x.method, x.paid_at, e.first_name || ' ' || e.last_name AS employee_name, x.note
              FROM purchase_payments x LEFT JOIN employees e ON e.employee_id = x.employee_id
              WHERE x.purchase_id = :id ORDER BY x.pp_id", new { id });

        return Ok(new { purchase, items, payments });
    }

    // Record a purchase: stock goes up, average cost prices are updated, and the first payment (if any) is saved.
    // All in ONE transaction. PaidAmount empty = nothing paid yet (the supplier is owed the whole amount).
    [HttpPost]
    public async Task<IActionResult> Create(PurchaseRequest req)
    {
        if (req.SupplierId <= 0) return BadRequest(new { error = "Choose the supplier." });
        if (req.Items is null || req.Items.Count == 0) return BadRequest(new { error = "Add at least one product." });
        if (req.Items.Any(i => i.Quantity <= 0)) return BadRequest(new { error = "Quantity must be greater than 0." });
        if (req.Items.Any(i => i.UnitCost < 0)) return BadRequest(new { error = "Cost price cannot be negative." });
        if (req.PaidAmount < 0) return BadRequest(new { error = "The paid amount cannot be negative." });
        var method = string.IsNullOrWhiteSpace(req.PaymentMethod) ? "Cash" : req.PaymentMethod;
        if (!Methods.Contains(method)) return BadRequest(new { error = "Choose Cash, Card, bKash, Nagad or Bank." });

        var employeeId = User.GetEmployeeId()!.Value;
        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var id = await conn.ExecuteScalarAsync<int>("SELECT purchases_seq.NEXTVAL FROM DUAL", transaction: tx);
            await conn.ExecuteAsync("pkg_purchases.start_purchase",
                new { p_purchase_id = id, p_supplier_id = req.SupplierId, p_employee_id = employeeId, p_invoice_no = req.InvoiceNo, p_note = req.Note },
                tx, commandType: CommandType.StoredProcedure);

            foreach (var item in req.Items)
            {
                await conn.ExecuteAsync("pkg_purchases.add_purchase_item",
                    new { p_purchase_id = id, p_product_id = item.ProductId, p_qty = item.Quantity, p_unit_cost = item.UnitCost },
                    tx, commandType: CommandType.StoredProcedure);
            }

            var total = await conn.ExecuteScalarAsync<decimal>("SELECT total_amount FROM purchases WHERE purchase_id = :id", new { id }, tx);
            var paid = req.PaidAmount ?? 0m;
            if (paid > 0)
            {
                await conn.ExecuteAsync("pkg_purchases.pay_supplier",
                    new { p_purchase_id = id, p_amount = paid, p_method = method, p_employee_id = employeeId, p_note = "Payment at purchase" },
                    tx, commandType: CommandType.StoredProcedure);
            }
            tx.Commit();

            await AuditLogger.LogAsync(db, employeeId, "PURCHASE", "Purchase", id.ToString(),
                $"Supplier #{req.SupplierId}, invoice {req.InvoiceNo}, {req.Items.Count} line(s), total {total}, paid {paid}, owed {total - paid}");
            return Ok(new { purchaseId = id, total, paid, due = total - paid });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // Pay the supplier (all or part of what is owed on one purchase).
    [HttpPost("{id:int}/payments")]
    public async Task<IActionResult> Pay(int id, SupplierPaymentRequest req)
    {
        if (!Methods.Contains(req.Method)) return BadRequest(new { error = "Choose Cash, Card, bKash, Nagad or Bank." });

        var employeeId = User.GetEmployeeId()!.Value;
        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            await conn.ExecuteAsync("pkg_purchases.pay_supplier",
                new { p_purchase_id = id, p_amount = req.Amount, p_method = req.Method, p_employee_id = employeeId, p_note = req.Note },
                tx, commandType: CommandType.StoredProcedure);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }

        await AuditLogger.LogAsync(db, employeeId, "SUPPLIER_PAYMENT", "Purchase", id.ToString(), $"{req.Amount} by {req.Method}");
        return NoContent();
    }
}
