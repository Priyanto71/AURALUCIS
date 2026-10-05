using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController(DbConnectionFactory db) : ControllerBase
{
    // GET /api/customers?phone=555  -> search by (part of) phone number
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? phone)
    {
        using var conn = db.Create();
        const string cols = "SELECT customer_id, first_name, last_name, phone, email, address FROM customers";
        var rows = string.IsNullOrWhiteSpace(phone)
            ? await conn.QueryAsync<Customer>(cols + " ORDER BY last_name, first_name")
            : await conn.QueryAsync<Customer>(cols + " WHERE phone LIKE :p ORDER BY last_name", new { p = "%" + phone + "%" });
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Customer c)
    {
        using var conn = db.Create();
        var id = await conn.ExecuteScalarAsync<int>("SELECT customers_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            @"INSERT INTO customers (customer_id, first_name, last_name, phone, email, address)
              VALUES (:id, :fn, :ln, :phone, :email, :address)",
            new { id, fn = c.FirstName, ln = c.LastName, phone = c.Phone, email = c.Email, address = c.Address });
        return Ok(new { customerId = id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Customer c)
    {
        using var conn = db.Create();
        var n = await conn.ExecuteAsync(
            @"UPDATE customers SET first_name = :fn, last_name = :ln, phone = :phone,
                     email = :email, address = :address WHERE customer_id = :id",
            new { fn = c.FirstName, ln = c.LastName, phone = c.Phone, email = c.Email, address = c.Address, id });
        return n == 0 ? NotFound() : NoContent();
    }

    // Purchase history of one customer: details, totals and all their orders.
    [HttpGet("{id:int}/history")]
    public async Task<IActionResult> History(int id)
    {
        using var conn = db.Create();
        var customer = await conn.QueryFirstOrDefaultAsync<Customer>(
            "SELECT customer_id, first_name, last_name, phone, email, address FROM customers WHERE customer_id = :id",
            new { id });
        if (customer is null) return NotFound(new { error = "Customer not found." });

        // total spent counts Completed orders only
        var stats = await conn.QuerySingleAsync<CustomerStats>(
            @"SELECT NVL(SUM(CASE WHEN status = 'Completed' THEN total_amount END), 0) AS total_spent,
                     COUNT(*) AS order_count
              FROM orders WHERE customer_id = :id", new { id });

        var orders = await conn.QueryAsync<OrderSummary>(
            @"SELECT o.order_id, o.order_date, o.status,
                     c.first_name || ' ' || c.last_name AS customer_name,
                     e.first_name || ' ' || e.last_name AS employee_name,
                     o.total_amount AS order_total,
                     (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
              FROM orders o
              JOIN customers c ON c.customer_id = o.customer_id
              LEFT JOIN employees e ON e.employee_id = o.employee_id
              WHERE o.customer_id = :id
              ORDER BY o.order_id DESC", new { id });

        return Ok(new { customer, totalSpent = stats.TotalSpent, orderCount = stats.OrderCount, orders });
    }
}
