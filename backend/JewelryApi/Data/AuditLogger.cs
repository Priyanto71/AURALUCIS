using Dapper;

namespace JewelryApi.Data;

// Writes one line to the audit_log table: who did what, and when.
public static class AuditLogger
{
    public static async Task LogAsync(DbConnectionFactory db, int? employeeId, string action, string entity, string? entityId, string? details)
    {
        try
        {
            using var conn = db.Create();
            await conn.ExecuteAsync(
                "INSERT INTO audit_log (employee_id, action, entity, entity_id, details) VALUES (:emp, :act, :ent, :eid, :det)",
                new { emp = employeeId, act = action, ent = entity, eid = entityId, det = Cut(details, 500) });
        }
        catch
        {
            // the audit log must never stop the real action
        }
    }

    private static string? Cut(string? s, int max) => s is null ? null : (s.Length <= max ? s : s[..max]);
}
