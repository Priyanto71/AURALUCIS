using System.Data;
using System.Security.Cryptography;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Controllers;

// Returns, refunds and exchanges. Money goes back to the customer, so this is for Managers only.
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Manager,Owner")]
public class ReturnsController(DbConnectionFactory db) : ControllerBase
{
    private static readonly string[] RefundMethods = { "Cash", "Card", "bKash", "Nagad", "Bank" };

    // Latest 200 returns.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<ReturnRow>(
            @"SELECT * FROM (
                SELECT r.return_id, r.order_id, r.return_date,
                       c.first_name || ' ' || c.last_name AS customer_name,
                       e.first_name || ' ' || e.last_name AS employee_name,
                       r.reason, r.items_amount, r.credit_amount, r.refund_amount, r.refund_method, r.exchange_order_id
                FROM order_returns r
                JOIN orders o ON o.order_id = r.order_id
                LEFT JOIN customers c ON c.customer_id = o.customer_id
                LEFT JOIN employees e ON e.employee_id = r.employee_id
                ORDER BY r.return_id DESC)
              WHERE ROWNUM <= 200");
        return Ok(rows);
    }

    // What can still be returned from one order, with the money facts the screen needs for its estimate.
    [HttpGet("order/{orderId:int}")]
    public async Task<IActionResult> ForOrder(int orderId)
    {
        using var conn = db.Create();
        var order = await conn.QueryFirstOrDefaultAsync<ReturnOrderInfo>(
            @"SELECT o.order_id, o.status, o.order_date,
                     c.first_name || ' ' || c.last_name AS customer_name,
                     o.total_amount, o.discount_amount, o.vat_percent, o.paid_amount, o.returned_amount
              FROM orders o LEFT JOIN customers c ON c.customer_id = o.customer_id
              WHERE o.order_id = :id", new { id = orderId });
        if (order is null) return NotFound(new { error = "Order not found." });

        var lines = await conn.QueryAsync<ReturnLine>(
            @"SELECT oi.item_id, oi.product_id, p.product_name, oi.quantity, oi.returned_qty,
                     oi.quantity - oi.returned_qty AS remaining_qty, oi.unit_price
              FROM order_items oi JOIN products p ON p.product_id = oi.product_id
              WHERE oi.order_id = :id ORDER BY oi.item_id", new { id = orderId });

        var subTotal = lines.Sum(l => l.Quantity * l.UnitPrice);
        return Ok(new { order, subTotal, lines });
    }

    // Return items and pay the money back (one database transaction).
    [HttpPost]
    public async Task<IActionResult> Refund(ReturnRequest req)
    {
        var problem = CheckItems(req.Reason, req.Items);
        if (problem is not null) return BadRequest(new { error = problem });
        if (!RefundMethods.Contains(req.RefundMethod))
            return BadRequest(new { error = "Choose how the money is paid back: Cash, Card, bKash, Nagad or Bank." });

        var employeeId = User.GetEmployeeId()!.Value;
        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var returnId = await ReturnItemsAsync(conn, tx, req.OrderId, employeeId, req.Reason, req.Items);
            var s = await conn.QuerySingleAsync<ReturnSummary>(
                "SELECT credit_amount, refundable_amount FROM order_returns WHERE return_id = :id", new { id = returnId }, tx);

            if (s.RefundableAmount > 0)
            {
                await conn.ExecuteAsync("pkg_returns.settle_return",
                    new { p_return_id = returnId, p_method = req.RefundMethod, p_amount = s.RefundableAmount, p_new_order_id = (int?)null, p_employee_id = employeeId },
                    tx, commandType: CommandType.StoredProcedure);
            }
            await AuditLogger.LogAsync(conn, tx, employeeId, "RETURN", "Order", req.OrderId.ToString(),
                $"Return #{returnId}: credit {s.CreditAmount}, refunded {s.RefundableAmount} by {req.RefundMethod}. Reason: {req.Reason}");

            tx.Commit();
            return Ok(new { returnId, credit = s.CreditAmount, refunded = s.RefundableAmount });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // Exchange: return items and sell other items in the same step. The value of the returned items
    // is used as a payment ("Exchange") on the new order; the customer pays the difference.
    [HttpPost("exchange")]
    public async Task<IActionResult> Exchange(ExchangeRequest req)
    {
        var problem = CheckItems(req.Reason, req.ReturnItems);
        if (problem is not null) return BadRequest(new { error = problem });
        if (req.NewItems is null || req.NewItems.Count == 0)
            return BadRequest(new { error = "Choose the new item(s) the customer takes." });
        if (req.NewItems.Any(i => i.Quantity <= 0))
            return BadRequest(new { error = "Quantity must be greater than 0." });
        var method = string.IsNullOrWhiteSpace(req.PaymentMethod) ? "Cash" : req.PaymentMethod;
        if (!RefundMethods.Contains(method))
            return BadRequest(new { error = "Choose Cash, Card, bKash, Nagad or Bank for the extra payment." });
        if (req.PaidAmount < 0) return BadRequest(new { error = "The paid amount cannot be negative." });

        var employeeId = User.GetEmployeeId()!.Value;
        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var customerId = await conn.ExecuteScalarAsync<int?>(
                "SELECT customer_id FROM orders WHERE order_id = :id", new { id = req.OrderId }, tx);
            if (customerId is null)
            {
                tx.Rollback();
                return NotFound(new { error = "Order not found." });
            }

            var returnId = await ReturnItemsAsync(conn, tx, req.OrderId, employeeId, req.Reason, req.ReturnItems);
            var s = await conn.QuerySingleAsync<ReturnSummary>(
                "SELECT credit_amount, refundable_amount FROM order_returns WHERE return_id = :id", new { id = returnId }, tx);

            // the new sale
            var newOrderId = await conn.ExecuteScalarAsync<int>("SELECT orders_seq.NEXTVAL FROM DUAL", transaction: tx);
            await conn.ExecuteAsync("pkg_jewelry.create_order",
                new
                {
                    p_customer_id = customerId.Value, p_employee_id = employeeId, p_order_id = newOrderId,
                    p_status = "Completed", p_public_code = Convert.ToHexString(RandomNumberGenerator.GetBytes(16))
                }, tx, commandType: CommandType.StoredProcedure);
            foreach (var item in req.NewItems)
            {
                await conn.ExecuteAsync("pkg_jewelry.add_order_item",
                    new { p_order_id = newOrderId, p_product_id = item.ProductId, p_qty = item.Quantity },
                    tx, commandType: CommandType.StoredProcedure);
            }
            await conn.ExecuteAsync("pkg_jewelry.finalize_order",
                new { p_order_id = newOrderId, p_discount_type = "NONE", p_discount_value = 0m, p_max_pct = 100m },
                tx, commandType: CommandType.StoredProcedure);

            var newTotal = await conn.ExecuteScalarAsync<decimal>(
                "SELECT total_amount FROM orders WHERE order_id = :id", new { id = newOrderId }, tx);

            // the returned value must be fully used by the new items (no cash back inside an exchange)
            if (s.RefundableAmount > newTotal)
            {
                tx.Rollback();
                return BadRequest(new
                {
                    error = $"The returned items are worth {s.RefundableAmount:0.00} but the new items only {newTotal:0.00}. " +
                            "Add more new items, or use a refund instead."
                });
            }

            if (s.RefundableAmount > 0)
            {
                await conn.ExecuteAsync("pkg_returns.settle_return",
                    new { p_return_id = returnId, p_method = "Exchange", p_amount = s.RefundableAmount, p_new_order_id = newOrderId, p_employee_id = employeeId },
                    tx, commandType: CommandType.StoredProcedure);
            }

            var difference = newTotal - s.RefundableAmount;
            var paid = req.PaidAmount ?? difference;
            if (paid > 0)
            {
                await conn.ExecuteAsync("pkg_jewelry.add_payment",
                    new { p_order_id = newOrderId, p_amount = paid, p_method = method, p_employee_id = employeeId, p_note = "Payment at exchange" },
                    tx, commandType: CommandType.StoredProcedure);
            }
            await AuditLogger.LogAsync(conn, tx, employeeId, "EXCHANGE", "Order", req.OrderId.ToString(),
                $"Return #{returnId} (credit {s.CreditAmount}) exchanged for new order #{newOrderId} (total {newTotal}), customer paid {paid} by {method}. Reason: {req.Reason}");

            tx.Commit();
            return Ok(new { returnId, newOrderId, credit = s.CreditAmount, applied = s.RefundableAmount, newTotal, paid, due = difference - paid });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    private static string? CheckItems(string? reason, List<ReturnItemRequest>? items)
    {
        if (string.IsNullOrWhiteSpace(reason)) return "A reason is required for a return.";
        if (items is null || items.Count == 0 || items.All(i => i.Quantity <= 0)) return "Choose at least one item to return.";
        if (items.Any(i => i.Quantity < 0)) return "Quantity cannot be negative.";
        return null;
    }

    // start_return -> return_item (each line) -> finish_return, all inside the caller's transaction
    private static async Task<int> ReturnItemsAsync(OracleConnection conn, IDbTransaction tx, int orderId, int employeeId,
                                                    string reason, List<ReturnItemRequest> items)
    {
        var returnId = await conn.ExecuteScalarAsync<int>("SELECT returns_seq.NEXTVAL FROM DUAL", transaction: tx);
        await conn.ExecuteAsync("pkg_returns.start_return",
            new { p_return_id = returnId, p_order_id = orderId, p_employee_id = employeeId, p_reason = reason.Trim() },
            tx, commandType: CommandType.StoredProcedure);

        foreach (var it in items.Where(i => i.Quantity > 0))
        {
            await conn.ExecuteAsync("pkg_returns.return_item",
                new { p_return_id = returnId, p_item_id = it.ItemId, p_qty = it.Quantity },
                tx, commandType: CommandType.StoredProcedure);
        }

        await conn.ExecuteAsync("pkg_returns.finish_return", new { p_return_id = returnId }, tx, commandType: CommandType.StoredProcedure);
        return returnId;
    }
}
