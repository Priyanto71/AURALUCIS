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
            @"SELECT employee_id, first_name, last_name, role, username, password_hash, is_active
              FROM employees WHERE LOWER(username) = LOWER(:u)", new { u = req.Username });

        if (emp?.PasswordHash is null || !PasswordHasher.Verify(req.Password, emp.PasswordHash))
        {
            await AuditLogger.LogAsync(db, emp?.EmployeeId, "LOGIN_FAILED", "Auth", emp?.EmployeeId.ToString(),
                $"Wrong username or password for '{req.Username}'");
            return Unauthorized(new { error = "Wrong username or password." });
        }

        if (emp.IsActive != 1)
        {
            await AuditLogger.LogAsync(db, emp.EmployeeId, "LOGIN_BLOCKED", "Auth", emp.EmployeeId.ToString(), "Disabled account tried to sign in");
            return Unauthorized(new { error = "This account is disabled. Ask a Manager." });
        }

        // Only "Manager" gets manager rights; every other role is treated as Staff.
        var role = emp.Role.Equals("Manager", StringComparison.OrdinalIgnoreCase) ? "Manager" : "Staff";
        var name = $"{emp.FirstName} {emp.LastName}";
        var token = tokens.Issue(new AuthUser(emp.EmployeeId, emp.Username ?? "", name, role, DateTime.UtcNow.AddHours(8)));
        await AuditLogger.LogAsync(db, emp.EmployeeId, "LOGIN", "Auth", emp.EmployeeId.ToString(), $"{name} signed in as {role}");
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

    // Any logged-in employee can change their OWN password (needs the current one).
    // A wrong current password returns 400 (not 401) so the website does not log the user out.
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        if (string.IsNullOrEmpty(req.NewPassword) || req.NewPassword.Length < 6)
            return BadRequest(new { error = "New password must be at least 6 characters." });

        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        using var conn = db.Create();
        var hash = await conn.ExecuteScalarAsync<string?>(
            "SELECT password_hash FROM employees WHERE employee_id = :id", new { id });

        if (hash is null || !PasswordHasher.Verify(req.CurrentPassword, hash))
            return BadRequest(new { error = "Current password is wrong." });

        await conn.ExecuteAsync(
            "UPDATE employees SET password_hash = :h WHERE employee_id = :id",
            new { h = PasswordHasher.Hash(req.NewPassword), id });
        await AuditLogger.LogAsync(db, id, "PASSWORD_CHANGE", "Employee", id.ToString(), "Changed own password");
        return NoContent();
    }
}
