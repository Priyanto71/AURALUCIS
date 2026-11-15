using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;

namespace JewelryApi.Services;

// Loads one complete receipt (header, items, payments, shop details) by order id or by public code.
public class ReceiptService(DbConnectionFactory db, SettingsService settings)
{
    public Task<ReceiptDto?> GetByIdAsync(int orderId) => LoadAsync("o.order_id = :k", new { k = orderId });

    public Task<ReceiptDto?> GetByCodeAsync(string code) => LoadAsync("UPPER(o.public_code) = :k", new { k = code.ToUpperInvariant() });

    private async Task<ReceiptDto?> LoadAsync(string where, object param)
    {
        using var conn = db.Create();
        var h = await conn.QueryFirstOrDefaultAsync<ReceiptHeader>(
            $@"SELECT o.order_id, o.order_date, o.status, o.total_amount, o.discount_amount, o.paid_amount,
                      o.vat_percent, o.vat_amount, o.public_code,
                      c.first_name || ' ' || c.last_name AS customer_name,
                      c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address,
                      e.first_name || ' ' || e.last_name AS employee_name
               FROM orders o
               LEFT JOIN customers c ON c.customer_id = o.customer_id
               LEFT JOIN employees e ON e.employee_id = o.employee_id
               WHERE {where}", param);
        if (h is null) return null;

        var items = (await conn.QueryAsync<OrderItemRow>(
            @"SELECT oi.item_id, oi.product_id, p.product_name, oi.quantity, oi.unit_price, oi.line_total
              FROM order_items oi JOIN products p ON p.product_id = oi.product_id
              WHERE oi.order_id = :id ORDER BY oi.item_id", new { id = h.OrderId })).ToList();

        var payments = (await conn.QueryAsync<PaymentRow>(
            @"SELECT p.payment_id, p.amount, p.method, p.paid_at,
                     e.first_name || ' ' || e.last_name AS received_by_name, p.note
              FROM order_payments p LEFT JOIN employees e ON e.employee_id = p.received_by
              WHERE p.order_id = :id ORDER BY p.payment_id", new { id = h.OrderId })).ToList();

        var s = await settings.GetAllAsync();
        var site = s["website_url"].TrimEnd('/');

        return new ReceiptDto
        {
            OrderId = h.OrderId,
            ReceiptNo = $"AL-{h.OrderId:D6}",
            OrderDate = h.OrderDate,
            Status = h.Status,
            SubTotal = items.Sum(i => i.LineTotal),
            DiscountAmount = h.DiscountAmount,
            VatPercent = h.VatPercent,
            VatAmount = h.VatAmount,
            TotalAmount = h.TotalAmount,
            PaidAmount = h.PaidAmount,
            DueAmount = h.Status == "Cancelled" ? 0m : h.TotalAmount - h.PaidAmount,
            CustomerName = h.CustomerName, CustomerPhone = h.CustomerPhone,
            CustomerEmail = h.CustomerEmail, CustomerAddress = h.CustomerAddress,
            EmployeeName = h.EmployeeName,
            PublicCode = h.PublicCode ?? "",
            PublicUrl = string.IsNullOrEmpty(h.PublicCode) ? site : $"{site}/verify/{h.PublicCode}",
            ShopName = s["shop_name"], ShopTagline = s["shop_tagline"], ShopAddress = s["shop_address"], ShopPhone = s["shop_phone"],
            Items = items, Payments = payments
        };
    }
}
