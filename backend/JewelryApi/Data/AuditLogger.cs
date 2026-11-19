using Dapper;
using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Data;

// Writes audit entries. Critical business operations can include
// their audit entry in the same database transaction.
public static class AuditLogger
{
    // Best-effort logging for ordinary operations.
    public static async Task LogAsync(
        DbConnectionFactory db,
        int? employeeId,
        string action,
        string entity,
        string? entityId,
        string? details)
    {
        try
        {
            using var conn = db.Create();
            await conn.ExecuteAsync(
                "INSERT INTO audit_log (employee_id, action, entity, entity_id, details) VALUES (:emp, :act, :ent, :eid, :det)",
                new
                {
                    emp = employeeId,
                    act = action,
                    ent = entity,
                    eid = entityId,
                    det = Cut(details, 500)
                });
        }
        catch
        {
            // Ordinary audit failures must not stop the real action.
        }
    }

    // Transaction-aware logging for critical business operations.
    // Failure propagates so the caller can roll back the operation.
    public static async Task LogAsync(
        OracleConnection conn,
        OracleTransaction tx,
        int? employeeId,
        string action,
        string entity,
        string? entityId,
        string? details)
    {
        await conn.ExecuteAsync(
            "INSERT INTO audit_log (employee_id, action, entity, entity_id, details) VALUES (:emp, :act, :ent, :eid, :det)",
            new
            {
                emp = employeeId,
                act = action,
                ent = entity,
                eid = entityId,
                det = Cut(details, 500)
            },
            transaction: tx);
    }

    private static string? Cut(string? s, int max) =>
        s is null ? null : (s.Length <= max ? s : s[..max]);
}
