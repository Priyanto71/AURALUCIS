using Dapper;
using JewelryApi.Auth;
using JewelryApi.Data;
using JewelryApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ServiceJobsController(DbConnectionFactory db) : ControllerBase
{
    private static readonly string[] PaymentMethods =
        { "Cash", "Card", "bKash", "Nagad", "Bank" };

    private const string SelectSql = @"
        SELECT j.job_id AS ""JobId"", j.job_number AS ""JobNumber"",
               j.customer_id AS ""CustomerId"",
               c.first_name || ' ' || c.last_name AS ""CustomerName"",
               c.phone AS ""CustomerPhone"",
               j.employee_id AS ""EmployeeId"",
               e.first_name || ' ' || e.last_name AS ""EmployeeName"",
               j.job_type AS ""JobType"", j.description AS ""Description"",
               j.metal_type AS ""MetalType"", j.purity AS ""Purity"",
               j.weight_grams AS ""WeightGrams"", j.received_at AS ""ReceivedAt"",
               j.due_date AS ""DueDate"", j.completed_at AS ""CompletedAt"",
               j.delivered_at AS ""DeliveredAt"", j.status AS ""Status"",
               j.estimated_charge AS ""EstimatedCharge"",
               j.final_charge AS ""FinalCharge"",
               NVL((SELECT SUM(p.amount) FROM service_job_payments p
                    WHERE p.job_id = j.job_id), 0) AS ""PaidAmount"",
               j.notes AS ""Notes""
        FROM service_jobs j
        JOIN customers c ON c.customer_id = j.customer_id
        JOIN employees e ON e.employee_id = j.employee_id";

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        using var conn = db.Create();
        var sql = SelectSql;

        if (!string.IsNullOrWhiteSpace(status))
            sql += " WHERE j.status = :status";

        sql += " ORDER BY j.job_id DESC";

        var rows = await conn.QueryAsync<ServiceJobRow>(
            sql, string.IsNullOrWhiteSpace(status) ? null : new { status });
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create(ServiceJobCreateRequest req)
    {
        var type = req.JobType?.Trim().ToUpperInvariant();
        if (type is not ("CUSTOM_ORDER" or "REPAIR"))
            return BadRequest(new { error = "Job type must be CUSTOM_ORDER or REPAIR." });

        if (req.CustomerId <= 0)
            return BadRequest(new { error = "Select a customer." });

        if (string.IsNullOrWhiteSpace(req.Description) || req.Description.Trim().Length > 1000)
            return BadRequest(new { error = "Description is required and cannot exceed 1000 characters." });

        if (req.MetalType?.Length > 50 || req.Purity?.Length > 20 ||
            req.Notes?.Length > 1000)
            return BadRequest(new { error = "One or more fields exceed their allowed length." });

        if (req.WeightGrams is <= 0 ||
            (req.WeightGrams.HasValue && decimal.Round(req.WeightGrams.Value, 3) != req.WeightGrams.Value))
            return BadRequest(new { error = "Weight must be positive and have at most 3 decimal places." });

        if (req.EstimatedCharge < 0 || req.EstimatedCharge > 9999999999.99m || decimal.Round(req.EstimatedCharge, 2) != req.EstimatedCharge)
            return BadRequest(new { error = "Estimated charge must be between 0 and 9,999,999,999.99 with at most 2 decimal places." });

        if (req.DueDate.HasValue && req.DueDate.Value.Date < DateTime.Today)
            return BadRequest(new { error = "Due date cannot be in the past." });

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();

        try
        {
            var customerExists = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM customers WHERE customer_id = :id",
                new { id = req.CustomerId }, tx);

            if (customerExists == 0)
            {
                tx.Rollback();
                return BadRequest(new { error = "Customer does not exist." });
            }

            var id = await conn.ExecuteScalarAsync<int>(
                "SELECT service_jobs_seq.NEXTVAL FROM DUAL", transaction: tx);

            var jobNumber = $"JOB-{id:D7}";
            var employeeId = User.GetEmployeeId()!.Value;

            await conn.ExecuteAsync(
                @"INSERT INTO service_jobs
                    (job_id, job_number, customer_id, employee_id, job_type,
                     description, metal_type, purity, weight_grams, due_date,
                     status, estimated_charge, notes)
                  VALUES
                    (:id, :jobNumber, :customerId, :employeeId, :jobType,
                     :description, :metal, :purity, :weight, :dueDate,
                     'RECEIVED', :estimated, :notes)",
                new
                {
                    id, jobNumber, customerId = req.CustomerId, employeeId,
                    jobType = type, description = req.Description.Trim(),
                    metal = string.IsNullOrWhiteSpace(req.MetalType) ? null : req.MetalType.Trim(),
                    purity = string.IsNullOrWhiteSpace(req.Purity) ? null : req.Purity.Trim(),
                    weight = req.WeightGrams,
                    dueDate = req.DueDate?.Date,
                    estimated = req.EstimatedCharge,
                    notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim()
                }, tx);

            await AuditLogger.LogAsync(conn, tx, employeeId, "CREATE", "ServiceJob",
                id.ToString(), $"{jobNumber}; {type}; customer {req.CustomerId}");

            tx.Commit();
            return Ok(new { jobId = id, jobNumber });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, ServiceJobStatusRequest req)
    {
        var next = req.Status?.Trim().ToUpperInvariant();
        if (next is not ("IN_PROGRESS" or "READY" or "DELIVERED" or "CANCELLED"))
            return BadRequest(new { error = "Invalid service-job status." });

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();

        try
        {
            var job = await conn.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT status FROM service_jobs WHERE job_id = :id FOR UPDATE",
                new { id }, tx);

            if (job is null)
            {
                tx.Rollback();
                return NotFound(new { error = "Service job not found." });
            }

            string current = (string)job.STATUS;
            bool allowed =
                (current == "RECEIVED" && next is "IN_PROGRESS" or "CANCELLED") ||
                (current == "IN_PROGRESS" && next is "READY" or "CANCELLED") ||
                (current == "READY" && next == "DELIVERED");

            if (!allowed)
            {
                tx.Rollback();
                return BadRequest(new { error = $"Cannot change status from {current} to {next}." });
            }

            if (next == "DELIVERED")
            {
                var paid = await conn.ExecuteScalarAsync<decimal>(
                    "SELECT NVL(SUM(amount), 0) FROM service_job_payments WHERE job_id = :id",
                    new { id }, tx);

                var charge = await conn.ExecuteScalarAsync<decimal>(
                    "SELECT NVL(final_charge, estimated_charge) FROM service_jobs WHERE job_id = :id",
                    new { id }, tx);

                if (paid < charge)
                {
                    tx.Rollback();
                    return BadRequest(new { error = $"Cannot deliver: {charge - paid:0.00} remains unpaid." });
                }
            }

            await conn.ExecuteAsync(
                @"UPDATE service_jobs
                  SET status = :next,
                      completed_at = CASE WHEN :next = 'READY' THEN SYSDATE ELSE completed_at END,
                      delivered_at = CASE WHEN :next = 'DELIVERED' THEN SYSDATE ELSE delivered_at END
                  WHERE job_id = :id",
                new { next, id }, tx);

            var employeeId = User.GetEmployeeId()!.Value;
            await AuditLogger.LogAsync(conn, tx, employeeId, "UPDATE_STATUS",
                "ServiceJob", id.ToString(), $"{current} -> {next}");

            tx.Commit();
            return Ok(new { jobId = id, status = next });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPut("{id:int}/charge")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> UpdateCharge(int id, ServiceJobChargeRequest req)
    {
        if (req.FinalCharge < 0 || req.FinalCharge > 9999999999.99m || decimal.Round(req.FinalCharge, 2) != req.FinalCharge)
            return BadRequest(new { error = "Final charge must be between 0 and 9,999,999,999.99 with at most 2 decimal places." });

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();

        try
        {
            var job = await conn.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT status FROM service_jobs WHERE job_id = :id FOR UPDATE",
                new { id }, tx);

            if (job is null)
            {
                tx.Rollback();
                return NotFound(new { error = "Service job not found." });
            }

            string status = (string)job.STATUS;
            if (status is "DELIVERED" or "CANCELLED")
            {
                tx.Rollback();
                return BadRequest(new { error = "Cannot change the charge of a delivered or cancelled job." });
            }

            var paid = await conn.ExecuteScalarAsync<decimal>(
                "SELECT NVL(SUM(amount), 0) FROM service_job_payments WHERE job_id = :id",
                new { id }, tx);

            if (req.FinalCharge < paid)
            {
                tx.Rollback();
                return BadRequest(new { error = "Final charge cannot be lower than payments already received." });
            }

            await conn.ExecuteAsync(
                "UPDATE service_jobs SET final_charge = :charge WHERE job_id = :id",
                new { charge = req.FinalCharge, id }, tx);

            var employeeId = User.GetEmployeeId()!.Value;
            await AuditLogger.LogAsync(conn, tx, employeeId, "UPDATE_CHARGE",
                "ServiceJob", id.ToString(), $"Final charge set to {req.FinalCharge}");

            tx.Commit();
            return Ok(new { jobId = id, finalCharge = req.FinalCharge });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPost("{id:int}/payments")]
    [Authorize(Roles = "Manager,Owner")]
    public async Task<IActionResult> AddPayment(int id, ServiceJobPaymentRequest req)
    {
        if (req.Amount <= 0 || req.Amount > 9999999999.99m || decimal.Round(req.Amount, 2) != req.Amount)
            return BadRequest(new { error = "Payment must be greater than zero, at most 9,999,999,999.99, and have at most 2 decimal places." });

        if (!PaymentMethods.Contains(req.Method))
            return BadRequest(new { error = "Invalid payment method." });

        if (req.Note?.Length > 255)
            return BadRequest(new { error = "Payment note cannot exceed 255 characters." });

        using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = conn.BeginTransaction();

        try
        {
            var job = await conn.QueryFirstOrDefaultAsync<dynamic>(
                "SELECT status, NVL(final_charge, estimated_charge) AS charge FROM service_jobs WHERE job_id = :id FOR UPDATE",
                new { id }, tx);

            if (job is null)
            {
                tx.Rollback();
                return NotFound(new { error = "Service job not found." });
            }

            string status = (string)job.STATUS;
            decimal charge = (decimal)job.CHARGE;

            if (status is "DELIVERED" or "CANCELLED")
            {
                tx.Rollback();
                return BadRequest(new { error = "Cannot receive payment for a delivered or cancelled job." });
            }

            var paid = await conn.ExecuteScalarAsync<decimal>(
                "SELECT NVL(SUM(amount), 0) FROM service_job_payments WHERE job_id = :id",
                new { id }, tx);

            if (paid + req.Amount > charge)
            {
                tx.Rollback();
                return BadRequest(new { error = $"Payment exceeds remaining balance of {charge - paid:0.00}." });
            }

            var employeeId = User.GetEmployeeId()!.Value;
            var paymentId = await conn.ExecuteScalarAsync<int>(
                "SELECT service_job_pay_seq.NEXTVAL FROM DUAL", transaction: tx);

            await conn.ExecuteAsync(
                @"INSERT INTO service_job_payments
                    (payment_id, job_id, amount, method, received_by, note)
                  VALUES (:paymentId, :id, :amount, :method, :employeeId, :note)",
                new
                {
                    paymentId, id, amount = req.Amount, method = req.Method,
                    employeeId, note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim()
                }, tx);

            await AuditLogger.LogAsync(conn, tx, employeeId, "RECEIVE_PAYMENT",
                "ServiceJob", id.ToString(), $"{req.Amount} by {req.Method}");

            tx.Commit();
            return Ok(new { paymentId, paidAmount = paid + req.Amount, balance = charge - paid - req.Amount });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}




