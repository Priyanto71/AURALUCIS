namespace JewelryApi.Models;

public class Category { public int CategoryId { get; set; } public string CategoryName { get; set; } = ""; public string? Description { get; set; } }

public class Supplier
{
    public int SupplierId { get; set; } public string SupplierName { get; set; } = "";
    public string? ContactPerson { get; set; } public string? Phone { get; set; }
    public string? Email { get; set; } public string? Address { get; set; }
}

public class Product
{
    public int ProductId { get; set; } public string ProductName { get; set; } = "";
    public int? CategoryId { get; set; } public int? SupplierId { get; set; }
    public string MetalType { get; set; } = ""; public string? Purity { get; set; }
    public decimal WeightGrams { get; set; } public decimal MakingCharge { get; set; }
    public decimal UnitPrice { get; set; } public int StockQuantity { get; set; }
    public decimal CostPrice { get; set; }
    public string PricingMode { get; set; } = "FIXED"; public decimal? MakingPercent { get; set; }
}

// Row shape of view VW_PRODUCT_CATALOG (joined names + stock value)
public class ProductCatalogItem
{
    public int ProductId { get; set; } public string ProductName { get; set; } = "";
    public string? CategoryName { get; set; } public string? SupplierName { get; set; }
    public string MetalType { get; set; } = ""; public string? Purity { get; set; }
    public decimal WeightGrams { get; set; } public decimal MakingCharge { get; set; }
    public decimal UnitPrice { get; set; } public int StockQuantity { get; set; }
    public decimal StockValue { get; set; } public decimal CostPrice { get; set; }
    public string PricingMode { get; set; } = "FIXED"; public decimal? MakingPercent { get; set; }
}

public class Customer
{
    public int CustomerId { get; set; } public string FirstName { get; set; } = ""; public string LastName { get; set; } = "";
    public string? Phone { get; set; } public string? Email { get; set; } public string? Address { get; set; }
    public decimal DueAmount { get; set; }
}

public class Employee
{
    public int EmployeeId { get; set; } public string FirstName { get; set; } = ""; public string LastName { get; set; } = "";
    public string Role { get; set; } = ""; public string? Phone { get; set; } public string? Email { get; set; }
    public string? Username { get; set; }
    public int IsActive { get; set; }
}

// Used only by the login endpoint (includes the password hash, never sent to the browser)
public class EmployeeLogin
{
    public int EmployeeId { get; set; } public string FirstName { get; set; } = ""; public string LastName { get; set; } = "";
    public string Role { get; set; } = ""; public string? Username { get; set; } public string? PasswordHash { get; set; }
    public int IsActive { get; set; }
}

// Row shape of view VW_ORDER_SUMMARY
public class OrderSummary
{
    public int OrderId { get; set; } public DateTime OrderDate { get; set; } public string Status { get; set; } = "";
    public string? CustomerName { get; set; } public string? EmployeeName { get; set; }
    public decimal OrderTotal { get; set; } public int ItemCount { get; set; }
    public decimal DiscountAmount { get; set; } public decimal PaidAmount { get; set; } public decimal DueAmount { get; set; }
    public decimal VatAmount { get; set; }
}

public class OrderItemRow
{
    public int ItemId { get; set; } public int ProductId { get; set; } public string ProductName { get; set; } = "";
    public int Quantity { get; set; } public decimal UnitPrice { get; set; } public decimal LineTotal { get; set; }
}

public class StockTxn
{
    public int TxnId { get; set; } public int ProductId { get; set; } public string ProductName { get; set; } = "";
    public string TxnType { get; set; } = ""; public int Quantity { get; set; }
    public DateTime TxnDate { get; set; } public string? Remarks { get; set; }
    public decimal? UnitCost { get; set; } public string? SupplierName { get; set; }
}

public record LoginRequest(string Username, string Password);
public record EmployeeCreateRequest(string FirstName, string LastName, string Role, string? Phone, string? Email, string Username, string Password);
public record SaleLine(int ProductId, int Quantity);
public record SaleRequest(int CustomerId, List<SaleLine> Items, bool? Pending, string? DiscountType, decimal? DiscountValue, string? PaymentMethod, decimal? PaidAmount);
public record PaymentRequest(decimal Amount, string Method, string? Note);
public record AdjustStockRequest(int ProductId, int QuantityChange, string Reason, string? Note);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record ResetPasswordRequest(string NewPassword);
public record EmployeeUpdateRequest(string FirstName, string LastName, string Role, string? Phone, string? Email);
public record SetActiveRequest(bool Active);
public record RestockRequest(int ProductId, int Quantity, string? Remarks, decimal? UnitCost, int? SupplierId);

// ---- Dashboard / reports ----
public class SalesSummary { public decimal TotalSales { get; set; } public int CompletedOrders { get; set; } public int CancelledOrders { get; set; } public int PendingOrders { get; set; }
    public decimal DueTotal { get; set; } public decimal DiscountTotal { get; set; } public decimal PaidTotal { get; set; }
    public decimal VatTotal { get; set; } }
public class StockSummary { public int ProductCount { get; set; } public decimal StockValue { get; set; } }
public class LowStockItem { public int ProductId { get; set; } public string ProductName { get; set; } = ""; public int StockQuantity { get; set; } }
public class DailySales { public DateTime SaleDay { get; set; } public int OrderCount { get; set; } public decimal Total { get; set; } }
public class TopProduct { public string ProductName { get; set; } = ""; public int QtySold { get; set; } public decimal Revenue { get; set; } }

// ---- Receipt, customer history, sales report ----
public class ReceiptHeader
{
    public int OrderId { get; set; } public DateTime OrderDate { get; set; } public string Status { get; set; } = "";
    public decimal TotalAmount { get; set; } public decimal DiscountAmount { get; set; } public decimal PaidAmount { get; set; }
    public decimal VatPercent { get; set; } public decimal VatAmount { get; set; } public string? PublicCode { get; set; }
    public string? CustomerEmail { get; set; }
    public string? CustomerName { get; set; } public string? CustomerPhone { get; set; } public string? CustomerAddress { get; set; }
    public string? EmployeeName { get; set; }
}
public class CustomerStats { public decimal TotalSpent { get; set; } public int OrderCount { get; set; } }
public class ReportRow { public string Label { get; set; } = ""; public int Qty { get; set; } public decimal Revenue { get; set; } public decimal Profit { get; set; } }
public class PaymentRow
{
    public int PaymentId { get; set; } public decimal Amount { get; set; } public string Method { get; set; } = "";
    public DateTime PaidAt { get; set; } public string? ReceivedByName { get; set; } public string? Note { get; set; }
}
public class AuditRow
{
    public int AuditId { get; set; } public DateTime CreatedAt { get; set; } public int? EmployeeId { get; set; }
    public string? EmployeeName { get; set; } public string Action { get; set; } = ""; public string Entity { get; set; } = "";
    public string? EntityId { get; set; } public string? Details { get; set; }
}
public class ItemTotals
{
    public int ItemsSold { get; set; } public decimal ItemsRevenue { get; set; } public decimal ItemsCost { get; set; }
    public int ZeroCostLines { get; set; }
}
public class SettingRow { public string SettingKey { get; set; } = ""; public string? SettingValue { get; set; } }

public record SendReceiptRequest(string? To);

// The receipt, used by the receipt screen, the e-mail/SMS text and the public receipt page.
public class ReceiptDto
{
    public int OrderId { get; set; } public string ReceiptNo { get; set; } = ""; public DateTime OrderDate { get; set; }
    public string Status { get; set; } = "";
    public decimal SubTotal { get; set; } public decimal DiscountAmount { get; set; }
    public decimal VatPercent { get; set; } public decimal VatAmount { get; set; }
    public decimal TotalAmount { get; set; } public decimal PaidAmount { get; set; } public decimal DueAmount { get; set; }
    public string? CustomerName { get; set; } public string? CustomerPhone { get; set; }
    public string? CustomerEmail { get; set; } public string? CustomerAddress { get; set; }
    public string? EmployeeName { get; set; }
    public string PublicCode { get; set; } = ""; public string PublicUrl { get; set; } = "";
    public string ShopName { get; set; } = ""; public string ShopTagline { get; set; } = "";
    public string ShopAddress { get; set; } = ""; public string ShopPhone { get; set; } = "";
    public List<OrderItemRow> Items { get; set; } = new();
    public List<PaymentRow> Payments { get; set; } = new();

    // What anybody holding the QR link may see: no phone, e-mail, address or staff names.
    public ReceiptDto ToPublic()
    {
        var first = (CustomerName ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return new ReceiptDto
        {
            OrderId = 0, ReceiptNo = ReceiptNo, OrderDate = OrderDate, Status = Status,
            SubTotal = SubTotal, DiscountAmount = DiscountAmount, VatPercent = VatPercent, VatAmount = VatAmount,
            TotalAmount = TotalAmount, PaidAmount = PaidAmount, DueAmount = DueAmount,
            CustomerName = first,
            ShopName = ShopName, ShopTagline = ShopTagline, ShopAddress = ShopAddress, ShopPhone = ShopPhone,
            Items = Items.Select(i => new OrderItemRow { ProductName = i.ProductName, Quantity = i.Quantity, UnitPrice = i.UnitPrice, LineTotal = i.LineTotal }).ToList(),
            Payments = Payments.Select(x => new PaymentRow { Amount = x.Amount, Method = x.Method, PaidAt = x.PaidAt }).ToList()
        };
    }
}

public class MetalRate
{
    public int RateId { get; set; } public string MetalType { get; set; } = ""; public string? Purity { get; set; }
    public decimal RatePerGram { get; set; } public DateTime EffectiveFrom { get; set; }
    public string? SetByName { get; set; } public int ProductCount { get; set; }
}
public record RateRequest(string MetalType, string? Purity, decimal RatePerGram);
