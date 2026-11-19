using Dapper;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Manager,Owner")]
public class AuditController(DbConnectionFactory db) : ControllerBase
{
    // Latest 500 audit entries, optionally for one entity (Product, Order, Employee, ...).
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? entity)
    {
        const string select =
            @"SELECT a.audit_id, a.created_at, a.employee_id,
                     e.first_name || ' ' || e.last_name AS employee_name,
                     a.action, a.entity, a.entity_id, a.details
              FROM audit_log a
              LEFT JOIN employees e ON e.employee_id = a.employee_id";

        using var conn = db.Create();
        var rows = string.IsNullOrWhiteSpace(entity)
            ? await conn.QueryAsync<AuditRow>($"SELECT * FROM ({select} ORDER BY a.audit_id DESC) WHERE ROWNUM <= 500")
            : await conn.QueryAsync<AuditRow>($"SELECT * FROM ({select} WHERE a.entity = :entity ORDER BY a.audit_id DESC) WHERE ROWNUM <= 500", new { entity });
        return Ok(rows);
    }
}
