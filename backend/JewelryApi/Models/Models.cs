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
}

// Row shape of view VW_PRODUCT_CATALOG (joined names + stock value)
public class ProductCatalogItem
{
    public int ProductId { get; set; } public string ProductName { get; set; } = "";
    public string? CategoryName { get; set; } public string? SupplierName { get; set; }
    public string MetalType { get; set; } = ""; public string? Purity { get; set; }
    public decimal WeightGrams { get; set; } public decimal MakingCharge { get; set; }
    public decimal UnitPrice { get; set; } public int StockQuantity { get; set; }
    public decimal StockValue { get; set; }
}

public class Customer
{
    public int CustomerId { get; set; } public string FirstName { get; set; } = ""; public string LastName { get; set; } = "";
    public string? Phone { get; set; } public string? Email { get; set; } public string? Address { get; set; }
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
}

public record LoginRequest(string Username, string Password);
public record EmployeeCreateRequest(string FirstName, string LastName, string Role, string? Phone, string? Email, string Username, string Password);
public record SaleLine(int ProductId, int Quantity);
public record SaleRequest(int CustomerId, List<SaleLine> Items, bool? Pending);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record ResetPasswordRequest(string NewPassword);
public record EmployeeUpdateRequest(string FirstName, string LastName, string Role, string? Phone, string? Email);
public record SetActiveRequest(bool Active);
public record RestockRequest(int ProductId, int Quantity, string? Remarks);

// ---- Dashboard / reports ----
public class SalesSummary { public decimal TotalSales { get; set; } public int CompletedOrders { get; set; } public int CancelledOrders { get; set; } public int PendingOrders { get; set; } }
public class StockSummary { public int ProductCount { get; set; } public decimal StockValue { get; set; } }
public class LowStockItem { public int ProductId { get; set; } public string ProductName { get; set; } = ""; public int StockQuantity { get; set; } }
public class DailySales { public DateTime SaleDay { get; set; } public int OrderCount { get; set; } public decimal Total { get; set; } }
public class TopProduct { public string ProductName { get; set; } = ""; public int QtySold { get; set; } public decimal Revenue { get; set; } }

// ---- Receipt, customer history, sales report ----
public class ReceiptHeader
{
    public int OrderId { get; set; } public DateTime OrderDate { get; set; } public string Status { get; set; } = "";
    public decimal TotalAmount { get; set; }
    public string? CustomerName { get; set; } public string? CustomerPhone { get; set; } public string? CustomerAddress { get; set; }
    public string? EmployeeName { get; set; }
}
public class CustomerStats { public decimal TotalSpent { get; set; } public int OrderCount { get; set; } }
public class ReportRow { public string Label { get; set; } = ""; public int Qty { get; set; } public decimal Revenue { get; set; } }
