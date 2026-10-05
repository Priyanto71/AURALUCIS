using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmployeesController(DbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<Employee>(
            "SELECT employee_id, first_name, last_name, role, phone, email, username FROM employees ORDER BY last_name");
        return Ok(rows);
    }

    // Manager only: creates the employee together with a login (password is stored as a hash).
    [HttpPost]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Create(EmployeeCreateRequest e)
    {
        if (string.IsNullOrWhiteSpace(e.Username) || string.IsNullOrWhiteSpace(e.Password) || e.Password.Length < 6)
            return BadRequest(new { error = "Username is required and password must be at least 6 characters." });

        using var conn = db.Create();
        var id = await conn.ExecuteScalarAsync<int>("SELECT employees_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            @"INSERT INTO employees (employee_id, first_name, last_name, role, phone, email, username, password_hash)
              VALUES (:id, :fn, :ln, :role, :phone, :email, :username, :hash)",
            new
            {
                id, fn = e.FirstName, ln = e.LastName, role = e.Role, phone = e.Phone, email = e.Email,
                username = e.Username.Trim(), hash = PasswordHasher.Hash(e.Password)
            });
        return Ok(new { employeeId = id });
    }
}
