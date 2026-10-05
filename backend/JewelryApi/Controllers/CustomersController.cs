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
}
