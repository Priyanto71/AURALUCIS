using System.Security.Claims;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmployeesController(DbConnectionFactory db, TokenStore tokens) : ControllerBase
{
    private const string SelectOne =
        "SELECT employee_id, first_name, last_name, role, phone, email, username, is_active FROM employees WHERE employee_id = :id";

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var rows = await conn.QueryAsync<Employee>(
            @"SELECT employee_id, first_name, last_name, role, phone, email, username, is_active
              FROM employees ORDER BY last_name, first_name");
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

    // Manager only: change name, role, phone, email (username stays the same).
    [HttpPut("{id:int}")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> Update(int id, EmployeeUpdateRequest e)
    {
        if (e.Role != "Manager" && e.Role != "Staff")
            return BadRequest(new { error = "Role must be Manager or Staff." });

        using var conn = db.Create();
        var current = await conn.QueryFirstOrDefaultAsync<Employee>(SelectOne, new { id });
        if (current is null) return NotFound(new { error = "Employee not found." });

        // never leave the shop without an active Manager
        if (IsActiveManager(current) && e.Role != "Manager" && !await HasOtherActiveManager(conn, id))
            return BadRequest(new { error = "At least one active Manager is required." });

        await conn.ExecuteAsync(
            @"UPDATE employees SET first_name = :fn, last_name = :ln, role = :role, phone = :phone, email = :email
              WHERE employee_id = :id",
            new { fn = e.FirstName, ln = e.LastName, role = e.Role, phone = e.Phone, email = e.Email, id });

        // the role is stored inside the login token, so make the person sign in again
        if (!string.Equals(current.Role, e.Role, StringComparison.OrdinalIgnoreCase))
            tokens.RevokeEmployee(id);
        return NoContent();
    }

    // Manager only: disable / enable a login. Disabled people are signed out at once.
    [HttpPost("{id:int}/active")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> SetActive(int id, SetActiveRequest req)
    {
        var myId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!req.Active && id == myId)
            return BadRequest(new { error = "You cannot disable your own account." });

        using var conn = db.Create();
        var current = await conn.QueryFirstOrDefaultAsync<Employee>(SelectOne, new { id });
        if (current is null) return NotFound(new { error = "Employee not found." });

        if (!req.Active && IsActiveManager(current) && !await HasOtherActiveManager(conn, id))
            return BadRequest(new { error = "At least one active Manager is required." });

        await conn.ExecuteAsync("UPDATE employees SET is_active = :a WHERE employee_id = :id",
            new { a = req.Active ? 1 : 0, id });

        if (!req.Active) tokens.RevokeEmployee(id);
        return NoContent();
    }

    // Manager only: set a new password for someone who forgot theirs.
    [HttpPost("{id:int}/reset-password")]
    [Authorize(Roles = "Manager")]
    public async Task<IActionResult> ResetPassword(int id, ResetPasswordRequest req)
    {
        if (string.IsNullOrEmpty(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest(new { error = "Password must be at least 6 characters." });

        using var conn = db.Create();
        var n = await conn.ExecuteAsync(
            "UPDATE employees SET password_hash = :h WHERE employee_id = :id",
            new { h = PasswordHasher.Hash(req.NewPassword), id });
        if (n == 0) return NotFound(new { error = "Employee not found." });

        tokens.RevokeEmployee(id);
        return NoContent();
    }

    private static bool IsActiveManager(Employee e) =>
        e.IsActive == 1 && e.Role.Equals("Manager", StringComparison.OrdinalIgnoreCase);

    private static async Task<bool> HasOtherActiveManager(OracleConnection conn, int excludeId)
    {
        var n = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM employees WHERE employee_id <> :id AND is_active = 1 AND LOWER(role) = 'manager'",
            new { id = excludeId });
        return n > 0;
    }
}
