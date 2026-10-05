using System.Security.Claims;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(DbConnectionFactory db, TokenStore tokens) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        using var conn = db.Create();
        var emp = await conn.QueryFirstOrDefaultAsync<EmployeeLogin>(
            @"SELECT employee_id, first_name, last_name, role, username, password_hash
              FROM employees WHERE LOWER(username) = LOWER(:u)", new { u = req.Username });

        if (emp?.PasswordHash is null || !PasswordHasher.Verify(req.Password, emp.PasswordHash))
            return Unauthorized(new { error = "Wrong username or password." });

        // Only "Manager" gets manager rights; every other role is treated as Staff.
        var role = emp.Role.Equals("Manager", StringComparison.OrdinalIgnoreCase) ? "Manager" : "Staff";
        var name = $"{emp.FirstName} {emp.LastName}";
        var token = tokens.Issue(new AuthUser(emp.EmployeeId, emp.Username ?? "", name, role, DateTime.UtcNow.AddHours(8)));
        return Ok(new { token, employeeId = emp.EmployeeId, name, role });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        var header = Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            tokens.Revoke(header.Substring(7).Trim());
        return NoContent();
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(new
    {
        employeeId = User.FindFirstValue(ClaimTypes.NameIdentifier),
        name = User.FindFirstValue(ClaimTypes.Name),
        role = User.FindFirstValue(ClaimTypes.Role)
    });
}
