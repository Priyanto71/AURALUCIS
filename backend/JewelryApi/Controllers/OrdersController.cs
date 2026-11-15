using System.Data;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using JewelryApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(DbConnectionFactory db, ReceiptService receipts, EmailService email, SmsService sms) : ControllerBase
{
    // Staff may give at most this discount (in %). A Manager may give any discount.
    private const decimal StaffMaxDiscountPct = 10m;

    private const string ItemsSql =
        @"SELECT oi.item_id, oi.product_id, p.product_name, oi.quantity, oi.unit_price, oi.line_total
          FROM order_items oi JOIN products p ON p.product_id = oi.product_id
          WHERE oi.order_id = :id ORDER BY oi.item_id";

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<OrderSummary>(
            @"SELECT order_id, order_date, status, customer_name, employee_name, order_total, item_count,
                     discount_amount, paid_amount, due_amount, vat_amount
              FROM vw_order_summary ORDER BY order_id DESC");
        return Ok(rows);
    }

    [HttpGet("{id:int}/items")]
    public async Task<IActionResult> Items(int id)
    {
        using var conn = db.Create();
        return Ok(await conn.QueryAsync<OrderItemRow>(ItemsSql, new { id }));
    }

    // Everything the printable receipt needs: shop, header, lines, discount, VAT and payments.
    [HttpGet("{id:int}/receipt")]
    public async Task<IActionResult> Receipt(int id)
    {
        var r = await receipts.GetByIdAsync(id);
        return r is null ? NotFound(new { error = "Order not found." }) : Ok(r);
    }

    // Send the receipt by e-mail (to = typed address, or the customer's e-mail).
    [HttpPost("{id:int}/email")]
    public async Task<IActionResult> EmailReceipt(int id, SendReceiptRequest req)
    {
        var r = await receipts.GetByIdAsync(id);
        if (r is null) return NotFound(new { error = "Order not found." });

        var to = string.IsNullOrWhiteSpace(req.To) ? r.CustomerEmail : req.To.Trim();
        if (string.IsNullOrWhiteSpace(to))
            return BadRequest(new { error = "This customer has no e-mail address. Type one." });
        if (!email.IsConfigured)
            return BadRequest(new { error = "E-mail is not set up on the server (appsettings.json > Email)." });

        try { await email.SendAsync(to, ReceiptFormatter.Subject(r), ReceiptFormatter.Html(r)); }
        catch (FormatException) { return BadRequest(new { error = "That e-mail address is not valid." }); }
        catch (SmtpException ex) { return StatusCode(502, new { error = "The mail server refused the message: " + ex.Message }); }

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "EMAIL", "Order", id.ToString(), $"Receipt sent to {to}");
        return NoContent();
    }

    // Send the receipt as an SMS through the configured gateway (to = typed number, or the customer's phone).
    [HttpPost("{id:int}/sms")]
    public async Task<IActionResult> SmsReceipt(int id, SendReceiptRequest req)
    {
        var r = await receipts.GetByIdAsync(id);
        if (r is null) return NotFound(new { error = "Order not found." });

        var to = string.IsNullOrWhiteSpace(req.To) ? r.CustomerPhone : req.To.Trim();
        if (string.IsNullOrWhiteSpace(to))
            return BadRequest(new { error = "This customer has no phone number. Type one." });
        if (!sms.IsConfigured)
            return BadRequest(new { error = "SMS is not set up on the server (appsettings.json > Sms)." });

        try { await sms.SendAsync(to, ReceiptFormatter.Sms(r)); }
        catch (HttpRequestException ex) { return StatusCode(502, new { error = "The SMS gateway refused the message: " + ex.Message }); }
        catch (TaskCanceledException) { return StatusCode(504, new { error = "The SMS gateway did not answer in time." }); }

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "SMS", "Order", id.ToString(), $"Receipt sent to {to}");
        return NoContent();
    }

    // Sale with several products, an optional discount and an optional first payment.
    // All steps run in ONE database transaction: if anything fails, nothing is saved.
    //  - discount: "AMOUNT" or "PERCENT" (Staff are limited to 10 %)
    //  - paidAmount: how much the customer pays now. Empty = pays in full (or 0 for a Pending order).
    //  - "Pending": the order is held, stock is reserved, and it is completed (or cancelled) later.
    [HttpPost("sale")]
    public async Task<IActionResult> Sale(SaleRequest req)
    {
        if (req.Items is null || req.Items.Count == 0)
            return BadRequest(new { error = "Add at least one product." });
        if (req.Items.Any(i => i.Quantity <= 0))
            return BadRequest(new { error = "Quantity must be greater than 0." });
        if (req.PaidAmount < 0)
            return BadRequest(new { error = "The paid amount cannot be negative." });

        var employeeId = User.GetEmployeeId()!.Value;
        var isManager = User.FindFirstValue(ClaimTypes.Role) == "Manager";
        var pending = req.Pending == true;
        var status = pending ? "Pending" : "Completed";
        var discountType = string.IsNullOrWhiteSpace(req.DiscountType) ? "NONE" : req.DiscountType.ToUpperInvariant();
        var discountValue = req.DiscountValue ?? 0m;
        var method = string.IsNullOrWhiteSpace(req.PaymentMethod) ? "Cash" : req.PaymentMethod;

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();
        try
        {
            var orderId = await conn.ExecuteScalarAsync<int>("SELECT orders_seq.NEXTVAL FROM DUAL", transaction: tx);

            // random code for the public receipt page (the QR code on the receipt)
            var publicCode = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));

            await conn.ExecuteAsync("pkg_jewelry.create_order",
                new { p_customer_id = req.CustomerId, p_employee_id = employeeId, p_order_id = orderId, p_status = status, p_public_code = publicCode },
                tx, commandType: CommandType.StoredProcedure);

            foreach (var item in req.Items)
            {
                await conn.ExecuteAsync("pkg_jewelry.add_order_item",
                    new { p_order_id = orderId, p_product_id = item.ProductId, p_qty = item.Quantity },
                    tx, commandType: CommandType.StoredProcedure);
            }

            // discount and final total (the package checks the discount and the seller's limit)
            await conn.ExecuteAsync("pkg_jewelry.finalize_order",
                new
                {
                    p_order_id = orderId, p_discount_type = discountType, p_discount_value = discountValue,
                    p_max_pct = isManager ? 100m : StaffMaxDiscountPct
                },
                tx, commandType: CommandType.StoredProcedure);

            var total = await conn.ExecuteScalarAsync<decimal>(
                "SELECT total_amount FROM orders WHERE order_id = :id", new { id = orderId }, tx);
            var discount = await conn.ExecuteScalarAsync<decimal>(
                "SELECT discount_amount FROM orders WHERE order_id = :id", new { id = orderId }, tx);
            var vat = await conn.ExecuteScalarAsync<decimal>(
                "SELECT vat_amount FROM orders WHERE order_id = :id", new { id = orderId }, tx);

            var paid = req.PaidAmount ?? (pending ? 0m : total);
            if (paid > 0)
            {
                await conn.ExecuteAsync("pkg_jewelry.add_payment",
                    new { p_order_id = orderId, p_amount = paid, p_method = method, p_employee_id = employeeId, p_note = "Payment at sale" },
                    tx, commandType: CommandType.StoredProcedure);
            }

            tx.Commit();

            await AuditLogger.LogAsync(db, employeeId, pending ? "HOLD" : "SALE", "Order", orderId.ToString(),
                $"{req.Items.Count} product line(s), discount {discount}, VAT {vat}, total {total}, paid {paid} ({method}), due {total - paid}");
            return Ok(new { orderId, status, total, discount, vat, paid, due = total - paid });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // Take a (further) payment for an order. The package refuses more than the amount due.
    [HttpPost("{id:int}/payments")]
    public async Task<IActionResult> AddPayment(int id, PaymentRequest req)
    {
        var employeeId = User.GetEmployeeId();
        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.receive_payment",
            new { p_order_id = id, p_amount = req.Amount, p_method = req.Method, p_employee_id = employeeId, p_note = req.Note },
            commandType: CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, employeeId, "PAYMENT", "Order", id.ToString(), $"{req.Amount} by {req.Method}");
        return NoContent();
    }

    // Pending -> Completed (any logged-in employee). The package rejects other statuses (ORA-20005 -> 409).
    [HttpPost("{id:int}/complete")]
    public async Task<IActionResult> Complete(int id)
    {
        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.complete_order", new { p_order_id = id }, commandType: CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "COMPLETE", "Order", id.ToString(), "Pending order completed");
        return NoContent();
    }

    // Manager only. The package refuses to cancel twice (ORA-20004 -> 409).
    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Cancel(int id)
    {
        using var conn = db.Create();
        await conn.ExecuteAsync("pkg_jewelry.cancel_order", new { p_order_id = id }, commandType: CommandType.StoredProcedure);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "CANCEL", "Order", id.ToString(), "Order cancelled, stock returned");
        return NoContent();
    }
}
