using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using JewelryApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(DbConnectionFactory db, TokenStore tokens, EmailService email, IConfiguration config) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        using var conn = db.Create();
        var emp = await conn.QueryFirstOrDefaultAsync<EmployeeLogin>(
            @"SELECT employee_id, first_name, last_name, role, username, password_hash, is_active, must_change_password
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
        var role = emp.Role.Equals("Owner", StringComparison.OrdinalIgnoreCase) ? "Owner" : emp.Role.Equals("Manager", StringComparison.OrdinalIgnoreCase) ? "Manager" : "Staff";
        var name = $"{emp.FirstName} {emp.LastName}";
        var mustChangePassword = emp.MustChangePassword == 1;

var token = tokens.Issue(new AuthUser(
    emp.EmployeeId,
    emp.Username ?? "",
    name,
    role,
    DateTime.UtcNow.AddHours(8),
    mustChangePassword
));
        await AuditLogger.LogAsync(db, emp.EmployeeId, "LOGIN", "Auth", emp.EmployeeId.ToString(), $"{name} signed in as {role}");
        return Ok(new { token, employeeId = emp.EmployeeId, name, role, mustChangePassword = emp.MustChangePassword == 1 });
    }


    public sealed class OwnerResetRow { public int EmployeeId { get; set; } public string? Email { get; set; } }

    [AllowAnonymous]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest req)
    {
        // Do not reveal whether a username exists.
        using var conn = db.Create();
        var owner = await conn.QueryFirstOrDefaultAsync<OwnerResetRow>(
            "SELECT employee_id, email FROM employees WHERE LOWER(role)='owner' AND LOWER(username)=LOWER(:u)", new { u = req.Username });
        if (owner is not null && !string.IsNullOrWhiteSpace(owner.Email) && email.IsConfigured)
        {
            var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
            await conn.ExecuteAsync("UPDATE employees SET password_reset_token=:t, password_reset_expires=SYSDATE+1/24 WHERE employee_id=:id", new { t = hash, id = owner.EmployeeId });
            var baseUrl = (config["App:PublicUrl"] ?? "http://localhost:5173").TrimEnd('/');
            var link = $"{baseUrl}/reset-password/{raw}";
            await email.SendAsync(owner.Email!, "AURALUCIS Owner password reset", $"<p>A password reset was requested for the AURALUCIS Owner account.</p><p><a href=\"{link}\">Reset password</a></p><p>This link expires in one hour. If you did not request it, ignore this email.</p>");
        }
        return Ok(new { message = "If the Owner account is found and email is configured, a reset link has been sent." });
    }

    [AllowAnonymous]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(CompletePasswordResetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(req.Token ?? "")));
        using var conn = db.Create();
        var id = await conn.ExecuteScalarAsync<int?>("SELECT employee_id FROM employees WHERE password_reset_token=:t AND password_reset_expires>SYSDATE AND LOWER(role)='owner'", new { t = hash });
        if (id is null) return BadRequest(new { error = "Reset link is invalid or expired." });
        await conn.ExecuteAsync("UPDATE employees SET password_hash=:p, must_change_password=0, password_reset_token=NULL, password_reset_expires=NULL WHERE employee_id=:id", new { p = PasswordHasher.Hash(req.NewPassword), id });
        tokens.RevokeEmployee(id.Value);
        await AuditLogger.LogAsync(db, id.Value, "PASSWORD_RESET", "Employee", id.Value.ToString(), "Owner password reset by email link");
        return NoContent();
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
        if (string.IsNullOrEmpty(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "New password must be at least 8 characters." });

        var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        using var conn = db.Create();
        var hash = await conn.ExecuteScalarAsync<string?>(
            "SELECT password_hash FROM employees WHERE employee_id = :id", new { id });

        if (hash is null || !PasswordHasher.Verify(req.CurrentPassword, hash))
            return BadRequest(new { error = "Current password is wrong." });

        await conn.ExecuteAsync(
    "UPDATE employees SET password_hash = :h, must_change_password = 0 WHERE employee_id = :id",
    new { h = PasswordHasher.Hash(req.NewPassword), id });

tokens.SetMustChangePassword(id, false);

await AuditLogger.LogAsync(
    db, id, "PASSWORD_CHANGE", "Employee", id.ToString(),
    "Changed own password");

return NoContent();
    }
}
