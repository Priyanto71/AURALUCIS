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
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> GetAll()
    {
        using var conn = db.Create();
        var filter = User.IsInRole("Owner") ? "WHERE LOWER(role) IN ('manager','staff')" : "WHERE LOWER(role)='staff'";
        var rows = await conn.QueryAsync<Employee>(
            $@"SELECT employee_id, first_name, last_name, role, phone, email, username, is_active
               FROM employees {filter} ORDER BY last_name, first_name");
        return Ok(rows);
    }

    // Manager only: creates the employee together with a login (password is stored as a hash).
    [HttpPost]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Create(EmployeeCreateRequest e)
    {
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? "Staff";
        if (e.Role is not ("Manager" or "Staff")) return BadRequest(new { error = "Role must be Manager or Staff." });
        if (actorRole == "Manager" && e.Role != "Staff") return Forbid();
        if (string.IsNullOrWhiteSpace(e.Username) || string.IsNullOrWhiteSpace(e.Password) || e.Password.Length < 8)
            return BadRequest(new { error = "Username is required and password must be at least 8 characters." });

        using var conn = db.Create();
        var duplicate = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM employees WHERE LOWER(username)=LOWER(:u)", new { u = e.Username.Trim() });
        if (duplicate > 0) return Conflict(new { error = "That username is already in use." });
        var id = await conn.ExecuteScalarAsync<int>("SELECT employees_seq.NEXTVAL FROM DUAL");
        await conn.ExecuteAsync(
            @"INSERT INTO employees (employee_id, first_name, last_name, role, phone, email, username, password_hash, must_change_password)
              VALUES (:id, :fn, :ln, :role, :phone, :email, :username, :hash, 1)",
            new
            {
                id, fn = e.FirstName, ln = e.LastName, role = e.Role, phone = e.Phone, email = e.Email,
                username = e.Username.Trim(), hash = PasswordHasher.Hash(e.Password)
            });
        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "CREATE", "Employee", id.ToString(), $"{e.FirstName} {e.LastName} ({e.Role}), username {e.Username}");
        return Ok(new { employeeId = id });
    }

    // Manager only: change name, role, phone, email (username stays the same).
    [HttpPut("{id:int}")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> Update(int id, EmployeeUpdateRequest e)
    {
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? "Staff";
        if (e.Role != "Manager" && e.Role != "Staff") return BadRequest(new { error = "Role must be Manager or Staff." });
        using var conn = db.Create();
        var current = await conn.QueryFirstOrDefaultAsync<Employee>(SelectOne, new { id });
        if (current is null) return NotFound(new { error = "Employee not found." });
        if (current.Role == "Owner" || (actorRole == "Manager" && current.Role != "Staff")) return Forbid();
        if (actorRole == "Manager" && e.Role != "Staff") return Forbid();

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

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "UPDATE", "Employee", id.ToString(),
            $"{e.FirstName} {e.LastName}: role {current.Role} -> {e.Role}");
        return NoContent();
    }

    // Manager only: disable / enable a login. Disabled people are signed out at once.
    [HttpPost("{id:int}/active")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> SetActive(int id, SetActiveRequest req)
    {
        var myId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!req.Active && id == myId)
            return BadRequest(new { error = "You cannot disable your own account." });

        using var conn = db.Create();
        var current = await conn.QueryFirstOrDefaultAsync<Employee>(SelectOne, new { id });
        if (current is null) return NotFound(new { error = "Employee not found." });
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? "Staff";
        if (current.Role == "Owner" || (actorRole == "Manager" && current.Role != "Staff")) return Forbid();

        if (!req.Active && IsActiveManager(current) && !await HasOtherActiveManager(conn, id))
            return BadRequest(new { error = "At least one active Manager is required." });

        await conn.ExecuteAsync("UPDATE employees SET is_active = :a WHERE employee_id = :id",
            new { a = req.Active ? 1 : 0, id });

        if (!req.Active) tokens.RevokeEmployee(id);

        await AuditLogger.LogAsync(db, myId, req.Active ? "ENABLE" : "DISABLE", "Employee", id.ToString(), $"{current.FirstName} {current.LastName}");
        return NoContent();
    }

    // Manager only: set a new password for someone who forgot theirs.
    [HttpPost("{id:int}/reset-password")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> ResetPassword(int id, ResetPasswordRequest req)
    {
        if (string.IsNullOrEmpty(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        using var conn = db.Create();
        var targetRole = await conn.ExecuteScalarAsync<string?>("SELECT role FROM employees WHERE employee_id = :id", new { id });
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? "Staff";
        if (targetRole is null) return NotFound(new { error = "Employee not found." });
        if (targetRole == "Owner" || (actorRole == "Manager" && targetRole != "Staff")) return Forbid();
        var n = await conn.ExecuteAsync(
            "UPDATE employees SET password_hash = :h, must_change_password = 1 WHERE employee_id = :id",
            new { h = PasswordHasher.Hash(req.NewPassword), id });
        if (n == 0) return NotFound(new { error = "Employee not found." });

        tokens.RevokeEmployee(id);

        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "PASSWORD_RESET", "Employee", id.ToString(), "Manager reset this password");
        return NoContent();
    }

    [HttpPut("{id:int}/username")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> RenameUsername(int id, UsernameUpdateRequest req)
    {
        var username = (req.Username ?? "").Trim();
        if (username.Length < 3 || username.Length > 50) return BadRequest(new { error = "Username must be 3 to 50 characters." });
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? "Staff";
        using var conn = db.Create();
        var targetRole = await conn.ExecuteScalarAsync<string?>("SELECT role FROM employees WHERE employee_id = :id", new { id });
        if (targetRole is null) return NotFound();
        if (targetRole == "Owner" || (actorRole == "Manager" && targetRole != "Staff")) return Forbid();
        var duplicate = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM employees WHERE LOWER(username)=LOWER(:u) AND employee_id<>:id", new { u = username, id });
        if (duplicate > 0) return Conflict(new { error = "That username is already in use." });
        await conn.ExecuteAsync("UPDATE employees SET username = :u WHERE employee_id = :id", new { u = username, id });
        tokens.RevokeEmployee(id);
        await AuditLogger.LogAsync(db, User.GetEmployeeId(), "USERNAME_CHANGE", "Employee", id.ToString(), $"Username changed to {username}");
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
