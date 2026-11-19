using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SuppliersController(DbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<Supplier>(
            @"SELECT supplier_id, supplier_name, contact_person, phone, email, address
              FROM suppliers ORDER BY supplier_name");
        return Ok(rows);
    }

    [HttpPost]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Create(Supplier s)
    {
        using var conn = db.Create();
        var id = await conn.ExecuteScalarAsync<int>("SELECT suppliers_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            @"INSERT INTO suppliers (supplier_id, supplier_name, contact_person, phone, email, address)
              VALUES (:id, :name, :contact, :phone, :email, :address)",
            new { id, name = s.SupplierName, contact = s.ContactPerson, phone = s.Phone, email = s.Email, address = s.Address });
        return Ok(new { supplierId = id });
    }
}
