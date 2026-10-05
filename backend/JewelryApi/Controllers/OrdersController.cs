using System.Data;
using System.Security.Claims;
using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(DbConnectionFactory db) : ControllerBase
{
    private const string ItemsSql =
        @"SELECT oi.item_id, oi.product_id, p.product_name, oi.quantity, oi.unit_price, oi.line_total
          FROM order_items oi JOIN products p ON p.product_id = oi.product_id
          WHERE oi.order_id = :id ORDER BY oi.item_id";

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<OrderSummary>(
            @"SELECT order_id, order_date, status, customer_name, employee_name, order_total, item_count
              FROM vw_order_summary ORDER BY order_id DESC");
        return Ok(rows);
    }

    [HttpGet("{id:int}/items")]
    public async Task<IActionResult> Items(int id)
    {
        using var conn = db.Create();
        return Ok(await conn.QueryAsync<OrderItemRow>(ItemsSql, new { id }));
    }

    // Everything the printable receipt needs: header + lines.
    [HttpGet("{id:int}/receipt")]
    public async Task<IActionResult> Receipt(int id)
    {
        using var conn = db.Create();
        var h = await conn.QueryFirstOrDefaultAsync<ReceiptHeader>(
            @"SELECT o.order_id, o.order_date, o.status, o.total_amount,
                     c.first_name || ' ' || c.last_name AS customer_name,
                     c.phone AS customer_phone, c.address AS customer_address,
                     e.first_name || ' ' || e.last_name AS employee_name
              FROM orders o
              LEFT JOIN customers c ON c.customer_id = o.customer_id
              LEFT JOIN employees e ON e.employee_id = o.employee_id
              WHERE o.order_id = :id", new { id });
        if (h is null) return NotFound(new { error = "Order not found." });

        var items = await conn.QueryAsync<OrderItemRow>(ItemsSql, new { id });
        return Ok(new
        {
            h.OrderId, h.OrderDate, h.Status, h.TotalAmount,
            h.CustomerName, h.CustomerPhone, h.CustomerAddress, h.EmployeeName,
            items
        });
    }

    // Multi-product sale. The seller is the logged-in employee.
    // create_order + add_order_item (one call per product) run in ONE database transaction:
    // if any product is out of stock, everything is rolled back.
    // "Pending": the order is held, stock is reserved, and it is completed (or cancelled) later.
    [HttpPost("sale")]
    public async Task<IActionResult> Sale(SaleRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { error = "Add at least one product." });
        if (req.Items.Any(i => i.Quantity <= 0))
            return BadRequest(new { error = "Quantity must be greater than 0." });

        var employeeId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var status = req.Pending == true ? "Pending" : "Completed";

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var orderId = await conn.ExecuteScalarAsync<int>("SELECT orders_seq.NEXTVAL FROM DUAL", transaction: tx);

            await conn.ExecuteAsync("pkg_jewelry.create_order",
                new { p_customer_id = req.CustomerId, p_employee_id = employeeId, p_order_id = orderId, p_status = status },
                tx, commandType: CommandType.StoredProcedure);

            foreach (var item in req.Items)
            {
                await conn.ExecuteAsync("pkg_jewelry.add_order_item",
                    new { p_order_id = orderId, p_product_id = item.ProductId, p_qty = item.Quantity },
                    tx, commandType: CommandType.StoredProcedure);
            }

            tx.Commit();
            return Ok(new { orderId, status });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // Pending -> Completed (any logged-in employee). The package rejects other statuses (ORA-20005 -> 409).
    [HttpPost("{id:int}/complete")]
    public async Task<IActionResult> Complete(int id)
    {
        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.complete_order", new { p_order_id = id }, commandType: CommandType.StoredProcedure);
        return NoContent();
    }

    // Manager only. The package refuses to cancel twice (ORA-20004 -> 409).
    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Cancel(int id)
    {
        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.cancel_order", new { p_order_id = id }, commandType: CommandType.StoredProcedure);
        return NoContent();
    }
}
